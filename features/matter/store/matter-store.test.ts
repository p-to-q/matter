import { describe, expect, it } from "vitest";
import {
  ROOTED_FIXTURE_NODE_IDS,
  ROOT_ONLY_FIXTURE_TREE_ID,
} from "../fixtures/rooted-material";
import { createMatterStore } from "./matter-store";
import type { ThoughtTree } from "../tree/model";

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
    expect(store.getState().tree.nodes[ROOTED_FIXTURE_NODE_IDS.imaginedLives]?.text)
      .toBe("被允许想象的其他生活");
  });

  it("starts the public root-only document without descendants and grows locally", () => {
    const store = createMatterStore("root");
    const rootId = store.getState().tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");

    expect(store.getState().tree.id).toBe(ROOT_ONLY_FIXTURE_TREE_ID);
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

    first.getState().select(ROOTED_FIXTURE_NODE_IDS.root);
    expect(first.getState().navigation.selectedNodeId).toBe(
      ROOTED_FIXTURE_NODE_IDS.root,
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
    const firstReceipt = before.extendMaterial(ROOTED_FIXTURE_NODE_IDS.root, branchValues());
    const afterFirst = store.getState();
    const secondReceipt = afterFirst.extendMaterial(ROOTED_FIXTURE_NODE_IDS.root, branchValues());
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
    expect(afterSecond.tree.nodes[ROOTED_FIXTURE_NODE_IDS.root].children).toHaveLength(
      before.tree.nodes[ROOTED_FIXTURE_NODE_IDS.root].children.length + 2,
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
    store.getState().select(ROOTED_FIXTURE_NODE_IDS.root);
    const selected = store.getState();
    const receipt = selected.select(ROOTED_FIXTURE_NODE_IDS.root);
    const repeated = store.getState();

    expect(receipt).toMatchObject({ operation: "select", status: "navigated" });
    expect(repeated.navigation).toBe(selected.navigation);
    expect(repeated.tree).toBe(selected.tree);
    expect(repeated.history).toBe(selected.history);
  });

  it("clears a selection without changing the material or history", () => {
    const store = createMatterStore();
    store.getState().select(ROOTED_FIXTURE_NODE_IDS.root);
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
      .extendMaterial(ROOTED_FIXTURE_NODE_IDS.root, branchValues());
    expect(inserted.status).toBe("committed");
    const afterInsert = store.getState();
    const insertedNodeId = afterInsert.tree.nodes[ROOTED_FIXTURE_NODE_IDS.root].children.at(-1);
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
      focusNodeId: ROOTED_FIXTURE_NODE_IDS.root,
      selectedNodeId: ROOTED_FIXTURE_NODE_IDS.root,
    });
    expect(undone.lastError).toBeNull();
  });

  it("supports fold, focus, return, and empty undo through named actions", () => {
    const store = createMatterStore();
    const initial = store.getState();

    expect(initial.extendMaterial(ROOTED_FIXTURE_NODE_IDS.root, branchValues()).status).toBe(
      "committed",
    );
    const childId = store.getState().tree.nodes[ROOTED_FIXTURE_NODE_IDS.root].children[0];
    if (childId === undefined) throw new Error("fixture child missing");

    expect(initial.toggleFold(ROOTED_FIXTURE_NODE_IDS.root).status).toBe(
      "navigated",
    );
    expect(store.getState().navigation.foldedNodeIds.has(ROOTED_FIXTURE_NODE_IDS.root)).toBe(true);

    store.getState().focus(childId);
    expect(store.getState().navigation.mode).toBe("focus");
    store.getState().showFull();
    expect(store.getState().navigation).toMatchObject({
      mode: "full",
      selectedNodeId: childId,
    });
    expect(store.getState().navigation.foldedNodeIds.has(ROOTED_FIXTURE_NODE_IDS.root)).toBe(false);

    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
  });

  it("publishes a structural move once and restores it through named undo", () => {
    const store = createMatterStore();
    const before = store.getState().tree;
    store.getState().select(ROOTED_FIXTURE_NODE_IDS.imaginedTime);
    expect(store.getState().moveNode({
      commandId: "human_move_store",
      nodeId: ROOTED_FIXTURE_NODE_IDS.imaginedTime,
      targetParentId: ROOTED_FIXTURE_NODE_IDS.presentDistance,
      createdAt: "2026-08-07T00:00:00.000Z",
    })).toMatchObject({ operation: "commit", status: "committed" });
    expect(store.getState().tree.nodes[ROOTED_FIXTURE_NODE_IDS.imaginedTime].parentId)
      .toBe(ROOTED_FIXTURE_NODE_IDS.presentDistance);
    expect(store.getState().navigation.selectedNodeId).toBe(ROOTED_FIXTURE_NODE_IDS.imaginedTime);
    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes).toEqual(before.nodes);
  });

  it("hydrates one validated snapshot while clearing runtime history and navigation", () => {
    const store = createMatterStore();
    const initial = store.getState();
    initial.select(ROOTED_FIXTURE_NODE_IDS.root);
    store.getState().extendMaterial(ROOTED_FIXTURE_NODE_IDS.root, branchValues());
    const storedTree = store.getState().tree;
    store.getState().extendMaterial(ROOTED_FIXTURE_NODE_IDS.root, branchValues());

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
