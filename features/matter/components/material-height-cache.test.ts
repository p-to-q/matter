import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ThoughtTree } from "../tree/model";
import { pictureLayoutKey } from "./passage-picture-box";
import {
  materialHeightIsReusable,
  materialLayoutDocumentKey,
  reconcileMaterialHeightCache,
  retainMaterialHeight,
  type MaterialHeightCacheBasis,
  type MaterialHeightMeasurement,
} from "./material-height-cache";

const measurement = (text: string): MaterialHeightMeasurement => Object.freeze({
  columnWidth: 300,
  height: 48,
  picture: null,
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

  it("does not reuse a height measured before a picture was attached, replaced, or removed", () => {
    const pointer = { contentHash: "a".repeat(64), width: 1024, height: 1024 };
    const subject = { columnWidth: 300, root: false, text: "same words" };
    const bare = { ...subject, picture: pictureLayoutKey(undefined) };
    const attached = { ...subject, picture: pictureLayoutKey(pointer) };
    const measuredBare = Object.freeze({ ...bare, height: 48 });
    const measuredAttached = Object.freeze({ ...attached, height: 48 + 310 });

    expect(materialHeightIsReusable(measuredBare, bare)).toBe(true);
    // Attach: the text is identical, so only the picture can tell them apart.
    expect(materialHeightIsReusable(measuredBare, attached)).toBe(false);
    expect(materialHeightIsReusable(measuredAttached, attached)).toBe(true);
    // Undo removes the pointer: the taller entry must not be reused.
    expect(materialHeightIsReusable(measuredAttached, bare)).toBe(false);
    // Replace with a picture of another shape or another hash.
    const wider = { ...subject, picture: pictureLayoutKey({ ...pointer, height: 512 }) };
    const other = { ...subject, picture: pictureLayoutKey({ ...pointer, contentHash: "b".repeat(64) }) };
    expect(materialHeightIsReusable(measuredAttached, wider)).toBe(false);
    expect(materialHeightIsReusable(measuredAttached, other)).toBe(false);
  });

  it("still keys by text, column width, and role, and has nothing to reuse when empty", () => {
    const measured = measurement("words");
    const subject = { columnWidth: 300, picture: null, root: false, text: "words" };
    expect(materialHeightIsReusable(measured, subject)).toBe(true);
    expect(materialHeightIsReusable(measured, { ...subject, text: "other" })).toBe(false);
    expect(materialHeightIsReusable(measured, { ...subject, columnWidth: 301 })).toBe(false);
    expect(materialHeightIsReusable(measured, { ...subject, root: true })).toBe(false);
    expect(materialHeightIsReusable(undefined, subject)).toBe(false);
  });

  it("is the comparison the measured canvas uses, with the picture in what it stores", () => {
    const source = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");
    expect(source).toContain("materialHeightIsReusable(cachedHeight, subject)");
    expect(source).toContain("picture: pictureLayoutKey(item.node.image)");
    expect(source).toMatch(/Object\.freeze\(\{\s*\.\.\.subject,\s*height,\s*\}\)/u);
  });
});
