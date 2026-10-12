import { renderContextReceipt } from "./context-receipt";
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

/** Markdown for an address, or null when it is refused (size) or cannot be produced. */
async function receiptFor(tree: ThoughtTree, address: MaterialAddress): Promise<string | null> {
  try {
    return await renderContextReceipt(projectMaterial(tree, address));
  } catch {
    return null;
  }
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
