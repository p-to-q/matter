const TERMINAL = /(?:[。！？.!?]|…+|\.{3})[\p{Pe}\p{Pf}“"']*$/u;
const CJK = /[㐀-鿿ぁ-ゖァ-ヺー]/u;

const LOW_AMBIGUITY_LATIN_FILLER = /(^|[\s,])(?:[Uu]m+|[Uu]h+|[Ee]rm+|[Ee]r+)(?=([\s,.!?]|$))/gu;
const LOW_AMBIGUITY_CJK_FILLER = /(^|[，。！？、\s])(?:呃+|額+|额+)(?=([，。！？、\s]|$))/gu;
const LATIN_RECOGNITION_ECHO = /\b(a|an|the|i|we|you|he|she|it|to|of|in|on|and|or|but)(?:\s+\1)+\b/giu;
const CJK_RECOGNITION_ECHO = /(我|你|他|她|它|这|這|那|的|是|在|就)(?:\s+\1)+/gu;
const CJK_TIGHT_RECOGNITION_ECHO = /(我|你|他|她|它|这|這|那)(?:\1)+/gu;
const LATIN_TRIPLE_RECOGNITION_ECHO = /\b([\p{L}\p{N}][\p{L}\p{N}'’-]{0,31})(?:\s+\1){2,}\b/giu;
const CJK_TRIPLE_RECOGNITION_ECHO = /([\p{Script=Han}]{1,8})(?:\s+\1){2,}(?=\s|[，。！？、]|$)/gu;
const CJK_TIGHT_RESTART = /(我觉得|我覺得|我认为|我認為|我们需要|我們需要|我想|这个|這個)(?:\s*\1)+/gu;
const CJK_PARTIAL_RESTART = /(我(?:觉|覺|认|認|需|想)?|我们(?:觉|覺|认|認|需|想)?|我們(?:覺|認|需|想)?)[-—，,\s]*(?=(?:我(?:觉得|覺得|认为|認為|需要|想要)|我们(?:觉得|认为|需要|想要)|我們(?:覺得|認為|需要|想要)))/gu;

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
]);

const SPOKEN_ENGLISH_PUNCTUATION: readonly SpokenPunctuation[] = Object.freeze([
  { pattern: /\bquestion mark\b(?:[.!?])?/giu, punctuation: "?" },
  { pattern: /\b(?:exclamation mark|exclamation point)\b(?:[.!?])?/giu, punctuation: "!" },
  { pattern: /\b(?:full stop|period)\b(?:[.!?])?/giu, punctuation: "." },
  { pattern: /\bcomma\b(?:[.!?])?/giu, punctuation: "," },
  { pattern: /\bsemicolon\b(?:[.!?])?/giu, punctuation: ";" },
  { pattern: /\bcolon\b(?:[.!?])?/giu, punctuation: ":" },
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
const CJK_DIRECT_QUESTION = /^(?:请问|請問|为什么|為什麼|怎么|怎麼|如何|谁|誰|哪(?:里|裡|个|個|些)|何时|何時|什么时候|什麼時候|多少|几|幾)(?=[^，。！？；：、\s])/u;

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

const VERBATIM_LITERAL = /```[^]*?```|`[^`\n]+`|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|"[^"\n]+"/gu;
const PROTECTED_LITERAL = /```[^]*?```|`[^`\n]+`|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|"[^"\n]+"|(?:https?:\/\/|[Ww]{3}\.)[^\s，。！？；：]+|[\p{L}\p{N}.!#$%&'*+\-/=?^_`{|}~]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|(?:\.{0,2}\/|\/)[\p{L}\p{N}._~!$&'()*+;=:@%\-/]+|[A-Za-z]:\\[^\s，。！？；：]+|--[A-Za-z][A-Za-z0-9-]*|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[Vv]?\d+(?:\.\d+){1,3}\b|\b(?:[A-Za-z]+_[A-Za-z0-9_]+|[a-z]+[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/gu;

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
 * A bounded deterministic repair for text that is already material. It is
 * deliberately assertive about recognition-shaped debris and formatting, but
 * every lexical deletion still requires an exact local shape. Open-ended tone
 * or semantic rewriting never belongs in this pipeline.
 */
export function repairAdmittedTranscript(value: string, locale: string): string {
  const baseline = normalizeAdmittedTranscript(value);
  let text = baseline;
  if (locale === "zh-CN" || locale === "zh-TW") {
    text = repairCjkTranscript(text);
  } else if (locale === "en-US") {
    text = repairEnglishTranscript(text);
  }
  text = normalizeRepairSeams(text);
  if (!hasLexicalContent(text)) return baseline;
  return normalizeAdmittedTranscript(text);
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
    const inverseText = replacePairedEnglishCommands(
      normalizeEnglishNumberUnits(normalizeSpokenEnglishAddresses(outsideVerbatim)),
    );
    return withProtectedLiterals(inverseText, (unprotected) => {
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
    const inverseText = spaceHanAndLatin(
      replacePairedCjkCommands(normalizeSpokenCjkAddresses(outsideVerbatim)),
    );
    return withProtectedLiterals(inverseText, (unprotected) => {
      let text = replaceSpokenCjkPunctuation(unprotected);
      text = replacePreservingBoundary(text, LOW_AMBIGUITY_CJK_FILLER);
      text = removeLeadingCjkAcousticFiller(text);
      text = text.replace(CJK_PARTIAL_RESTART, "");
      text = text.replace(CJK_RECOGNITION_ECHO, "$1");
      text = text.replace(CJK_TIGHT_RECOGNITION_ECHO, "$1");
      text = text.replace(CJK_TRIPLE_RECOGNITION_ECHO, "$1");
      text = text.replace(CJK_TIGHT_RESTART, "$1");
      text = collapseCjkAnchoredRestarts(text);
      text = repairCjkTemporalCorrection(text);
      text = punctuateCjkSignals(text);
      text = normalizeCjkMarks(text);
      return applyKnownEnglishCasing(spaceHanAndLatin(text));
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
      (_match: string, content: string) => `(${replaceSpokenEnglishPunctuation(content).trim()})`,
    )
    .replace(
      /\bopen (?:quote|quotation mark)\b\s+(.{1,240}?)\s+\bclose (?:quote|quotation mark)\b/giu,
      (_match: string, content: string) => `“${replaceSpokenEnglishPunctuation(content).trim()}”`,
    );
  // Two pairs can be dictated in one utterance; the bounded second pass sees
  // only command text left outside already materialized delimiters.
  text = text.replace(
    /\bopen (?:parenthesis|paren)\b\s+(.{1,240}?)\s+\bclose (?:parenthesis|paren)\b/giu,
    (_match: string, content: string) => `(${replaceSpokenEnglishPunctuation(content).trim()})`,
  );
  return text;
}

function replacePairedCjkCommands(value: string): string {
  return value
    .replace(
      /(?:左括号|左括號)\s*(.{1,240}?)\s*(?:右括号|右括號)/gu,
      (_match: string, content: string) => `（${replaceSpokenCjkPunctuation(content).trim()}）`,
    )
    .replace(
      /(?:左引号|左引號)\s*(.{1,240}?)\s*(?:右引号|右引號)/gu,
      (_match: string, content: string) => `“${replaceSpokenCjkPunctuation(content).trim()}”`,
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

function replacePreservingBoundary(value: string, pattern: RegExp): string {
  return value.replace(pattern, (_match, leading: string) => leading);
}

function normalizeRepairSeams(value: string): string {
  return value
    .replace(/^[,，、]\s*/u, "")
    .replace(/([,，、])(?:\s*[,，、])+\s*/gu, "$1")
    .replace(/\s+([,.;:!?，。！？；：、])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]*\n[ \t]*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function punctuateCjkSignals(value: string): string {
  let text = value.replace(
    /^(所以|然后|然後|不过|不過|可是|然而|其实|其實|首先|其次|最后|最後|总之|總之|换句话说|換句話說)(?=[^，。！？；：、\s])/u,
    "$1，",
  );
  text = text.replace(
    /([^，。！？；：、\s])(但是|不过|不過|可是|然而|然后|然後|接着|接著|所以|而且|另外|同时|同時)(?=[^，。！？；：、\s])/gu,
    "$1，$2",
  );
  text = text.replace(
    /(如果|假如|只要|除非)([^，。！？；：]{2,80}?)(那么|那麼|就)(?=[^，。！？；：、\s])/gu,
    "$1$2，$3",
  );
  text = text.replace(/([吗嗎么麼嘛])([”’"'）】》」』]*)[。.]$/u, "$1$2？");
  if (CJK_DIRECT_QUESTION.test(text)) {
    text = text.replace(/[。.]([”’"'）】》」』]*)$/u, "？$1");
  }
  return text;
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
    .replace(/\s+(then)\s+(?=(?:i|we|you|he|she|it|they|this|that|there)\b)/giu, ", $1 ")
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
  return value
    .replace(/\b(\d+(?:\.\d+)?)\s+(?:percent|per cent)\b/giu, "$1%")
    .replace(/\b(\d+(?:\.\d+)?)\s*(kg|km|cm|mm|ms|mb|gb|tb)\b/giu, "$1 $2")
    .replace(/\b(\d{1,2})\s+([ap])\s*\.?\s*m\.?\b/giu, "$1 $2.m.");
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
  return withProtectedPattern(value, PROTECTED_LITERAL, transform);
}

function withProtectedPattern(
  value: string,
  pattern: RegExp,
  transform: (text: string) => string,
): string {
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
