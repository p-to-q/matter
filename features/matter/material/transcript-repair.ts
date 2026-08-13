import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

/**
 * Owns the deterministic half of transcript repair: which utterances are worth
 * asking about, and what a model answer must preserve to be usable at all.
 *
 * Repair restores what a person said. It does not improve it. Recognition can
 * flatten punctuation and casing, duplicate a streaming seam, retain acoustic
 * filler, or write the discarded side of an explicit self-correction. Each
 * broader edit is authorised as a closed repair class; everything outside those
 * classes remains the person's material and is not the model's to touch.
 *
 * That distinction is enforced here rather than asked for in the prompt. A
 * prompt states an intention; this module decides whether the answer kept it.
 * An answer that fails is discarded silently, and the deterministic transcript
 * the browser already produced is admitted instead, so the worst outcome of a
 * confused, unlucky, or prompt-injected model is the transcript we had anyway.
 *
 * Nothing here knows about transport, React, or durable material.
 */

/**
 * Bumping this invalidates the boundary without a schema change: both sides
 * parse it, and a request whose prompt version the server does not recognise is
 * refused rather than answered by a different scenario than the client asked for.
 */
export const TRANSCRIPT_REPAIR_PROMPT_VERSION = "transcript-repair/4";

export const MAX_REPAIR_TEXT_CODE_UNITS = MAX_NODE_TEXT_CODE_UNITS;

/**
 * Below this there is nothing for repair to restore: a handful of syllables has
 * no sentence boundary to find, and the deterministic normalizer already gives
 * it a terminal mark. Asking anyway would spend a person's remaining patience
 * on a round trip that cannot change the answer.
 */
export const MIN_REPAIR_SKELETON_LENGTH = 8;
export const MIN_CJK_REPAIR_SKELETON_LENGTH = 4;

/**
 * How far an answer may move.
 *
 * Repair legitimately changes characters — a homophone the recognizer picked
 * wrong, one spelling for a term said twice — so exact-match adjudication would
 * reject the work we asked for. A proportional budget admits that class of
 * change and nothing larger: rewriting, translating, summarizing, or answering
 * the utterance all move far past it, because they change most of the string.
 */
const REPAIR_BUDGET_RATIO = 0.28;
const REDRAFT_BUDGET_RATIO = 0.45;
const MIN_REPAIR_BUDGET = 3;
const REPAIR_GROWTH_RATIO = 0.12;
const MIN_REPAIR_GROWTH = 2;
const MAX_REPAIR_GROWTH = 12;
/**
 * A long utterance must not buy a proportionally unlimited licence. This budget
 * admits a faithful spoken-to-written cleanup with several recognition fixes,
 * but every path has an absolute ceiling; past that, similarity stops being
 * evidence of the same utterance. The wider ceiling below is reachable only
 * when the source itself proves a spoken redraft is needed.
 */
const MAX_REPAIR_BUDGET = 64;
const MAX_REDRAFT_BUDGET = 80;

export type RepairSource = "verbatim" | "model";

export type NormalizedRepairInput = Readonly<{
  text: string;
  locale: string;
  /**
   * Terms the person already uses elsewhere in their own material. A hint for
   * recognising a misheard word, never a licence to insert one — the edit
   * budget below is what makes that distinction enforceable rather than asked.
   */
  vocabulary: readonly string[];
}>;

export function normalizeRepairInput(
  input: Readonly<{ text: string; locale: string; vocabulary?: readonly string[] }>,
): NormalizedRepairInput {
  return Object.freeze({
    text: input.text.trim(),
    locale: input.locale,
    vocabulary: Object.freeze([...(input.vocabulary ?? [])]),
  });
}

/**
 * The spoken residue of a transcript: what is left when every mark a speaker
 * did not pronounce is removed. Two transcripts of one utterance differ in
 * punctuation, spacing, and case; they agree here. Adjudication compares
 * skeletons so that the marks we asked the model to add cost it nothing, and
 * the words we told it not to touch cost it everything.
 */
export function repairSkeleton(value: string): string {
  return value
    .replace(/(\p{N})\s*%/gu, "$1percent")
    .replace(/[\p{P}\p{S}\p{Z}\s]/gu, "")
    .toLowerCase();
}

export function decideRepairRequest(input: NormalizedRepairInput): boolean {
  if (input.text.length === 0 || input.text.length > MAX_REPAIR_TEXT_CODE_UNITS) return false;
  const minimum = input.locale === "zh-CN" || input.locale === "zh-TW"
    ? MIN_CJK_REPAIR_SKELETON_LENGTH
    : MIN_REPAIR_SKELETON_LENGTH;
  return repairSkeleton(input.text).length >= minimum;
}

export function repairBudget(skeletonLength: number): number {
  return Math.min(
    MAX_REPAIR_BUDGET,
    Math.max(MIN_REPAIR_BUDGET, Math.ceil(skeletonLength * REPAIR_BUDGET_RATIO)),
  );
}

/**
 * A deadline proportional to the utterance. Repair emits roughly as much text
 * as it reads, so one fixed budget either abandons long thoughts before they
 * can be answered or lets long thoughts occupy the whole repair lease. The
 * person is reading durable words while this runs, which buys a narrow six-to-
 * eight-second range. Production evidence showed the relay needs more than the
 * old 2.6-second short-utterance floor merely to return a first token; timing it
 * out there made the managed level nominal rather than usable.
 */
export function repairDeadlineMs(input: NormalizedRepairInput): number {
  const codePoints = Array.from(input.text).length;
  return Math.min(8_000, Math.max(6_000, 6_000 + codePoints * 8));
}

/** Output ceiling for the provider, in the same proportion as the deadline. */
export function repairMaxOutputTokens(input: NormalizedRepairInput): number {
  const codePoints = Array.from(input.text).length;
  return Math.min(1_200, Math.max(96, codePoints * 2 + 64));
}

export type RepairRejection =
  | "EMPTY"
  | "TOO_LONG"
  | "NOT_ONE_UTTERANCE"
  | "MEANING_CHANGED";

export type RepairAdjudication =
  | Readonly<{ ok: true; text: string; changed: boolean }>
  | Readonly<{ ok: false; reason: RepairRejection }>;

/**
 * Judges one model answer against the transcript it was given.
 *
 * The order matters: shape first, because a fenced, labelled, or multi-line
 * answer means the model answered a different question than the one asked, and
 * only then meaning, which is the check that actually protects the material.
 */
export function adjudicateRepair(
  original: NormalizedRepairInput,
  candidate: unknown,
): RepairAdjudication {
  if (typeof candidate !== "string") return reject("EMPTY");
  const text = unwrapQuoted(stripFence(candidate).trim());
  if (text.length === 0) return reject("EMPTY");
  if (text.length > MAX_REPAIR_TEXT_CODE_UNITS) return reject("TOO_LONG");
  // Speech produces one utterance. A newline or a control character means the
  // answer carries structure the person never spoke — a list, a heading, or a
  // commentary line the model added about its own work.
  if (/[\p{Cc}\p{Cf}]/u.test(text)) return reject("NOT_ONE_UTTERANCE");

  const source = repairSkeleton(original.text);
  const repaired = repairSkeleton(text);
  if (repaired.length === 0) return reject("EMPTY");
  if (isExplicitCorrectionReduction(original.text, source, repaired)) {
    return Object.freeze({ ok: true, text, changed: text !== original.text });
  }
  if (!preservesProtectedMeaning(original, text)) return reject("MEANING_CHANGED");
  if (!preservesSharedAnchorOrder(original.text, text)) return reject("MEANING_CHANGED");
  const budget = hasFaithfulRedraftEvidence(original)
    ? redraftBudget(source.length)
    : repairBudget(source.length);
  const growthBudget = Math.min(
    MAX_REPAIR_GROWTH,
    Math.max(MIN_REPAIR_GROWTH, Math.ceil(source.length * REPAIR_GROWTH_RATIO)),
  );
  if (repaired.length - source.length > growthBudget) return reject("MEANING_CHANGED");
  if (source.length - repaired.length > budget) return reject("MEANING_CHANGED");
  if (boundedEditDistance(source, repaired, budget) > budget) return reject("MEANING_CHANGED");

  return Object.freeze({ ok: true, text, changed: text !== original.text });
}

const PROTECTED_MEANING_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(?:not|no|never|cannot|can't|won't|don't|isn't|aren't|wasn't|weren't|shouldn't|wouldn't|couldn't|mustn't)\b/giu,
  /(?:不能|不要|別|别|沒|没|未|無|无|非|不)/gu,
  /(?:じゃない|ではない|ません|ない)/gu,
  /\b(?:nicht|kein|keine|keinen|keinem|keiner|keines|nie)\b/giu,
  /\b(?:may|might|maybe|perhaps|probably|possibly|should|could|would|must)\b/giu,
  /(?:可能|也许|也許|大概|应该|應該|或许|或許|未必)/gu,
  /\b(?:all|every|only|none|always|never|least|most|before|after)\b/giu,
  /(?:全部|所有|每个|每個|只有|仅|僅|至少|至多|之前|之后|之後)/gu,
  /\b(?:and|or|either|neither|if|unless|because|since|therefore|so that|first|then|finally)\b/giu,
  /(?:而且|以及|或者|还是|還是|如果|除非|因为|因為|所以|先|然后|然後|最后|最後)/gu,
  /(?:そして|または|もし|なければ|だから|なので|まず|それから|最後)/gu,
  /\b(?:und|oder|entweder|weder|wenn|falls|weil|deshalb|zuerst|dann|schließlich)\b/giu,
  /\b(?:i|we|you|he|she|they|my|our|your|his|her|their)\b/giu,
  /(?:我们|我們|你们|你們|他们|他們|她们|她們|我|你|他|她)/gu,
  /(?:私たち|私達|僕たち|俺たち|彼ら|彼女たち|私|僕|俺|あなた|彼|彼女)/gu,
  /\b(?:ich|wir|du|ihr|er|sie|es|mein|meine|unser|unsere|dein|deine|sein|seine|ihr|ihre)\b/giu,
]);

/**
 * A wider edit budget is authority, so it is granted only when the utterance
 * itself still contains evidence of spoken scaffolding or a fractured clause.
 * The deterministic floor has already removed low-ambiguity noise; these
 * markers cover the residue whose written form may legitimately require a
 * local redraft. Clean prose stays on the narrower lexical budget.
 */
function hasFaithfulRedraftEvidence(input: NormalizedRepairInput): boolean {
  const text = input.text;
  if (input.locale === "zh-CN" || input.locale === "zh-TW") {
    return /(?:我(?:觉得|覺得|感觉|感覺|认为|認為)|怎么说|怎麼說|就是说|就是說|这个(?:地方|东西)|這個(?:地方|東西)|有(?:一)?点|有(?:一)?點|不太|其实|其實|反正|然后|然後)/u.test(text);
  }
  if (input.locale === "ja-JP") {
    return /(?:というか|なんというか|なんか|と思う|感じがする|ちょっと|実は)/u.test(text);
  }
  if (input.locale === "de-DE") {
    return /\b(?:ich denke|ich meine|eigentlich|sozusagen|irgendwie|ein bisschen|die sache ist)\b/iu.test(text);
  }
  return /\b(?:i think|i feel|i mean|the thing is|basically|kind of|sort of|a little|you know)\b/iu.test(text);
}

function redraftBudget(skeletonLength: number): number {
  return Math.min(
    MAX_REDRAFT_BUDGET,
    Math.max(MIN_REPAIR_BUDGET, Math.ceil(skeletonLength * REDRAFT_BUDGET_RATIO)),
  );
}

type CorrectionMarkerKind = "sorry" | "rather" | "late" | "explicit";

type CorrectionMarker = Readonly<{
  kind: CorrectionMarkerKind;
  start: number;
  end: number;
}>;

/**
 * An explicit correction is the one safe deletion shape broader than the
 * ordinary edit budget. The repaired skeleton must equal the source with one
 * contiguous span removed, and that exact removed span must carry the spoken
 * correction marker. Nothing may be inserted, reordered, or paraphrased.
 */
function isExplicitCorrectionReduction(
  original: string,
  source: string,
  repaired: string,
): boolean {
  if (source.length <= repaired.length) return false;
  let prefix = 0;
  while (prefix < repaired.length && source[prefix] === repaired[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < repaired.length - prefix &&
    source[source.length - 1 - suffix] === repaired[repaired.length - 1 - suffix]
  ) suffix += 1;
  if (prefix + suffix !== repaired.length) return false;
  const deleted = source.slice(prefix, source.length - suffix);
  if (deleted.length > Math.min(128, Math.ceil(source.length * 0.7))) return false;
  const deletionEnd = source.length - suffix;
  const marker = correctionMarkers(original).find((candidate) =>
    candidate.start >= prefix && candidate.end <= deletionEnd);
  if (marker === undefined) return false;
  const beforeMarker = source.slice(prefix, marker.start);
  const afterMarker = source.slice(marker.end, deletionEnd);
  if (beforeMarker.length + afterMarker.length < 2) return false;
  if (marker.kind === "sorry" && /(?:iam|im)$/iu.test(beforeMarker)) return false;
  if (marker.kind === "rather" && /would$/iu.test(beforeMarker)) return false;
  if (marker.kind === "late" && !containsLateCorrectionFact(beforeMarker)) return false;
  // This is deletion-only: the candidate is exactly the untouched prefix and
  // suffix of the original spoken skeleton. Facts inside the discarded side
  // may legitimately differ from the replacement; nothing can be inserted,
  // reordered, or invented through this wider path.
  return true;
}

/**
 * Maps surface-level, token-bounded correction markers into spoken-skeleton
 * offsets. Searching the flattened skeleton directly would mistake `factually`
 * for `actually` and turn an ordinary word into repair authority.
 */
function correctionMarkers(value: string): readonly CorrectionMarker[] {
  const markers: CorrectionMarker[] = [];
  const patterns: ReadonlyArray<readonly [RegExp, CorrectionMarkerKind]> = [
    [/\b(?:sorry|i\s+mean|correction)\b/giu, "sorry"],
    [/\brather\b/giu, "rather"],
    [/\b(?:actually|wait)\b/giu, "late"],
    [/(?:不对|不對|我是说|我是說|应该是|應該是|更正|改成|准确地说|準確地說)/gu, "explicit"],
  ];
  for (const [pattern, kind] of patterns) {
    for (const match of value.matchAll(pattern)) {
      const surfaceStart = match.index;
      const surfaceText = match[0] ?? "";
      const start = repairSkeleton(value.slice(0, surfaceStart)).length;
      markers.push(Object.freeze({
        kind,
        start,
        end: start + repairSkeleton(surfaceText).length,
      }));
    }
  }
  return Object.freeze(markers.sort((left, right) => left.start - right.start));
}

function containsLateCorrectionFact(value: string): boolean {
  return /\p{N}|(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|noon|midnight)|(?:今天|明天|昨天|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|禮拜[一二三四五六日天])/iu.test(value);
}

/**
 * Edit distance alone cannot distinguish a typo from deleting one short word
 * that reverses a thought. Numeric facts, negation, and uncertainty markers
 * therefore form a zero-change semantic floor for every model-backed repair.
 */
function preservesProtectedMeaning(original: NormalizedRepairInput, candidate: string): boolean {
  if (!sameSequence(numericFacts(original.text), numericFacts(candidate))) return false;
  if (!sameSequence(unitFacts(original.text), unitFacts(candidate))) return false;
  const originalLiterals = literalFacts(original.text);
  if (originalLiterals.length > 0 && !sameSequence(originalLiterals, literalFacts(candidate))) return false;
  const originalIdentifiers = stableIdentifierFacts(original.text);
  if (
    originalIdentifiers.length > 0 &&
    !sameSequence(originalIdentifiers, stableIdentifierFacts(candidate))
  ) return false;
  for (const term of original.vocabulary) {
    const count = vocabularyCount(original.text, term);
    if (count > 0 && vocabularyCount(candidate, term) !== count) return false;
  }
  for (const pattern of PROTECTED_MEANING_PATTERNS) {
    if (!sameSequence(matches(original.text, pattern), matches(candidate, pattern))) return false;
  }
  if (isQuestion(original.text, original.locale) !== isQuestion(candidate, original.locale)) return false;
  return true;
}

function numericFacts(value: string): readonly string[] {
  return [...value.matchAll(/\p{N}+(?:[.,]\p{N}+)*/gu)]
    .map((match) => canonicalNumericFact(match[0] ?? ""));
}

function canonicalNumericFact(value: string): string {
  return /^\p{N}{1,3}(?:,\p{N}{3})+(?:\.\p{N}+)?$/u.test(value)
    ? value.replace(/,/gu, "")
    : value;
}

function unitFacts(value: string): readonly string[] {
  return [...value.matchAll(
    /\p{N}+(?:[.,]\p{N}+)*\s*(%|percent|per cent|kg|g|km|m|cm|mm|ms|s|mb|gb|tb|°c|°f|公里|千米|公斤|千克|克|毫秒|秒|分钟|分鐘|小时|小時|キログラム|キロメートル|ミリ秒|kilogramm|kilometer|millisekunden?|sekunden?)|\p{N}+(?:[.,]\p{N}+)*\s*%/giu,
  )].map((match) => {
    const unit = (match[1] ?? "%").toLocaleLowerCase();
    return unit === "%" || unit === "percent" || unit === "per cent" ? "percent" : unit;
  });
}

function stableIdentifierFacts(value: string): readonly string[] {
  return [...value.matchAll(
    /\b(?:v\d+(?:\.\d+)+|[A-Z]{2,}\d*|[A-Za-z][A-Za-z0-9]*[._-][A-Za-z0-9._-]+|[A-Za-z]+\d+)\b/gu,
  )].map((match) => (match[0] ?? "").toLocaleLowerCase());
}

function vocabularyCount(value: string, term: string): number {
  if (term.length === 0) return 0;
  let count = 0;
  let cursor = 0;
  const haystack = value.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    if (
      !/^\p{Script=Latin}[\p{Script=Latin}\p{N}'’-]*$/u.test(needle) ||
      isLatinTermBoundary(haystack, found, needle.length)
    ) count += 1;
    cursor = found + needle.length;
  }
  return count;
}

function isLatinTermBoundary(value: string, start: number, length: number): boolean {
  const before = start === 0 ? "" : value[start - 1] ?? "";
  const after = value[start + length] ?? "";
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
}

function isQuestion(value: string, locale: string): boolean {
  if (/[?？][\p{Pe}\p{Pf}“"']*$/u.test(value.trim())) return true;
  if (locale === "zh-CN" || locale === "zh-TW") {
    return /^(?:请问|請問|为什么|為什麼|怎么|怎麼|如何|谁|誰|哪|何时|何時|多少|几|幾)|(?:吗|嗎|呢)[。.]?$/u.test(value.trim());
  }
  if (locale === "ja-JP") return /(?:か|でしょうか)[。.]?$/u.test(value.trim());
  if (locale === "de-DE") return /^(?:warum|wie|was|wer|wo|wann|welch|kann|können|ist|sind|hat|haben)\b/iu.test(value.trim());
  return /^(?:why|how|what|who|where|when|which|can|could|would|should|do|does|did|is|are|was|were|will|have|has)\b/iu.test(value.trim());
}

function literalFacts(value: string): readonly string[] {
  return [...value.matchAll(
    /(?:https?:\/\/|www\.)[^\s，。！？；：]+|[\p{L}\p{N}.!#$%&'*+\-/=?^_`{|}~]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/giu,
  )].map((match) => (match[0] ?? "")
    .replace(/[.,;:!?，。！？；：]+$/u, "")
    .toLocaleLowerCase());
}

function matches(value: string, pattern: RegExp): readonly string[] {
  return [...value.matchAll(pattern)].map((match) => (match[0] ?? "").toLocaleLowerCase());
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Levenshtein distance limits how much may change, but a short clause swap can
 * still be cheap. Unique lexical words and Han bigrams act as order anchors:
 * substitutions may remove an anchor, while surviving anchors may never cross.
 */
function preservesSharedAnchorOrder(original: string, candidate: string): boolean {
  const source = semanticAnchorPositions(original);
  const repaired = semanticAnchorPositions(candidate);
  const shared = [...source.entries()]
    .filter(([anchor]) => repaired.has(anchor))
    .sort((left, right) => left[1] - right[1]);
  if (shared.length < 2) return true;
  let last = -1;
  for (const [anchor] of shared) {
    const position = repaired.get(anchor);
    if (position === undefined) continue;
    if (position < last) return false;
    last = position;
  }
  return true;
}

function semanticAnchorPositions(value: string): ReadonlyMap<string, number> {
  const occurrences = new Map<string, number[]>();
  const record = (anchor: string, position: number) => {
    const positions = occurrences.get(anchor) ?? [];
    positions.push(position);
    occurrences.set(anchor, positions);
  };
  for (const match of value.toLocaleLowerCase().matchAll(/\p{Script=Latin}[\p{L}\p{N}'’-]{2,}/gu)) {
    record(`l:${match[0]}`, match.index);
  }
  for (const match of value.matchAll(/\p{Script=Han}{2,}/gu)) {
    const chars = Array.from(match[0]);
    for (let index = 0; index < chars.length - 1; index += 1) {
      record(`h:${chars[index]}${chars[index + 1]}`, match.index + index);
    }
  }
  const unique = new Map<string, number>();
  for (const [anchor, positions] of occurrences) {
    if (positions.length === 1) unique.set(anchor, positions[0] ?? 0);
  }
  return unique;
}

/**
 * Levenshtein distance, abandoned as soon as it exceeds `budget`.
 *
 * Only the diagonal band of width `budget` can hold a value within the budget,
 * so everything outside it is treated as already over. That keeps the cost
 * linear in the utterance rather than quadratic, and it means a wholesale
 * rewrite is rejected after a few rows instead of being measured precisely.
 */
export function boundedEditDistance(left: string, right: string, budget: number): number {
  const source = Array.from(left);
  const target = Array.from(right);
  if (Math.abs(source.length - target.length) > budget) return budget + 1;

  const over = budget + 1;
  let previous = new Array<number>(target.length + 1).fill(over);
  for (let column = 0; column <= Math.min(budget, target.length); column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    const current = new Array<number>(target.length + 1).fill(over);
    const from = Math.max(1, row - budget);
    const to = Math.min(target.length, row + budget);
    if (row <= budget) current[0] = row;
    let best = current[0] ?? over;
    for (let column = from; column <= to; column += 1) {
      const substitution = (previous[column - 1] ?? over) + (source[row - 1] === target[column - 1] ? 0 : 1);
      const deletion = (previous[column] ?? over) + 1;
      const insertion = (current[column - 1] ?? over) + 1;
      const value = Math.min(substitution, deletion, insertion);
      current[column] = value;
      if (value < best) best = value;
    }
    if (best > budget) return over;
    previous = current;
  }
  return Math.min(previous[target.length] ?? over, over);
}

/**
 * Models wrap answers. A fence or a matched outer quote pair the transcript did
 * not start with is packaging, not speech, and unwrapping it saves an otherwise
 * correct repair from being discarded for a reason the person cannot see.
 */
function stripFence(value: string): string {
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/u.exec(value.trim());
  return fenced === null ? value : fenced[1];
}

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
];

function unwrapQuoted(value: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (value.length > open.length + close.length && value.startsWith(open) && value.endsWith(close)) {
      const inner = value.slice(open.length, value.length - close.length);
      // Only an outer pair is packaging. A quotation the person actually spoke
      // has its marks inside the utterance, not around all of it.
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return value;
}

function reject(reason: RepairRejection): RepairAdjudication {
  return Object.freeze({ ok: false, reason });
}
