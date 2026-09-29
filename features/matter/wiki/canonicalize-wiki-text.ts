import type { WikiChannel } from "./wiki-model";
import type { MatterLocale } from "../config/locales";
import { hasUnsafeWikiFormatControl } from "./wiki-text-safety";
import type {
  CompiledWikiRule,
  CompiledWikiSnapshot,
  CompiledWikiView,
} from "./wiki-compiler";
import {
  foldWikiFullWidthAscii,
  hasWikiFullWidthAscii,
  hasWikiLatinLetter,
  isWikiCjkLetter,
  isWikiLatinScriptLocale,
  isWikiLatinWord,
  isWikiRoutableGrapheme,
  wikiLatinRouteLocale,
} from "./wiki-script-routing";

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", {
  granularity: "grapheme",
});
const WORD_CONSTITUENT = /[\p{L}\p{M}\p{N}\p{Pc}'\u2019\-\u2010-\u2015@#`]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const MAY_CONTAIN_PROTECTED_LITERAL =
  /[`\u201c\u2018\u300c\u300e"@/\\_.]|--|[a-z][A-Z]|[A-Z][A-Za-z0-9]*[A-Z]/u;
const EMPTY_EDITS: readonly WikiCanonicalizationEdit[] = Object.freeze([]);
// Code units read on each side of a span to find its neighbouring grapheme.
const BOUNDARY_WINDOW = 32;

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
 * In a Chinese or Japanese turn, Latin-script spans the turn's own rules left
 * untouched are also matched against the Latin ledger they route to.
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
  const routedLocale = wikiLatinRouteLocale(locale);
  const candidateRoutedView = routedLocale === null
    ? null
    : snapshot.views[routedLocale][channel];
  // Without a Latin letter nothing can route, so a pure-CJK turn pays nothing.
  const routedView = candidateRoutedView !== null && candidateRoutedView.ruleCount > 0 &&
      hasWikiLatinLetter(text)
    ? candidateRoutedView
    : null;
  if (text.length === 0 || (view.ruleCount === 0 && routedView === null)) {
    return result("unchanged", text, snapshot.generation, EMPTY_EDITS, 0, 0);
  }

  const input = segmentText(text);
  // A Latin-script turn protects and bounds its own words across widths, so
  // `＠name` or a full-width URL is as safe as its half-width form. Half-width
  // text folds to itself, so its outcome is unchanged.
  const widthAware = isWikiLatinScriptLocale(locale);
  const protectedSpans = widthAware
    ? findWidthAwareProtectedWikiSpans(text)
    : findProtectedWikiSpans(text);
  const endsWord = widthAware ? endsFoldedWord : endsOwnWord;
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
        hasRequiredBoundary(rule, input, graphemeIndex, cursor, endsWord)
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

  if (routedView !== null) {
    const routed = matchRoutedWikiView(
      snapshot,
      routedView,
      view,
      text,
      input,
      eligibleRanges,
      pendingEdits,
    );
    transitionCount += routed.transitionCount;
    if (routed.edits.length > 0) {
      pendingEdits.push(...routed.edits);
      pendingEdits.sort((left, right) => left.start - right.start);
    }
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
  for (let index = firstPossibleRange; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (range === undefined || range.start >= end) return false;
    if (range.end <= start) continue;
    return start >= range.start && end <= range.end;
  }
  return false;
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

type WikiWordEnd = (neighbor: string | undefined) => boolean;

function hasRequiredBoundary(
  rule: CompiledWikiRule,
  input: readonly Grapheme[],
  start: number,
  end: number,
  endsWord: WikiWordEnd,
): boolean {
  if (rule.boundary === "literal") return true;
  return endsWord(input[start - 1]?.segment) && endsWord(input[end]?.segment);
}

function endsOwnWord(neighbor: string | undefined): boolean {
  return neighbor === undefined || !WORD_CONSTITUENT.test(neighbor);
}

/**
 * Full-width joiners such as `＠＃｀－＿` join a word exactly as their ASCII
 * forms do, so the neighbour is folded before the word-character test.
 */
function endsFoldedWord(neighbor: string | undefined): boolean {
  return neighbor === undefined ||
    !WORD_CONSTITUENT.test(foldWikiFullWidthAscii(neighbor));
}

/**
 * Whether a word rule could apply to `text[start, end)` in a `locale` turn:
 * the same own, width-aware, or routed boundary test the matcher uses, on the
 * graphemes around the span. Evidence producers use it so an occurrence no
 * resulting rule could rewrite, such as `@name`, `#tag`, or a hyphen-joined
 * word, is never counted.
 */
export function hasWikiWordBoundaryAround(
  text: string,
  start: number,
  end: number,
  locale: MatterLocale,
  routed: boolean,
): boolean {
  const before = text.slice(Math.max(0, start - BOUNDARY_WINDOW), start);
  const after = text.slice(end, end + BOUNDARY_WINDOW);
  const previous = before.length === 0
    ? undefined
    : GRAPHEME_SEGMENTER.segment(before).containing(before.length - 1)?.segment;
  const next = after.length === 0
    ? undefined
    : GRAPHEME_SEGMENTER.segment(after).containing(0)?.segment;
  const ends = routed
    ? endsRoutedWord
    : isWikiLatinScriptLocale(locale) ? endsFoldedWord : endsOwnWord;
  return ends(previous) && ends(next);
}

type RoutedWikiMatches = Readonly<{
  edits: readonly WikiCanonicalizationEdit[];
  transitionCount: number;
}>;

/**
 * Matches the Latin ledger a CJK turn routes to. Routing is additive: a routed
 * match never covers a grapheme holding a non-Latin letter or one the turn's
 * own rules replaced, and it never overlaps a complete form of the turn's own
 * rules even where that rule could not apply, so human authority in the turn's
 * locale always wins and no CJK span can reach the Latin ledger. Keys and
 * protection are width-folded for matching only; the replaced span is always
 * the text as written.
 */
function matchRoutedWikiView(
  snapshot: CompiledWikiSnapshot,
  view: CompiledWikiView,
  ownView: CompiledWikiView,
  text: string,
  input: readonly Grapheme[],
  eligibleRanges: readonly WikiEligibleRange[],
  ownEdits: readonly WikiCanonicalizationEdit[],
): RoutedWikiMatches {
  const foldedKeys = input.map((grapheme) => foldWikiFullWidthAscii(grapheme.normalized));
  const keys: (string | null)[] = input.map((grapheme, index) =>
    isWikiRoutableGrapheme(grapheme.segment) ? foldedKeys[index] : null);
  // A routable grapheme's letters are all Latin, so a routed span is a Latin
  // word exactly when one of its graphemes holds a letter.
  const letters = input.map((grapheme, index) =>
    keys[index] !== null && isWikiLatinWord(grapheme.segment));
  let ownIndex = 0;
  for (let index = 0; index < input.length; index += 1) {
    while (ownIndex < ownEdits.length && ownEdits[ownIndex].end <= input[index].start) {
      ownIndex += 1;
    }
    const own = ownEdits[ownIndex];
    if (own !== undefined && own.start <= input[index].start) keys[index] = null;
  }

  let transitionCount = 0;
  // The furthest end of any complete own form starting at a grapheme, walked
  // lazily and at most once per start for the written and the folded keys.
  const ownFormEnds = new Map<number, number>();
  const foldingChanges = hasWikiFullWidthAscii(text);
  const walkOwnForm = (from: number, keyAt: (index: number) => string): number => {
    let nodeIndex = 0;
    let furthest = -1;
    for (let cursor = from;
      cursor < input.length && cursor - from < ownView.maxFormGraphemes;) {
      transitionCount += 1;
      const nextNodeIndex = ownView.nodes[nodeIndex].edges[keyAt(cursor)];
      if (nextNodeIndex === undefined) break;
      nodeIndex = nextNodeIndex;
      cursor += 1;
      if (ownView.nodes[nodeIndex].terminalRuleIndex !== null) furthest = cursor;
    }
    return furthest;
  };
  const ownFormEndFrom = (from: number): number => {
    const cached = ownFormEnds.get(from);
    if (cached !== undefined) return cached;
    let furthest = walkOwnForm(from, (index) => input[index].normalized);
    if (foldingChanges) {
      furthest = Math.max(furthest, walkOwnForm(from, (index) => foldedKeys[index]));
    }
    ownFormEnds.set(from, furthest);
    return furthest;
  };
  const overlapsOwnForm = (start: number, end: number): boolean => {
    if (ownView.ruleCount === 0) return false;
    for (let from = Math.max(0, start - ownView.maxFormGraphemes + 1); from < end; from += 1) {
      if (ownFormEndFrom(from) > start) return true;
    }
    return false;
  };

  const protectedSpans = findWidthAwareProtectedWikiSpans(text);
  const edits: WikiCanonicalizationEdit[] = [];
  const candidates: [ruleIndex: number, endGrapheme: number][] = [];
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
    let latinWord = false;
    candidates.length = 0;
    while (cursor < input.length && cursor - graphemeIndex < view.maxFormGraphemes) {
      const key = keys[cursor];
      if (key === null) break;
      transitionCount += 1;
      const nextNodeIndex = view.nodes[nodeIndex].edges[key];
      if (nextNodeIndex === undefined) break;
      nodeIndex = nextNodeIndex;
      latinWord ||= letters[cursor];
      cursor += 1;
      const terminalRuleIndex = view.nodes[nodeIndex].terminalRuleIndex;
      if (terminalRuleIndex === null) continue;
      const end = input[cursor - 1].end;
      if (
        latinWord &&
        !wikiRangeOverlapsProtected(start, end, protectedSpans, protectedIndex) &&
        isWikiRangeEligible(start, end, eligibleRanges, eligibleIndex) &&
        hasRoutedBoundary(snapshot.rules[terminalRuleIndex], input, graphemeIndex, cursor)
      ) candidates.push([terminalRuleIndex, cursor]);
    }

    // Leftmost-longest among the candidates that no own form claims.
    let chosen: [ruleIndex: number, endGrapheme: number] | undefined;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index]!;
      if (!overlapsOwnForm(graphemeIndex, candidate[1])) {
        chosen = candidate;
        break;
      }
    }
    if (chosen === undefined) {
      graphemeIndex += 1;
      continue;
    }
    const [ruleIndex, endGrapheme] = chosen;
    edits.push(Object.freeze({
      start,
      end: input[endGrapheme - 1].end,
      ruleIndex,
      sourceIndex: snapshot.rules[ruleIndex].sourceIndex,
    }));
    graphemeIndex = endGrapheme;
  }
  return Object.freeze({ edits: Object.freeze(edits), transitionCount });
}

/** A routed word also ends where a CJK letter begins, with no space needed. */
function hasRoutedBoundary(
  rule: CompiledWikiRule,
  input: readonly Grapheme[],
  start: number,
  end: number,
): boolean {
  if (rule.boundary === "literal") return true;
  return endsRoutedWord(input[start - 1]?.segment) && endsRoutedWord(input[end]?.segment);
}

function endsRoutedWord(neighbor: string | undefined): boolean {
  return neighbor === undefined || isWikiCjkLetter(neighbor) || endsFoldedWord(neighbor);
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

export function findProtectedWikiSpans(
  text: string,
  level: "matching" | "evidence" = "matching",
): readonly WikiProtectedSpan[] {
  if (!MAY_CONTAIN_PROTECTED_LITERAL.test(text)) return Object.freeze([]);
  const spans = Array.from(text.matchAll(protectedLiteralPattern(level)), (match) =>
    Object.freeze([match.index, match.index + match[0].length] as const));
  return Object.freeze(spans);
}

/**
 * Width-aware protection for Latin words, routed or in a Latin-script turn:
 * every literal of the text as written, plus every literal that appears once
 * full-width ASCII is folded, so a full-width URL, email address, path, flag,
 * code span, or identifier stays protected. Folding the full-width colon lets
 * a URL tail run past a full-width colon in the same sentence; the union can
 * only protect more, and half-width text yields exactly the written spans.
 * CJK turns keep the written-text spans alone for their own words.
 */
export function findWidthAwareProtectedWikiSpans(
  text: string,
  level: "matching" | "evidence" = "matching",
): readonly WikiProtectedSpan[] {
  const written = findProtectedWikiSpans(text, level);
  if (!hasWikiFullWidthAscii(text)) return written;
  return mergeProtectedSpans(
    written,
    findProtectedWikiSpans(foldWikiFullWidthAscii(text), level),
  );
}

/** Sorted, non-overlapping union; overlap scans rely on both properties. */
function mergeProtectedSpans(
  left: readonly WikiProtectedSpan[],
  right: readonly WikiProtectedSpan[],
): readonly WikiProtectedSpan[] {
  if (right.length === 0) return left;
  if (left.length === 0) return right;
  const sorted = [...left, ...right].sort((first, second) =>
    first[0] - second[0] || first[1] - second[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return Object.freeze(merged.map(([start, end]) =>
    Object.freeze([start, end] as const)));
}

function protectedLiteralPattern(level: "matching" | "evidence"): RegExp {
  const shared = "```[^]*?(?:```|$)|`[^`\\n]*(?:`|$)|\\u201c[^\\u201d\\n]*(?:\\u201d|$)|\\u2018[^\\u2019\\n]*(?:\\u2019|$)|\\u300c[^\\u300d\\n]*(?:\\u300d|$)|\\u300e[^\\u300f\\n]*(?:\\u300f|$)|\"[^\"\\n]*(?:\"|$)|(?:https?:\\/\\/|[Ww]{3}\\.)[^\\s\\uff0c\\u3002\\uff01\\uff1f\\uff1b\\uff1a]+|[\\p{L}\\p{N}.!#$%&'*+\\-/=?^_`{|}~]+@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)+|(?:\\\\\\\\|\\/\\/)[^\\s\\uff0c\\u3002\\uff01\\uff1f\\uff1b\\uff1a]+|(?<![\\p{L}\\p{N}._~-])(?:[\\p{L}\\p{N}._~!$&'()*+;=:@%-]+[\\\\/])+[\\p{L}\\p{N}._~!$&'()*+;=:@%\\\\/-]+|(?:\\.{0,2}\\/|\\/)[\\p{L}\\p{N}._~!$&'()*+;=:@%\\-/]+|[A-Za-z]:\\\\[^\\s\\uff0c\\u3002\\uff01\\uff1f\\uff1b\\uff1a]+|--[A-Za-z][A-Za-z0-9-]*|\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b|\\b[Vv]?\\d+(?:\\.\\d+){1,3}\\b|(?<![\\p{L}\\p{N}_$])[\\p{L}\\p{N}$]+(?:_[\\p{L}\\p{N}$]+)+(?![\\p{L}\\p{N}_$])|(?<![\\p{L}\\p{N}_$])[\\p{L}\\p{N}_$]+(?:\\.[\\p{L}\\p{N}_$]+)+(?![\\p{L}\\p{N}_$])";
  const identifiers = "|\\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\\b";
  return new RegExp(level === "matching" ? shared + identifiers : shared, "gu");
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

/**
 * Maximum trie transitions for one call, independent of corpus size. A
 * script-routed turn also walks the one view its Latin spans route to and, to
 * keep own-locale authority first, re-walks its own view at most once per
 * start for the written and once for the width-folded keys.
 */
export function wikiCanonicalizationOperationBudget(
  view: CompiledWikiView,
  graphemeCount: number,
  routedView?: CompiledWikiView,
): number {
  return routedView === undefined
    ? graphemeCount * view.maxFormGraphemes
    : graphemeCount * (3 * view.maxFormGraphemes + routedView.maxFormGraphemes);
}
