import { describe, expect, it } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { admissionRepairToTreeCommand, ADMISSION_REPAIR_WINDOW_MS } from "./admission-repair";

const CREATED = "2026-08-11T10:00:00.000Z";

function values(treeId: string, nodeId: string, expectedText: string, expectedUpdatedAt: string) {
  return {
    interactionId: "voice_1",
    commandId: "repair_1",
    treeId,
    nodeId,
    expectedText,
    expectedUpdatedAt,
    text: `${expectedText} repaired`,
    createdAt: CREATED,
    admittedAtMs: 100,
    settledAtMs: 200,
  };
}

describe("admissionRepairToTreeCommand", () => {
  it("uses the current tree revision with an exact node memento", () => {
    const tree = createSeededDocument("root").tree;
    const node = tree.nodes[tree.rootId ?? ""];
    if (node === undefined) throw new Error("fixture root missing");
    const result = admissionRepairToTreeCommand(
      { ...tree, revision: tree.revision + 4 },
      values(tree.id, node.id, node.text, node.updatedAt),
    );
    expect(result).toMatchObject({
      ok: true,
      command: {
        source: "repair",
        expectedRevision: tree.revision + 4,
        mutation: {
          type: "replace-text",
          nodeId: node.id,
          expectedText: node.text,
          expectedUpdatedAt: node.updatedAt,
        },
      },
    });
  });

  it("rejects an expired lease", () => {
    const tree = createSeededDocument("root").tree;
    const node = tree.nodes[tree.rootId ?? ""];
    if (node === undefined) throw new Error("fixture root missing");
    expect(admissionRepairToTreeCommand(tree, {
      ...values(tree.id, node.id, node.text, node.updatedAt),
      settledAtMs: 100 + ADMISSION_REPAIR_WINDOW_MS + 1,
    })).toMatchObject({ ok: false, error: { code: "REPAIR_EXPIRED" } });
  });

  it("rejects a changed, removed, or differently timestamped passage", () => {
    const tree = createSeededDocument("root").tree;
    const node = tree.nodes[tree.rootId ?? ""];
    if (node === undefined) throw new Error("fixture root missing");
    for (const candidate of [
      values(tree.id, node.id, `${node.text}!`, node.updatedAt),
      values(tree.id, "missing", node.text, node.updatedAt),
      values(tree.id, node.id, node.text, CREATED),
    ]) {
      expect(admissionRepairToTreeCommand(tree, candidate))
        .toMatchObject({ ok: false, error: { code: "REPAIR_STALE" } });
    }
  });
});
