/**
 * Spoken punctuation words, substituted only where the word is not also
 * ordinary prose in the same position.
 *
 * English is deliberately absent. "period" and "comma" are common nouns, and a
 * dictated command is lexically identical to the word itself — "during that
 * period we shipped" and "wait comma then go" have the same shape, so any
 * substitution rewrites some people's wording. That is forbidden on the human
 * admission path (`docs/material.md`, principle 4), and the affordance is not
 * needed: browsers that recognize English already punctuate, and a missing
 * terminal mark is added below regardless.
 *
 * The CJK words carry the same ambiguity in principle — 句号 is a noun in
 * "这个句号打错了" — but only after a determiner, which DETERMINER_PREFIX
 * excludes. Recognizers for these locales do not reliably punctuate, so the
 * affordance earns its narrow remaining risk.
 */
const SPOKEN_PUNCTUATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/\s*(?:逗号|逗點)\s*/g, "，"],
  [/\s*(?:句号|句點)\s*/g, "。"],
  [/\s*问号\s*/g, "？"],
  [/\s*感叹号\s*/g, "！"],
];

/**
 * After one of these, a punctuation word is being named rather than dictated.
 * A short closed list, not a parser: it removes the common false positive
 * without pretending to segment Chinese.
 */
const DETERMINER_PREFIX = /(?:这个|那个|一个|的|个)$/u;

const TERMINAL = /[。！？.!?]$/u;
const CJK = /[㐀-鿿]/u;

/**
 * Admission-only cleanup: spoken punctuation is a browser speech affordance,
 * not generative rewriting. Wording is never changed — only spoken punctuation
 * words become marks, and a missing terminal mark is added.
 */
export function normalizeAdmittedTranscript(value: string): string {
  let text = value.trim();
  for (const [pattern, punctuation] of SPOKEN_PUNCTUATION) {
    text = text.replace(pattern, (match, offset: number, whole: string) =>
      DETERMINER_PREFIX.test(whole.slice(0, offset)) ? match : punctuation,
    );
  }
  text = text.replace(/\s+([，。！？,.!?])/g, "$1").trim();
  text = CJK.test(text)
    ? text.replace(/([，])\s+/g, "$1")
    : text.replace(/([,])(?=\S)/g, "$1 ");
  if (text.endsWith("，") || text.endsWith(",")) text = text.slice(0, -1);
  if (!TERMINAL.test(text)) text += CJK.test(text) ? "。" : ".";
  return text;
}
