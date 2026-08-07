import type { SegmentSelection } from "./text-segments";

export type LassoSelectionSet = readonly SegmentSelection[];

export type LassoSelectionSetResolution =
  | Readonly<{
      kind: "selection";
      selection: SegmentSelection;
      selections?: readonly SegmentSelection[];
    }>
  | Readonly<{ kind: "empty-closed" | "uncommitted" | "ambiguous" }>;

/** Owns the transient selection-set rules shared by interaction and UI. */
export function normalizeLassoSelectionSet(
  selections: readonly SegmentSelection[],
): LassoSelectionSet {
  const seen = new Set<string>();
  const normalized: SegmentSelection[] = [];
  for (const selection of selections) {
    const key = `${selection.nodeId}:${selection.start}:${selection.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(Object.freeze({ ...selection }));
  }
  return Object.freeze(normalized);
}

export function copyLassoSelectionSet(selections: LassoSelectionSet): string {
  return selections.map((selection) => selection.selectedText).join("\n\n");
}

/**
 * Commits the semantic set at pointer-up. An incomplete or stale stroke keeps
 * the set that existed at pointer-down; only a trustworthy empty loop clears it.
 */
export function settleLassoSelectionSet(
  startSelections: LassoSelectionSet,
  resolution: LassoSelectionSetResolution,
): LassoSelectionSet {
  if (resolution.kind === "selection") {
    return normalizeLassoSelectionSet(resolution.selections ?? [resolution.selection]);
  }
  if (resolution.kind === "empty-closed") return Object.freeze([]);
  return startSelections;
}
