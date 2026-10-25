import { describe, expect, it, vi } from "vitest";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { parseContextReceiptV2 } from "./context-receipt-v2";
import { receiptFileName, renderActiveTreeReceipt } from "./receipt-actions";
import { projectWorkingContext } from "./working-context";

const TREE_ID = "tree_receipt_actions";
const ROOT_ID = documentRootId(TREE_ID);

/** doc root → a(b(f), c), d(e), g; d is the branch the working context sets aside. */
function fixture(cText = "Third"): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: TREE_ID,
    rootId: ROOT_ID,
    revision: 12,
    nodes: {
      [ROOT_ID]: node(ROOT_ID, null, ["a", "d", "g"], "", "document-root"),
      a: node("a", ROOT_ID, ["b", "c"], "Alpha"),
      b: node("b", "a", ["f"], "Beta"),
      f: node("f", "b", [], "Deep"),
      c: node("c", "a", [], cText),
      d: node("d", ROOT_ID, ["e"], "Held aside secret"),
      e: node("e", "d", [], "Secret child"),
      g: node("g", ROOT_ID, [], "Gamma"),
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
    const current = tree.nodes[nodeId]!;
    const isRoot = current.role === "document-root";
    if (!isRoot) view.push({ node: current, depth });
    for (const childId of current.children) visit(childId, isRoot ? 0 : depth + 1);
  };
  visit(tree.rootId!, 0);
  return view;
}

async function parsed(markdown: string | null) {
  expect(markdown).not.toBeNull();
  const result = await parseContextReceiptV2(markdown);
  if (!result.ok) throw new Error(`receipt rejected: ${result.reason}`);
  return result.projection;
}

describe("the active working tree as a receipt", () => {
  it("is the active view and nothing the working context sets aside", async () => {
    const tree = fixture();
    const held = projectWorkingContext(tree, new Set(["d"]));
    const markdown = await renderActiveTreeReceipt(tree, { view: fullView(tree), activeNodeIds: held.activeNodeIds });
    const projection = await parsed(markdown);
    expect(projection.nodes.map(({ nodeId }) => nodeId)).toEqual(["a", "b", "f", "c", "g"]);
    expect(projection.thoughtCount).toBe(5);
    expect(markdown).not.toContain("secret");
    expect(markdown).not.toContain("Secret");
    expect(markdown).not.toMatch(/\b[de]\b/u);
  });

  it("follows the view it is handed, so a folded-away branch is absent too", async () => {
    const tree = fixture();
    const active = projectWorkingContext(tree).activeNodeIds;
    const view = fullView(tree).filter(({ node: { id } }) => id !== "b" && id !== "f");
    const projection = await parsed(await renderActiveTreeReceipt(tree, { view, activeNodeIds: active }));
    expect(projection.nodes.map(({ nodeId }) => nodeId)).toEqual(["a", "c", "d", "e", "g"]);
  });

  it("writes v2 and preserves valid line separators rather than silently refusing or normalizing them", async () => {
    const text = "valid\r\nmaterial\u0085with\u2028all\u2029separators";
    const tree = fixture(text);
    const markdown = await renderActiveTreeReceipt(tree, { view: fullView(tree), activeNodeIds: projectWorkingContext(tree).activeNodeIds });
    expect(markdown).toContain("format: matter-receipt/2");
    expect((await parsed(markdown)).nodes.find(({ nodeId }) => nodeId === "c")?.text).toBe(text);
  });
});

describe("a refused receipt", () => {
  it("resolves to null, never throws", async () => {
    const refused = fixture("lone surrogate \uD800");
    const active = projectWorkingContext(refused).activeNodeIds;
    await expect(renderActiveTreeReceipt(refused, { view: fullView(refused), activeNodeIds: active }))
      .resolves.toBeNull();
  });

  it("refuses a digest failure without leaking text and succeeds on an explicit later retry", async () => {
    const tree = fixture();
    const active = { view: fullView(tree), activeNodeIds: projectWorkingContext(tree).activeNodeIds };
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("synthetic unavailable crypto"));
    try {
      await expect(renderActiveTreeReceipt(tree, active)).resolves.toBeNull();
      const retried = await renderActiveTreeReceipt(tree, active);
      expect((await parsed(retried)).treeId).toBe(tree.id);
    } finally {
      digest.mockRestore();
    }
  });
});

describe("receipt file name", () => {
  it("is the first eight characters of the tree id and the revision", () => {
    expect(receiptFileName("matter_fixture_rooted_01", 7)).toBe("matter-receipt-matter_f-r7.md");
    expect(receiptFileName(TREE_ID, 12)).toBe("matter-receipt-tree_rec-r12.md");
    expect(receiptFileName("abc", 0)).toBe("matter-receipt-abc-r0.md");
  });
});
