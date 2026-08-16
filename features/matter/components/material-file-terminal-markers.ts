import type { MaterialFileRow } from "../material/material-files";

/**
 * A terminal point distinguishes a branch that stops earlier than the rest of
 * the authored outline. It is presentation-only: a deepest leaf stays quiet,
 * and no point can ever imply a disclosure action.
 */
export function projectMaterialFileTerminalMarkerIds(
  authoredRows: readonly MaterialFileRow[],
): ReadonlySet<string> {
  const deepestDepth = authoredRows.reduce((deepest, row) => Math.max(deepest, row.depth), 0);
  const ids = new Set<string>();
  for (const row of authoredRows) {
    if (!row.hasChildren && row.depth < deepestDepth) ids.add(row.nodeId);
  }
  return ids;
}
