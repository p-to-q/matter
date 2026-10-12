import { describe, expect, it } from "vitest";
import {
  MAX_CHILDREN_PER_NODE,
  MAX_NODES_PER_TREE,
  MAX_TREE_DEPTH,
  validateThoughtTree,
} from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { admissionToTreeCommand } from "./admission";
import { createNavigationState, selectNode } from "./navigation";
import {
  createUnderAnchor,
  underBlockReason,
  underChildRoom,
  type UnderAvailabilityInput,
} from "./under-child";

const T0 = "2026-08-03T00:00:00.000Z";

function node(
  id: string,
  parentId: string | null,
  children: string[] = [],
  role?: ThoughtNode["role"],
): ThoughtNode {
  return {
    id,
    text: role === "document-root" ? "" : id,
    parentId,
    children,
    createdAt: T0,
    updatedAt: T0,
    ...(role === undefined ? {} : { role }),
  };
}

function treeOf(rootId: string, nodes: ThoughtNode[], revision = 7): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_1",
    rootId,
    revision,
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  } as ThoughtTree;
}

/** A plain root with one chain of `length` descendants: n1 under root, n2 under n1... */
function chain(length: number, rootRole?: ThoughtNode["role"]): ThoughtTree {
  const nodes: ThoughtNode[] = [node("root", null, length > 0 ? ["n1"] : [], rootRole)];
  for (let index = 1; index <= length; index += 1) {
    nodes.push(node(`n${index}`, index === 1 ? "root" : `n${index - 1}`, index < length ? [`n${index + 1}`] : []));
  }
  return treeOf("root", nodes);
}

function withChild(tree: ThoughtTree, parentId: string): ThoughtTree {
  return treeOf(tree.rootId as string, [
    ...Object.values(tree.nodes).map((entry) =>
      entry.id === parentId ? { ...entry, children: [...entry.children, "extra"] } : entry),
    node("extra", parentId),
  ]);
}

const OPEN: Omit<UnderAvailabilityInput, "tree" | "nodeId"> = {
  voiceAdmissionAvailable: true,
  heldAside: false,
  interactionBusy: false,
};

function reason(tree: ThoughtTree, nodeId: string, overrides: Partial<typeof OPEN> = {}) {
  return underBlockReason({ tree, nodeId, ...OPEN, ...overrides });
}

describe("Under availability", () => {
  const tree = chain(2);

  it("is available when every condition holds", () => {
    expect(reason(tree, "n1")).toBeNull();
  });

  it("is blocked, never absent, when the passage is held aside", () => {
    expect(reason(tree, "n1", { heldAside: true })).toBe("held-aside");
  });

  it("is blocked when voice admission is not available", () => {
    expect(reason(tree, "n1", { voiceAdmissionAvailable: false })).toBe("voice-unavailable");
  });

  it("is blocked while another interaction is pending", () => {
    expect(reason(tree, "n1", { interactionBusy: true })).toBe("busy");
  });

  it("treats a vanished passage as stale rather than throwing", () => {
    expect(reason(tree, "gone")).toBe("busy");
  });

  it("names the most durable true reason when several hold", () => {
    expect(reason(tree, "n1", {
      heldAside: true,
      voiceAdmissionAvailable: false,
      interactionBusy: true,
    })).toBe("held-aside");
    expect(reason(tree, "n1", {
      voiceAdmissionAvailable: false,
      interactionBusy: true,
    })).toBe("voice-unavailable");
  });
});

describe("Under tree bounds", () => {
  it("allows a child exactly at the deepest legal level and refuses one past it", () => {
    // A plain root is depth 1 and `n<k>` is depth k + 1, so depth MAX is n<MAX - 1>.
    const open = chain(MAX_TREE_DEPTH - 2);
    const parentOfLast = `n${MAX_TREE_DEPTH - 2}`;
    expect(underChildRoom(open, parentOfLast)).toBeNull();
    expect(reason(open, parentOfLast)).toBeNull();
    expect(validateThoughtTree(withChild(open, parentOfLast)).ok).toBe(true);

    const full = chain(MAX_TREE_DEPTH - 1);
    const deepest = `n${MAX_TREE_DEPTH - 1}`;
    expect(underChildRoom(full, deepest)).toBe("deepest-level");
    expect(reason(full, deepest)).toBe("deepest-level");
  });

  it("counts a document root as depth 0, exactly as tree validation does", () => {
    // Under a document root `n<k>` is depth k, so n<MAX> is the deepest legal passage.
    const withDocumentRoot = chain(MAX_TREE_DEPTH, "document-root");
    expect(validateThoughtTree(withDocumentRoot).ok).toBe(true);
    expect(underChildRoom(withDocumentRoot, `n${MAX_TREE_DEPTH}`)).toBe("deepest-level");
    expect(underChildRoom(withDocumentRoot, `n${MAX_TREE_DEPTH - 1}`)).toBeNull();
    expect(validateThoughtTree(withChild(withDocumentRoot, `n${MAX_TREE_DEPTH - 1}`)).ok).toBe(true);
  });

  it("refuses at the deepest level in agreement with the tree validator", () => {
    // The mark must never offer what the engine would reject.
    const deep = chain(MAX_TREE_DEPTH - 1);
    const deepest = `n${MAX_TREE_DEPTH - 1}`;
    expect(validateThoughtTree(deep).ok).toBe(true);
    expect(validateThoughtTree(withChild(deep, deepest)).ok).toBe(false);
    expect(underChildRoom(deep, deepest)).toBe("deepest-level");
  });

  it("refuses a parent that already holds the most children", () => {
    const ids = Array.from({ length: MAX_CHILDREN_PER_NODE }, (_, index) => `c${index}`);
    const crowded = treeOf("root", [
      node("root", null, ids),
      ...ids.map((id) => node(id, "root")),
    ]);
    expect(underChildRoom(crowded, "root")).toBe("child-limit");
    expect(reason(crowded, "root")).toBe("child-limit");
    expect(underChildRoom(crowded, "c0")).toBeNull();

    const roomy = treeOf("root", [
      node("root", null, ids.slice(0, -1)),
      ...ids.slice(0, -1).map((id) => node(id, "root")),
    ]);
    expect(underChildRoom(roomy, "root")).toBeNull();
  });

  it("refuses once the tree holds the most nodes", () => {
    const perParent = 40;
    const parents = Math.ceil(MAX_NODES_PER_TREE / perParent);
    const nodes: ThoughtNode[] = [];
    const rootChildren: string[] = [];
    let count = 1;
    for (let parent = 0; parent < parents && count < MAX_NODES_PER_TREE; parent += 1) {
      const parentId = `p${parent}`;
      rootChildren.push(parentId);
      const children: string[] = [];
      count += 1;
      for (let child = 0; child < perParent && count < MAX_NODES_PER_TREE; child += 1) {
        const id = `p${parent}_c${child}`;
        children.push(id);
        nodes.push(node(id, parentId));
        count += 1;
      }
      nodes.push(node(parentId, "root", children));
    }
    nodes.push(node("root", null, rootChildren));
    const full = treeOf("root", nodes);
    expect(Object.keys(full.nodes)).toHaveLength(MAX_NODES_PER_TREE);
    expect(underChildRoom(full, "p0")).toBe("tree-full");
    expect(reason(full, "p0")).toBe("tree-full");
  });

  it("reports a bound before the environment, so a bound is never hidden", () => {
    const full = chain(MAX_TREE_DEPTH - 1);
    expect(reason(full, `n${MAX_TREE_DEPTH - 1}`, {
      voiceAdmissionAvailable: false,
      interactionBusy: true,
    })).toBe("deepest-level");
  });
});

describe("Under anchor", () => {
  const tree = chain(2);

  it("is a child handle whose parent is the passage, whatever the selection was", () => {
    const selected = selectNode(tree, createNavigationState(), "n2");
    if (!selected.ok) throw new Error("selection failed");
    const anchored = createUnderAnchor(tree, selected.navigation, "n1");
    expect(anchored).toEqual({
      ok: true,
      anchor: { target: "child", treeId: "tree_1", baseRevision: 7, parentNodeId: "n1" },
    });
  });

  it("is refused outside the full view, exactly as admission is", () => {
    const focused = { ...createNavigationState(), mode: "focus" as const, focusNodeId: "n1" };
    expect(createUnderAnchor(tree, focused, "n1")).toMatchObject({ ok: false });
  });

  it("appends the spoken child as the last child of that passage", () => {
    const withKids = treeOf("root", [
      node("root", null, ["a"]),
      node("a", "root", ["b", "c"]),
      node("b", "a"),
      node("c", "a"),
    ]);
    const navigation = createNavigationState();
    const anchored = createUnderAnchor(withKids, navigation, "a");
    if (!anchored.ok) throw new Error(anchored.error.code);

    const translated = admissionToTreeCommand(withKids, navigation, anchored.anchor, {
      interactionId: "voice_1",
      commandId: "admit_1",
      nodeId: "spoken",
      createdAt: T0,
      transcript: "said under a",
    });

    expect(translated).toMatchObject({ ok: true });
    if (!translated.ok) return;
    expect(translated.command).toMatchObject({
      source: "human",
      mutation: {
        type: "insert-node",
        parentId: "a",
        index: 2,
        expectedParentChildren: ["b", "c"],
        node: { id: "spoken", parentId: "a", children: [], text: "said under a" },
      },
    });
  });
});
