import { describe, expect, it } from "vitest";
import type { LabelEntry, LabelSessionState } from "../runtime/label-session";
import { projectMaterialFileLabels } from "./material-file-label-projection";

const FIXED = new Map([["seed", "Fixed seed"]]);

function entry(label: string, origin: LabelEntry["origin"]): LabelEntry {
  return Object.freeze({
    basis: origin === "user" ? null : "basis",
    deferred: false,
    label,
    origin,
    pendingOperationId: null,
    revision: 1,
  });
}

function session(entries: ReadonlyMap<string, LabelEntry>): LabelSessionState {
  return Object.freeze({ documentEpoch: 4, entries, treeId: "tree" });
}

describe("material file label projection", () => {
  it("shows fixed names before lazy observation and rejects an automatic overwrite", () => {
    const empty = projectMaterialFileLabels({
      documentEpoch: 4,
      fixedLabels: FIXED,
      session: session(new Map()),
      treeId: "tree",
    });
    expect(empty.labels.get("seed")).toBe("Fixed seed");
    expect(empty.origins.get("seed")).toBe("fixed");

    const staleModel = projectMaterialFileLabels({
      documentEpoch: 4,
      fixedLabels: FIXED,
      session: session(new Map([["seed", entry("Stale model", "model")]])),
      treeId: "tree",
    });
    expect(staleModel.labels.get("seed")).toBe("Fixed seed");
    expect(staleModel.origins.get("seed")).toBe("fixed");
  });

  it("lets a manual name outrank the product name within the current document", () => {
    const projected = projectMaterialFileLabels({
      documentEpoch: 4,
      fixedLabels: FIXED,
      session: session(new Map([
        ["seed", entry("My name", "user")],
        ["authored", entry("Authored label", "provisional")],
      ])),
      treeId: "tree",
    });
    expect([...projected.labels]).toEqual([
      ["seed", "My name"],
      ["authored", "Authored label"],
    ]);
    expect(projected.origins.get("seed")).toBe("user");
  });

  it("does not leak a prior document session while fixed names remain synchronous", () => {
    const projected = projectMaterialFileLabels({
      documentEpoch: 5,
      fixedLabels: FIXED,
      session: session(new Map([["authored", entry("Old label", "user")]])),
      treeId: "tree",
    });
    expect([...projected.labels]).toEqual([["seed", "Fixed seed"]]);
    expect(projected.labels.has("authored")).toBe(false);
  });
});
