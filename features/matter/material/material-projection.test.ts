import { describe, expect, it } from "vitest";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { isWellFormedUnicodeText } from "../tree/unicode-text";
import { projectInquiryContext } from "./inquiry-context";
import { MATERIAL_PROJECTION_VERSION, projectMaterial, type MaterialAddress } from "./material-projection";
import type { SegmentSelection } from "./text-segments";
import { projectActiveViewContext, projectWorkingContext } from "./working-context";

const TREE_ID = "tree_projection";
const ROOT_ID = documentRootId(TREE_ID);

/** doc root → a(b, c), d(e); d is the branch the working context sets aside. */
function fixture(heldText = "Held aside"): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: TREE_ID,
    rootId: ROOT_ID,
    revision: 7,
    nodes: {
      [ROOT_ID]: node(ROOT_ID, null, ["a", "d"], "", "document-root"),
      a: node("a", ROOT_ID, ["b", "c"], "Matter keeps thought as material."),
      b: node("b", "a", [], "Branches hold relations."),
      c: node("c", "a", [], "第三段 שלום"),
      d: node("d", ROOT_ID, ["e"], heldText),
      e: node("e", "d", [], "Secret child"),
    },
  };
}

function node(id: string, parentId: string | null, children: string[], text: string, role?: "document-root"): ThoughtNode {
  return {
    id,
    parentId,
    children,
    text,
    ...(role === undefined ? {} : { role }),
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

function fullView(tree: ThoughtTree): { node: ThoughtNode; depth: number }[] {
  const view: { node: ThoughtNode; depth: number }[] = [];
  const visit = (nodeId: string, depth: number): void => {
    const current = tree.nodes[nodeId];
    if (current === undefined) return;
    const isRoot = current.role === "document-root";
    if (!isRoot) view.push({ node: current, depth });
    for (const childId of current.children) visit(childId, isRoot ? 0 : depth + 1);
  };
  if (tree.rootId !== null) visit(tree.rootId, 0);
  return view;
}

function workingAddress(
  tree: ThoughtTree,
  held: ReadonlySet<string> = new Set(),
  view = fullView(tree),
): MaterialAddress {
  return { kind: "working-tree", view, activeNodeIds: projectWorkingContext(tree, held).activeNodeIds };
}

function select(nodeId: string, selectedText: string): SegmentSelection {
  return { type: "segment-range", nodeId, start: 0, end: selectedText.length, selectedText };
}

describe("material projection", () => {
  it("projects the active working tree in view order with the view's own depth", () => {
    const tree = fixture();
    const projection = projectMaterial(tree, workingAddress(tree, new Set(["d"])));
    expect(projection).toMatchObject({
      version: MATERIAL_PROJECTION_VERSION,
      treeId: TREE_ID,
      revision: 7,
      address: "working-tree",
      thoughtCount: 3,
      clipped: false,
    });
    expect(projection.nodes).toEqual([
      { nodeId: "a", parentId: null, siblingIndex: 0, depth: 0, text: "Matter keeps thought as material.", truncated: false },
      { nodeId: "b", parentId: "a", siblingIndex: 0, depth: 1, text: "Branches hold relations.", truncated: false },
      { nodeId: "c", parentId: "a", siblingIndex: 1, depth: 1, text: "第三段 שלום", truncated: false },
    ]);
  });

  it("a focus view names no parent it does not carry and keeps the view's depth", () => {
    const tree = fixture();
    const focusView = fullView(tree).filter(({ node: { id } }) => id === "b" || id === "c");
    const projection = projectMaterial(tree, workingAddress(tree, new Set(), focusView.map((entry) => ({ ...entry, depth: entry.depth - 1 }))));
    expect(projection.nodes.map(({ nodeId, parentId, depth, siblingIndex }) => ({ nodeId, parentId, depth, siblingIndex })))
      .toEqual([
        { nodeId: "b", parentId: null, depth: 0, siblingIndex: 0 },
        { nodeId: "c", parentId: null, depth: 0, siblingIndex: 1 },
      ]);
  });

  it("a folded view omits the folded descendants and keeps the folded node", () => {
    const tree = fixture();
    const folded = fullView(tree).filter(({ node: { id } }) => id !== "b" && id !== "c");
    const projection = projectMaterial(tree, workingAddress(tree, new Set(), folded));
    expect(projection.nodes.map(({ nodeId }) => nodeId)).toEqual(["a", "d", "e"]);
    expect(projection.nodes.map(({ parentId }) => parentId)).toEqual([null, null, "d"]);
    expect(projection.thoughtCount).toBe(3);
  });

  it("projects the root-to-focus lineage with the position on the path as depth", () => {
    const tree = fixture();
    const projection = projectMaterial(tree, { kind: "lineage", focusNodeId: "c" });
    expect(projection.address).toBe("lineage");
    expect(projection.nodes.map(({ nodeId, parentId, depth, siblingIndex }) => ({ nodeId, parentId, depth, siblingIndex })))
      .toEqual([
        { nodeId: "a", parentId: null, depth: 0, siblingIndex: 0 },
        { nodeId: "c", parentId: "a", depth: 1, siblingIndex: 0 },
      ]);
    expect(projection.thoughtCount).toBe(2);
  });

  it("projects selected passages with the presentation index as depth, repeating a node per range", () => {
    const tree = fixture();
    const projection = projectMaterial(tree, {
      kind: "selection",
      selections: [select("b", "hold"), select("b", "relations"), select("c", "第三段")],
    });
    expect(projection.address).toBe("selection");
    expect(projection.nodes.map(({ nodeId, depth, text, parentId, siblingIndex }) => ({ nodeId, depth, text, parentId, siblingIndex })))
      .toEqual([
        { nodeId: "b", depth: 0, text: "hold", parentId: null, siblingIndex: 0 },
        { nodeId: "b", depth: 1, text: "relations", parentId: null, siblingIndex: 0 },
        { nodeId: "c", depth: 2, text: "第三段", parentId: null, siblingIndex: 1 },
      ]);
    expect(projection.thoughtCount).toBe(3);
  });

  it("an empty selection, an unknown focus and the document root yield an empty projection", () => {
    const tree = fixture();
    for (const address of [
      { kind: "selection", selections: [] },
      { kind: "selection", selections: [select("nope", "x"), select(ROOT_ID, "x")] },
      { kind: "lineage", focusNodeId: "nope" },
      { kind: "lineage", focusNodeId: ROOT_ID },
      { kind: "lineage", focusNodeId: "__proto__" },
      { kind: "working-tree", view: [], activeNodeIds: new Set<string>() },
    ] satisfies MaterialAddress[]) {
      expect(projectMaterial(tree, address)).toMatchObject({ nodes: [], thoughtCount: 0, clipped: false });
    }
    const empty: ThoughtTree = { ...tree, rootId: null, nodes: {} };
    expect(projectMaterial(empty, { kind: "lineage", focusNodeId: "a" }).nodes).toEqual([]);
  });

  it("never carries the document root, even when a view offers it", () => {
    const tree = fixture();
    const root = tree.nodes[ROOT_ID] as ThoughtNode;
    const projection = projectMaterial(tree, {
      kind: "working-tree",
      view: [{ node: root, depth: 0 }, ...fullView(tree)],
      activeNodeIds: new Set([ROOT_ID, "a", "b", "c", "d", "e"]),
    });
    expect(projection.nodes.map(({ nodeId }) => nodeId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("carries a node once even when the view lists it twice", () => {
    const tree = fixture();
    const view = [...fullView(tree), ...fullView(tree)];
    const projection = projectMaterial(tree, workingAddress(tree, new Set(), view));
    expect(projection.nodes.map(({ nodeId }) => nodeId)).toEqual(["a", "b", "c", "d", "e"]);
    expect(projection.thoughtCount).toBe(5);
  });

  it("clips by node count, per-node and total code points, and reports it", () => {
    const tree = fixture();
    const address = workingAddress(tree);
    expect(projectMaterial(tree, address, { maxNodes: 2 })).toMatchObject({ thoughtCount: 5, clipped: true });
    expect(projectMaterial(tree, address, { maxNodes: 2 }).nodes).toHaveLength(2);

    const perNode = projectMaterial(tree, address, { maxNodeCodePoints: 4 });
    expect(perNode.nodes[0]).toMatchObject({ text: "Matt", truncated: true });
    expect(perNode.clipped).toBe(true);

    const total = projectMaterial(tree, address, { maxTotalCodePoints: 40 });
    expect(total.clipped).toBe(true);
    expect(total.nodes.reduce((sum, { text }) => sum + Array.from(text).length, 0)).toBeLessThanOrEqual(40);
    expect(total.nodes.length).toBeLessThan(5);
  });

  it("default limits are the tree's own bounds and clip nothing", () => {
    const tree = fixture("x".repeat(2_000));
    const projection = projectMaterial(tree, workingAddress(tree));
    expect(projection.clipped).toBe(false);
    expect(projection.nodes.find(({ nodeId }) => nodeId === "d")?.text).toHaveLength(2_000);
  });

  it("never splits a surrogate pair when truncating", () => {
    const tree = fixture("a😀b");
    const address = { kind: "selection", selections: [select("d", "a😀b")] } satisfies MaterialAddress;
    const two = projectMaterial(tree, address, { maxNodeCodePoints: 2 });
    expect(two.nodes[0]).toMatchObject({ text: "a😀", truncated: true });
    const one = projectMaterial(tree, address, { maxNodeCodePoints: 1 });
    expect(one.nodes[0]).toMatchObject({ text: "a", truncated: true });
    const zero = projectMaterial(tree, address, { maxNodeCodePoints: 0 });
    expect(zero.nodes[0]).toMatchObject({ text: "", truncated: true });
    for (const projection of [two, one, zero]) {
      expect(isWellFormedUnicodeText(projection.nodes[0]?.text ?? "")).toBe(true);
    }
  });

  it("is deterministic, frozen, and leaves its inputs untouched", () => {
    const tree = fixture();
    const before = JSON.stringify(tree);
    const address = workingAddress(tree, new Set(["d"]));
    const first = projectMaterial(tree, address);
    expect(JSON.stringify(projectMaterial(tree, address))).toBe(JSON.stringify(first));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.nodes)).toBe(true);
    expect(Object.isFrozen(first.nodes[0])).toBe(true);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it("derives nothing about withheld material from the output", () => {
    const withHeld = fixture();
    const withoutHeld: ThoughtTree = {
      ...withHeld,
      nodes: {
        [ROOT_ID]: node(ROOT_ID, null, ["a"], "", "document-root"),
        a: withHeld.nodes.a as ThoughtNode,
        b: withHeld.nodes.b as ThoughtNode,
        c: withHeld.nodes.c as ThoughtNode,
      },
    };
    const manyHeld = fixture("Entirely different withheld words");
    const held = new Set(["d"]);
    const reference = JSON.stringify(projectMaterial(withHeld, workingAddress(withHeld, held)));
    expect(JSON.stringify(projectMaterial(withoutHeld, workingAddress(withoutHeld)))).toBe(reference);
    expect(JSON.stringify(projectMaterial(manyHeld, workingAddress(manyHeld, held)))).toBe(reference);
    for (const secret of ["Held aside", "Secret child", "\"d\"", "\"e\""]) expect(reference).not.toContain(secret);
  });

  it("ranks siblings among the addressed set, so a held-aside sibling is not counted", () => {
    const tree: ThoughtTree = {
      ...fixture(),
      nodes: {
        [ROOT_ID]: node(ROOT_ID, null, ["h1", "h2", "k"], "", "document-root"),
        h1: node("h1", ROOT_ID, [], "withheld one"),
        h2: node("h2", ROOT_ID, [], "withheld two"),
        k: node("k", ROOT_ID, [], "kept"),
      },
    };
    const projection = projectMaterial(tree, workingAddress(tree, new Set(["h1", "h2"])));
    expect(projection.nodes).toEqual([
      { nodeId: "k", parentId: null, siblingIndex: 0, depth: 0, text: "kept", truncated: false },
    ]);
    expect(projection.thoughtCount).toBe(1);
  });
});

describe("material projection and the inquiry projection cannot drift", () => {
  const INQUIRY_LIMITS = { maxNodes: 64, maxNodeCodePoints: 480, maxTotalCodePoints: 4_000 } as const;

  function shape(nodes: readonly { nodeId: string; depth: number; text: string; truncated: boolean }[]) {
    return nodes.map(({ nodeId, depth, text, truncated }) => ({ nodeId, depth, text, truncated }));
  }

  function wideTree(count: number, text: string): ThoughtTree {
    const nodes: Record<string, ThoughtNode> = {
      [ROOT_ID]: node(ROOT_ID, null, [], "", "document-root"),
    };
    const rootChildren = (nodes[ROOT_ID] as ThoughtNode).children;
    for (let index = 0; index < count; index += 1) {
      const id = `w${index}`;
      const parentIndex = Math.floor((index - 1) / 8);
      const parentId = index < 8 ? ROOT_ID : `w${parentIndex}`;
      nodes[id] = node(id, parentId, [], `${text}${index}`);
      (parentId === ROOT_ID ? rootChildren : (nodes[parentId] as ThoughtNode).children).push(id);
    }
    return { ...fixture(), id: TREE_ID, nodes };
  }

  it("working-tree: same nodes, depth, text and truncation under the inquiry's limits", () => {
    const trees = [fixture(), wideTree(150, "字".repeat(300)), wideTree(30, "字".repeat(700)), wideTree(12, "x".repeat(40))];
    const heldSets: ReadonlySet<string>[] = [new Set(), new Set(["d"]), new Set(["w3", "w9"]), new Set(["w1"])];
    trees.forEach((tree, index) => {
      const held = heldSets[index] ?? new Set<string>();
      const view = fullView(tree);
      const active = projectWorkingContext(tree, held).activeNodeIds;
      for (const [maxNodeCodePoints, maxContextCodePoints] of [[480, 4_000], [10, 30], [5, 1_000], [480, 600]] as const) {
        const inquiry = projectInquiryContext(tree, projectActiveViewContext(view, active), { maxNodeCodePoints, maxContextCodePoints });
        const projection = projectMaterial(
          tree,
          { kind: "working-tree", view, activeNodeIds: active },
          { ...INQUIRY_LIMITS, maxNodeCodePoints, maxTotalCodePoints: maxContextCodePoints },
        );
        expect(shape(projection.nodes)).toEqual(shape(inquiry.lineage));
        expect(projection.thoughtCount).toBe(inquiry.thoughtCount);
      }
    });
  });

  it("working-tree: a focus view and a folded view agree with the inquiry", () => {
    const tree = fixture();
    const active = projectWorkingContext(tree).activeNodeIds;
    const focusView = fullView(tree).filter(({ node: { id } }) => id === "a" || id === "c").map((entry) => ({ ...entry, depth: entry.depth }));
    const foldedView = fullView(tree).filter(({ node: { id } }) => id !== "e");
    for (const view of [focusView, foldedView]) {
      const inquiry = projectInquiryContext(tree, projectActiveViewContext(view, active));
      const projection = projectMaterial(tree, { kind: "working-tree", view, activeNodeIds: active }, INQUIRY_LIMITS);
      expect(shape(projection.nodes)).toEqual(shape(inquiry.lineage));
    }
  });

  it("selection: same passages, presentation depth and truncation", () => {
    const tree = fixture();
    const working = projectActiveViewContext(fullView(tree), projectWorkingContext(tree).activeNodeIds);
    const selections = [select("b", "hold"), select("b", "relations"), select("c", "字".repeat(600)), select("a", "Matter")];
    for (const [maxNodeCodePoints, maxContextCodePoints] of [[480, 4_000], [3, 7], [480, 100]] as const) {
      const inquiry = projectInquiryContext(tree, working, selections, { maxNodeCodePoints, maxContextCodePoints });
      const projection = projectMaterial(
        tree,
        { kind: "selection", selections },
        { ...INQUIRY_LIMITS, maxNodeCodePoints, maxTotalCodePoints: maxContextCodePoints },
      );
      expect(inquiry.scope).toBe("selection");
      expect(shape(projection.nodes)).toEqual(shape(inquiry.lineage));
    }
  });
});
