import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

/**
 * Owns the deterministic half of transcript repair: which utterances are worth
 * asking about, and what a model answer must preserve to be usable at all.
 *
 * Repair restores what a person said. It does not improve it. Recognition
 * reliably loses three things — punctuation, sentence boundaries, and the
 * occasional misheard character — and those three are the entire mandate.
 * Everything else in an utterance, including the hesitation, the repetition and
 * the false start, is the person's material and is not the model's to touch.
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
export const TRANSCRIPT_REPAIR_PROMPT_VERSION = "transcript-repair/1";

export const MAX_REPAIR_TEXT_CODE_UNITS = MAX_NODE_TEXT_CODE_UNITS;

/**
 * Below this there is nothing for repair to restore: a handful of syllables has
 * no sentence boundary to find, and the deterministic normalizer already gives
 * it a terminal mark. Asking anyway would spend a person's remaining patience
 * on a round trip that cannot change the answer.
 */
export const MIN_REPAIR_SKELETON_LENGTH = 8;

/**
 * How far an answer may move.
 *
 * Repair legitimately changes characters — a homophone the recognizer picked
 * wrong, one spelling for a term said twice — so exact-match adjudication would
 * reject the work we asked for. A proportional budget admits that class of
 * change and nothing larger: rewriting, translating, summarizing, or answering
 * the utterance all move far past it, because they change most of the string.
 */
const REPAIR_BUDGET_RATIO = 0.12;
const MIN_REPAIR_BUDGET = 1;
/**
 * A long utterance must not buy a proportionally large licence. At 12% a
 * two-hundred-character thought would allow twenty-four edits, which is already
 * more misrecognition than any usable transcript contains; past that the ratio
 * stops being evidence of repair.
 */
const MAX_REPAIR_BUDGET = 24;

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
    .replace(/[\p{P}\p{S}\p{Z}\s]/gu, "")
    .toLowerCase();
}

export function decideRepairRequest(input: NormalizedRepairInput): boolean {
  if (input.text.length === 0 || input.text.length > MAX_REPAIR_TEXT_CODE_UNITS) return false;
  return repairSkeleton(input.text).length >= MIN_REPAIR_SKELETON_LENGTH;
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
 * can be answered or makes short ones wait for nothing. The person is reading
 * their own words while this runs, which is what buys the upper end. Both ends
 * carry a second relay's attempt as well as a first: the pool gives one relay
 * at most half of this, so a budget sized for a single call falls back to the
 * words as heard the moment the nearest relay is the slow one.
 */
export function repairDeadlineMs(input: NormalizedRepairInput): number {
  const codePoints = Array.from(input.text).length;
  return Math.min(6_000, Math.max(2_600, 2_600 + codePoints * 8));
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
  const budget = repairBudget(source.length);
  if (Math.abs(source.length - repaired.length) > budget) return reject("MEANING_CHANGED");
  if (boundedEditDistance(source, repaired, budget) > budget) return reject("MEANING_CHANGED");

  return Object.freeze({ ok: true, text, changed: text !== original.text });
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
