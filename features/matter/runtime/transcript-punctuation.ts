const SPOKEN_PUNCTUATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/\s*(?:逗号|逗點)\s*/g, "，"],
  [/\s*(?:句号|句點)\s*/g, "。"],
  [/\s*问号\s*/g, "？"],
  [/\s*感叹号\s*/g, "！"],
  [/\bcomma\b\s*/gi, ","],
  [/\b(?:period|full stop)\b\s*/gi, "."],
  [/\bquestion mark\b\s*/gi, "?"],
  [/\bexclamation mark\b\s*/gi, "!"],
];

const TERMINAL = /[。！？.!?]$/u;

/**
 * Admission-only cleanup: spoken punctuation is a browser speech affordance,
 * not generative rewriting. Existing punctuation and wording are preserved.
 */
export function normalizeAdmittedTranscript(value: string): string {
  let text = value.trim();
  for (const [pattern, punctuation] of SPOKEN_PUNCTUATION) text = text.replace(pattern, punctuation);
  text = text.replace(/\s+([，。！？,.!?])/g, "$1").trim();
  text = /[\u3400-\u9fff]/u.test(text)
    ? text.replace(/([，])\s+/g, "$1")
    : text.replace(/([,])(?=\S)/g, "$1 ");
  if (text.endsWith("，") || text.endsWith(",")) text = text.slice(0, -1);
  if (!TERMINAL.test(text)) text += /[\u3400-\u9fff]/u.test(text) ? "。" : ".";
  return text;
}
