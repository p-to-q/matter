import type { LassoSelectionSet } from "../material/lasso-selection";
import { validateSelection } from "../material/text-segments";
import type { ThoughtTree } from "../tree/model";

export type LassoMaterialTransition = Readonly<{
  releasePointerId: number | null;
  retainSelections: boolean;
}>;

/** A material revision revokes lasso authority only when its addressed text changed. */
export function lassoSelectionsRemainValid(
  tree: ThoughtTree,
  selections: LassoSelectionSet,
): boolean {
  return selections.every((selection) => {
    const node = tree.nodes[selection.nodeId];
    return node !== undefined && validateSelection(node.text, selection, node.id).ok;
  });
}

/** Plans pointer release and semantic retention before the hook mutates either. */
export function planLassoMaterialTransition(input: Readonly<{
  tree: ThoughtTree;
  selections: LassoSelectionSet;
  ownerChanged: boolean;
  drawingPointerId: number | null;
}>): LassoMaterialTransition {
  return Object.freeze({
    releasePointerId: input.drawingPointerId,
    retainSelections: !input.ownerChanged &&
      lassoSelectionsRemainValid(input.tree, input.selections),
  });
}
