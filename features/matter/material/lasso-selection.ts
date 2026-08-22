import type { SegmentSelection } from "./text-segments";

export type LassoSelectionSet = readonly SegmentSelection[];

/** One transient semantic address. DOM fragments and adjacent seams may be many; authority is one. */
export type LassoAddress = Readonly<{
  kind: "contiguous-segment-range";
  range: SegmentSelection;
}>;

export type LassoAddressResolution =
  | Readonly<{
      kind: "selection";
      mode: "contiguous-segment-range" | "selection-set";
      selection: SegmentSelection;
      selections?: readonly SegmentSelection[];
    }>
  | Readonly<{ kind: "empty-closed" | "uncommitted" | "ambiguous" }>;

export function lassoAddressFromResolution(
  resolution: Extract<LassoAddressResolution, { kind: "selection" }>,
): LassoAddress | null {
  const selections = lassoSelectionSetFromResolution(resolution);
  if (resolution.mode !== "contiguous-segment-range" || selections?.length !== 1) {
    return null;
  }
  return Object.freeze({
    kind: "contiguous-segment-range",
    range: selections[0]!,
  });
}

export function lassoSelectionSetFromResolution(
  resolution: Extract<LassoAddressResolution, { kind: "selection" }>,
): LassoSelectionSet | null {
  return ownedSelectionsFromResolution(resolution);
}

export function primaryLassoSelection(
  address: LassoAddress | null,
): SegmentSelection | null {
  return address?.range ?? null;
}

/** Owns the transient multi-passage rules shared by interaction and UI. */
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
 * A completed selection replaces the set. Incomplete or stale strokes retain
 * the prior set; only a trustworthy empty loop clears it.
 */
export function settleLassoSelectionSet(
  startSelections: LassoSelectionSet,
  resolution: LassoAddressResolution,
): LassoSelectionSet {
  if (resolution.kind === "selection") {
    return lassoSelectionSetFromResolution(resolution) ?? startSelections;
  }
  if (resolution.kind === "empty-closed") return Object.freeze([]);
  return startSelections;
}

function ownedSelectionsFromResolution(
  resolution: Extract<LassoAddressResolution, { kind: "selection" }>,
): LassoSelectionSet | null {
  const rawSelections = resolution.selections ?? [resolution.selection];
  if (rawSelections.some((selection) => !isSegmentSelection(selection))) return null;
  const selections = normalizeLassoSelectionSet(rawSelections);
  if (
    selections.length === 0 ||
    !sameSelection(selections[0]!, resolution.selection)
  ) return null;
  if (resolution.mode === "contiguous-segment-range") {
    return selections.length === 1 ? selections : null;
  }
  return selections.length >= 2 ? selections : null;
}

function isSegmentSelection(selection: SegmentSelection): boolean {
  return selection.type === "segment-range" &&
    typeof selection.nodeId === "string" &&
    selection.nodeId.length > 0 &&
    Number.isSafeInteger(selection.start) &&
    Number.isSafeInteger(selection.end) &&
    selection.start >= 0 &&
    selection.end > selection.start &&
    typeof selection.selectedText === "string" &&
    selection.selectedText.length > 0;
}

function sameSelection(left: SegmentSelection, right: SegmentSelection): boolean {
  return left.type === right.type &&
    left.nodeId === right.nodeId &&
    left.start === right.start &&
    left.end === right.end &&
    left.selectedText === right.selectedText;
}
