import type { WikiChannel } from "./wiki-model";
import type { MatterLocale } from "../config/locales";
import { hasUnsafeWikiFormatControl } from "./wiki-text-safety";
import type {
  CompiledWikiRule,
  CompiledWikiSnapshot,
  CompiledWikiView,
} from "./wiki-compiler";

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", {
  granularity: "grapheme",
});
const WORD_CONSTITUENT = /[\p{L}\p{M}\p{N}\p{Pc}'\u2019\-\u2010-\u2015@#`]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const MAY_CONTAIN_PROTECTED_LITERAL =
  /[`\u201c\u2018\u300c\u300e"@/\\_.]|--|[a-z][A-Z]|[A-Z][A-Za-z0-9]*[A-Z]/u;
const EMPTY_EDITS: readonly WikiCanonicalizationEdit[] = Object.freeze([]);

type Grapheme = Readonly<{
  segment: string;
  normalized: string;
  start: number;
  end: number;
}>;

export type WikiProtectedSpan = readonly [start: number, end: number];

export type WikiEligibleRange = Readonly<{ start: number; end: number }>;

export type WikiCanonicalizationStatus = "changed" | "unchanged" | "invalid-text";

export type WikiCanonicalizationEdit = Readonly<{
  start: number;
  end: number;
  ruleIndex: number;
  sourceIndex: number;
}>;

export type WikiCanonicalizationResult = Readonly<{
  status: WikiCanonicalizationStatus;
  text: string;
  changed: boolean;
  generation: number;
  edits: readonly WikiCanonicalizationEdit[];
  graphemeCount: number;
  transitionCount: number;
}>;

/**
 * Applies one compiled channel immediately before a material commit. Matches
 * inspect only the original text, so replacements cannot trigger more rules.
 */
export function canonicalizeWikiText(
  snapshot: CompiledWikiSnapshot,
  locale: MatterLocale,
  channel: WikiChannel,
  text: string,
  options: Readonly<{ eligibleRanges?: readonly WikiEligibleRange[] }> = {},
): WikiCanonicalizationResult {
  if (LONE_SURROGATE.test(text) || hasUnsafeWikiFormatControl(text)) {
    return result("invalid-text", text, snapshot.generation, EMPTY_EDITS, 0, 0);
  }

  const eligibleRanges = normalizeWikiEligibleRanges(options.eligibleRanges, text.length);
  if (eligibleRanges === null) {
    return result("invalid-text", text, snapshot.generation, EMPTY_EDITS, 0, 0);
  }
  const view = snapshot.views[locale][channel];
  if (text.length === 0 || view.ruleCount === 0) {
    return result("unchanged", text, snapshot.generation, EMPTY_EDITS, 0, 0);
  }

  const input = segmentText(text);
  const protectedSpans = findProtectedWikiSpans(text);
  const pendingEdits: WikiCanonicalizationEdit[] = [];
  let transitionCount = 0;
  let protectedIndex = 0;
  let eligibleIndex = 0;
  let graphemeIndex = 0;

  while (graphemeIndex < input.length) {
    const start = input[graphemeIndex].start;
    while (
      protectedIndex < protectedSpans.length &&
      protectedSpans[protectedIndex][1] <= start
    ) protectedIndex += 1;
    while (
      eligibleIndex < eligibleRanges.length &&
      eligibleRanges[eligibleIndex].end <= start
    ) eligibleIndex += 1;

    let nodeIndex = 0;
    let cursor = graphemeIndex;
    let bestRuleIndex: number | null = null;
    let bestEndGrapheme = graphemeIndex;

    while (
      cursor < input.length &&
      cursor - graphemeIndex < view.maxFormGraphemes
    ) {
      transitionCount += 1;
      const nextNodeIndex = view.nodes[nodeIndex].edges[input[cursor].normalized];
      if (nextNodeIndex === undefined) break;
      nodeIndex = nextNodeIndex;
      cursor += 1;
      const terminalRuleIndex = view.nodes[nodeIndex].terminalRuleIndex;
      if (terminalRuleIndex === null) continue;

      const end = input[cursor - 1].end;
      const rule = snapshot.rules[terminalRuleIndex];
      if (
        !wikiRangeOverlapsProtected(start, end, protectedSpans, protectedIndex) &&
        isWikiRangeEligible(start, end, eligibleRanges, eligibleIndex) &&
        hasRequiredBoundary(rule, input, graphemeIndex, cursor)
      ) {
        bestRuleIndex = terminalRuleIndex;
        bestEndGrapheme = cursor;
      }
    }

    if (bestRuleIndex === null) {
      graphemeIndex += 1;
      continue;
    }

    const rule = snapshot.rules[bestRuleIndex];
    pendingEdits.push(Object.freeze({
      start,
      end: input[bestEndGrapheme - 1].end,
      ruleIndex: bestRuleIndex,
      sourceIndex: rule.sourceIndex,
    }));
    graphemeIndex = bestEndGrapheme;
  }

  if (pendingEdits.length === 0) {
    return result(
      "unchanged",
      text,
      snapshot.generation,
      EMPTY_EDITS,
      input.length,
      transitionCount,
    );
  }

  let sourceCursor = 0;
  const output: string[] = [];
  for (const edit of pendingEdits) {
    output.push(text.slice(sourceCursor, edit.start));
    output.push(snapshot.rules[edit.ruleIndex].canonical);
    sourceCursor = edit.end;
  }
  output.push(text.slice(sourceCursor));

  return result(
    "changed",
    output.join(""),
    snapshot.generation,
    Object.freeze(pendingEdits),
    input.length,
    transitionCount,
  );
}

export function normalizeWikiEligibleRanges(
  ranges: readonly WikiEligibleRange[] | undefined,
  textLength: number,
): readonly WikiEligibleRange[] | null {
  if (ranges === undefined) {
    return Object.freeze([Object.freeze({ start: 0, end: textLength })]);
  }
  const normalized: WikiEligibleRange[] = [];
  let priorEnd = 0;
  for (const range of ranges) {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < priorEnd ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > textLength
    ) return null;
    normalized.push(Object.freeze({ start: range.start, end: range.end }));
    priorEnd = range.end;
  }
  return Object.freeze(normalized);
}

export function isWikiRangeEligible(
  start: number,
  end: number,
  ranges: readonly WikiEligibleRange[],
  firstPossibleRange: number,
): boolean {
  const range = ranges[firstPossibleRange];
  return range !== undefined && start >= range.start && end <= range.end;
}

function segmentText(text: string): Grapheme[] {
  const segments = [...GRAPHEME_SEGMENTER.segment(text)];
  return segments.map((entry, index) => Object.freeze({
    segment: entry.segment,
    normalized: entry.segment.normalize("NFC"),
    start: entry.index,
    end: segments[index + 1]?.index ?? text.length,
  }));
}

function hasRequiredBoundary(
  rule: CompiledWikiRule,
  input: readonly Grapheme[],
  start: number,
  end: number,
): boolean {
  if (rule.boundary === "literal") return true;
  const previous = input[start - 1]?.segment;
  const next = input[end]?.segment;
  return (previous === undefined || !WORD_CONSTITUENT.test(previous)) &&
    (next === undefined || !WORD_CONSTITUENT.test(next));
}

export function wikiRangeOverlapsProtected(
  start: number,
  end: number,
  spans: readonly WikiProtectedSpan[],
  firstPossibleSpan: number,
): boolean {
  for (let index = firstPossibleSpan; index < spans.length; index += 1) {
    const span = spans[index];
    if (span[0] >= end) return false;
    if (span[1] > start) return true;
  }
  return false;
}

export function findProtectedWikiSpans(text: string): readonly WikiProtectedSpan[] {
  if (!MAY_CONTAIN_PROTECTED_LITERAL.test(text)) return Object.freeze([]);
  const spans = Array.from(text.matchAll(protectedLiteralPattern()), (match) =>
    Object.freeze([match.index, match.index + match[0].length] as const));
  return Object.freeze(spans);
}

function protectedLiteralPattern(): RegExp {
  return /```[^]*?(?:```|$)|`[^`\n]*(?:`|$)|\u201c[^\u201d\n]*(?:\u201d|$)|\u2018[^\u2019\n]*(?:\u2019|$)|\u300c[^\u300d\n]*(?:\u300d|$)|\u300e[^\u300f\n]*(?:\u300f|$)|"[^"\n]*(?:"|$)|(?:https?:\/\/|[Ww]{3}\.)[^\s\uff0c\u3002\uff01\uff1f\uff1b\uff1a]+|[\p{L}\p{N}.!#$%&'*+\-/=?^_`{|}~]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|(?:\\\\|\/\/)[^\s\uff0c\u3002\uff01\uff1f\uff1b\uff1a]+|(?<![\p{L}\p{N}._~-])(?:[\p{L}\p{N}._~!$&'()*+;=:@%-]+[\\/])+[\p{L}\p{N}._~!$&'()*+;=:@%\\/-]+|(?:\.{0,2}\/|\/)[\p{L}\p{N}._~!$&'()*+;=:@%\-/]+|[A-Za-z]:\\[^\s\uff0c\u3002\uff01\uff1f\uff1b\uff1a]+|--[A-Za-z][A-Za-z0-9-]*|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[Vv]?\d+(?:\.\d+){1,3}\b|(?<![\p{L}\p{N}_$])[\p{L}\p{N}$]+(?:_[\p{L}\p{N}$]+)+(?![\p{L}\p{N}_$])|(?<![\p{L}\p{N}_$])[\p{L}\p{N}_$]+(?:\.[\p{L}\p{N}_$]+)+(?![\p{L}\p{N}_$])|\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/gu;
}

function result(
  status: WikiCanonicalizationStatus,
  text: string,
  generation: number,
  edits: readonly WikiCanonicalizationEdit[],
  graphemeCount: number,
  transitionCount: number,
): WikiCanonicalizationResult {
  return Object.freeze({
    status,
    text,
    changed: status === "changed",
    generation,
    edits,
    graphemeCount,
    transitionCount,
  });
}

/** Maximum trie transitions for one call, independent of corpus size. */
export function wikiCanonicalizationOperationBudget(
  view: CompiledWikiView,
  graphemeCount: number,
): number {
  return graphemeCount * view.maxFormGraphemes;
}
