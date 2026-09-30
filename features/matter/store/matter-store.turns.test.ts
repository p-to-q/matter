import { describe, expect, it } from "vitest";
import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import { SEEDED_DOCUMENT_NODE_IDS } from "../material/seeded-document";
import { relocalizeSeededSession } from "../material/seeded-session-localization";
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
import { compileWikiBasis } from "../wiki/wiki-basis";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";
import { createWikiMaterialLexicalPort } from "../application/wiki-material-lexical-adapter";
import { createMatterStore, type MatterStore } from "./matter-store";
import { adjudicateAdmissionRepair } from "../runtime/admission-repair-adjudication";

// The repair runtime supplies this adjudicator; the product loads it lazily.
const judgeRepair = () => adjudicateAdmissionRepair;

const TARGET = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
const SIBLING_PARENT = SEEDED_DOCUMENT_NODE_IDS.bodilyMemory;
const EXPANDED = "被允许沿着眼前松动的边界缓慢想象的、仍然保留清晰细节和余地的其他生活";
const NOW_MS = Date.parse("2026-09-29T00:00:00.000Z");

describe("Matter store material turns", () => {
  it("lands a late Elastic turn without destroying an Undo made after submission", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    store.getState().extendMaterial(SIBLING_PARENT, {
      nodeId: "thought_sibling_y",
      createdAt: "2026-09-29T00:00:01.000Z",
    });
    const envelope = transformEnvelope(currentTree(store));

    // The person submits Elastic on X, then undoes Y's admission before it lands.
    expect(store.getState().undo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.thought_sibling_y).toBeUndefined();

    const landed = store.getState().commitTransform(
      envelope,
      buildTransformPlan(envelope, EXPANDED),
      store.getState().documentEpoch,
      NOW_MS,
    );
    expect(landed).toMatchObject({ status: "committed", transformChange: { nodeId: TARGET } });
    expect(store.getState().history.redoEntries).toHaveLength(1);

    expect(store.getState().redo()).toMatchObject({ operation: "redo", status: "committed" });
    expect(store.getState().tree.nodes.thought_sibling_y).toBeDefined();
    expect(store.getState().tree.nodes[TARGET]?.text).toBe(EXPANDED);

    store.getState().undo();
    const reverted = store.getState().undo();
    expect(reverted).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes[TARGET]?.text).toBe(envelope.selection.selectedText);
    expect(store.getState().tree.nodes.thought_sibling_y).toBeUndefined();
    store.getState().redo();
    store.getState().redo();
    expect(store.getState().tree.nodes[TARGET]?.text).toBe(EXPANDED);
    expect(store.getState().tree.nodes.thought_sibling_y).toBeDefined();
  });

  it("settles an admission repair without destroying an Undo made meanwhile", () => {
    let nowMs = 100;
    const store = createMatterStore("expanded", { admissionRepair: judgeRepair, monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_repair_redo",
      commandId: "human_admission_repair_redo",
      nodeId: "voice_node_repair_redo",
      createdAt: "2026-09-29T00:00:00.000Z",
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");
    store.getState().extendMaterial(SIBLING_PARENT, {
      nodeId: "thought_sibling_y",
      createdAt: "2026-09-29T00:00:00.050Z",
    });
    store.getState().undo();

    nowMs = 200;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-09-29T00:00:00.100Z",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().redo()).toMatchObject({ operation: "redo", status: "committed" });
    expect(store.getState().tree.nodes.thought_sibling_y).toBeDefined();
    expect(store.getState().tree.nodes.voice_node_repair_redo?.text).toBe("我觉得可以。");
  });

  it.each([
    ["code x helps.", { status: "rejected", after: "Codex helps." }],
    ["code x helps", { status: "committed", after: "Codex helps" }],
  ] as const)(
    "never lets a late repair %j reintroduce a spelling the person's Wiki replaced",
    (repairText, expected) => {
      const confirmed = applyWikiEvent(createEmptyWikiState(), {
        type: "confirm-rule",
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "code x",
        canonical: "Codex",
      });
      if (!confirmed.ok) throw new Error(confirmed.error.code);
      const compiled = compileWikiBasis(confirmed.state, 1);
      if (!compiled.ok) throw new Error(compiled.error.code);
      let nowMs = 100;
      const store = createMatterStore("root", {
        admissionRepair: judgeRepair,
        materialLexical: createWikiMaterialLexicalPort(() => compiled.basis, () => canonicalizeWikiText),
        monotonicNow: () => nowMs,
      });
      const rootId = store.getState().tree.rootId;
      if (rootId === null) throw new Error("fixture root missing");
      const admission = store.getState().admitHumanTranscript({
        target: "child",
        treeId: store.getState().tree.id,
        baseRevision: store.getState().tree.revision,
        parentNodeId: rootId,
      }, {
        interactionId: "voice_wiki_repair",
        commandId: "human_admission_wiki_repair",
        nodeId: "voice_node_wiki_repair",
        createdAt: "2026-09-29T00:00:00.000Z",
        transcript: "code x helps",
        expectedDocumentEpoch: 0,
        admittedAtMs: 100,
        repairLocale: "en-US",
      });
      if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");
      expect(store.getState().tree.nodes.voice_node_wiki_repair?.text).toBe("Codex helps.");

      nowMs = 200;
      const receipt = store.getState().settleHumanTranscriptRepair({
        repairLeaseId: admission.repairLeaseId,
        outcome: "candidate",
        text: repairText,
        source: "model",
        createdAt: "2026-09-29T00:00:00.100Z",
      });
      const after = store.getState().tree.nodes.voice_node_wiki_repair?.text;
      expect(after).not.toMatch(/code x/iu);
      // A repair that only restores the replaced spelling changes nothing and
      // is rejected; a real repair keeps the person's canonical spelling.
      expect({ status: receipt.status, after }).toEqual(expected);
    },
  );

  it("keeps a human commit's convention of ending the redo future", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    store.getState().extendMaterial(SIBLING_PARENT, {
      nodeId: "thought_sibling_y",
      createdAt: "2026-09-29T00:00:01.000Z",
    });
    store.getState().undo();
    store.getState().extendMaterial(SIBLING_PARENT, {
      nodeId: "thought_sibling_z",
      createdAt: "2026-09-29T00:00:02.000Z",
    });
    expect(store.getState().history.redoEntries).toEqual([]);
  });

  it("lands a Point-and-Talk result on seed copy when relocalization waits for it", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const envelope = textSwapEnvelope(currentTree(store));
    const replacement = "我们怀念的也许是另一种生活";
    const siblingBefore = store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime]?.text;

    expect(store.getState().commitTextSwap(
      envelope,
      buildTextSwapPlan(envelope, replacement),
      store.getState().documentEpoch,
      NOW_MS,
    )).toMatchObject({ status: "committed" });
    expect(store.getState().localizeSeededMaterial("en-US", relocalizeSeededSession))
      .toMatchObject({ status: "localized" });

    // The person's result is no longer seed copy; untouched passages follow the locale.
    expect(store.getState().tree.nodes[TARGET]?.text).toBe(replacement);
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime]?.text)
      .not.toBe(siblingBefore);
  });

  it("shows why relocalization must wait: it revokes a turn submitted on seed copy", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const envelope = textSwapEnvelope(currentTree(store));
    store.getState().localizeSeededMaterial("en-US", relocalizeSeededSession);

    expect(store.getState().commitTextSwap(
      envelope,
      buildTextSwapPlan(envelope, "我们怀念的也许是另一种生活"),
      store.getState().documentEpoch,
      NOW_MS,
    )).toMatchObject({ status: "stale" });
  });

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
