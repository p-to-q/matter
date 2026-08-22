import {
  MAX_NODE_TEXT_CODE_UNITS,
  MAX_REPLACEMENT_TEXT_CODE_UNITS,
} from "../tree/invariants";
import { MAX_TEXT_SWAP_DIRECTION_CODE_POINTS } from "./spoken-text-limits";
export { MAX_TEXT_SWAP_DIRECTION_CODE_POINTS } from "./spoken-text-limits";


export type TextSwapPolicyCode =
  | "EMPTY"
  | "NO_CHANGE"
  | "LENGTH_OUT_OF_RANGE"
  | "BOUND_EXCEEDED"
  | "INVALID_FORMAT"
  | "PROTECTED_MEANING_CHANGED"
  | "SCRIPT_DRIFT";

export type TextSwapLength = Readonly<{
  sourceGraphemes: number;
  sourceCodeUnits: number;
  remainingReplacementCodeUnits: number;
  minimumAcceptedGraphemes: number;
  maximumAcceptedGraphemes: number;
}>;

export type TextSwapPolicyResult =
  | Readonly<{ ok: true; length: TextSwapLength }>
  | Readonly<{ ok: false; code: TextSwapPolicyCode }>;

export type TextSwapCandidate = Readonly<{
  sourceText: string;
  candidateText: string;
  beforeText: string;
  afterText: string;
}>;

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });
const DANGEROUS_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const DIRECTION_DANGEROUS = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060\u2066-\u2069\uFE00-\uFE0F\uFEFF]/u;
const MULTILINE = /[\r\n\u2028\u2029]/u;
const MARKDOWN_OR_CHAT_WRAPPER = /^(?:\s*(?:```|~~~|#{1,6}\s|[-*+]\s+|\d+[.)]\s+|>\s)|\s*(?:assistant|user|system|chatgpt|matter|助手|用户|系统|sure|certainly|of course|here(?:'s| is)|当然可以|好的[，,]?|以下是)\s*[:：,，]?)/iu;
const WHOLE_WRAPPER = /^\s*(?:```[\s\S]*```|~~~[\s\S]*~~~|>[\s\S]*|["“「][\s\S]*["”」])\s*$/u;
const PROMPT_ARTIFACT = /<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s[^<>]*)?>|```|~~~/gu;
const JOINER_OR_VARIATION = /[\u200C\u200D\uFE00-\uFE0F]/gu;
const SCRIPT_TESTS: readonly RegExp[] = [
  /\p{Script=Latin}/u,
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
  /\p{Script=Arabic}/u,
  /\p{Script=Hebrew}/u,
  /\p{Script=Devanagari}/u,
  /\p{Script=Han}/u,
  /\p{Script=Hangul}/u,
  /\p{Script=Hiragana}/u,
  /\p{Script=Katakana}/u,
  /\p{Script=Thai}/u,
];
const PROTECTED_LANGUAGE_MARKERS = /(?<!\p{L})(?:not|no|never|without|none|neither|nor|cannot|can't|won't|must|mustn't|should|shouldn't|may|might|could|would|if|unless|because|since|therefore|thus|hence|so|all|every|each|any|some|many|much|few|several|most|only|nicht|kein(?:e|er|en|em|es)?|nie|ohne|muss|müssen|soll|sollte|kann|könnte|darf|dürfte|vielleicht|möglich|wenn|falls|sofern|weil|deshalb|daher|somit|alle|jeder|jede|jedes|manche|viele|wenige|einige|mehrere|meiste|nur)(?!\p{L})|(?:没有|沒有|不能|不会|不會|必须|必須|应该|應該|可能|或许|或許|除非|如果|因为|因為|由于|由於|所以|因此|导致|導致|从而|從而|不是|不|没|沒|无|無|未|勿|别|別|应|應|可以|若|只要|所有|全部|每个|每個|任何|一些|许多|許多|少数|少數|大多数|大多數|只有|仅|僅|ではない|じゃない|ません|かもしれない|なければならない|おそらく|たぶん|べき|可能性|もし|なら|場合|ので|から|ため|従って|だから|そのため|すべて|全て|各|いくつか|多く|少し|ほとんど|必ず|決して|ない|ず|ぬ)/giu;
const PROTECTED_CURRENCY_AMOUNT = /(?:\p{Lu}{1,3}\$|\p{Sc}|\p{Lu}{3}|Euro|Euros|Dollar|Dollars|Yen|euro|euros|dollar|dollars|yen|元|円|日元|人民币|人民幣|欧元|歐元)\s*-?\d[\d,]*(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s*(?:\p{Lu}{1,3}\$|\p{Sc}|\p{Lu}{3}|Euro|Euros|Dollar|Dollars|Yen|euro|euros|dollar|dollars|yen|元|円|日元|人民币|人民幣|欧元|歐元)/gu;

/** Canonicalizes the person's bounded spoken direction before it crosses the wire. */
export function normalizeTextSwapDirection(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (MULTILINE.test(value) || DIRECTION_DANGEROUS.test(value)) return null;
  const text = value.trim();
  const codePoints = Array.from(text).length;
  if (
    codePoints < 1 ||
    codePoints > MAX_TEXT_SWAP_DIRECTION_CODE_POINTS
  ) return null;
  return text;
}

/**
 * A paraphrase has a fixed, source-relative size seed rather than a gesture
 * degree. Graphemes own perceived length; UTF-16 owns document capacity.
 */
export function deriveTextSwapLength(
  sourceText: string,
  beforeText: string,
  afterText: string,
): TextSwapLength | null {
  if (typeof sourceText !== "string" || typeof beforeText !== "string" || typeof afterText !== "string") {
    return null;
  }
  const sourceGraphemes = countTextSwapGraphemes(sourceText);
  const sourceCodeUnits = sourceText.length;
  if (sourceGraphemes === 0 || sourceCodeUnits === 0) return null;
  const remainingReplacementCodeUnits = Math.max(
    0,
    Math.min(
      MAX_REPLACEMENT_TEXT_CODE_UNITS,
      MAX_NODE_TEXT_CODE_UNITS - beforeText.length - afterText.length,
    ),
  );
  if (remainingReplacementCodeUnits < 1) return null;
  const graphemeCapacity = Math.floor(
    remainingReplacementCodeUnits * sourceGraphemes / sourceCodeUnits,
  );
  const minimumAcceptedGraphemes = Math.max(1, Math.floor(.75 * sourceGraphemes));
  const maximumAcceptedGraphemes = Math.min(
    Math.ceil(1.35 * sourceGraphemes),
    graphemeCapacity,
  );
  if (maximumAcceptedGraphemes < minimumAcceptedGraphemes) return null;
  return Object.freeze({
    sourceGraphemes,
    sourceCodeUnits,
    remainingReplacementCodeUnits,
    minimumAcceptedGraphemes,
    maximumAcceptedGraphemes,
  });
}

/** Runs identically at server adjudication and browser pre-commit boundaries. */
export function validateTextSwapCandidate(input: TextSwapCandidate): TextSwapPolicyResult {
  const length = deriveTextSwapLength(input.sourceText, input.beforeText, input.afterText);
  if (length === null) return rejected("BOUND_EXCEEDED");
  if (input.candidateText.trim().length === 0) return rejected("EMPTY");
  if (input.candidateText === input.sourceText) return rejected("NO_CHANGE");
  if (
    input.candidateText.length > MAX_REPLACEMENT_TEXT_CODE_UNITS ||
    input.beforeText.length + input.candidateText.length + input.afterText.length > MAX_NODE_TEXT_CODE_UNITS
  ) return rejected("BOUND_EXCEEDED");
  const candidateGraphemes = countTextSwapGraphemes(input.candidateText);
  if (
    candidateGraphemes < length.minimumAcceptedGraphemes ||
    candidateGraphemes > length.maximumAcceptedGraphemes
  ) return rejected("LENGTH_OUT_OF_RANGE");
  if (
    MULTILINE.test(input.candidateText) ||
    DANGEROUS_CONTROL.test(input.candidateText) ||
    addsWrapper(input.sourceText, input.candidateText) ||
    !sameSequence(promptArtifacts(input.sourceText), promptArtifacts(input.candidateText)) ||
    !sameSequence(joinersAndVariations(input.sourceText), joinersAndVariations(input.candidateText)) ||
    !preservesOuterSeams(input.sourceText, input.candidateText)
  ) return rejected("INVALID_FORMAT");
  if (!sameSequence(protectedAnchors(input.sourceText), protectedAnchors(input.candidateText))) {
    return rejected("PROTECTED_MEANING_CHANGED");
  }
  if (!sameScriptSet(input.sourceText, input.candidateText)) return rejected("SCRIPT_DRIFT");
  return Object.freeze({ ok: true, length });
}

export function countTextSwapGraphemes(text: string): number {
  return [...GRAPHEME_SEGMENTER.segment(text)].length;
}

function promptArtifacts(text: string): readonly string[] {
  return Object.freeze(Array.from(text.matchAll(PROMPT_ARTIFACT), (match) => match[0]));
}

function joinersAndVariations(text: string): readonly string[] {
  return Object.freeze(Array.from(text.matchAll(JOINER_OR_VARIATION), (match) => match[0]));
}

function addsWrapper(source: string, candidate: string): boolean {
  return (
    MARKDOWN_OR_CHAT_WRAPPER.test(candidate) && !MARKDOWN_OR_CHAT_WRAPPER.test(source)
  ) || (
    WHOLE_WRAPPER.test(candidate) && !WHOLE_WRAPPER.test(source)
  );
}

function preservesOuterSeams(source: string, candidate: string): boolean {
  return leadingSeam(source) === leadingSeam(candidate) &&
    trailingSeam(source) === trailingSeam(candidate);
}

function leadingSeam(text: string): string {
  return text.match(/^[\p{P}\p{Zs}\t]*/u)?.[0] ?? "";
}

function trailingSeam(text: string): string {
  return text.match(/[\p{P}\p{Zs}\t]*$/u)?.[0] ?? "";
}

function protectedAnchors(text: string): readonly string[] {
  const values: { index: number; value: string }[] = [];
  const capture = (expression: RegExp) => {
    for (const match of text.matchAll(expression)) {
      if (match.index !== undefined) values.push({ index: match.index, value: match[0] });
    }
  };
  capture(/https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu);
  capture(PROTECTED_CURRENCY_AMOUNT);
  capture(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/gu);
  capture(/\b(?:v?\d+(?:\.\d+){1,}|[A-Za-z]+[A-Za-z0-9_]*[-_][A-Za-z0-9_-]+|[A-Za-z]+\d[A-Za-z0-9_-]*)\b/gu);
  capture(/(?<![\p{L}\p{N}_])-?\d[\d,]*(?:\.\d+)?(?:\s*(?:%|°[CF]|(?:ms|s|min|h|day|days|kg|g|mg|km|m|cm|mm|mb|gb|tb|万|亿|年|月|日|小时|分钟|秒)))?/giu);
  capture(PROTECTED_LANGUAGE_MARKERS);
  return Object.freeze(values.sort((left, right) => left.index - right.index).map((entry) => entry.value));
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameScriptSet(source: string, candidate: string): boolean {
  return SCRIPT_TESTS.every((expression) => expression.test(source) === expression.test(candidate));
}

function rejected(code: TextSwapPolicyCode): TextSwapPolicyResult {
  return Object.freeze({ ok: false, code });
}
