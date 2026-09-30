/**
 * Coarse script classes decide whether one human turn was a comparable
 * opportunity for a stored candidate: a term or relation can only be absent
 * from a turn that could have contained it. This is deterministic letter
 * classification, not language identification. Common and Inherited code
 * points, digits, punctuation, and symbols constrain nothing.
 */

export const WIKI_SCRIPT_CLASSES = Object.freeze([
  "latin",
  "han",
  "kana",
  "hangul",
  "other",
] as const);

export type WikiScriptClass = (typeof WIKI_SCRIPT_CLASSES)[number];

/** Bit set over WIKI_SCRIPT_CLASSES in declaration order. */
export type WikiScriptMask = number;

const LETTER = /^\p{L}$/u;
const NEUTRAL = /^[\p{Script=Common}\p{Script=Inherited}]$/u;
const LATIN = /^\p{Script=Latin}$/u;
const HAN = /^\p{Script=Han}$/u;
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const HANGUL = /^\p{Script=Hangul}$/u;
const ALL_SCRIPTS_MASK = (1 << WIKI_SCRIPT_CLASSES.length) - 1;

export function isWikiScriptClass(value: unknown): value is WikiScriptClass {
  return typeof value === "string" &&
    (WIKI_SCRIPT_CLASSES as readonly string[]).includes(value);
}

/** Returns the scripts whose letters occur in `text`. */
export function wikiScriptMask(text: string): WikiScriptMask {
  let mask = 0;
  for (const point of text) {
    if (!LETTER.test(point) || NEUTRAL.test(point)) continue;
    mask |= scriptBit(point);
    if (mask === ALL_SCRIPTS_MASK) break;
  }
  return mask;
}

export function wikiScriptMaskFromClasses(
  classes: readonly WikiScriptClass[],
): WikiScriptMask {
  let mask = 0;
  for (const value of classes) mask |= 1 << WIKI_SCRIPT_CLASSES.indexOf(value);
  return mask;
}

/** Stable, sorted, duplicate-free class list for a transient opportunity. */
export function wikiScriptClassesFromMask(
  mask: WikiScriptMask,
): readonly WikiScriptClass[] {
  return Object.freeze(WIKI_SCRIPT_CLASSES.filter((_, index) =>
    (mask & (1 << index)) !== 0));
}

/** A candidate is comparable only when every script it needs was present. */
export function wikiScriptsCover(
  opportunity: WikiScriptMask,
  candidate: WikiScriptMask,
): boolean {
  return (candidate & ~opportunity) === 0;
}

function scriptBit(point: string): number {
  if (LATIN.test(point)) return 1 << 0;
  if (HAN.test(point)) return 1 << 1;
  if (KANA.test(point)) return 1 << 2;
  if (HANGUL.test(point)) return 1 << 3;
  return 1 << 4;
}
