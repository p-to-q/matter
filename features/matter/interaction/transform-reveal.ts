import { planRepairReveal } from "./repair-reveal";

export const TRANSFORM_REVEAL_MIN_TOTAL_MS = 240;
export const TRANSFORM_REVEAL_MAX_TOTAL_MS = 450;

export type TransformRevealPart = Readonly<{
  text: string;
  group: number | null;
}>;

export type TransformRevealPlan = Readonly<{
  parts: readonly TransformRevealPart[];
  groupCount: number;
  holdMs: number;
  stepMs: number;
  settleMs: number;
  totalMs: number;
}>;

/**
 * Groups the bounded canonical-text diff into a few perceptible arrivals.
 * This is presentation only: the complete final string already owns the DOM,
 * accessibility name, layout, and hit testing before any group is revealed.
 */
export function planTransformReveal(
  beforeText: string,
  afterText: string,
): TransformRevealPlan | null {
  const diff = planRepairReveal(beforeText, afterText);
  if (diff === null || diff.revealUnitCount === 0) return null;

  const changedGraphemes = diff.parts
    .filter((part) => part.revealIndex !== null)
    .reduce((count, part) => count + countGraphemes(part.text), 0);
  const groupCount = changedGraphemes <= 1
    ? 1
    : Math.min(4, Math.max(2, Math.ceil(Math.sqrt(changedGraphemes))));
  const parts: TransformRevealPart[] = [];
  let changedOrdinal = 0;
  for (const part of diff.parts) {
    if (part.revealIndex === null) {
      appendPart(parts, part.text, null);
      continue;
    }
    for (const grapheme of graphemes(part.text)) {
      const group = Math.min(
        groupCount - 1,
        Math.floor(changedOrdinal * groupCount / changedGraphemes),
      );
      appendPart(parts, grapheme, group);
      changedOrdinal += 1;
    }
  }

  const holdMs = 20;
  const stepMs = groupCount <= 1 ? 0 : 60;
  const settleMs = 220;
  const totalMs = Math.max(
    TRANSFORM_REVEAL_MIN_TOTAL_MS,
    holdMs + stepMs * Math.max(0, groupCount - 1) + settleMs,
  );
  if (totalMs > TRANSFORM_REVEAL_MAX_TOTAL_MS) return null;

  return Object.freeze({
    parts: Object.freeze(parts),
    groupCount,
    holdMs,
    stepMs,
    settleMs,
    totalMs,
  });
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });

function graphemes(text: string): readonly string[] {
  return Object.freeze(Array.from(GRAPHEME_SEGMENTER.segment(text), ({ segment }) => segment));
}

function countGraphemes(text: string): number {
  return [...GRAPHEME_SEGMENTER.segment(text)].length;
}

function appendPart(parts: TransformRevealPart[], text: string, group: number | null): void {
  const previous = parts.at(-1);
  if (previous?.group === group) {
    parts[parts.length - 1] = Object.freeze({ text: previous.text + text, group });
  } else {
    parts.push(Object.freeze({ text, group }));
  }
}
