const TERMINAL = /(?:[。！？.!?]|…+|\.{3})[\p{Pe}\p{Pf}“"']*$/u;
const CJK = /[㐀-鿿ぁ-ゖァ-ヺー]/u;

const LOW_AMBIGUITY_LATIN_FILLER = /(^|[\s,])(?:[Uu]m+|[Uu]h+|[Ee]rm+)(?=([\s,.!?]|$))/gu;
const LOW_AMBIGUITY_CJK_FILLER = /(^|[，。！？、\s])(?:呃+|額+|额+)(?=([，。！？、\s]|$))/gu;
const LATIN_RECOGNITION_ECHO = /\b(a|an|the|i|we|you|he|she|it|to|of|in|on|and|or|but)(?:\s+\1)+\b/giu;
const CJK_RECOGNITION_ECHO = /(我|你|他|她|它|这|這|那|的|是|在|就)(?:\s+\1)+/gu;

type SpokenPunctuation = Readonly<{
  pattern: RegExp;
  punctuation: string;
}>;

const SPOKEN_PUNCTUATION: readonly SpokenPunctuation[] = Object.freeze([
  { pattern: /((?:逗号|逗點))(?:[。！？.!?])?/gu, punctuation: "，" },
  { pattern: /((?:句号|句點))(?:[。！？.!?])?/gu, punctuation: "。" },
  { pattern: /((?:问号|問號))(?:[。！？.!?])?/gu, punctuation: "？" },
  { pattern: /((?:感叹号|感嘆號))(?:[。！？.!?])?/gu, punctuation: "！" },
]);

const NAMING_PREFIX = /(?:这个|那个|一个|這個|那個|一個|关于|關於|说|說|写|寫|读|讀|叫|称|稱|用|看|的|个|個)$/u;
const NAMING_SUFFIX = /^(?:的|是|叫|表示|代表|通常|一般|放|写|寫|读|讀|规则|規則|这个|這個|那个|那個)/u;
const OPENING_QUOTE = /[“‘"'「『]$/u;
const CLOSING_QUOTE = /^[”’"'」』]/u;

/**
 * The immediate admission floor changes formatting only. Lexical cleanup,
 * including spoken punctuation words, belongs to the short late-repair lease
 * so the browser can publish what it heard before optional work begins.
 */
export function normalizeAdmittedTranscript(value: string): string {
  let text = value.trim().replace(/\s+([，。！？,.!?])/gu, "$1");
  if (CJK.test(text)) {
    text = text.replace(/([，])\s+/gu, "$1");
  } else {
    // A comma between digits is a decimal or thousands separator, not a word
    // boundary. Only repair the unambiguous `word,next` shape.
    text = text.replace(/,(?=\S)/gu, (comma, offset: number, whole: string) => {
      const left = whole[offset - 1] ?? "";
      const right = whole[offset + 1] ?? "";
      return /\p{Nd}/u.test(left) && /\p{Nd}/u.test(right) ? comma : ", ";
    });
  }
  if (text.endsWith("，") || text.endsWith(",")) text = text.slice(0, -1).trimEnd();
  if (!TERMINAL.test(text)) text += CJK.test(text) ? "。" : ".";
  return text;
}

/**
 * A conservative local repair for text that is already material. It is
 * intentionally incomplete: a false negative leaves recognizer text visible;
 * a false positive would change a person's wording.
 */
export function repairAdmittedTranscript(value: string, locale: string): string {
  const baseline = normalizeAdmittedTranscript(value);
  let text = baseline;
  if (locale === "zh-CN" || locale === "zh-TW") {
    text = replaceSpokenCjkPunctuation(text);
    text = replacePreservingBoundary(text, LOW_AMBIGUITY_CJK_FILLER);
    text = text.replace(CJK_RECOGNITION_ECHO, "$1");
    text = spaceHanAndLatin(text);
  } else if (locale === "en-US") {
    text = replacePreservingBoundary(text, LOW_AMBIGUITY_LATIN_FILLER);
    text = text.replace(LATIN_RECOGNITION_ECHO, "$1");
  }
  text = normalizeRepairSeams(text);
  if (!hasLexicalContent(text)) return baseline;
  return normalizeAdmittedTranscript(text);
}

function replaceSpokenCjkPunctuation(value: string): string {
  let text = value;
  for (const rule of SPOKEN_PUNCTUATION) {
    text = text.replace(rule.pattern, (
      match: string,
      word: string,
      offset: number,
      whole: string,
    ) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + match.length);
      const beforeTrimmed = before.trimEnd();
      const afterTrimmed = after.trimStart();
      if (
        NAMING_PREFIX.test(beforeTrimmed) ||
        NAMING_SUFFIX.test(afterTrimmed) ||
        OPENING_QUOTE.test(beforeTrimmed) ||
        CLOSING_QUOTE.test(afterTrimmed)
      ) {
        return match;
      }
      const separatedBefore = /\s$/u.test(before);
      const explicitlyDelimited = separatedBefore && /^\s/u.test(after);
      const atUtteranceEnd = /^(?:[。！？.!?]|…{2}|\.{3})?[”’"')\]】》」』）]*$/u.test(afterTrimmed);
      return explicitlyDelimited || (separatedBefore && atUtteranceEnd) ? rule.punctuation : match;
    });
  }
  return text;
}

function replacePreservingBoundary(value: string, pattern: RegExp): string {
  return value.replace(pattern, (_match, leading: string) => leading);
}

function normalizeRepairSeams(value: string): string {
  return value
    .replace(/^[,，、]\s*/u, "")
    .replace(/([,，、])(?:\s*[,，、])+\s*/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/**
 * Latin product names are visually separate words in Chinese prose. Limit the
 * rule to Han/Latin boundaries: digits and kana have locale-specific spacing
 * conventions and are not safe to infer here.
 */
function spaceHanAndLatin(value: string): string {
  return value
    .replace(/(\p{Script=Han})(\p{Script=Latin})/gu, "$1 $2")
    .replace(/(\p{Script=Latin}[\p{Script=Latin}\p{N}]*)(\p{Script=Han})/gu, "$1 $2");
}

function hasLexicalContent(value: string): boolean {
  return value.replace(/[\p{P}\p{S}\p{Z}\s]/gu, "").length > 0;
}
