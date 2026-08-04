import { describe, expect, it } from "vitest";
import { commitTreeCommand, createTreeHistory } from "../tree/history";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtNode, ThoughtTree, TreeCommand } from "../tree/model";
import { createNavigationState, focusNode, selectNode, toggleFold } from "./navigation";
import {
  commitHumanAdmission,
  commitSessionCommand,
  undoSession,
  type RuntimeState,
} from "./session";
import { createAdmissionAnchor, type AdmissionValues } from "./admission";

const T0 = "2026-08-03T00:00:00.000Z";
const LIMITS = { maxEntries: 8, maxRetainedInverseBytes: 20_000 };

function node(
  id: string,
  parentId: string | null,
  children: string[] = [],
): ThoughtNode {
  return { id, text: id, parentId, children, createdAt: T0, updatedAt: T0 };
}

function command(
  id: string,
  revision: number,
  mutation: TreeCommand["mutation"],
): TreeCommand {
  return {
    id,
    source: "human",
    expectedTreeId: "tree_1",
    expectedRevision: revision,
    mutation,
    createdAt: T0,
  };
}

function emptyState(): RuntimeState {
  return {
    tree: createEmptyTree("tree_1"),
    history: createTreeHistory(),
    navigation: createNavigationState(),
    lastError: null,
  };
}

function rootedState(): RuntimeState {
  const initialized = commitTreeCommand(
    createEmptyTree("tree_1"),
    createTreeHistory(),
    command("init", 0, {
      type: "initialize-root",
      root: node("root", null),
    }),
    LIMITS,
  );
  if (!initialized.ok) throw new Error(initialized.error.code);
  return {
    tree: initialized.tree,
    history: initialized.history,
    navigation: createNavigationState(),
    lastError: null,
  };
}

describe("runtime session", () => {
  it("commits and exactly undoes a human root admission", () => {
    const state = emptyState();
    const anchored = createAdmissionAnchor(state.tree, state.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);
    const values: AdmissionValues = {
      interactionId: "voice_1",
      commandId: "admit_root",
      nodeId: "root",
      createdAt: T0,
      transcript: "unfinished",
    };

    const admitted = commitHumanAdmission(state, anchored.anchor, values, LIMITS);
    if (!admitted.ok) throw new Error(admitted.receipt.errorCode);
    expect(admitted.state).toMatchObject({
      tree: { rootId: "root", revision: 1 },
      navigation: { mode: "full", selectedNodeId: "root" },
    });
    expect(admitted.state.history.entries.at(-1)).toMatchObject({ source: "human" });

    const undone = undoSession(admitted.state);
    expect(undone).toMatchObject({
      ok: true,
      state: { tree: { rootId: null, nodes: {}, revision: 2 } },
    });
  });

  it("commits a child atomically while preserving the parent selection", () => {
    const state = rootedState();
    const selected = selectNode(state.tree, state.navigation, "root");
    if (!selected.ok) throw new Error(selected.error.code);
    const selectedState = { ...state, navigation: selected.navigation };
    const anchored = createAdmissionAnchor(selectedState.tree, selectedState.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const admitted = commitHumanAdmission(selectedState, anchored.anchor, {
      interactionId: "voice_2",
      commandId: "admit_child",
      nodeId: "child",
      createdAt: T0,
      transcript: "child",
    }, LIMITS);

    expect(admitted).toMatchObject({
      ok: true,
      state: {
        tree: { revision: 2, nodes: { root: { children: ["child"] } } },
        navigation: { selectedNodeId: "root" },
      },
    });

    if (!admitted.ok) throw new Error(admitted.receipt.errorCode);
    const undone = undoSession(admitted.state);
    expect(undone).toMatchObject({
      ok: true,
      state: {
        tree: { revision: 3, nodes: { root: { children: [] } } },
        navigation: { selectedNodeId: "root" },
      },
    });
    expect(undone.state.tree.nodes.child).toBeUndefined();
  });

  it("reveals the admitted child while preserving unrelated folds and parent selection", () => {
    const tree: ThoughtTree = {
      ...createEmptyTree("tree_1"),
      rootId: "root",
      nodes: {
        root: node("root", null, ["parent", "other"]),
        parent: node("parent", "root", ["prior"]),
        prior: node("prior", "parent"),
        other: node("other", "root", ["other_leaf"]),
        other_leaf: node("other_leaf", "other"),
      },
    };
    const state: RuntimeState = {
      tree,
      history: createTreeHistory(),
      navigation: {
        mode: "full",
        focusNodeId: null,
        selectedNodeId: "parent",
        foldedNodeIds: new Set(["parent", "other"]),
      },
      lastError: null,
    };
    const anchored = createAdmissionAnchor(state.tree, state.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const admitted = commitHumanAdmission(state, anchored.anchor, {
      interactionId: "voice_reveal",
      commandId: "admit_reveal",
      nodeId: "new_child",
      createdAt: T0,
      transcript: "new child",
    }, LIMITS);

    expect(admitted).toMatchObject({
      ok: true,
      state: {
        navigation: {
          mode: "full",
          selectedNodeId: "parent",
          foldedNodeIds: new Set(["other"]),
        },
      },
    });
    if (!admitted.ok) throw new Error(admitted.receipt.errorCode);
    expect(admitted.state.tree.nodes.parent.children).toEqual(["prior", "new_child"]);
  });

  it("atomically rejects a colliding admission id at the tree boundary", () => {
    const state = rootedState();
    const selected = selectNode(state.tree, state.navigation, "root");
    if (!selected.ok) throw new Error(selected.error.code);
    const selectedState = { ...state, navigation: selected.navigation };
    const anchored = createAdmissionAnchor(selectedState.tree, selectedState.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const rejected = commitHumanAdmission(selectedState, anchored.anchor, {
      interactionId: "voice_collision",
      commandId: "admit_collision",
      nodeId: "root",
      createdAt: T0,
      transcript: "collision",
    }, LIMITS);

    expect(rejected).toMatchObject({
      ok: false,
      receipt: { errorCode: "INVALID_COMMAND" },
    });
    expect(rejected.state.tree).toBe(selectedState.tree);
    expect(rejected.state.history).toBe(selectedState.history);
    expect(rejected.state.navigation).toBe(selectedState.navigation);
  });

  it("atomically rejects admission beyond the parent's child bound", () => {
    const children = Array.from({ length: 64 }, (_, index) => `child_${index}`);
    const nodes: ThoughtTree["nodes"] = { root: node("root", null, children) };
    for (const childId of children) nodes[childId] = node(childId, "root");
    const tree: ThoughtTree = {
      ...createEmptyTree("tree_1"),
      rootId: "root",
      nodes,
    };
    const selected = selectNode(tree, createNavigationState(), "root");
    if (!selected.ok) throw new Error(selected.error.code);
    const state: RuntimeState = {
      tree,
      history: createTreeHistory(),
      navigation: selected.navigation,
      lastError: null,
    };
    const anchored = createAdmissionAnchor(state.tree, state.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const rejected = commitHumanAdmission(state, anchored.anchor, {
      interactionId: "voice_bound",
      commandId: "admit_bound",
      nodeId: "overflow",
      createdAt: T0,
      transcript: "overflow",
    }, LIMITS);

    expect(rejected).toMatchObject({
      ok: false,
      receipt: { errorCode: "BOUND_EXCEEDED" },
    });
    expect(rejected.state.tree).toBe(state.tree);
    expect(rejected.state.history).toBe(state.history);
    expect(rejected.state.navigation).toBe(state.navigation);
  });

  it("rejects stale and history-capacity admission without publishing any owned state", () => {
    const state = emptyState();
    const anchored = createAdmissionAnchor(state.tree, state.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);
    const values: AdmissionValues = {
      interactionId: "voice_1",
      commandId: "admit_root",
      nodeId: "root",
      createdAt: T0,
      transcript: "unfinished",
    };
    const stale = commitHumanAdmission(
      { ...state, tree: { ...state.tree, revision: 1 } },
      anchored.anchor,
      values,
      LIMITS,
    );
    expect(stale).toMatchObject({ ok: false, receipt: { errorCode: "INVALID_INTERACTION" } });

    const capacity = commitHumanAdmission(state, anchored.anchor, values, {
      maxEntries: 1,
      maxRetainedInverseBytes: 0,
    }, () => 1);
    expect(capacity).toMatchObject({ ok: false, receipt: { errorCode: "HISTORY_LIMIT_EXCEEDED" } });
    expect(capacity.state.tree).toBe(state.tree);
    expect(capacity.state.history).toBe(state.history);
    expect(capacity.state.navigation).toBe(state.navigation);
  });

  it("publishes tree, history, navigation reconciliation, and a stable receipt together", () => {
    const state = rootedState();
    const result = commitSessionCommand(
      state,
      command("insert", 1, {
        type: "insert-node",
        node: node("child", "root"),
        parentId: "root",
        index: 0,
        expectedParentChildren: [],
      }),
      LIMITS,
    );

    expect(result).toMatchObject({
      ok: true,
      state: { tree: { revision: 2 }, lastError: null },
      receipt: {
        operation: "commit",
        status: "committed",
        revision: 2,
        affectedNodeIds: ["child", "root"],
      },
    });
    expect(result.state.history.entries).toHaveLength(2);
    expect(result.state).not.toBe(state);
  });

  it.each([
    ["stale revision", command("stale", 4, { type: "initialize-root", root: node("other", null) }), "REVISION_CONFLICT"],
    ["wrong tree", { ...command("wrong-tree", 0, { type: "initialize-root", root: node("root", null) }), expectedTreeId: "other" }, "INVALID_COMMAND"],
  ] as const)("rejects %s while preserving material ownership", (_name, invalid, code) => {
    const state = emptyState();
    const result = commitSessionCommand(state, invalid, LIMITS);

    expect(result).toMatchObject({
      ok: false,
      state: { lastError: { code } },
      receipt: {
        operation: "commit",
        status: "rejected",
        revision: 0,
        errorCode: code,
      },
    });
    expect(result.state.tree).toBe(state.tree);
    expect(result.state.history).toBe(state.history);
    expect(result.state.navigation).toBe(state.navigation);
  });

  it("rejects inverse capacity atomically and preserves all owned references", () => {
    const state = emptyState();
    const result = commitSessionCommand(
      state,
      command("large", 0, {
        type: "initialize-root",
        root: node("root", null),
      }),
      { maxEntries: 1, maxRetainedInverseBytes: 0 },
      () => 1,
    );

    expect(result).toMatchObject({
      ok: false,
      state: { lastError: { code: "HISTORY_LIMIT_EXCEEDED" } },
      receipt: { status: "rejected", errorCode: "HISTORY_LIMIT_EXCEEDED" },
    });
    expect(result.state.tree).toBe(state.tree);
    expect(result.state.history).toBe(state.history);
    expect(result.state.navigation).toBe(state.navigation);
  });

  it("throws only for invalid programmer-owned history configuration", () => {
    expect(() =>
      commitSessionCommand(
        emptyState(),
        command("init", 0, {
          type: "initialize-root",
          root: node("root", null),
        }),
        { maxEntries: 0, maxRetainedInverseBytes: 100 },
      ),
    ).toThrow(RangeError);
  });

  it("reports empty undo without changing material, history, or navigation", () => {
    const state = emptyState();
    const result = undoSession(state);

    expect(result).toMatchObject({
      ok: false,
      state: { lastError: { code: "EMPTY_HISTORY" } },
      receipt: {
        operation: "undo",
        status: "rejected",
        revision: 0,
        errorCode: "EMPTY_HISTORY",
      },
    });
    expect(result.state.tree).toBe(state.tree);
    expect(result.state.history).toBe(state.history);
    expect(result.state.navigation).toBe(state.navigation);
  });

  it("reconciles focus and folds in the same undo that removes their nodes", () => {
    const rooted = rootedState();
    const inserted = commitSessionCommand(
      rooted,
      command("insert", 1, {
        type: "insert-node",
        node: node("child", "root"),
        parentId: "root",
        index: 0,
        expectedParentChildren: [],
      }),
      LIMITS,
    );
    if (!inserted.ok) throw new Error(inserted.receipt.errorCode);
    const folded = toggleFold(inserted.state.tree, inserted.state.navigation, "root");
    if (!folded.ok) throw new Error(folded.error.code);
    const focused = focusNode(inserted.state.tree, folded.navigation, "child");
    if (!focused.ok) throw new Error(focused.error.code);
    const state = { ...inserted.state, navigation: focused.navigation };

    const undone = undoSession(state);

    expect(undone).toMatchObject({
      ok: true,
      state: {
        tree: { revision: 3 },
        navigation: {
          mode: "focus",
          focusNodeId: "root",
          selectedNodeId: "root",
          foldedNodeIds: new Set(),
        },
        lastError: null,
      },
      receipt: { operation: "undo", status: "committed", revision: 3 },
    });
    expect(undone.state.tree.nodes.child).toBeUndefined();
  });

  it("clears a previous error after the next successful material publication", () => {
    const failed = undoSession(emptyState());
    if (failed.ok) throw new Error("expected empty undo");

    const committed = commitSessionCommand(
      failed.state,
      command("init", 0, {
        type: "initialize-root",
        root: node("root", null),
      }),
      LIMITS,
    );

    expect(committed.ok).toBe(true);
    expect(committed.state.lastError).toBeNull();
  });
});
