import {
  isSpokenTranscriptQuestion,
  normalizeSpokenTranscript,
} from "./spoken-transcript";
import {
  MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL,
  protectedTranscriptLiteralPattern,
} from "./protected-transcript-literal";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

const LOW_AMBIGUITY_LATIN_FILLER = /(^|[\s,])(?:[Uu]m+|[Uu]h+|[Ee]rm+|[Ee]r+)(?=([\s,.!?]|$))/gu;
const LOW_AMBIGUITY_CJK_FILLER = /(^|[，。！？、\s])(?:呃+|額+|额+)(?=([，。！？、\s]|$))/gu;
const LOW_AMBIGUITY_GERMAN_FILLER = /(^|[\s,])(?:äh+|ähm+|öh+|öhm+)(?=([\s,.!?]|$))/giu;
const LATIN_RECOGNITION_ECHO = /\b(a|an|the|i|we|you|he|she|it|to|of|in|on|and|or|but)(?:\s+\1)+\b/giu;
const CJK_RECOGNITION_ECHO = /(我|你|他|她|它|这|這|那|的|是|在|就)(?:\s+\1)+/gu;
const CJK_TIGHT_RECOGNITION_ECHO = /(我|你|他|她|它|这|這|那)(?:\1)+/gu;
const LATIN_TRIPLE_RECOGNITION_ECHO = /\b([\p{L}\p{N}][\p{L}\p{N}'’-]{0,31})(?:\s+\1){2,}\b/giu;
const CJK_TRIPLE_RECOGNITION_ECHO = /([\p{Script=Han}]{1,8})(?:\s+\1){2,}(?=\s|[，。！？、]|$)/gu;
const CJK_TIGHT_RESTART = /(我觉得|我覺得|我认为|我認為|我们需要|我們需要|我想|这个|這個)(?:\s*\1)+/gu;
const CJK_PARTIAL_RESTART = /(我(?:觉|覺|认|認|需|想)?|我们(?:觉|覺|认|認|需|想)?|我們(?:覺|認|需|想)?)[-—，,\s]*(?=(?:我(?:觉得|覺得|认为|認為|需要|想要)|我们(?:觉得|认为|需要|想要)|我們(?:覺得|認為|需要|想要)))/gu;

const JAPANESE_RECOGNITION_ECHO = /(私は|私たちは|これは|それは|この案は)(?:\s+\1)+/gu;
const GERMAN_RECOGNITION_ECHO = /\b(ich|wir|du|er|sie|es|der|die|das|ein|eine|und|oder|aber)(?:\s+\1)+\b/giu;

type SpokenPunctuation = Readonly<{
  pattern: RegExp;
  punctuation: string;
}>;

const SPOKEN_PUNCTUATION: readonly SpokenPunctuation[] = Object.freeze([
  { pattern: /((?:逗号|逗點))(?:[。！？.!?])?/gu, punctuation: "，" },
  { pattern: /((?:句号|句點))(?:[。！？.!?])?/gu, punctuation: "。" },
  { pattern: /((?:问号|問號))(?:[。！？.!?])?/gu, punctuation: "？" },
  { pattern: /((?:感叹号|感嘆號))(?:[。！？.!?])?/gu, punctuation: "！" },
  { pattern: /((?:冒号|冒號))(?:[。！？.!?])?/gu, punctuation: "：" },
  { pattern: /((?:分号|分號))(?:[。！？.!?])?/gu, punctuation: "；" },
  { pattern: /((?:顿号|頓號))(?:[。！？.!?])?/gu, punctuation: "、" },
  { pattern: /((?:破折号|破折號))(?:[。！？.!?])?/gu, punctuation: "—" },
]);

const SPOKEN_ENGLISH_PUNCTUATION: readonly SpokenPunctuation[] = Object.freeze([
  { pattern: /\bquestion mark\b(?:[.!?])?/giu, punctuation: "?" },
  { pattern: /\b(?:exclamation mark|exclamation point)\b(?:[.!?])?/giu, punctuation: "!" },
  { pattern: /\b(?:full stop|period)\b(?:[.!?])?/giu, punctuation: "." },
  { pattern: /\bcomma\b(?:[.!?])?/giu, punctuation: "," },
  { pattern: /\bsemicolon\b(?:[.!?])?/giu, punctuation: ";" },
  { pattern: /\bcolon\b(?:[.!?])?/giu, punctuation: ":" },
  { pattern: /\bem dash\b(?:[.!?])?/giu, punctuation: "—" },
]);

const SPOKEN_JAPANESE_PUNCTUATION: readonly SpokenPunctuation[] = Object.freeze([
  { pattern: /(?:疑問符|クエスチョンマーク)(?:[。！？.!?])?/gu, punctuation: "？" },
  { pattern: /(?:感嘆符|エクスクラメーションマーク)(?:[。！？.!?])?/gu, punctuation: "！" },
  { pattern: /句点(?:[。！？.!?])?/gu, punctuation: "。" },
  { pattern: /読点(?:[。！？.!?])?/gu, punctuation: "、" },
  { pattern: /ダッシュ(?:[。！？.!?])?/gu, punctuation: "—" },
]);

const SPOKEN_GERMAN_PUNCTUATION: readonly SpokenPunctuation[] = Object.freeze([
  { pattern: /\bFragezeichen\b(?:[.!?])?/giu, punctuation: "?" },
  { pattern: /\bAusrufezeichen\b(?:[.!?])?/giu, punctuation: "!" },
  { pattern: /\bPunkt\b(?:[.!?])?/giu, punctuation: "." },
  { pattern: /\bKomma\b(?:[.!?])?/giu, punctuation: "," },
  { pattern: /\bSemikolon\b(?:[.!?])?/giu, punctuation: ";" },
  { pattern: /\bDoppelpunkt\b(?:[.!?])?/giu, punctuation: ":" },
  { pattern: /\bGedankenstrich\b(?:[.!?])?/giu, punctuation: "—" },
]);

const NAMING_PREFIX = /(?:这个|那个|一个|這個|那個|一個|关于|關於|说|說|写|寫|读|讀|叫|称|稱|用|看|的|个|個)$/u;
const NAMING_SUFFIX = /^(?:的|是|叫|表示|代表|通常|一般|放|写|寫|读|讀|规则|規則|这个|這個|那个|那個)/u;
const OPENING_QUOTE = /[“‘"'「『]$/u;
const CLOSING_QUOTE = /^[”’"'」』]/u;
const CJK_COMMAND_CONTINUATION = /^(?:然后|然後|接着|接著|但是|不过|不過|可是|所以|再|我|我们|我們|你|他|她|这|這|那)/u;
const ENGLISH_NAMING_PREFIX = /(?:\b(?:a|the|this|that|word|term|mark|called|named|say|says|said|write|writes|wrote|type|spell|about|discuss|discussed|mention|mentioned|using|use|with|without|support|parse|parser|handle|handles|recognize|recognizes|literal|spoken|voice|regex|token|command|jurassic|historical|geological|trial|grace|waiting|menstrual|decimal)\s+)$/iu;
const ENGLISH_NAMING_SUFFIX = /^\s*(?:is|means|refers|rule|rules|mark|punctuation|character|of|between|ended|lasted|began|support|syntax|command|handling|mode|token|word|case|example|literal|key)\b/iu;
const ENGLISH_DIRECT_QUESTION = /^(?:(?:can|could|would|should|do|does|did|is|are|was|were|will|have|has|am|can['’]t|couldn['’]t|wouldn['’]t|shouldn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|won['’]t|don['’]t|doesn['’]t|didn['’]t|hasn['’]t|haven['’]t)\s+(?:i|we|you|he|she|it|they|this|that|there)\b|(?:why|how|what|where|when|who|which)\s+(?:can|could|would|should|do|does|did|is|are|was|were|will|have|has|can['’]t|couldn['’]t|wouldn['’]t|shouldn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|won['’]t|don['’]t|doesn['’]t|didn['’]t|hasn['’]t|haven['’]t)\b)/iu;
const ENGLISH_LEXICAL_QUESTION = /^(?:what happened|what changed|what matters|who knows|who said|who wants|who needs|how come|where to|what to|which one)\b/iu;
const JAPANESE_PUNCTUATION_NAMING_PREFIX = /(?:言葉|記号|文字|用語|「|『)$/u;
const JAPANESE_PUNCTUATION_NAMING_SUFFIX = /^(?:とは|は|を|の|という|表す|意味)/u;
const GERMAN_PUNCTUATION_NAMING_PREFIX = /(?:\b(?:das|ein|dieses|Wort|Zeichen|Begriff|Token|namens|heißt)\s+)$/iu;
const GERMAN_PUNCTUATION_NAMING_SUFFIX = /^\s*(?:ist|bedeutet|bezeichnet|steht|Zeichen|Regel|Token|Wort)\b/iu;

const ENGLISH_RESTART_ANCHORS = Object.freeze([
  "i think",
  "i guess",
  "i want",
  "i need",
  "we think",
  "we want",
  "we need",
  "we should",
  "this is",
  "that is",
] as const);
const CJK_RESTART_ANCHORS = Object.freeze([
  "我觉得",
  "我覺得",
  "我认为",
  "我認為",
  "我们觉得",
  "我們覺得",
  "我们需要",
  "我們需要",
  "我想",
  "这个",
  "這個",
] as const);

const RESTART_CONTRAST = /\b(?:and|but|because|although|though|while|when|if|unless|since|so|therefore|however|or)\b|[.;:!?]/iu;
const CJK_RESTART_CONTRAST = /(?:但是|不过|不過|因为|因為|所以|而且|如果|虽然|雖然|还是|還是|或者|可是|然而)|[。！？；：]/u;

const KNOWN_ENGLISH_CASING: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/\bopenai\b/giu, "OpenAI"],
  [/\bchatgpt\b/giu, "ChatGPT"],
  [/\bgithub\b/giu, "GitHub"],
  [/\btypescript\b/giu, "TypeScript"],
  [/\bjavascript\b/giu, "JavaScript"],
  [/\biphone\b/giu, "iPhone"],
  [/\bipad\b/giu, "iPad"],
  [/\bmacos\b/giu, "macOS"],
  [/\bapi\b/giu, "API"],
  [/\burl\b/giu, "URL"],
  [/\bstt\b/giu, "STT"],
  [/\basr\b/giu, "ASR"],
  [/\bllm\b/giu, "LLM"],
]);

const ENGLISH_NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
});
const GERMAN_NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
  dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17,
  achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, vierzig: 40,
  fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
});
const CJK_DIGITS: Readonly<Record<string, number>> = Object.freeze({
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
});

const VERBATIM_LITERAL = /```[^]*?```|`[^`\n]+`|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|"[^"\n]+"/gu;
const MAY_CONTAIN_VERBATIM_LITERAL = /[`“‘「『"]/u;

/**
 * The immediate admission floor changes formatting only. Lexical cleanup,
 * including spoken punctuation words, belongs to the short late-repair lease
 * so the browser can publish what it heard before optional work begins.
 */
export function normalizeAdmittedTranscript(value: string, locale = "und"): string {
  return normalizeSpokenTranscript({
    text: value,
    locale,
    maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
  });
}

/**
 * A bounded deterministic repair for text that is already material. It is
 * deliberately assertive about recognition-shaped debris and formatting, but
 * every lexical deletion still requires an exact local shape. Open-ended tone
 * or semantic rewriting never belongs here; the separate expression planner
 * can only append one closed-set emoji under stricter vetoes.
 */
/** The managed repair boundary receives words and punctuation, never a
 * deterministic expression guess. Its accepted result is decorated locally. */
export function repairAdmittedTranscriptWords(value: string, locale: string): string {
  const baseline = normalizeAdmittedTranscript(value, locale);
  let text = baseline;
  if (locale === "zh-CN" || locale === "zh-TW") {
    text = repairCjkTranscript(text);
  } else if (locale === "en-US") {
    text = repairEnglishTranscript(text);
  } else if (locale === "ja-JP") {
    text = repairJapaneseTranscript(text);
  } else if (locale === "de-DE") {
    text = repairGermanTranscript(text);
  }
  text = withProtectedLiterals(text, normalizeRepairSeams);
  if (!hasLexicalContent(text)) return baseline;
  const repaired = normalizeAdmittedTranscript(text, locale);
  // Lexical repair may add script-boundary spaces even when punctuation has
  // already degraded at capacity. The optional repair must fall back whole,
  // never hand the port a candidate the tree cannot represent.
  return repaired.length <= MAX_NODE_TEXT_CODE_UNITS ? repaired : baseline;
}

/**
 * Locale repair is an ordered pipeline, not a bag of replacements. Literal
 * addresses are recovered and hidden first; destructive lexical passes then
 * cannot title-case a URL, turn its dots into sentence marks, or edit an email
 * local-part. Restoring them last also makes every pass independently
 * idempotent.
 */
function repairEnglishTranscript(value: string): string {
  return withProtectedPattern(value, VERBATIM_LITERAL, (outsideVerbatim) => {
    const addressedText = normalizeEnglishNumberUnits(
      replacePairedEnglishCommands(normalizeSpokenEnglishAddresses(outsideVerbatim)),
    );
    return withProtectedLiterals(addressedText, (unprotected) => {
      let text = replaceSpokenEnglishPunctuation(unprotected);
      text = replacePreservingBoundary(text, LOW_AMBIGUITY_LATIN_FILLER);
      text = removeBoundedEnglishDiscourseFillers(text);
      text = collapseEnglishPartialStutters(text);
      text = collapseEnglishRestarts(text);
      text = collapseEnglishAnchoredRestarts(text);
      text = text.replace(LATIN_RECOGNITION_ECHO, "$1");
      text = text.replace(LATIN_TRIPLE_RECOGNITION_ECHO, "$1");
      text = repairEnglishExplicitCorrections(text);
      text = normalizeRepairSeams(text);
      text = punctuateEnglishSignals(text);
      return applyKnownEnglishCasing(text);
    });
  });
}

function repairCjkTranscript(value: string): string {
  return withProtectedPattern(value, VERBATIM_LITERAL, (outsideVerbatim) => {
    const addressedText = spaceHanAndLatin(
      replacePairedCjkCommands(
        normalizeCjkInverseText(normalizeSpokenCjkAddresses(outsideVerbatim)),
      ),
    );
    return withProtectedLiterals(addressedText, (unprotected) => {
      let text = replaceSpokenCjkPunctuation(unprotected);
      text = replacePreservingBoundary(text, LOW_AMBIGUITY_CJK_FILLER);
      text = removeLeadingCjkAcousticFiller(text);
      text = removeInlineCjkAcousticFiller(text);
      text = text.replace(CJK_PARTIAL_RESTART, "");
      text = text.replace(CJK_RECOGNITION_ECHO, "$1");
      text = text.replace(CJK_TIGHT_RECOGNITION_ECHO, "$1");
      text = text.replace(CJK_TRIPLE_RECOGNITION_ECHO, "$1");
      text = text.replace(CJK_TIGHT_RESTART, "$1");
      text = collapseCjkAnchoredRestarts(text);
      text = repairCjkTemporalCorrection(text);
      text = normalizeCjkMarks(text);
      return applyKnownEnglishCasing(spaceHanAndLatin(text));
    });
  });
}

function repairJapaneseTranscript(value: string): string {
  return withProtectedPattern(value, VERBATIM_LITERAL, (outsideVerbatim) => {
    return withProtectedLiterals(outsideVerbatim, (unprotected) => {
      let text = replaceSpokenLocalePunctuation(
        normalizeJapaneseInverseText(unprotected),
        SPOKEN_JAPANESE_PUNCTUATION,
        JAPANESE_PUNCTUATION_NAMING_PREFIX,
        JAPANESE_PUNCTUATION_NAMING_SUFFIX,
      );
      text = text.replace(/^\s*(?:えーと|ええと|あのー)[、,\s]+(?=[^、。！？])/u, "");
      text = text.replace(JAPANESE_RECOGNITION_ECHO, "$1");
      // Sentence-final か is grammatical question evidence. の is not: it can
      // be explanatory or attributive, and prosody is no longer available here.
      if (isSpokenTranscriptQuestion(text, "ja-JP")) {
        text = text.replace(/。([”’）】》」』]*)$/u, "？$1");
      }
      return applyKnownEnglishCasing(text.replace(/([、。！？])\s+/gu, "$1"));
    });
  });
}

function repairGermanTranscript(value: string): string {
  return withProtectedPattern(value, VERBATIM_LITERAL, (outsideVerbatim) => {
    return withProtectedLiterals(outsideVerbatim, (unprotected) => {
      let text = replaceSpokenLocalePunctuation(
        normalizeGermanInverseText(unprotected),
        SPOKEN_GERMAN_PUNCTUATION,
        GERMAN_PUNCTUATION_NAMING_PREFIX,
        GERMAN_PUNCTUATION_NAMING_SUFFIX,
      );
      text = replacePreservingBoundary(text, LOW_AMBIGUITY_GERMAN_FILLER);
      text = text.replace(GERMAN_RECOGNITION_ECHO, "$1");
      text = normalizeRepairSeams(text);
      text = capitalizeLatinSentenceStarts(text);
      if (isSpokenTranscriptQuestion(text, "de-DE")) {
        text = text.replace(/\.([”’"')\]]*)$/u, "?$1");
      }
      return applyKnownEnglishCasing(text);
    });
  });
}

/** Paired delimiters are safer than isolated symbol words: both spoken ends
 * prove that the phrase is a dictation command rather than prose about a quote
 * or parenthesis. Punctuation inside the pair is settled before the resulting
 * literal is masked from every later lexical pass. */
function replacePairedEnglishCommands(value: string): string {
  let text = value
    .replace(
      /\bopen (?:parenthesis|paren)\b\s+(.{1,240}?)\s+\bclose (?:parenthesis|paren)\b/giu,
      (_match: string, content: string) =>
        `(${normalizeRepairSeams(replaceSpokenEnglishPunctuation(content))})`,
    )
    .replace(
      /\bopen (?:quote|quotation mark)\b\s+(.{1,240}?)\s+\bclose (?:quote|quotation mark)\b/giu,
      (_match: string, content: string) =>
        `“${normalizeRepairSeams(replaceSpokenEnglishPunctuation(content))}”`,
    );
  // Two pairs can be dictated in one utterance; the bounded second pass sees
  // only command text left outside already materialized delimiters.
  text = text.replace(
    /\bopen (?:parenthesis|paren)\b\s+(.{1,240}?)\s+\bclose (?:parenthesis|paren)\b/giu,
    (_match: string, content: string) =>
      `(${normalizeRepairSeams(replaceSpokenEnglishPunctuation(content))})`,
  );
  return text;
}

function replacePairedCjkCommands(value: string): string {
  return value
    .replace(
      /(?:左括号|左括號)\s*(.{1,240}?)\s*(?:右括号|右括號)/gu,
      (_match: string, content: string) =>
        `（${normalizeRepairSeams(replaceSpokenCjkPunctuation(content))}）`,
    )
    .replace(
      /(?:左引号|左引號)\s*(.{1,240}?)\s*(?:右引号|右引號)/gu,
      (_match: string, content: string) =>
        `“${normalizeRepairSeams(replaceSpokenCjkPunctuation(content))}”`,
    );
}

function removeBoundedEnglishDiscourseFillers(value: string): string {
  return value
    .replace(/(^|[.!?;,]\s*)you know\s*,\s+(?=\p{L})/giu, "$1")
    .replace(/(^|[.!?;,]\s*)I mean\s*,\s+(?=\p{L})/giu, "$1");
}

function removeLeadingCjkAcousticFiller(value: string): string {
  return value.replace(
    /^(?:呃+|额+|額+)[，,\s]*(?=(?:我|我们|我們|你|他|她|这|這|那|先|然后|然後|所以|可以|需要))/u,
    "",
  );
}

function removeInlineCjkAcousticFiller(value: string): string {
  // Unspaced CJK ASR commonly glues a hesitation to the next discourse cue.
  // Restrict deletion to that exact shape: 嗯 can be an answer and 呃逆 is a
  // word, so neither a general single-character deletion nor a noun split is safe.
  return value.replace(
    /(?<=[\p{Script=Han}，。！？])呃+(?=[，,]?(?:其实|其實|然后|然後|所以|我|我们|我們|这个|這個|可以|需要|先|再))/gu,
    "",
  );
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
      const embeddedCommand = CJK_COMMAND_CONTINUATION.test(afterTrimmed);
      return explicitlyDelimited || atUtteranceEnd || embeddedCommand ? rule.punctuation : match;
    });
  }
  return text;
}

function replaceSpokenEnglishPunctuation(value: string): string {
  let text = value;
  for (const rule of SPOKEN_ENGLISH_PUNCTUATION) {
    text = text.replace(rule.pattern, (match: string, offset: number, whole: string) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + match.length);
      if (
        ENGLISH_NAMING_PREFIX.test(before) ||
        ENGLISH_NAMING_SUFFIX.test(after) ||
        OPENING_QUOTE.test(before.trimEnd()) ||
        CLOSING_QUOTE.test(after.trimStart())
      ) {
        return match;
      }
      return rule.punctuation;
    });
  }
  return text;
}

function replaceSpokenLocalePunctuation(
  value: string,
  rules: readonly SpokenPunctuation[],
  namingPrefix: RegExp,
  namingSuffix: RegExp,
): string {
  let text = value;
  for (const rule of rules) {
    text = text.replace(rule.pattern, (match: string, offset: number, whole: string) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + match.length);
      if (
        namingPrefix.test(before.trimEnd()) ||
        namingSuffix.test(after.trimStart()) ||
        OPENING_QUOTE.test(before.trimEnd()) ||
        CLOSING_QUOTE.test(after.trimStart())
      ) {
        return match;
      }
      const separated = /\s$/u.test(before) && /^\s/u.test(after);
      const terminal = /^(?:[。！？.!?])?[”’"')\]】》」』）]*$/u.test(after.trim());
      return separated || terminal ? rule.punctuation : match;
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
    .replace(/\s+([,.;:!?，。！？；：、])/gu, "$1")
    .replace(/\s*—\s*/gu, "—")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]*\n[ \t]*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function normalizeCjkMarks(value: string): string {
  return value
    .replace(/,(?=\s*[^\p{N}])/gu, "，")
    .replace(/;(?!\p{N})/gu, "；")
    .replace(/:(?![\/\p{N}])/gu, "：")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！");
}

function punctuateEnglishSignals(value: string): string {
  let text = value
    .replace(/\s+(but|however|yet)\s+(?=(?:i|we|you|he|she|it|they|this|that|there)\b)/giu, ", $1 ")
    .replace(/\s+(then)\s+(?=(?:i|we|you|he|she|it|they|this|that|there)\b)/giu, (
      match: string,
      then: string,
      offset: number,
      whole: string,
    ) => /\band$/iu.test(whole.slice(0, offset)) ? match : `, ${then} `)
    .replace(
      /^(so|however|therefore|actually|instead|finally|first|second|third|in fact|for example)\s+(?=(?:i|we|you|he|she|it|they|this|that|there|the|a|an)\b)/iu,
      "$1, ",
    )
    .replace(/\bhowever\s+(?=(?:i|we|you|he|she|it|they|this|that|there)\b)/giu, "however, ")
    .replace(/([;:!?])(?=\p{L})/gu, "$1 ");
  text = capitalizeEnglishSentenceStarts(text);
  if (ENGLISH_DIRECT_QUESTION.test(text) || ENGLISH_LEXICAL_QUESTION.test(text)) {
    text = text.replace(/\.([”’"')\]]*)$/u, "?$1");
  }
  return text;
}

function capitalizeEnglishSentenceStarts(value: string): string {
  return value
    .replace(/\bi\b/gu, "I")
    .replace(/(^|(?:[.!?]\s+|\n+))([a-z][a-z'’-]*)(?![\p{L}\p{N}])/gu, (
      _match,
      prefix: string,
      word: string,
    ) => `${prefix}${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`);
}

function capitalizeLatinSentenceStarts(value: string): string {
  return value.replace(/(^|(?:[.!?]\s+|\n+))([a-zäöüß][\p{L}'’-]*)/gu, (
    _match,
    prefix: string,
    word: string,
  ) => `${prefix}${word[0]?.toLocaleUpperCase("de-DE") ?? ""}${word.slice(1)}`);
}

function collapseEnglishPartialStutters(value: string): string {
  return value.replace(
    /\b([a-z]{1,5})[-–—]\s+([a-z][a-z'’-]*)/giu,
    (match: string, partial: string, word: string) =>
      word.toLocaleLowerCase().startsWith(partial.toLocaleLowerCase()) ? word : match,
  ).replace(
    /\b([a-z]{1,5})[-–—]\s+((?:i|we|you|he|she|it|they)\s+)([a-z][a-z'’-]*)/giu,
    (match: string, partial: string, subject: string, word: string) =>
      word.toLocaleLowerCase().startsWith(partial.toLocaleLowerCase()) ? `${subject}${word}` : match,
  );
}

/** Exact two-to-six-word restarts are recognition debris; one-word doubling
 * remains untouched because emphasis such as `really really` is ordinary
 * speech. The loop handles two independent restarts without relying on one
 * regex pass to rediscover shifted boundaries. */
function collapseEnglishRestarts(value: string): string {
  let text = value;
  const repeatedPhrase = /\b((?:[\p{L}\p{N}][\p{L}\p{N}'’-]*\s+){2,6})\1(?=[\p{L}\p{N}])/giu;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text.replace(repeatedPhrase, "$1");
    if (next === text) break;
    text = next;
  }
  return text;
}

/** A non-exact restart repeats a short clause anchor before completing it a
 * second way (`I think we sh- I think we should`). The repeated anchor is the
 * evidence: bounded intervening words may be discarded only when no contrast,
 * causal connective, or hard sentence seam explains the repetition. */
function collapseEnglishAnchoredRestarts(value: string): string {
  let text = value;
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const anchor of ENGLISH_RESTART_ANCHORS) {
      const pattern = new RegExp(`\\b${anchor.replace(" ", "\\s+")}\\b`, "giu");
      const matches = Array.from(text.matchAll(pattern));
      for (let index = 0; index + 1 < matches.length; index += 1) {
        const first = matches[index];
        const second = matches[index + 1];
        const firstStart = first.index;
        const firstEnd = (first.index ?? 0) + first[0].length;
        const secondStart = second.index;
        if (firstStart === undefined || secondStart === undefined) continue;
        const middle = text.slice(firstEnd, secondStart);
        const wordCount = middle.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
        if (wordCount > 8 || RESTART_CONTRAST.test(middle)) continue;
        text = `${text.slice(0, firstStart)}${text.slice(secondStart)}`;
        changed = true;
        break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  return text;
}

function collapseCjkAnchoredRestarts(value: string): string {
  let text = value;
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const anchor of CJK_RESTART_ANCHORS) {
      const firstStart = text.indexOf(anchor);
      if (firstStart < 0) continue;
      const firstEnd = firstStart + anchor.length;
      const secondStart = text.indexOf(anchor, firstEnd);
      if (secondStart < 0) continue;
      const middle = text.slice(firstEnd, secondStart);
      const hanCount = middle.match(/\p{Script=Han}/gu)?.length ?? 0;
      if (hanCount > 12 || CJK_RESTART_CONTRAST.test(middle)) continue;
      text = `${text.slice(0, firstStart)}${text.slice(secondStart)}`;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return text;
}

function repairEnglishExplicitCorrections(value: string): string {
  const temporal = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|(?:\\d{1,2})(?::\\d{2})?(?:\\s*[ap]\\.?m\\.?)?)";
  const numeric = "(?:\\d+(?:\\.\\d+)?(?:\\s*(?:%|percent|per cent|ms|s|kg|g|km|cm|mm|mb|gb|tb))?)";
  const correctableValue = `(?:${temporal}|${numeric})`;
  return value.replace(
    new RegExp(`(${correctableValue})\\s*[,;:]?\\s+(?:no|sorry|i mean|or rather|actually)\\s*[,;:]?\\s+(${correctableValue})`, "giu"),
    "$2",
  );
}

function repairCjkTemporalCorrection(value: string): string {
  const temporal = "(?:(?:上|下|这|這)?周[一二三四五六日天]|(?:上|下|这|這)?星期[一二三四五六日天]|(?:上|下|这|這)?礼拜[一二三四五六日天]|(?:上|下|这|這)?禮拜[一二三四五六日天]|今天|明天|后天|後天|昨天|(?:上午|下午|晚上)?[零〇一二两兩三四五六七八九十百千万萬\\d]{1,6}(?:点|點|時|时|号|號|日|月|年))";
  const numeric = "(?:[零〇一二两兩三四五六七八九十百千万萬\\d]{1,8}(?:\\.[零〇一二两兩三四五六七八九十百千万萬\\d]{1,4})?(?:%|个|個|次|份|米|公里|千米|克|公斤|秒|分钟|分鐘|小时|小時)?)";
  const correctableValue = `(?:${temporal}|${numeric})`;
  return value.replace(
    new RegExp(`(${correctableValue})\\s*[,，]?\\s*(?:不对|不對|我是说|我是說|应该是|應該是)\\s*[,，]?\\s*(${correctableValue})`, "gu"),
    "$2",
  );
}

function normalizeEnglishNumberUnits(value: string): string {
  const explicitNumber = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?";
  let text = value.replace(
    new RegExp(`\\b(${explicitNumber})(?:\\s+point\\s+(${explicitNumber}))?\\s+(percent|per cent|milliseconds?|seconds?|minutes?|hours?|kilograms?|grams?|kilometres?|kilometers?|centimetres?|centimeters?|millimetres?|millimeters?|megabytes?|gigabytes?|terabytes?)\\b`, "giu"),
    (_match: string, integer: string, fraction: string | undefined, unit: string) => {
      const normalizedInteger = parseBoundedNumberWords(integer, ENGLISH_NUMBER_WORDS);
      if (normalizedInteger === null) return _match;
      const decimal = fraction ? parseDigitSequence(fraction, ENGLISH_NUMBER_WORDS) : "";
      if (fraction && decimal === null) return _match;
      const display = `${normalizedInteger}${decimal ? `.${decimal}` : ""}`;
      const canonical = englishUnitDisplay(unit);
      return canonical === "%" ? `${display}%` : `${display} ${canonical}`;
    },
  );
  text = text.replace(
    new RegExp(`\\bversion\\s+(${explicitNumber})\\s+(?:point|dot)\\s+(${explicitNumber})\\b`, "giu"),
    (_match: string, major: string, minor: string) => {
      const left = parseBoundedNumberWords(major, ENGLISH_NUMBER_WORDS);
      const right = parseDigitSequence(minor, ENGLISH_NUMBER_WORDS);
      return left === null || right === null ? _match : `version ${left}.${right}`;
    },
  );
  text = text.replace(
    new RegExp(`\\b(${explicitNumber})\\s+(${explicitNumber})\\s+([ap])\\s*\\.?\\s*m\\.?\\b`, "giu"),
    (match: string, hour: string, minute: string, period: string) => {
      const normalizedHour = parseBoundedNumberWords(hour, ENGLISH_NUMBER_WORDS);
      const normalizedMinute = parseBoundedNumberWords(minute, ENGLISH_NUMBER_WORDS);
      return normalizedHour === null || normalizedMinute === null || normalizedHour > 12 || normalizedMinute > 59
        ? match
        : `${normalizedHour}:${String(normalizedMinute).padStart(2, "0")} ${period.toLocaleLowerCase()}.m.`;
    },
  );
  return text
    .replace(/\b(\d+(?:\.\d+)?)\s+(?:percent|per cent)\b/giu, "$1%")
    .replace(/\b(\d+(?:\.\d+)?)\s*(kg|km|cm|mm|ms|mb|gb|tb)\b/giu, "$1 $2")
    .replace(/\b(\d{1,2})\s+([ap])\s*\.?\s*m\.?\b/giu, "$1 $2.m.");
}

function normalizeCjkInverseText(value: string): string {
  const number = "[零〇一二两兩三四五六七八九十百千]{1,8}";
  let text = value.replace(
    new RegExp(`百分之(${number})(?:点(${number}))?`, "gu"),
    (match: string, integer: string, fraction: string | undefined) => {
      const normalizedInteger = parseCjkNumber(integer);
      const decimal = fraction ? parseCjkDigitSequence(fraction) : "";
      return normalizedInteger === null || (fraction && decimal === null)
        ? match
        : `${normalizedInteger}${decimal ? `.${decimal}` : ""}%`;
    },
  );
  text = text.replace(
    new RegExp(`(${number})(?:点(${number}))?(毫秒|秒|分钟|分鐘|小时|小時|公斤|千克|克|公里|千米|米|厘米|毫米|MB|GB|TB)`, "giu"),
    (match: string, integer: string, fraction: string | undefined, unit: string) => {
      const normalizedInteger = parseCjkNumber(integer);
      const decimal = fraction ? parseCjkDigitSequence(fraction) : "";
      return normalizedInteger === null || (fraction && decimal === null)
        ? match
        : `${normalizedInteger}${decimal ? `.${decimal}` : ""}${unit.toLocaleUpperCase()}`;
    },
  );
  text = text.replace(
    new RegExp(`(版本|版本号|版本號)\s*(${number})点(${number})`, "gu"),
    (match: string, cue: string, major: string, minor: string) => {
      const left = parseCjkNumber(major);
      const right = parseCjkDigitSequence(minor);
      return left === null || right === null ? match : `${cue} ${left}.${right}`;
    },
  );
  text = text.replace(
    new RegExp(`(${number})年(${number})月(${number})(日|号|號)`, "gu"),
    (match: string, year: string, month: string, day: string, suffix: string) => {
      const normalizedYear = parseCjkDigitSequence(year) ?? parseCjkNumber(year)?.toString();
      const normalizedMonth = parseCjkNumber(month);
      const normalizedDay = parseCjkNumber(day);
      return normalizedYear === undefined || normalizedYear === null || normalizedMonth === null || normalizedDay === null
        ? match
        : `${normalizedYear}年${normalizedMonth}月${normalizedDay}${suffix}`;
    },
  );
  return text.replace(
    new RegExp(`(上午|下午|晚上)?(${number})(?:点|點)半`, "gu"),
    (match: string, period: string | undefined, hour: string) => {
      const normalizedHour = parseCjkNumber(hour);
      return normalizedHour === null ? match : `${period ?? ""}${normalizedHour}:30`;
    },
  );
}

function normalizeJapaneseInverseText(value: string): string {
  const number = "[零〇一二两兩三四五六七八九十百千]{1,8}";
  let text = value.replace(
    new RegExp(`(${number})(?:点(${number}))?(パーセント|ミリ秒|秒|分|時間|キログラム|グラム|キロメートル|センチメートル|ミリメートル|メガバイト|ギガバイト)`, "gu"),
    (match: string, integer: string, fraction: string | undefined, unit: string) => {
      const normalizedInteger = parseCjkNumber(integer);
      const decimal = fraction ? parseCjkDigitSequence(fraction) : "";
      if (normalizedInteger === null || (fraction && decimal === null)) return match;
      const display = `${normalizedInteger}${decimal ? `.${decimal}` : ""}`;
      return unit === "パーセント" ? `${display}%` : `${display}${unit}`;
    },
  );
  text = text.replace(
    new RegExp(`バージョン\s*(${number})点(${number})`, "gu"),
    (match: string, major: string, minor: string) => {
      const left = parseCjkNumber(major);
      const right = parseCjkDigitSequence(minor);
      return left === null || right === null ? match : `バージョン ${left}.${right}`;
    },
  );
  text = text.replace(
    new RegExp(`(${number})年(${number})月(${number})日`, "gu"),
    (match: string, year: string, month: string, day: string) => {
      const normalizedYear = parseCjkDigitSequence(year) ?? parseCjkNumber(year)?.toString();
      const normalizedMonth = parseCjkNumber(month);
      const normalizedDay = parseCjkNumber(day);
      return normalizedYear === undefined || normalizedYear === null || normalizedMonth === null || normalizedDay === null
        ? match
        : `${normalizedYear}年${normalizedMonth}月${normalizedDay}日`;
    },
  );
  return text.replace(
    new RegExp(`(午前|午後)?(${number})時半`, "gu"),
    (match: string, period: string | undefined, hour: string) => {
      const normalizedHour = parseCjkNumber(hour);
      return normalizedHour === null ? match : `${period ?? ""}${normalizedHour}時30分`;
    },
  );
}

function normalizeGermanInverseText(value: string): string {
  const number = "(?:null|eins?|eine|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)";
  let text = value.replace(
    new RegExp(`\\b(${number})(?:\\s+Komma\\s+(${number}))?\\s+(Prozent|Millisekunden?|Sekunden?|Minuten?|Stunden?|Kilogramm|Gramm|Kilometer|Zentimeter|Millimeter|Megabyte|Gigabyte|Terabyte)\\b`, "giu"),
    (match: string, integer: string, fraction: string | undefined, unit: string) => {
      const normalizedInteger = parseBoundedNumberWords(integer, GERMAN_NUMBER_WORDS);
      const decimal = fraction ? parseDigitSequence(fraction, GERMAN_NUMBER_WORDS) : "";
      if (normalizedInteger === null || (fraction && decimal === null)) return match;
      const display = `${normalizedInteger}${decimal ? `,${decimal}` : ""}`;
      return unit.toLocaleLowerCase("de-DE") === "prozent" ? `${display} %` : `${display} ${unit.toLocaleLowerCase("de-DE")}`;
    },
  );
  text = text.replace(
    new RegExp(`\\bVersion\\s+(${number})\\s+(?:Punkt|Komma)\\s+(${number})\\b`, "giu"),
    (match: string, major: string, minor: string) => {
      const left = parseBoundedNumberWords(major, GERMAN_NUMBER_WORDS);
      const right = parseDigitSequence(minor, GERMAN_NUMBER_WORDS);
      return left === null || right === null ? match : `Version ${left}.${right}`;
    },
  );
  return text.replace(
    new RegExp(`\\b(${number})\\s+Uhr\\s+(${number})\\b`, "giu"),
    (match: string, hour: string, minute: string) => {
      const normalizedHour = parseBoundedNumberWords(hour, GERMAN_NUMBER_WORDS);
      const normalizedMinute = parseBoundedNumberWords(minute, GERMAN_NUMBER_WORDS);
      return normalizedHour === null || normalizedMinute === null || normalizedHour > 23 || normalizedMinute > 59
        ? match
        : `${normalizedHour}:${String(normalizedMinute).padStart(2, "0")} Uhr`;
    },
  );
}

function parseBoundedNumberWords(
  value: string,
  lexicon: Readonly<Record<string, number>>,
): number | null {
  const words = value.toLocaleLowerCase().split(/[\s-]+/u).filter(Boolean);
  if (words.length < 1 || words.length > 2) return null;
  const values = words.map((word) => lexicon[word]);
  if (values.some((item) => item === undefined)) return null;
  if (values.length === 1) return values[0] ?? null;
  const [tens, ones] = values;
  return tens !== undefined && tens >= 20 && tens % 10 === 0 && ones !== undefined && ones < 10
    ? tens + ones
    : null;
}

function parseDigitSequence(
  value: string,
  lexicon: Readonly<Record<string, number>>,
): string | null {
  const words = value.toLocaleLowerCase().split(/[\s-]+/u).filter(Boolean);
  const digits = words.map((word) => lexicon[word]);
  return digits.length > 0 && digits.every((digit) => digit !== undefined && digit < 10)
    ? digits.join("")
    : null;
}

function parseCjkNumber(value: string): number | null {
  if ([...value].every((character) => CJK_DIGITS[character] !== undefined)) {
    return Number([...value].map((character) => CJK_DIGITS[character]).join(""));
  }
  let total = 0;
  let pending = 0;
  const units: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };
  for (const character of value) {
    const digit = CJK_DIGITS[character];
    if (digit !== undefined) {
      pending = digit;
      continue;
    }
    const unit = units[character];
    if (unit === undefined) return null;
    total += (pending || 1) * unit;
    pending = 0;
  }
  return total + pending;
}

function parseCjkDigitSequence(value: string): string | null {
  const digits = [...value].map((character) => CJK_DIGITS[character]);
  return digits.length > 0 && digits.every((digit) => digit !== undefined)
    ? digits.join("")
    : null;
}

function englishUnitDisplay(unit: string): string {
  const lower = unit.toLocaleLowerCase();
  if (lower === "percent" || lower === "per cent") return "%";
  const table: Readonly<Record<string, string>> = {
    millisecond: "ms", milliseconds: "ms", second: "s", seconds: "s",
    minute: "min", minutes: "min", hour: "h", hours: "h",
    kilogram: "kg", kilograms: "kg", gram: "g", grams: "g",
    kilometre: "km", kilometres: "km", kilometer: "km", kilometers: "km",
    centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
    millimetre: "mm", millimetres: "mm", millimeter: "mm", millimeters: "mm",
    megabyte: "MB", megabytes: "MB", gigabyte: "GB", gigabytes: "GB",
    terabyte: "TB", terabytes: "TB",
  };
  return table[lower] ?? lower;
}

function applyKnownEnglishCasing(value: string): string {
  let text = value;
  for (const [pattern, canonical] of KNOWN_ENGLISH_CASING) {
    text = text.replace(pattern, canonical);
  }
  return text;
}

function normalizeSpokenEnglishAddresses(value: string): string {
  let text = value.replace(/\b(https?)\s+colon\s+slash\s+slash\s+/giu, "$1://");

  const domainWords = "[a-z0-9-]+(?:\\s+(?:dot|point)\\s+[a-z0-9-]+)*\\s+(?:dot|point)\\s+(?:com|org|net|io|ai|co|cn|dev|app|me|edu|gov)";
  text = text.replace(
    new RegExp(`\\b(www\\s+(?:dot|point)\\s+${domainWords})`, "giu"),
    (address: string) => spokenDomain(address),
  );
  text = text.replace(
    new RegExp(`(https?:\\/\\/)(${domainWords})`, "giu"),
    (_match: string, scheme: string, domain: string) => `${scheme}${spokenDomain(domain)}`,
  );
  text = text.replace(
    new RegExp(`\\b((?:website|site|url)(?:\\s+(?:is|at))?\\s+)(${domainWords})`, "giu"),
    (_match: string, prefix: string, domain: string) => `${prefix}${spokenDomain(domain)}`,
  );
  text = text.replace(
    new RegExp(`\\b((?:my\\s+)?(?:email|e-mail)(?:\\s+address)?(?:\\s+is)?\\s+)([a-z0-9._%+-]+(?:\\s+(?:dot|point)\\s+[a-z0-9._%+-]+)*)\\s+(?:at|at sign)\\s+(${domainWords})`, "giu"),
    (_match: string, prefix: string, local: string, domain: string) =>
      `${prefix}${spokenDomain(local)}@${spokenDomain(domain)}`,
  );
  return text.replace(
    /((?:https?:\/\/|www\.)[^\s,，。！？；：]+)((?:\s+slash\s+[a-z0-9._~!$&'()*+;=:@%-]+)+)/giu,
    (_match: string, address: string, path: string) =>
      `${address}${path.replace(/\s+slash\s+/giu, "/")}`,
  );
}

function normalizeSpokenCjkAddresses(value: string): string {
  const domainWords = "[a-z0-9-]+(?:\\s*(?:点|點|dot)\\s*[a-z0-9-]+)*\\s*(?:点|點|dot)\\s*(?:com|org|net|io|ai|co|cn|dev|app|me|edu|gov)";
  let text = value.replace(
    new RegExp(`\\b(www\\s*(?:点|點|dot)\\s*${domainWords})`, "giu"),
    (address: string) => spokenDomain(address),
  );
  text = text.replace(
    new RegExp(`((?:网址|網址|网站|網站|链接|連結)(?:是|为|為)?\\s*)(${domainWords})`, "giu"),
    (_match: string, prefix: string, domain: string) => `${prefix}${spokenDomain(domain)}`,
  );
  return text.replace(
    new RegExp(`((?:邮箱|郵箱|电子邮件|電子郵件)(?:地址)?(?:是|为|為)?\\s*)([a-z0-9._%+-]+(?:\\s*(?:点|點|dot)\\s*[a-z0-9._%+-]+)*)\\s*(?:at|艾特)\\s*(${domainWords})`, "giu"),
    (_match: string, prefix: string, local: string, domain: string) =>
      `${prefix}${spokenDomain(local)}@${spokenDomain(domain)}`,
  );
}

function spokenDomain(value: string): string {
  return value.replace(/\s*(?:dot|point|点|點)\s*/giu, ".");
}

function withProtectedLiterals(value: string, transform: (text: string) => string): string {
  if (!MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL.test(value)) return transform(value);
  return withProtectedPattern(value, protectedTranscriptLiteralPattern(), transform);
}

function withProtectedPattern(
  value: string,
  pattern: RegExp,
  transform: (text: string) => string,
): string {
  if (
    pattern === VERBATIM_LITERAL && !MAY_CONTAIN_VERBATIM_LITERAL.test(value)
  ) return transform(value);
  const literals: Array<Readonly<{ token: string; literal: string }>> = [];
  let marker = 0xe000;
  pattern.lastIndex = 0;
  const masked = value.replace(pattern, (literal) => {
    while (value.includes(String.fromCodePoint(marker))) marker += 1;
    const token = String.fromCodePoint(marker);
    marker += 1;
    literals.push(Object.freeze({ token, literal }));
    return token;
  });
  const transformed = transform(masked);
  let restored = transformed;
  for (const literal of literals) {
    restored = restored.replace(literal.token, literal.literal);
  }
  return restored;
}

/**
 * Latin product names are visually separate words in Chinese prose. Limit the
 * rule to Han/Latin boundaries: digits and kana have locale-specific spacing
 * conventions and are not safe to infer here.
 */
function spaceHanAndLatin(value: string): string {
  return value
    .replace(/(\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, "$1")
    .replace(/(\p{Script=Han})(\p{Script=Latin})/gu, "$1 $2")
    .replace(/(\p{Script=Latin}[\p{Script=Latin}\p{N}]*)(\p{Script=Han})/gu, "$1 $2")
    .replace(/(\b[Vv]?\d+(?:\.\d+){1,3})(\p{Script=Han})/gu, "$1 $2")
    .replace(/(\b(?:\d{1,3}\.){3}\d{1,3})(\p{Script=Han})/gu, "$1 $2");
}

function hasLexicalContent(value: string): boolean {
  return value.replace(/[\p{P}\p{S}\p{Z}\s]/gu, "").length > 0;
}
