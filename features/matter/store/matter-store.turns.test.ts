import { describe, expect, it } from "vitest";
import { SEEDED_DOCUMENT_NODE_IDS } from "../material/seeded-document";
import {
  buildTransformPlan,
  parseTransformEnvelope,
  type TransformEnvelope,
} from "../protocol/transform-contract";
import {
  buildTextSwapPlan,
  parseTextSwapEnvelope,
  type TextSwapEnvelope,
} from "../protocol/text-swap-contract";
import type { ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import { createMatterStore, type MatterStore } from "./matter-store";

const TARGET = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
const EXPANDED = "被允许沿着眼前松动的边界缓慢想象的、仍然保留清晰细节和余地的其他生活";
const NOW_MS = Date.parse("2026-09-29T00:00:00.000Z");

describe("Matter store material turns", () => {
  it.each(["transform", "text-swap"] as const)(
    "rejects an invalid %s answer with a protected diagnostic and no material change",
    (kind) => {
      const store = createMatterStore("expanded", { documentRoot: true });
      const tree = currentTree(store);
      const before = tree.nodes[TARGET]?.text;
      const receipt = kind === "transform"
        ? store.getState().commitTransform(
            transformEnvelope(tree),
            invalidPlan(buildTransformPlan(transformEnvelope(tree), EXPANDED)),
            store.getState().documentEpoch,
            NOW_MS,
          )
        : store.getState().commitTextSwap(
            textSwapEnvelope(tree),
            invalidPlan(buildTextSwapPlan(textSwapEnvelope(tree), "我们怀念的也许是另一种生活")),
            store.getState().documentEpoch,
            NOW_MS,
          );

      expect(receipt).toEqual({
        operation: "commit",
        status: "rejected",
        revision: tree.revision,
        errorCode: "INVALID_COMMAND",
      });
      expect(store.getState().tree.nodes[TARGET]?.text).toBe(before);
      expect(Object.isFrozen(store.getState().lastError)).toBe(true);
      expect(Object.isFrozen(store.getState().lastReceipt)).toBe(true);
    },
  );

  it.each(["transform", "text-swap"] as const)(
    "reports a changed target as stale without a diagnostic",
    (kind) => {
      const store = createMatterStore("expanded", { documentRoot: true });
      const tree = currentTree(store);
      const transform = transformEnvelope(tree);
      const swap = textSwapEnvelope(tree);
      editTarget(store);
      const receipt = kind === "transform"
        ? store.getState().commitTransform(transform, buildTransformPlan(transform, EXPANDED), 0, NOW_MS)
        : store.getState().commitTextSwap(
            swap,
            buildTextSwapPlan(swap, "我们怀念的也许是另一种生活"),
            0,
            NOW_MS,
          );
      expect(receipt).toMatchObject({ operation: "commit", status: "stale" });
      expect(store.getState().lastError).toBeNull();
    },
  );
});

/** A later landed turn changes the target text, which any earlier basis read. */
function editTarget(store: MatterStore): void {
  const envelope = transformEnvelope(currentTree(store));
  const receipt = store.getState().commitTransform(
    envelope,
    buildTransformPlan(envelope, EXPANDED),
    store.getState().documentEpoch,
    NOW_MS,
  );
  if (receipt.status !== "committed") throw new Error("fixture edit failed");
}

/** The store publishes deeply frozen state; protocol builders read it only. */
function currentTree(store: MatterStore): ThoughtTree {
  return store.getState().tree as ThoughtTree;
}

function invalidPlan<Plan extends { action: { text: string } }>(plan: Plan): Plan {
  return { ...plan, action: { ...plan.action, text: "" } };
}

function lineageOf(tree: ThoughtTree) {
  const lineage = selectLineage(tree, TARGET);
  if (lineage === null) throw new Error("fixture lineage missing");
  return lineage.map((entry, index) => ({
    id: entry.id,
    text: entry.text,
    parentId: index === 0 ? null : entry.parentId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

function transformEnvelope(tree: ThoughtTree): TransformEnvelope {
  const node = tree.nodes[TARGET];
  if (node === undefined) throw new Error("fixture target missing");
  const parsed = parseTransformEnvelope({
    protocolVersion: tree.protocolVersion,
    requestVersion: "transform/2",
    id: "turn_store_late",
    treeId: tree.id,
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: tree.revision,
    selection: {
      type: "segment-range",
      nodeId: TARGET,
      start: 0,
      end: node.text.length,
      selectedText: node.text,
    },
    gesture: { type: "stretch", axis: "vertical", amount: 1 },
    locale: "zh-CN",
    context: { lineage: lineageOf(tree) },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}

function textSwapEnvelope(tree: ThoughtTree): TextSwapEnvelope {
  const node = tree.nodes[TARGET];
  if (node === undefined) throw new Error("fixture target missing");
  const parsed = parseTextSwapEnvelope({
    protocolVersion: tree.protocolVersion,
    requestVersion: "text-swap/2",
    id: "text_swap_store_late",
    treeId: tree.id,
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: tree.revision,
    selection: {
      type: "segment-range",
      nodeId: TARGET,
      start: 0,
      end: node.text.length,
      selectedText: node.text,
    },
    direction: { text: "换一种更凝练的说法" },
    locale: "zh-CN",
    context: { lineage: lineageOf(tree) },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}
