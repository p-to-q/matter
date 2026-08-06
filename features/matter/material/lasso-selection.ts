import type { SegmentSelection } from "./text-segments";

export type LassoSelectionSet = readonly SegmentSelection[];

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
