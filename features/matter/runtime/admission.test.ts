import { describe, expect, it } from "vitest";
import { commitTreeCommand, createTreeHistory } from "../tree/history";
import { MAX_NODE_TEXT_CODE_UNITS, createEmptyTree } from "../tree/invariants";
import type { ThoughtNode, ThoughtTree, TreeCommand } from "../tree/model";
import {
  createNavigationState,
  focusNode,
  selectNode,
  toggleFold,
} from "./navigation";
import {
  admissionToTreeCommand,
  createAdmissionAnchor,
  type AdmissionValues,
} from "./admission";

const T0 = "2026-08-03T00:00:00.000Z";
const LIMITS = { maxEntries: 8, maxRetainedInverseBytes: 20_000 };

function values(transcript = "  unfinished, exactly as spoken.  "): AdmissionValues {
  return {
    interactionId: "voice_1",
    commandId: "admit_1",
    nodeId: "new_node",
    createdAt: T0,
    transcript,
  };
}

function node(id: string, parentId: string | null, children: string[] = []): ThoughtNode {
  return { id, text: id, parentId, children, createdAt: T0, updatedAt: T0 };
}

function rootedTree(): ThoughtTree {
  const tree = createEmptyTree("tree_1");
  const command: TreeCommand = {
    id: "init",
    source: "human",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation: { type: "initialize-root", root: node("root", null) },
    createdAt: T0,
  };
  const result = commitTreeCommand(tree, createTreeHistory(), command, LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return result.tree;
}

describe("human material admission", () => {
  it("anchors and normalizes admitted root material punctuation", () => {
    const tree = createEmptyTree("tree_1", 4);
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const translated = admissionToTreeCommand(tree, navigation, anchored.anchor, values());

    expect(translated).toMatchObject({
      ok: true,
      command: {
        source: "human",
        interactionId: "voice_1",
        expectedTreeId: "tree_1",
        expectedRevision: 4,
        mutation: {
          type: "initialize-root",
          root: {
            id: "new_node",
            text: "unfinished, exactly as spoken.",
            parentId: null,
            children: [],
            createdAt: T0,
            updatedAt: T0,
          },
        },
      },
    });
  });

  it("appends a child using exact parent order and preserves the anchored view", () => {
    const tree = rootedTree();
    const selected = selectNode(tree, createNavigationState(), "root");
    if (!selected.ok) throw new Error(selected.error.code);
    const anchored = createAdmissionAnchor(tree, selected.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const translated = admissionToTreeCommand(tree, selected.navigation, anchored.anchor, values("child"));

    expect(translated).toMatchObject({
      ok: true,
      command: {
        expectedRevision: 1,
        mutation: {
          type: "insert-node",
          parentId: "root",
          index: 0,
          expectedParentChildren: [],
          node: { id: "new_node", text: "child.", parentId: "root" },
        },
      },
    });
  });

  it("anchors a new admission beneath the selected visible passage", () => {
    const root = node("root", null, ["first", "second"]);
    const first = node("first", "root");
    const second = node("second", "root");
    const tree: ThoughtTree = {
      ...createEmptyTree("tree_1", 1),
      rootId: "root",
      nodes: { root, first, second },
    };
    const selected = selectNode(tree, createNavigationState(), "second");
    if (!selected.ok) throw new Error(selected.error.code);
    const anchored = createAdmissionAnchor(tree, selected.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    expect(anchored.anchor).toMatchObject({ target: "child", parentNodeId: "second" });
    expect(admissionToTreeCommand(tree, selected.navigation, anchored.anchor, values("nested")))
      .toMatchObject({
        ok: true,
        command: { mutation: { parentId: "second", node: { parentId: "second" } } },
      });
  });

  it.each(["", "   ", "\n\t"])("rejects an empty transcript %j", (transcript) => {
    const tree = createEmptyTree("tree_1");
    const anchored = createAdmissionAnchor(tree, createNavigationState());
    if (!anchored.ok) throw new Error(anchored.error.code);
    expect(admissionToTreeCommand(tree, createNavigationState(), anchored.anchor, values(transcript))).toMatchObject({
      ok: false,
      error: { code: "INVALID_ADMISSION_TRANSCRIPT" },
    });
  });

  it("accepts the exact text bound and rejects one code unit over without truncation", () => {
    const tree = createEmptyTree("tree_1");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const atBound = admissionToTreeCommand(tree, navigation, anchored.anchor, values(`${"a".repeat(MAX_NODE_TEXT_CODE_UNITS - 1)}.`));
    const overBound = admissionToTreeCommand(tree, navigation, anchored.anchor, values("a".repeat(MAX_NODE_TEXT_CODE_UNITS + 1)));

    expect(atBound.ok).toBe(true);
    expect(overBound).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });

  it("rejects stale tree identity, revision, and focus while ignoring a later selection", () => {
    const tree = rootedTree();
    const selected = selectNode(tree, createNavigationState(), "root");
    if (!selected.ok) throw new Error(selected.error.code);
    const anchored = createAdmissionAnchor(tree, selected.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);
    const focused = focusNode(tree, selected.navigation, "root");
    if (!focused.ok) throw new Error(focused.error.code);

    expect(admissionToTreeCommand({ ...tree, id: "other" }, selected.navigation, anchored.anchor, values())).toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(admissionToTreeCommand({ ...tree, revision: 2 }, selected.navigation, anchored.anchor, values())).toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(admissionToTreeCommand(tree, { ...selected.navigation, selectedNodeId: null }, anchored.anchor, values())).toMatchObject({ ok: true });
    expect(admissionToTreeCommand(tree, focused.navigation, anchored.anchor, values())).toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
  });

  it("rejects creating a child admission anchor in focus view", () => {
    const tree = rootedTree();
    const focused = focusNode(tree, createNavigationState(), "root");
    if (!focused.ok) throw new Error(focused.error.code);

    expect(createAdmissionAnchor(tree, focused.navigation)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INTERACTION" },
    });
  });

  it("allows fold-only navigation changes because they do not change the handle", () => {
    const root = node("root", null, ["child"]);
    const child = node("child", "root");
    const tree: ThoughtTree = {
      ...createEmptyTree("tree_1"),
      rootId: "root",
      nodes: { root, child },
    };
    const selected = selectNode(tree, createNavigationState(), "root");
    if (!selected.ok) throw new Error(selected.error.code);
    const anchored = createAdmissionAnchor(tree, selected.navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);
    const folded = toggleFold(tree, selected.navigation, "root");
    if (!folded.ok) throw new Error(folded.error.code);

    expect(admissionToTreeCommand(tree, folded.navigation, anchored.anchor, values())).toMatchObject({ ok: true });
  });

  it("uses an empty tree for the root and any full rooted tree for a top-level child", () => {
    const empty = createEmptyTree("tree_1");
    expect(createAdmissionAnchor(empty, { ...createNavigationState(), selectedNodeId: "ghost" })).toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(createAdmissionAnchor(rootedTree(), createNavigationState())).toMatchObject({
      ok: true,
      anchor: { target: "child", parentNodeId: "root" },
    });
  });

  it("rejects invalid edge-injected identifiers and time before constructing a command", () => {
    const tree = createEmptyTree("tree_1");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    expect(admissionToTreeCommand(tree, navigation, anchored.anchor, {
      ...values(),
      interactionId: "",
    })).toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(admissionToTreeCommand(tree, navigation, anchored.anchor, {
      ...values(),
      createdAt: "not-a-time",
    })).toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
  });
});
