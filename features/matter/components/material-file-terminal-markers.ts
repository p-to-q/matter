import type { MaterialFileRow } from "../material/material-files";

/**
 * A terminal point belongs to one visible sibling group. When that group has
 * a structural branch, its leaf siblings are local early endings; an all-leaf
 * group is already terminal and stays blank. The point is presentation-only
 * and can never imply a disclosure action.
 */
export function projectMaterialFileTerminalMarkerIds(
  visibleRows: readonly MaterialFileRow[],
  structuralBranchRowIndexes: ReadonlySet<number>,
): ReadonlySet<string> {
  const branchingParentIds = new Set<string | null>();
  for (const [index, row] of visibleRows.entries()) {
    if (structuralBranchRowIndexes.has(index)) branchingParentIds.add(row.parentId);
  }
  const ids = new Set<string>();
  for (const row of visibleRows) {
    if (!row.hasChildren && branchingParentIds.has(row.parentId)) ids.add(row.nodeId);
  }
  return ids;
}
