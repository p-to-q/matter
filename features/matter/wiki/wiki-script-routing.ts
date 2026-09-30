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
const LATIN_SCRIPT_LOCALES: ReadonlySet<MatterLocale> = new Set<MatterLocale>([
  "en-US",
  "de-DE",
]);
const LATIN_LETTER = /\p{Script=Latin}/u;
const LETTER_GLOBAL = /\p{L}/gu;
// The full-width ASCII block and the ideographic space, except the CJK
// sentence marks U+FF01, U+FF0C, U+FF1B, and U+FF1F: those stay unfolded so a
// URL or path tail still ends where the sentence does.
const FULL_WIDTH_ASCII_SOURCE =
  "[\\u3000\\uff02-\\uff0b\\uff0d-\\uff1a\\uff1c-\\uff1e\\uff20-\\uff5e]";
const FULL_WIDTH_ASCII = new RegExp(FULL_WIDTH_ASCII_SOURCE, "u");
const FULL_WIDTH_ASCII_GLOBAL = new RegExp(FULL_WIDTH_ASCII_SOURCE, "gu");
const FULL_WIDTH_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;
// Letters that end a routed Latin word without whitespace: CJK ideographs,
// kana (including half-width), Hangul, Bopomofo, and the CJK iteration and
// prolonged-sound marks that Unicode assigns to the Common script.
const CJK_LETTER = new RegExp(
  "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}" +
    "\\p{Script=Bopomofo}\\u3005\\u3006\\u30fc\\uff70]",
  "u",
);
const ROUTED_SCRIPTS = Object.freeze(["latin"] as const);

/** The ledger that Latin words of a turn in `turnLocale` route to, if any. */
export function wikiLatinRouteLocale(turnLocale: MatterLocale): MatterLocale | null {
  return LATIN_ROUTING_TURN_LOCALES.has(turnLocale) ? LATIN_LEDGER_LOCALE : null;
}

/**
 * A locale whose own words are Latin script. Its own matching, like routed
 * matching, reads full-width ASCII folded for protection and word boundaries,
 * so `＠name` or a full-width URL stays as protected as its half-width form.
 */
export function isWikiLatinScriptLocale(locale: MatterLocale): boolean {
  return LATIN_SCRIPT_LOCALES.has(locale);
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

/** A cheap whole-text test: without a Latin letter nothing can route. */
export function hasWikiLatinLetter(text: string): boolean {
  return LATIN_LETTER.test(text);
}

export type WikiRoutedWord = Readonly<{
  /** Ledger locale that owns this word's evidence. */
  locale: MatterLocale;
  /** Matching form: a Latin word width-folded in any turn; any other word as written. */
  form: string;
  /** The word left the turn's own ledger for the Latin ledger. */
  routed: boolean;
  /** The Latin word used full-width forms; the form is not what was written. */
  widthFolded: boolean;
}>;

/**
 * Routes one NFC word-like segment of a turn to the ledger that owns it.
 * Width is decided by script, not by ledger: a Latin word is read by its
 * width-folded spelling whether it routed out of a CJK turn or stayed in an
 * English or German one, so a full-width spelling is the same word everywhere.
 */
export function routeWikiWord(turnLocale: MatterLocale, surface: string): WikiRoutedWord {
  if (!isWikiLatinWord(surface)) {
    return Object.freeze({ locale: turnLocale, form: surface, routed: false, widthFolded: false });
  }
  const routedLocale = wikiLatinRouteLocale(turnLocale);
  const form = foldWikiFullWidthAscii(surface);
  return Object.freeze({
    locale: routedLocale ?? turnLocale,
    form,
    routed: routedLocale !== null,
    widthFolded: form !== surface,
  });
}

/**
 * Maps full-width ASCII (letters, digits, and symbols such as `＠／．－｀`) and
 * the ideographic space to ASCII, for matching and protection scans only. Each
 * mapped character is one UTF-16 code unit on both sides, so every index into
 * the folded text addresses the same character of the original. Committed text
 * is never width-normalized; only a rule that replaces a whole span changes it.
 */
export function foldWikiFullWidthAscii(text: string): string {
  if (!FULL_WIDTH_ASCII.test(text)) return text;
  return text.replace(FULL_WIDTH_ASCII_GLOBAL, (character) => {
    const code = character.charCodeAt(0);
    return code === IDEOGRAPHIC_SPACE ? " " : String.fromCharCode(code - FULL_WIDTH_OFFSET);
  });
}

export function hasWikiFullWidthAscii(text: string): boolean {
  return FULL_WIDTH_ASCII.test(text);
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
