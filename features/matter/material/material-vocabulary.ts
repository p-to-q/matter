/**
 * The words a person keeps using.
 *
 * Speech recognition fails hardest on the vocabulary that matters most: a
 * project's own names, a borrowed term, an acronym said aloud. Those are
 * exactly the words a person has already written elsewhere in the same tree, so
 * the material itself is the glossary — no dictionary to maintain, no model to
 * train, and nothing retrieved from outside what they can see.
 *
 * This is deliberately a *hint*, and the boundary is narrow on purpose:
 *
 * - it is derived from the person's own visible material, never fetched;
 * - it is bounded in count and length, and states nothing about structure —
 *   no node ids, no depths, no lineage, just words;
 * - it can only ever help a scenario recognise a word that was actually said.
 *   Nothing downstream may insert one, and `adjudicateRepair` is what enforces
 *   that: a word the speaker did not say costs edits it does not have.
 *
 * Repetition is the whole signal. A term someone used twice in their own notes
 * is a term they are likely to say again, and it is the cheapest evidence that
 * it is theirs rather than the recognizer's guess.
 */

export const MAX_VOCABULARY_TERMS = 24;
export const MAX_VOCABULARY_TERM_CODE_UNITS = 32;
/** Below this a token is grammar rather than vocabulary, in every script here. */
const MIN_HAN_TERM_CODE_POINTS = 2;
const MIN_LATIN_TERM_CODE_POINTS = 4;
/**
 * How much material is read. Beyond this a repair request would spend more time
 * assembling a hint than the repair itself is allowed to take, and the terms
 * near the person's current work are the ones worth having anyway.
 */
const MAX_SCANNED_TEXTS = 64;
const MAX_SCANNED_CODE_UNITS = 20_000;

export type VocabularyLimits = Readonly<{
  maxTerms?: number;
  maxTermCodeUnits?: number;
}>;

/**
 * Collects the distinctive repeated terms from a person's material, most-used
 * first. Ties break on first appearance so the same tree always yields the same
 * hint, which keeps a repair request reproducible.
 */
export function collectVocabulary(
  texts: readonly string[],
  locale: string,
  limits: VocabularyLimits = {},
): readonly string[] {
  const maxTerms = limits.maxTerms ?? MAX_VOCABULARY_TERMS;
  const maxCodeUnits = limits.maxTermCodeUnits ?? MAX_VOCABULARY_TERM_CODE_UNITS;
  if (maxTerms <= 0) return Object.freeze([]);

  const counts = new Map<string, { term: string; count: number; first: number }>();
  let scanned = 0;
  let position = 0;

  for (const text of texts.slice(0, MAX_SCANNED_TEXTS)) {
    if (scanned >= MAX_SCANNED_CODE_UNITS) break;
    scanned += text.length;
    for (const term of wordsOf(text, locale)) {
      if (term.length > maxCodeUnits || !isDistinctive(term)) continue;
      const key = term.toLowerCase();
      const existing = counts.get(key);
      position += 1;
      if (existing === undefined) counts.set(key, { term, count: 1, first: position });
      else existing.count += 1;
    }
  }

  const repeated = [...counts.values()].filter((entry) => entry.count > 1);
  repeated.sort((left, right) => right.count - left.count || left.first - right.first);
  return Object.freeze(repeated.slice(0, maxTerms).map((entry) => entry.term));
}

/**
 * Word segmentation is the platform's job. `Intl.Segmenter` reads Han without
 * spaces and Latin with them, which is the whole reason this can be a few lines
 * rather than a tokenizer with a word list to keep current.
 */
function wordsOf(text: string, locale: string): readonly string[] {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  } catch {
    // An unknown locale must degrade to a shorter hint, never to a failure in
    // the middle of admitting someone's thought.
    segmenter = new Intl.Segmenter("en", { granularity: "word" });
  }
  const words: string[] = [];
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike === true) words.push(segment.segment);
  }
  return words;
}

/**
 * Keeps what a recognizer plausibly gets wrong and a person plausibly owns.
 * Numbers and single characters are dropped because they carry no identity: a
 * hint of "3" or "的" tells a model nothing it did not already have.
 */
function isDistinctive(term: string): boolean {
  const points = Array.from(term);
  if (points.length === 0) return false;
  if (/^\p{N}+$/u.test(term)) return false;
  const han = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term);
  return points.length >= (han ? MIN_HAN_TERM_CODE_POINTS : MIN_LATIN_TERM_CODE_POINTS);
}
