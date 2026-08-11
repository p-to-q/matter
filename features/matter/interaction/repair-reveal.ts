const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});

const MAX_DIFF_DISTANCE = 160;
const MAX_REVEAL_UNITS = 64;

export const REPAIR_REVEAL_HOLD_MS = 160;
export const REPAIR_REVEAL_SETTLE_MS = 110;
export const REPAIR_REVEAL_MAX_SPAN_MS = 520;
export const REPAIR_REVEAL_MAX_TOTAL_MS =
  REPAIR_REVEAL_HOLD_MS + REPAIR_REVEAL_MAX_SPAN_MS + REPAIR_REVEAL_SETTLE_MS;

export type RepairRevealPart = Readonly<{
  text: string;
  revealIndex: number | null;
}>;

export type RepairRevealPlan = Readonly<{
  parts: readonly RepairRevealPart[];
  revealUnitCount: number;
  holdMs: number;
  stepMs: number;
  settleMs: number;
  totalMs: number;
}>;

type EditOperation = Readonly<{
  kind: "equal" | "insert" | "delete";
  value: string;
}>;

/**
 * Derives a bounded visual plan from two already-authoritative strings.
 * Stable graphemes are coalesced and never animated. Inserted/replaced
 * graphemes receive ordered reveal indices; a deletion-only seam lends one
 * adjacent glyph to the cue because the removed language has no final glyph.
 * Nothing here reads time, React, the DOM, or durable material.
 */
export function planRepairReveal(beforeText: string, afterText: string): RepairRevealPlan | null {
  if (beforeText === afterText || afterText.length === 0) return null;

  const before = graphemes(beforeText);
  const after = graphemes(afterText);
  const operations = shortestEditScript(before, after, MAX_DIFF_DISTANCE) ??
    fallbackEditScript(before, after);
  const changed = changedAfterMask(operations, after);
  const changedCount = changed.filter(Boolean).length;
  if (changedCount === 0) return null;

  const revealUnitCount = Math.min(changedCount, MAX_REVEAL_UNITS);
  const parts: RepairRevealPart[] = [];
  let changedOrdinal = 0;
  for (let index = 0; index < after.length; index += 1) {
    const isChanged = changed[index] === true;
    const revealIndex = isChanged
      ? Math.min(
          revealUnitCount - 1,
          Math.floor(changedOrdinal * revealUnitCount / changedCount),
        )
      : null;
    if (isChanged) changedOrdinal += 1;
    const previous = parts.at(-1);
    if (previous?.revealIndex === revealIndex) {
      parts[parts.length - 1] = Object.freeze({
        text: previous.text + after[index],
        revealIndex,
      });
    } else {
      parts.push(Object.freeze({ text: after[index]!, revealIndex }));
    }
  }

  const stepMs = revealUnitCount <= 1
    ? 0
    : Math.min(46, Math.floor(REPAIR_REVEAL_MAX_SPAN_MS / (revealUnitCount - 1)));
  const totalMs = REPAIR_REVEAL_HOLD_MS +
    stepMs * Math.max(0, revealUnitCount - 1) +
    REPAIR_REVEAL_SETTLE_MS;

  return Object.freeze({
    parts: Object.freeze(parts),
    revealUnitCount,
    holdMs: REPAIR_REVEAL_HOLD_MS,
    stepMs,
    settleMs: REPAIR_REVEAL_SETTLE_MS,
    totalMs,
  });
}

function graphemes(text: string): readonly string[] {
  return Object.freeze(Array.from(GRAPHEME_SEGMENTER.segment(text), ({ segment }) => segment));
}

function changedAfterMask(
  operations: readonly EditOperation[],
  after: readonly string[],
): boolean[] {
  const changed = Array<boolean>(after.length).fill(false);
  const deletionSeams = new Set<number>();
  let afterIndex = 0;
  for (const operation of operations) {
    if (operation.kind === "equal") {
      afterIndex += 1;
      continue;
    }
    if (operation.kind === "insert") {
      changed[afterIndex] = true;
      afterIndex += 1;
      continue;
    }
    deletionSeams.add(afterIndex);
  }

  for (const seam of deletionSeams) {
    if (changed[seam] === true || changed[seam - 1] === true) continue;
    const adjacent = nearestVisibleGrapheme(after, seam);
    if (adjacent !== null) changed[adjacent] = true;
  }

  // Whitespace has geometry but no ink. A whitespace-only edit would otherwise
  // run an animation nobody can perceive, so one adjacent visible grapheme
  // carries that seam cue while every other unchanged glyph remains stable.
  if (!changed.some((value, index) => value && !isWhitespace(after[index]!))) {
    const firstChanged = changed.findIndex(Boolean);
    const adjacent = nearestVisibleGrapheme(after, firstChanged < 0 ? 0 : firstChanged);
    if (adjacent !== null) changed[adjacent] = true;
  }
  return changed;
}

function nearestVisibleGrapheme(after: readonly string[], seam: number): number | null {
  // A seam belongs perceptually to what follows it. Prefer the first visible
  // glyph on the reading side; only a terminal deletion borrows the glyph
  // before the seam.
  for (let index = seam; index < after.length; index += 1) {
    if (!isWhitespace(after[index]!)) return index;
  }
  for (let index = Math.min(seam - 1, after.length - 1); index >= 0; index -= 1) {
    if (!isWhitespace(after[index]!)) return index;
  }
  return null;
}

function isWhitespace(value: string): boolean {
  return /^\s+$/u.test(value);
}

/** Myers' shortest edit script, stopped before an unexpected repair can grow quadratic. */
function shortestEditScript(
  before: readonly string[],
  after: readonly string[],
  distanceLimit: number,
): readonly EditOperation[] | null {
  const maximum = Math.min(before.length + after.length, distanceLimit);
  const trace: Map<number, number>[] = [];
  const frontier = new Map<number, number>([[1, 0]]);

  for (let distance = 0; distance <= maximum; distance += 1) {
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const deletion = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
      const insertion = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      let beforeIndex = diagonal === -distance ||
        (diagonal !== distance && deletion < insertion)
        ? Math.max(0, insertion)
        : Math.max(0, deletion + 1);
      let afterIndex = beforeIndex - diagonal;
      while (
        beforeIndex < before.length &&
        afterIndex < after.length &&
        before[beforeIndex] === after[afterIndex]
      ) {
        beforeIndex += 1;
        afterIndex += 1;
      }
      frontier.set(diagonal, beforeIndex);
      if (beforeIndex >= before.length && afterIndex >= after.length) {
        return backtrack(trace, before, after, distance);
      }
    }
  }
  return null;
}

function backtrack(
  trace: readonly Map<number, number>[],
  before: readonly string[],
  after: readonly string[],
  distance: number,
): readonly EditOperation[] {
  let beforeIndex = before.length;
  let afterIndex = after.length;
  const reversed: EditOperation[] = [];

  for (let current = distance; current > 0; current -= 1) {
    const frontier = trace[current]!;
    const diagonal = beforeIndex - afterIndex;
    const deletion = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
    const insertion = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
    const previousDiagonal = diagonal === -current ||
      (diagonal !== current && deletion < insertion)
      ? diagonal + 1
      : diagonal - 1;
    const previousBefore = frontier.get(previousDiagonal) ?? 0;
    const previousAfter = previousBefore - previousDiagonal;

    while (beforeIndex > previousBefore && afterIndex > previousAfter) {
      reversed.push(Object.freeze({ kind: "equal", value: after[afterIndex - 1]! }));
      beforeIndex -= 1;
      afterIndex -= 1;
    }
    if (beforeIndex === previousBefore) {
      reversed.push(Object.freeze({ kind: "insert", value: after[afterIndex - 1]! }));
      afterIndex -= 1;
    } else {
      reversed.push(Object.freeze({ kind: "delete", value: before[beforeIndex - 1]! }));
      beforeIndex -= 1;
    }
  }

  while (beforeIndex > 0 && afterIndex > 0) {
    reversed.push(Object.freeze({ kind: "equal", value: after[afterIndex - 1]! }));
    beforeIndex -= 1;
    afterIndex -= 1;
  }
  while (beforeIndex > 0) {
    reversed.push(Object.freeze({ kind: "delete", value: before[beforeIndex - 1]! }));
    beforeIndex -= 1;
  }
  while (afterIndex > 0) {
    reversed.push(Object.freeze({ kind: "insert", value: after[afterIndex - 1]! }));
    afterIndex -= 1;
  }
  return Object.freeze(reversed.reverse());
}

function fallbackEditScript(
  before: readonly string[],
  after: readonly string[],
): readonly EditOperation[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;

  return Object.freeze([
    ...before.slice(0, prefix).map((value) => Object.freeze({ kind: "equal" as const, value })),
    ...before.slice(prefix, before.length - suffix)
      .map((value) => Object.freeze({ kind: "delete" as const, value })),
    ...after.slice(prefix, after.length - suffix)
      .map((value) => Object.freeze({ kind: "insert" as const, value })),
    ...after.slice(after.length - suffix)
      .map((value) => Object.freeze({ kind: "equal" as const, value })),
  ]);
}
