import { renderContextReceipt } from "./context-receipt";
import { projectMaterialFileSubtree } from "./material-files";
import { projectMaterial, type MaterialAddress } from "./material-projection";
import type { ThoughtTree } from "../tree/model";

/**
 * The active view the model sees: the current view's own order and depth, and
 * the ids the working context keeps. The composition root derives it once and
 * hands it down; nothing here recomputes focus, fold or held-aside.
 */
export type ActiveWorkingTree = Readonly<{
  view: Extract<MaterialAddress, { kind: "working-tree" }>["view"];
  activeNodeIds: ReadonlySet<string>;
}>;

/**
 * Selected node ids as a working-tree address in authored order, with each
 * row's true tree depth. The projection alone decides parentage: a selected
 * node whose parent is not selected reads as parentless.
 */
export function selectionWorkingTreeAddress(
  tree: ThoughtTree,
  selectedNodeIds: ReadonlySet<string>,
): Extract<MaterialAddress, { kind: "working-tree" }> {
  const view = projectMaterialFileSubtree(tree, tree.rootId)
    .filter(({ nodeId }) => selectedNodeIds.has(nodeId))
    .map(({ nodeId, depth }) => ({ node: { id: nodeId }, depth }));
  return { kind: "working-tree", view, activeNodeIds: selectedNodeIds };
}

/** Markdown for an address, or null when it is refused (size) or cannot be produced. */
async function receiptFor(tree: ThoughtTree, address: MaterialAddress): Promise<string | null> {
  try {
    return await renderContextReceipt(projectMaterial(tree, address));
  } catch {
    return null;
  }
}

export function renderSelectionReceipt(
  tree: ThoughtTree,
  selectedNodeIds: ReadonlySet<string>,
): Promise<string | null> {
  return receiptFor(tree, selectionWorkingTreeAddress(tree, selectedNodeIds));
}

export function renderActiveTreeReceipt(
  tree: ThoughtTree,
  active: ActiveWorkingTree,
): Promise<string | null> {
  return receiptFor(tree, { kind: "working-tree", ...active });
}

export function receiptFileName(treeId: string, revision: number): string {
  return `matter-receipt-${treeId.slice(0, 8)}-r${revision}.md`;
}
