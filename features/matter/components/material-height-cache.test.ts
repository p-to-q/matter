import { describe, expect, it } from "vitest";
import type { ThoughtTree } from "../tree/model";
import {
  materialLayoutDocumentKey,
  reconcileMaterialHeightCache,
  retainMaterialHeight,
  type MaterialHeightCacheBasis,
  type MaterialHeightMeasurement,
} from "./material-height-cache";

const measurement = (text: string): MaterialHeightMeasurement => Object.freeze({
  columnWidth: 300,
  height: 48,
  root: false,
  text,
});

const tree = (id: string, nodeIds: readonly string[]): ThoughtTree => ({
  protocolVersion: "0.2",
  id,
  rootId: nodeIds[0] ?? null,
  revision: 0,
  nodes: Object.fromEntries(nodeIds.map((nodeId, index) => [nodeId, {
    id: nodeId,
    text: nodeId,
    parentId: index === 0 ? null : nodeIds[0] ?? null,
    children: [],
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  }])),
});

const basis = (
  value: ThoughtTree,
  documentEpoch = 1,
  locale: MaterialHeightCacheBasis["locale"] = "en-US",
): MaterialHeightCacheBasis => ({ documentEpoch, locale, tree: value });

describe("material height cache authority", () => {
  it("gives reusable layouts a distinct document, locale, and projection owner", () => {
    const current = materialLayoutDocumentKey(1, "en-US", "tree:3:full");

    expect(materialLayoutDocumentKey(2, "en-US", "tree:3:full")).not.toBe(current);
    expect(materialLayoutDocumentKey(1, "zh-CN", "tree:3:full")).not.toBe(current);
    expect(materialLayoutDocumentKey(1, "en-US", "tree:4:full")).not.toBe(current);
  });

  it("keeps live measurements and removes deleted node ids on a tree replacement", () => {
    const first = tree("tree", ["root", "keep", "remove"]);
    const next = tree("tree", ["root", "keep", "add"]);
    const cache = new Map([
      ["keep", measurement("keep")],
      ["remove", measurement("remove")],
    ]);

    reconcileMaterialHeightCache(cache, basis(first), basis(next));

    expect([...cache.keys()]).toEqual(["keep"]);
  });

  it("clears measurements across document and locale authority changes", () => {
    const value = tree("tree", ["root"]);
    const cache = new Map([["root", measurement("root")]]);
    reconcileMaterialHeightCache(cache, basis(value), basis(value, 2));
    expect(cache.size).toBe(0);

    cache.set("root", measurement("root"));
    reconcileMaterialHeightCache(cache, basis(value, 2), basis(value, 2, "ja-JP"));
    expect(cache.size).toBe(0);
  });

  it("never retains more measurements than a valid material tree can own", () => {
    const cache = new Map<string, MaterialHeightMeasurement>();
    for (let index = 0; index < 10_000; index += 1) {
      retainMaterialHeight(cache, `node-${index}`, measurement(String(index)));
    }

    expect(cache.size).toBe(2_000);
    expect(cache.has("node-7999")).toBe(false);
    expect(cache.get("node-9999")?.text).toBe("9999");
  });
});
