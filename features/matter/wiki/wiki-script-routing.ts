import type { MatterLocale } from "../config/locales";
import type { WikiEvidenceOpportunity } from "./wiki-model";

/**
 * Script routing decides which lexical ledger owns one word of a human turn
 * or one span of material. It is not locale fallback: a span is routed by its
 * own script, never because the turn's locale lacks a rule, and a routed span
 * consults exactly one other ledger.
 *
 * Inside a Chinese or Japanese turn, a word whose letters are all Latin belongs
 * to the `en-US` ledger — the locale settings already infer for a Latin word
 * typed under those interfaces — so its evidence, comparable-opportunity aging,
 * producer precedence, and rules are that ledger's. Every other word, and every
 * word of an English or German turn, stays in the turn's own locale. CJK spans
 * are never routed, and nothing routes toward a CJK ledger.
 */

const LATIN_LEDGER_LOCALE: MatterLocale = "en-US";
const LATIN_ROUTING_TURN_LOCALES: ReadonlySet<MatterLocale> = new Set<MatterLocale>([
  "zh-CN",
  "zh-TW",
  "ja-JP",
]);
const LATIN_LETTER = /\p{Script=Latin}/u;
const LETTER_GLOBAL = /\p{L}/gu;
const FULL_WIDTH_ALPHANUMERIC = /[０-９Ａ-Ｚａ-ｚ]/u;
const FULL_WIDTH_ALPHANUMERIC_GLOBAL = /[０-９Ａ-Ｚａ-ｚ]/gu;
const FULL_WIDTH_OFFSET = 0xfee0;
// Letters that end a routed Latin word without whitespace: CJK ideographs,
// kana (including half-width), Hangul, Bopomofo, and the CJK iteration and
// prolonged-sound marks that Unicode assigns to the Common script.
const CJK_LETTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}々〆ーｰ]/u;
const ROUTED_SCRIPTS = Object.freeze(["latin"] as const);

/** The ledger that Latin words of a turn in `turnLocale` route to, if any. */
export function wikiLatinRouteLocale(turnLocale: MatterLocale): MatterLocale | null {
  return LATIN_ROUTING_TURN_LOCALES.has(turnLocale) ? LATIN_LEDGER_LOCALE : null;
}

/** The one ledger locale that owns a Latin word spoken in `turnLocale`. */
export function wikiLatinLedgerLocale(turnLocale: MatterLocale): MatterLocale {
  return wikiLatinRouteLocale(turnLocale) ?? turnLocale;
}

/** At least one letter, and every letter is Latin script (full width included). */
export function isWikiLatinWord(surface: string): boolean {
  let latin = false;
  for (const match of surface.matchAll(LETTER_GLOBAL)) {
    if (!LATIN_LETTER.test(match[0])) return false;
    latin = true;
  }
  return latin;
}

export type WikiRoutedWord = Readonly<{
  /** Ledger locale that owns this word's evidence. */
  locale: MatterLocale;
  /** Matching form: the surface, width-folded only when the word is routed. */
  form: string;
  routed: boolean;
  /** The routed surface used full-width Latin; the form is not what was written. */
  widthFolded: boolean;
}>;

/** Routes one NFC word-like segment of a turn to the ledger that owns it. */
export function routeWikiWord(turnLocale: MatterLocale, surface: string): WikiRoutedWord {
  const routedLocale = wikiLatinRouteLocale(turnLocale);
  if (routedLocale === null || !isWikiLatinWord(surface)) {
    return Object.freeze({ locale: turnLocale, form: surface, routed: false, widthFolded: false });
  }
  const form = foldWikiFullWidthLatin(surface);
  return Object.freeze({
    locale: routedLocale,
    form,
    routed: true,
    widthFolded: form !== surface,
  });
}

/**
 * Maps full-width ASCII letters and digits to ASCII for matching only. Each
 * mapped character is one UTF-16 code unit on both sides, so every index into
 * the folded text addresses the same character of the original. Committed text
 * is never width-normalized; only a rule that replaces a whole span changes it.
 */
export function foldWikiFullWidthLatin(text: string): string {
  if (!FULL_WIDTH_ALPHANUMERIC.test(text)) return text;
  return text.replace(FULL_WIDTH_ALPHANUMERIC_GLOBAL, (character) =>
    String.fromCharCode(character.charCodeAt(0) - FULL_WIDTH_OFFSET));
}

export function hasWikiFullWidthLatin(text: string): boolean {
  return FULL_WIDTH_ALPHANUMERIC.test(text);
}

/** A grapheme a routed match may cover: it has no letter outside Latin. */
export function isWikiRoutableGrapheme(grapheme: string): boolean {
  for (const match of grapheme.matchAll(LETTER_GLOBAL)) {
    if (!LATIN_LETTER.test(match[0])) return false;
  }
  return true;
}

/** A CJK letter ends a routed Latin word even without whitespace. */
export function isWikiCjkLetter(grapheme: string): boolean {
  return CJK_LETTER.test(grapheme);
}

/**
 * A routed opportunity is valid only for the ledger its turn routes to, on the
 * turn's channel, and only for the Latin script that routing moves.
 */
export function isWikiRoutedOpportunity(
  own: WikiEvidenceOpportunity,
  routed: WikiEvidenceOpportunity,
): boolean {
  return routed.locale === wikiLatinRouteLocale(own.locale) &&
    routed.channel === own.channel &&
    routed.scripts.length === ROUTED_SCRIPTS.length &&
    routed.scripts.every((script, index) => script === ROUTED_SCRIPTS[index]);
}
