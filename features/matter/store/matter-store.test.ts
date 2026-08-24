import { describe, expect, it } from "vitest";
import {
  SEEDED_DOCUMENT_NODE_IDS,
  SEEDED_ROOT_ONLY_TREE_ID,
  createSeededDocument,
} from "../material/seeded-document";
import {
  seededNodeText,
} from "../material/seeded-material-copy";
import {
  seededFallbackBranchTexts,
  type SeededBranchTextResolver,
} from "../material/seeded-material-core";
import { seededBranchTexts } from "../material/seeded-branch-copy";
import { relocalizeSeededSession } from "../material/seeded-session-localization";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import { createMatterStore } from "./matter-store";
import type { ThoughtTree } from "../tree/model";
import { buildTransformPlan, parseTransformEnvelope } from "../protocol/transform-contract";
import { buildTextSwapPlan, parseTextSwapEnvelope } from "../protocol/text-swap-contract";
import { selectLineage } from "../tree/selectors";

describe("Matter store", () => {
  it("uses the deployed initial title without replacing restored document titles", () => {
    const store = createMatterStore("expanded", {
      documentRoot: true,
      initialTitle: "被允许想象的其他生活",
    });
    expect(store.getState().tree.title).toBe("被允许想象的其他生活");

    const restored = structuredClone(store.getState().tree) as ThoughtTree;
    restored.title = "我已经改过的画布名";
    restored.revision += 1;
    expect(store.getState().hydrateSnapshot(restored)).toMatchObject({
      operation: "hydrate",
      status: "hydrated",
    });
    expect(store.getState().tree.title).toBe("我已经改过的画布名");
  });

  it("migrates only the seeded demo's superseded document title", () => {
    const store = createMatterStore("expanded", {
      documentRoot: true,
      initialTitle: "被允许想象的其他生活",
    });
    const restored = structuredClone(store.getState().tree) as ThoughtTree;
    restored.title = "而是那个过去在今天仍然允许我们想象的其他生活";

    expect(store.getState().hydrateSnapshot(restored)).toMatchObject({
      operation: "hydrate",
      status: "hydrated",
    });
    expect(store.getState().tree.title).toBe("被允许想象的其他生活");
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedLives]?.text)
      .toBe("被允许想象的其他生活");
  });

  it("starts the public root-only document without descendants and grows locally", () => {
    const store = createMatterStore("root");
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");

    expect(store.getState().tree.id).toBe(SEEDED_ROOT_ONLY_TREE_ID);
    expect(store.getState().tree.nodes[rootId]?.children).toEqual([]);
    expect(store.getState().extendMaterial(rootId, branchValues())).toMatchObject({
      operation: "commit",
      status: "committed",
    });
    const childId = store.getState().tree.nodes[rootId]?.children[0];
    expect(childId).toBeDefined();
    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes[rootId]?.children).toEqual([]);
  });

  it("publishes late transcript repair as its own undoable command", () => {
    let nowMs = 100;
    const store = createMatterStore("root", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_store_1",
      commandId: "human_admission_store_1",
      nodeId: "voice_node_store_1",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    expect(admission).toMatchObject({ operation: "commit", status: "committed" });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");
    expect("repairLeaseId" in (store.getState().lastReceipt ?? {})).toBe(false);
    expect(store.getState().tree.nodes.voice_node_store_1.text).toBe("呃，我觉得可以。");

    nowMs = 200;
    const repair = store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:00.100Z",
    });
    expect(repair).toMatchObject({
      operation: "commit",
      status: "committed",
      repairChange: {
        id: "human_admission_repair_voice_node_store_1",
        treeId: store.getState().tree.id,
        documentEpoch: 0,
        nodeId: "voice_node_store_1",
        committedRevision: 3,
        before: {
          text: "呃，我觉得可以。",
          updatedAt: "2026-08-11T10:00:00.000Z",
        },
        after: {
          text: "我觉得可以。",
          updatedAt: "2026-08-11T10:00:00.100Z",
        },
      },
    });
    expect("repairChange" in (store.getState().lastReceipt ?? {})).toBe(false);
    expect(JSON.stringify(store.getState().history)).not.toContain(admission.repairLeaseId);
    expect(store.getState().tree.nodes.voice_node_store_1.text).toBe("我觉得可以。");
    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes.voice_node_store_1.text).toBe("呃，我觉得可以。");
    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes.voice_node_store_1).toBeUndefined();
    expect(store.getState().history.redoEntries).toHaveLength(2);
    expect(store.getState().redo()).toMatchObject({ operation: "redo", status: "committed" });
    expect(store.getState().redo()).toMatchObject({ operation: "redo", status: "committed" });
    expect(store.getState().tree.nodes.voice_node_store_1.text).toBe("我觉得可以。");
  });

  it("rejects an admission from an earlier document epoch", () => {
    const store = createMatterStore("root");
    const initial = store.getState();
    const rootId = initial.tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const staleAnchor = {
      target: "child" as const,
      treeId: initial.tree.id,
      baseRevision: initial.tree.revision,
      parentNodeId: rootId,
    };
    const sameMaterial = structuredClone(initial.tree) as ThoughtTree;

    expect(store.getState().hydrateSnapshot(sameMaterial)).toMatchObject({
      operation: "hydrate",
      status: "hydrated",
    });
    expect(store.getState().tree.id).toBe(staleAnchor.treeId);
    expect(store.getState().tree.revision).toBe(staleAnchor.baseRevision);
    expect(store.getState().documentEpoch).toBe(1);

    expect(store.getState().admitHumanTranscript(staleAnchor, {
      interactionId: "voice_stale_epoch",
      commandId: "human_admission_stale_epoch",
      nodeId: "voice_node_stale_epoch",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "这段迟到的文字不应该写入",
      expectedDocumentEpoch: 0,
    })).toMatchObject({
      operation: "commit",
      status: "rejected",
      errorCode: "INVALID_INTERACTION",
    });
    expect(store.getState().tree.nodes.voice_node_stale_epoch).toBeUndefined();
  });

  it("keeps repair capabilities distinct when admission command ids repeat", () => {
    let nowMs = 100;
    const store = createMatterStore("root", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");

    const admit = (suffix: string) => store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: `voice_duplicate_${suffix}`,
      commandId: "human_admission_duplicate",
      nodeId: `voice_node_duplicate_${suffix}`,
      createdAt: `2026-08-11T10:00:00.${suffix === "first" ? "000" : "100"}Z`,
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: nowMs,
      repairLocale: "zh-CN",
    });

    const first = admit("first");
    nowMs = 200;
    const second = admit("second");
    if (!("repairLeaseId" in first) || !("repairLeaseId" in second)) {
      throw new Error("repair lease missing");
    }
    expect(first.repairLeaseId).not.toBe(second.repairLeaseId);

    nowMs = 300;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: first.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:00.200Z",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_duplicate_first.text).toBe("我觉得可以。");
    expect(store.getState().tree.nodes.voice_node_duplicate_second.text).toBe("呃，我觉得可以。");

    nowMs = 400;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: second.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:00.300Z",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_duplicate_second.text).toBe("我觉得可以。");
  });

  it("revalidates a model delta from the recomputed rule floor", () => {
    let nowMs = 100;
    const store = createMatterStore("root", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_composite_repair",
      commandId: "human_admission_composite_repair",
      nodeId: "voice_node_composite_repair",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "i think we need to i think we need to ship teh module",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "en-US",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");

    nowMs = 200;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "I think we need to ship the module.",
      source: "model",
      createdAt: "2026-08-11T10:00:00.100Z",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_composite_repair.text)
      .toBe("I think we need to ship the module.");
  });

  it("commits the store-adjudicated model text instead of its transport wrapper", () => {
    let nowMs = 100;
    const store = createMatterStore("root", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_wrapped_repair",
      commandId: "human_admission_wrapped_repair",
      nodeId: "voice_node_wrapped_repair",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "i think this still needs testng",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "en-US",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");

    nowMs = 200;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: '\"I think this still needs testing.\"',
      source: "model",
      createdAt: "2026-08-11T10:00:00.100Z",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_wrapped_repair.text)
      .toBe("I think this still needs testing.");
  });

  it("keeps a stale repair silent and leaves store diagnostics unchanged", () => {
    const store = createMatterStore("root");
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const before = store.getState();
    expect(before.settleHumanTranscriptRepair({
      repairLeaseId: "missing_repair_lease",
      outcome: "discarded",
    })).toMatchObject({ operation: "commit", status: "rejected", errorCode: "REPAIR_STALE" });
    expect(store.getState()).toBe(before);
  });

  it("does not preserve repair authority through undo", () => {
    let nowMs = 100;
    const store = createMatterStore("root", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_undo_only",
      commandId: "human_admission_undo_only",
      nodeId: "voice_node_undo_only",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");

    expect(store.getState().undo()).toMatchObject({ status: "committed" });
    nowMs = 200;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:00.100Z",
    })).toMatchObject({ status: "rejected", errorCode: "REPAIR_STALE" });
    expect(store.getState().tree.nodes.voice_node_undo_only).toBeUndefined();
  });

  it("consumes repair authority when an unrelated structural drag commits", () => {
    let nowMs = 100;
    const store = createMatterStore("expanded", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_move_repair",
      commandId: "human_admission_move_repair",
      nodeId: "voice_node_move_repair",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");

    expect(store.getState().moveNode({
      commandId: "human_move_while_repair_pending",
      nodeId: SEEDED_DOCUMENT_NODE_IDS.imaginedTime,
      targetParentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
      createdAt: "2026-08-11T10:00:00.050Z",
    })).toMatchObject({ status: "committed" });

    nowMs = 200;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:00.100Z",
    })).toMatchObject({ status: "rejected", errorCode: "REPAIR_STALE" });
    expect(store.getState().tree.nodes.voice_node_move_repair.text).toBe("呃，我觉得可以。");
  });

  it("uses the store clock to expire a repair capability", () => {
    let nowMs = 100;
    const store = createMatterStore("root", { monotonicNow: () => nowMs });
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const admission = store.getState().admitHumanTranscript({
      target: "child",
      treeId: store.getState().tree.id,
      baseRevision: store.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_expiry",
      commandId: "human_admission_expiry",
      nodeId: "voice_node_expiry",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");

    nowMs = 12_101;
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:12.001Z",
    })).toMatchObject({ status: "rejected", errorCode: "REPAIR_EXPIRED" });
    expect(store.getState().tree.nodes.voice_node_expiry.text).toBe("呃，我觉得可以。");
  });

  it("restores the admission and repair as two undo steps after hydration", () => {
    let nowMs = 100;
    const source = createMatterStore("root", {
      documentRoot: true,
      monotonicNow: () => nowMs,
    });
    const rootId = source.getState().tree.rootId;
    if (rootId === null) throw new Error("document root missing");
    const admission = source.getState().admitHumanTranscript({
      target: "child",
      treeId: source.getState().tree.id,
      baseRevision: source.getState().tree.revision,
      parentNodeId: rootId,
    }, {
      interactionId: "voice_reload",
      commandId: "human_admission_reload",
      nodeId: "voice_node_reload",
      createdAt: "2026-08-11T10:00:00.000Z",
      transcript: "呃，我觉得可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");
    nowMs = 200;
    expect(source.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: "我觉得可以。",
      source: "rules",
      createdAt: "2026-08-11T10:00:00.100Z",
    })).toMatchObject({ status: "committed" });

    const tree = structuredClone(source.getState().tree) as ThoughtTree;
    const history = structuredClone(source.getState().history);
    const restored = createMatterStore("root", { documentRoot: true });
    expect(restored.getState().hydrateSnapshot(tree, history)).toMatchObject({ status: "hydrated" });
    expect(restored.getState().undo()).toMatchObject({ status: "committed" });
    expect(restored.getState().tree.nodes.voice_node_reload.text).toBe("呃，我觉得可以。");
    expect(restored.getState().undo()).toMatchObject({ status: "committed" });
    expect(restored.getState().tree.nodes.voice_node_reload).toBeUndefined();
  });

  it("keeps a valid persisted undo chain after hydration", () => {
    const source = createMatterStore("root", { documentRoot: true });
    const rootId = source.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");
    const childrenBeforeCommit = [...(source.getState().tree.nodes[rootId]?.children ?? [])];
    source.getState().extendMaterial(rootId, branchValues());
    const persistedTree = structuredClone(source.getState().tree) as ThoughtTree;
    const persistedHistory = structuredClone(source.getState().history);

    const restored = createMatterStore("root", { documentRoot: true });
    expect(restored.getState().hydrateSnapshot(persistedTree, persistedHistory)).toMatchObject({
      operation: "hydrate",
      status: "hydrated",
    });
    expect(restored.getState().history.entries).toHaveLength(1);
    expect(restored.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(restored.getState().tree.nodes[rootId]?.children).toEqual(childrenBeforeCommit);
  });

  it("creates isolated deterministic sessions", () => {
    const first = createMatterStore();
    const second = createMatterStore();

    expect(first).not.toBe(second);
    expect(first.getState().tree).toEqual(second.getState().tree);
    expect(first.getState().tree).not.toBe(second.getState().tree);
    expect(first.getState().history).not.toBe(second.getState().history);
    expect(first.getState().navigation).not.toBe(second.getState().navigation);

    first.getState().select(SEEDED_DOCUMENT_NODE_IDS.root);
    expect(first.getState().navigation.selectedNodeId).toBe(
      SEEDED_DOCUMENT_NODE_IDS.root,
    );
    expect(second.getState().navigation.selectedNodeId).toBeNull();
  });

  it("does not expose Zustand's generic mutation escape hatch", () => {
    const store = createMatterStore();

    expect("setState" in store).toBe(false);
    // @ts-expect-error The public store deliberately excludes generic mutation.
    expect(store.setState).toBeUndefined();
  });

  it("physically protects public material, history, and navigation", () => {
    const store = createMatterStore();
    const state = store.getState();
    const rootId = state.tree.rootId;
    if (rootId === null) throw new Error("fixture root missing");
    const root = state.tree.nodes[rootId];
    const text = root.text;
    const children = [...root.children];

    expect(() => {
      // @ts-expect-error Public material is deeply readonly.
      root.text = "external mutation";
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error Public child order is deeply readonly.
      root.children.push("external-child");
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error Public history order is deeply readonly.
      state.history.entries.push({});
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error The physical readonly Set has no mutation method.
      state.navigation.foldedNodeIds.add(rootId);
    }).toThrow(TypeError);

    expect(root.text).toBe(text);
    expect(root.children).toEqual(children);
    expect(state.history.entries).toHaveLength(0);
    expect(state.extendMaterial(rootId, branchValues()).status).toBe("committed");
    expect(store.getState().tree.revision).toBe(state.tree.revision + 1);
  });

  it("protects published inverse mementos without breaking undo", () => {
    const store = createMatterStore();
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("fixture root missing");
    store.getState().extendMaterial(rootId, branchValues());
    const committed = store.getState();
    const entry = committed.history.entries.at(-1);
    if (entry === undefined) throw new Error("history entry missing");

    expect(() => {
      // @ts-expect-error Public mementos are deeply readonly.
      entry.inverse.expectedRevision = 999;
    }).toThrow(TypeError);
    expect(committed.undo().status).toBe("committed");
    expect(store.getState().history.entries).toHaveLength(0);
  });

  it("uses current state preconditions for sequential named insertions", () => {
    const store = createMatterStore();
    const before = store.getState();
    const firstReceipt = before.extendMaterial(SEEDED_DOCUMENT_NODE_IDS.root, branchValues());
    const afterFirst = store.getState();
    const secondReceipt = afterFirst.extendMaterial(SEEDED_DOCUMENT_NODE_IDS.root, branchValues());
    const afterSecond = store.getState();

    expect(firstReceipt).toMatchObject({
      operation: "commit",
      status: "committed",
      revision: before.tree.revision + 1,
    });
    expect(secondReceipt).toMatchObject({
      operation: "commit",
      status: "committed",
      revision: before.tree.revision + 2,
    });
    expect(afterSecond.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].children).toHaveLength(
      before.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].children.length + 2,
    );
    expect(afterSecond.history.entries).toHaveLength(2);
  });

  it.each(["missing", "toString", "constructor", "__proto__"])(
    "rejects invalid fixture parent %s without changing domain ownership",
    (parentId) => {
      const store = createMatterStore();
      const before = store.getState();

      expect(() => before.extendMaterial(parentId, branchValues())).not.toThrow();
      const receipt = store.getState().lastReceipt;
      const after = store.getState();

      expect(receipt).toMatchObject({
        operation: "commit",
        status: "rejected",
        errorCode: "INVALID_COMMAND",
      });
      expect(after.lastError?.code).toBe("INVALID_COMMAND");
      expect(after.tree).toBe(before.tree);
      expect(after.history).toBe(before.history);
      expect(after.navigation).toBe(before.navigation);
    },
  );

  it("preserves material references on navigation failure and clears the error", () => {
    const store = createMatterStore();
    const before = store.getState();
    const receipt = before.focus("missing");
    const failed = store.getState();

    expect(receipt).toMatchObject({
      operation: "focus",
      status: "rejected",
      errorCode: "NAVIGATION_NODE_NOT_FOUND",
    });
    expect(failed.tree).toBe(before.tree);
    expect(failed.history).toBe(before.history);
    expect(failed.navigation).toBe(before.navigation);
    expect(failed.lastError?.code).toBe("NAVIGATION_NODE_NOT_FOUND");

    failed.clearError();
    const cleared = store.getState();
    expect(cleared.lastError).toBeNull();
    expect(cleared.lastReceipt).toBe(failed.lastReceipt);
    expect(cleared.tree).toBe(before.tree);
  });

  it("retains current identity for repeated navigation while issuing a receipt", () => {
    const store = createMatterStore();
    store.getState().select(SEEDED_DOCUMENT_NODE_IDS.root);
    const selected = store.getState();
    const receipt = selected.select(SEEDED_DOCUMENT_NODE_IDS.root);
    const repeated = store.getState();

    expect(receipt).toMatchObject({ operation: "select", status: "navigated" });
    expect(repeated.navigation).toBe(selected.navigation);
    expect(repeated.tree).toBe(selected.tree);
    expect(repeated.history).toBe(selected.history);
  });

  it("clears a selection without changing the material or history", () => {
    const store = createMatterStore();
    store.getState().select(SEEDED_DOCUMENT_NODE_IDS.root);
    const selected = store.getState();

    const receipt = selected.clearSelection();
    const cleared = store.getState();

    expect(receipt).toMatchObject({ operation: "clear-selection", status: "navigated" });
    expect(cleared.navigation.selectedNodeId).toBeNull();
    expect(cleared.tree).toBe(selected.tree);
    expect(cleared.history).toBe(selected.history);
  });

  it("does not publish a new state when selection is already clear", () => {
    const store = createMatterStore();
    const before = store.getState();
    let publications = 0;
    const unsubscribe = store.subscribe(() => {
      publications += 1;
    });

    const receipt = before.clearSelection();

    unsubscribe();
    expect(receipt).toMatchObject({ operation: "clear-selection", status: "navigated" });
    expect(store.getState()).toBe(before);
    expect(publications).toBe(0);
  });

  it("undo reconciles focused material removed by the latest insertion", () => {
    const store = createMatterStore();
    const inserted = store
      .getState()
      .extendMaterial(SEEDED_DOCUMENT_NODE_IDS.root, branchValues());
    expect(inserted.status).toBe("committed");
    const afterInsert = store.getState();
    const insertedNodeId = afterInsert.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].children.at(-1);
    if (insertedNodeId === undefined) throw new Error("fixture child missing");

    afterInsert.focus(insertedNodeId);
    const focused = store.getState();
    expect(focused.navigation).toMatchObject({
      mode: "focus",
      focusNodeId: insertedNodeId,
    });

    const receipt = focused.undo();
    const undone = store.getState();

    expect(receipt).toMatchObject({ operation: "undo", status: "committed" });
    expect(undone.tree.nodes[insertedNodeId]).toBeUndefined();
    expect(undone.navigation).toMatchObject({
      mode: "focus",
      focusNodeId: SEEDED_DOCUMENT_NODE_IDS.root,
      selectedNodeId: SEEDED_DOCUMENT_NODE_IDS.root,
    });
    expect(undone.lastError).toBeNull();
  });

  it("can undo back to the document's first state and restore only through the store shortcut action", () => {
    const store = createMatterStore(undefined, { documentRoot: true });
    const initial = structuredClone(store.getState().tree);
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("document root missing");

    expect(store.getState().extendMaterial(rootId, branchValues()).status).toBe("committed");
    expect(store.getState().extendMaterial(rootId, branchValues()).status).toBe("committed");
    expect(store.getState().undo().status).toBe("committed");
    expect(store.getState().undo().status).toBe("committed");
    expect(store.getState().tree).toMatchObject({
      ...initial,
      revision: expect.any(Number),
    });
    expect(store.getState().tree.revision).toBeGreaterThan(initial.revision);
    expect(store.getState().history.redoEntries).toHaveLength(2);
    expect(store.getState().redo().status).toBe("committed");
    expect(store.getState().redo().status).toBe("committed");
    expect(store.getState().history.redoEntries).toEqual([]);
  });

  it("supports fold, focus, return, and empty undo through named actions", () => {
    const store = createMatterStore();
    const initial = store.getState();

    expect(initial.extendMaterial(SEEDED_DOCUMENT_NODE_IDS.root, branchValues()).status).toBe(
      "committed",
    );
    const childId = store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].children[0];
    if (childId === undefined) throw new Error("fixture child missing");

    expect(initial.toggleFold(SEEDED_DOCUMENT_NODE_IDS.root).status).toBe(
      "navigated",
    );
    expect(store.getState().navigation.foldedNodeIds.has(SEEDED_DOCUMENT_NODE_IDS.root)).toBe(true);

    store.getState().focus(childId);
    expect(store.getState().navigation.mode).toBe("focus");
    store.getState().showFull();
    expect(store.getState().navigation).toMatchObject({
      mode: "full",
      selectedNodeId: childId,
    });
    expect(store.getState().navigation.foldedNodeIds.has(SEEDED_DOCUMENT_NODE_IDS.root)).toBe(false);

    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
  });

  it("publishes a structural move once and restores it through named undo", () => {
    const store = createMatterStore();
    const before = store.getState().tree;
    store.getState().select(SEEDED_DOCUMENT_NODE_IDS.imaginedTime);
    expect(store.getState().moveNode({
      commandId: "human_move_store",
      nodeId: SEEDED_DOCUMENT_NODE_IDS.imaginedTime,
      targetParentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
      createdAt: "2026-08-07T00:00:00.000Z",
    })).toMatchObject({ operation: "commit", status: "committed" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime].parentId)
      .toBe(SEEDED_DOCUMENT_NODE_IDS.presentDistance);
    expect(store.getState().navigation.selectedNodeId).toBe(SEEDED_DOCUMENT_NODE_IDS.imaginedTime);
    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes).toEqual(before.nodes);
  });

  it("relocalizes structural mementos without adding a language change to Undo", () => {
    const store = createMatterStore();
    store.getState().select(SEEDED_DOCUMENT_NODE_IDS.imaginedTime);
    expect(store.getState().moveNode({
      commandId: "human_move_before_locale",
      nodeId: SEEDED_DOCUMENT_NODE_IDS.imaginedTime,
      targetParentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
      createdAt: "2026-08-24T01:00:00.000Z",
    })).toMatchObject({ status: "committed" });
    const historyLength = store.getState().history.entries.length;

    expect(store.getState().localizeSeededMaterial("en-US", relocalizeSeededSession))
      .toMatchObject({ operation: "localize-seed", status: "localized" });
    expect(store.getState().history.entries).toHaveLength(historyLength);
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime].text)
      .toBe(seededNodeText("en-US", "imaginedTime"));

    expect(store.getState().undo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime]).toMatchObject({
      parentId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
      text: seededNodeText("en-US", "imaginedTime"),
    });
    expect(store.getState().redo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime]).toMatchObject({
      parentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
      text: seededNodeText("en-US", "imaginedTime"),
    });
  });

  it("localizes a removed seeded subtree across Undo and Redo", () => {
    const store = createMatterStore();
    store.getState().select(SEEDED_DOCUMENT_NODE_IDS.imaginedLives);
    expect(store.getState().removeSelected({
      commandId: "human_remove_before_locale",
      createdAt: "2026-08-24T01:01:00.000Z",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedLives]).toBeUndefined();
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime]).toBeUndefined();
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedRelations]).toBeUndefined();

    expect(store.getState().localizeSeededMaterial("de-DE", relocalizeSeededSession))
      .toMatchObject({ status: "localized" });
    expect(store.getState().undo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedLives].text)
      .toBe(seededNodeText("de-DE", "imaginedLives"));
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime].text)
      .toBe(seededNodeText("de-DE", "imaginedTime"));
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedRelations].text)
      .toBe(seededNodeText("de-DE", "imaginedRelations"));
    expect(store.getState().redo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedLives]).toBeUndefined();
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime]).toBeUndefined();
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedRelations]).toBeUndefined();
  });

  it("chooses Branch copy from the active locale and never relocalizes the committed node", () => {
    const store = createMatterStore();
    const values = branchValues();
    expect(store.getState().extendMaterial(
      SEEDED_DOCUMENT_NODE_IDS.imaginedRelations,
      values,
      "ja-JP",
      seededBranchTexts,
    )).toMatchObject({ status: "committed" });
    const text = store.getState().tree.nodes[values.nodeId].text;
    expect(text).toBe(seededBranchTexts("ja-JP", "imaginedRelations")[0]);

    store.getState().localizeSeededMaterial("en-US", relocalizeSeededSession);
    expect(store.getState().tree.nodes[values.nodeId].text).toBe(text);
  });

  it.each([
    ["throws", (() => { throw new Error("interaction copy chunk unavailable"); })],
    ["returns no options", (() => [])],
    ["returns blank copy", (() => ["   "])],
    ["returns oversized copy", (() => ["x".repeat(MAX_NODE_TEXT_CODE_UNITS + 1)])],
  ] satisfies readonly (readonly [string, SeededBranchTextResolver])[])(
    "commits one undoable locale-floor Branch when an optional resolver $0",
    (_condition, failingResolver) => {
    const store = createMatterStore();
    const values = branchValues();

    expect(() => store.getState().extendMaterial(
      SEEDED_DOCUMENT_NODE_IDS.root,
      values,
      "de-DE",
      failingResolver,
    )).not.toThrow();
    expect(store.getState().tree.nodes[values.nodeId].text)
      .toBe(seededFallbackBranchTexts("de-DE")[0]);
    expect(store.getState().history.entries).toHaveLength(1);
    expect(store.getState().undo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[values.nodeId]).toBeUndefined();
    },
  );

  it("localizes only an untouched default title", () => {
    const untouched = createMatterStore("expanded", {
      documentRoot: true,
      initialTitle: "被允许想象的其他生活",
    });
    untouched.getState().localizeSeededMaterial("en-US", relocalizeSeededSession);
    expect(untouched.getState().tree.title).toBe("Other lives we are still allowed to imagine");

    const renamed = createMatterStore("expanded", {
      documentRoot: true,
      initialTitle: "被允许想象的其他生活",
    });
    expect(renamed.getState().renameDocument({
      commandId: "human_title_before_locale",
      title: "我自己的标题",
      createdAt: "2026-08-24T01:02:00.000Z",
    })).toMatchObject({ status: "committed" });
    renamed.getState().localizeSeededMaterial("en-US", relocalizeSeededSession);
    expect(renamed.getState().tree.title).toBe("我自己的标题");
    expect(renamed.getState().undo()).toMatchObject({ status: "committed" });
    expect(renamed.getState().tree.title).toBe("被允许想象的其他生活");
    renamed.getState().localizeSeededMaterial("en-US", relocalizeSeededSession);
    expect(renamed.getState().tree.title).toBe("被允许想象的其他生活");
    expect(renamed.getState().redo()).toMatchObject({ status: "committed" });
    expect(renamed.getState().tree.title).toBe("我自己的标题");
  });

  it("relocalizes an older hydrated seed snapshot and preserves every non-seed word", () => {
    const oldSnapshot = structuredClone(createSeededDocument().tree) as ThoughtTree;
    const root = oldSnapshot.nodes[SEEDED_DOCUMENT_NODE_IDS.root];
    const protectedNodes = [
      ["human_written_material", "We wrote this ourselves, word for word."],
      ["agent_committed_material", "This committed model passage must stay exact."],
      ["voice_admitted_material", "语音录入的这一句也不能被自动翻译。"],
    ] as const;
    for (const [id, text] of protectedNodes) {
      root.children.push(id);
      oldSnapshot.nodes[id] = {
        id,
        text,
        parentId: root.id,
        children: [],
        createdAt: "2026-08-24T01:03:00.000Z",
        updatedAt: "2026-08-24T01:03:00.000Z",
      };
    }
    oldSnapshot.revision += 1;

    const store = createMatterStore();
    store.getState().localizeSeededMaterial("en-US", relocalizeSeededSession);
    const beforeEpoch = store.getState().documentEpoch;
    expect(store.getState().hydrateSnapshot(oldSnapshot)).toMatchObject({ status: "hydrated" });
    expect(store.getState().documentEpoch).toBe(beforeEpoch + 1);

    expect(store.getState().localizeSeededMaterial("en-US", relocalizeSeededSession))
      .toMatchObject({ status: "localized" });
    expect(store.getState().tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].text)
      .toBe(seededNodeText("en-US", "root"));
    for (const [id, text] of protectedNodes) {
      expect(store.getState().tree.nodes[id].text).toBe(text);
    }
  });

  it("returns one private transform arrival receipt while Undo and Redo stay ordinary history", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const tree = structuredClone(store.getState().tree) as ThoughtTree;
    const nodeId = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
    const node = tree.nodes[nodeId];
    const materialLineage = selectLineage(tree, nodeId);
    if (node === undefined || materialLineage === null) {
      throw new Error("transform fixture lineage missing");
    }
    const lineage = materialLineage.map((entry, index) => ({
      id: entry.id,
      text: entry.text,
      parentId: index === 0 ? null : entry.parentId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
    const parsed = parseTransformEnvelope({
      protocolVersion: tree.protocolVersion,
      requestVersion: "transform/2",
      id: "turn_store_expand",
      treeId: tree.id,
      mode: "transform",
      operation: "expand-in-place",
      treeRevision: tree.revision,
      selection: {
        type: "segment-range",
        nodeId,
        start: 0,
        end: node.text.length,
        selectedText: node.text,
      },
      gesture: { type: "stretch", axis: "vertical", amount: 1 },
      locale: "zh-CN",
      context: { lineage },
    });
    if (!parsed.ok) throw new Error("transform fixture envelope invalid");
    const expanded = "被允许沿着眼前松动的边界缓慢想象的、仍然保留清晰细节和余地的其他生活";
    const plan = buildTransformPlan(parsed.envelope, expanded);

    const oldDocumentEpoch = store.getState().documentEpoch;
    expect(store.getState().hydrateSnapshot(tree)).toMatchObject({
      operation: "hydrate",
      status: "hydrated",
      revision: tree.revision,
    });
    expect(store.getState().commitTransform(
      parsed.envelope,
      plan,
      oldDocumentEpoch,
      Date.parse("2026-08-11T00:00:00.000Z"),
    )).toEqual({
      operation: "commit",
      status: "stale",
      revision: tree.revision,
    });
    expect(store.getState().lastError).toBeNull();
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(node.text);

    const receipt = store.getState().commitTransform(
      parsed.envelope,
      plan,
      store.getState().documentEpoch,
      Date.parse("2026-08-11T00:00:00.000Z"),
    );
    expect(receipt).toMatchObject({
      operation: "commit",
      status: "committed",
      transformChange: {
        id: "turn_store_expand",
        nodeId,
        motionHint: "grow",
        before: { text: node.text },
        after: { text: expanded },
      },
    });
    expect("transformChange" in (store.getState().lastReceipt ?? {})).toBe(false);
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(expanded);

    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(node.text);
    const redo = store.getState().redo();
    expect(redo).toMatchObject({ operation: "redo", status: "committed" });
    expect("transformChange" in redo).toBe(false);
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(expanded);
  });

  it("returns one private text-swap receipt while canonical Undo and Redo stay presentation-free", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const tree = structuredClone(store.getState().tree) as ThoughtTree;
    const nodeId = SEEDED_DOCUMENT_NODE_IDS.root;
    const node = tree.nodes[nodeId];
    const materialLineage = selectLineage(tree, nodeId);
    if (node === undefined || materialLineage === null) {
      throw new Error("text swap fixture lineage missing");
    }
    const source = "我们怀念的也许不是一个真实存在过的过去";
    const start = node.text.indexOf(source);
    const parsed = parseTextSwapEnvelope({
      protocolVersion: tree.protocolVersion,
      requestVersion: "text-swap/1",
      id: "text_swap_store",
      treeId: tree.id,
      mode: "transform",
      operation: "paraphrase-in-place",
      treeRevision: tree.revision,
      selection: {
        type: "segment-range",
        nodeId,
        start,
        end: start + source.length,
        selectedText: source,
      },
      direction: { text: "换一种更凝练的说法" },
      locale: "zh-CN",
      context: {
        lineage: materialLineage.map((entry, index) => ({
          id: entry.id,
          text: entry.text,
          parentId: index === 0 ? null : entry.parentId,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
      },
    });
    if (!parsed.ok) throw new Error("text swap fixture envelope invalid");
    const replacement = "我们也许怀念的，并不是一个曾经真实存在的过去";
    const plan = buildTextSwapPlan(parsed.envelope, replacement);
    const oldDocumentEpoch = store.getState().documentEpoch;
    expect(store.getState().hydrateSnapshot(tree)).toMatchObject({
      operation: "hydrate",
      status: "hydrated",
      revision: tree.revision,
    });
    expect(store.getState().commitTextSwap(
      parsed.envelope,
      plan,
      oldDocumentEpoch,
      Date.parse("2026-08-20T00:00:00.000Z"),
    )).toEqual({
      operation: "commit",
      status: "stale",
      revision: tree.revision,
    });
    expect(store.getState().lastError).toBeNull();
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(node.text);

    const receipt = store.getState().commitTextSwap(
      parsed.envelope,
      plan,
      store.getState().documentEpoch,
      Date.parse("2026-08-20T00:00:00.000Z"),
    );
    expect(receipt).toMatchObject({
      operation: "commit",
      status: "committed",
      textSwapChange: {
        id: "text_swap_store",
        nodeId,
        motionHint: "settle",
        before: { text: node.text },
      },
    });
    expect("textSwapChange" in (store.getState().lastReceipt ?? {})).toBe(false);
    const after = store.getState().tree.nodes[nodeId]?.text;
    expect(after).toBe(node.text.replace(source, replacement));

    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(node.text);
    const redo = store.getState().redo();
    expect(redo).toMatchObject({ operation: "redo", status: "committed" });
    expect("textSwapChange" in redo).toBe(false);
    expect(store.getState().tree.nodes[nodeId]?.text).toBe(after);
  });

  it("hydrates one validated snapshot while clearing runtime history and navigation", () => {
    const store = createMatterStore();
    const initial = store.getState();
    initial.select(SEEDED_DOCUMENT_NODE_IDS.root);
    store.getState().extendMaterial(SEEDED_DOCUMENT_NODE_IDS.root, branchValues());
    const storedTree = store.getState().tree;
    store.getState().extendMaterial(SEEDED_DOCUMENT_NODE_IDS.root, branchValues());

    expect(store.getState().hydrateSnapshot(storedTree as ThoughtTree)).toEqual({
      operation: "hydrate",
      status: "hydrated",
      revision: storedTree.revision,
    });
    expect(store.getState().tree).toEqual(storedTree);
    expect(store.getState().history.entries).toEqual([]);
    expect(store.getState().navigation).toMatchObject({
      mode: "full",
      focusNodeId: null,
      selectedNodeId: null,
    });
    expect(store.getState().navigation.foldedNodeIds.size).toBe(0);
  });

  it("switches to a separately validated document only through the explicit boundary", () => {
    const store = createMatterStore();
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("fixture root missing");
    store.getState().extendMaterial(rootId, branchValues());
    store.getState().focus(rootId);
    const imported = {
      ...createMatterStore().getState().tree,
      id: "imported_tree",
    } as ThoughtTree;

    expect(store.getState().hydrateSnapshot(imported)).toMatchObject({
      operation: "hydrate",
      status: "rejected",
    });
    expect(store.getState().switchDocument(imported)).toEqual({
      operation: "switch-document",
      status: "switched",
      treeId: "imported_tree",
      revision: imported.revision,
    });
    expect(store.getState().tree).toEqual(imported);
    expect(store.getState().history.entries).toEqual([]);
    expect(store.getState().navigation).toMatchObject({
      mode: "full",
      focusNodeId: null,
      selectedNodeId: null,
    });
  });
});

let branchSequence = 0;
function branchValues() {
  branchSequence += 1;
  return {
    nodeId: `thought_branch_${branchSequence}`,
    createdAt: `2026-08-09T00:00:${String(branchSequence).padStart(2, "0")}.000Z`,
  };
}
