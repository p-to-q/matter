import {
  findProtectedTranscriptLiteralSpans,
  type ProtectedTranscriptLiteralSpan,
} from "./protected-transcript-literal";

/**
 * Punctuation is an overlay on recognized words. Acoustic evidence may choose
 * a seam, but this layer never deletes, replaces, or reorders what was heard.
 */
export type TranscriptPauseEvidence = Readonly<{
  /** UTF-16 boundary in the canonical transcript, after the preceding word. */
  afterCodeUnit: number;
  durationMs: number;
  source: "word-timestamp" | "segment-timestamp";
}>;

export type SpokenTranscriptInput = Readonly<{
  text: string;
  locale: string;
  pauses?: readonly TranscriptPauseEvidence[];
  /** Consumer capacity. Punctuation degrades as one unit instead of overflowing it. */
  maxOutputCodeUnits?: number;
  maxOutputCodePoints?: number;
}>;

export type PunctuationInsertion = Readonly<{
  atCodeUnit: number;
  mark: "，" | "。" | "？" | "、" | "；" | "," | "." | "?" | ";" | "：" | ":";
  reason:
    | "pause"
    | "connective"
    | "paired-clause"
    | "question"
    | "enumeration"
    | "discourse-reset"
    | "final-stop";
}>;

type Candidate = PunctuationInsertion & Readonly<{ priority: number }>;
type ClauseAnalysis = Readonly<{
  cjkContentPrefix: Uint32Array;
  latinContentPrefix: Uint32Array;
  sentenceStart: Uint32Array;
  sentenceEnd: Uint32Array;
}>;

const EXISTING_MARK = /[，。！？、,.!?;；:：—]/u;
const TERMINAL = /(?:[。！？.!?]|…+|\.{3})[\p{Pe}\p{Pf}“"']*(?:\s*(?:\p{Extended_Pictographic}\uFE0F?|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3))*$/u;
const TRAILING_EXPRESSION = /(?:\s*(?:\p{Extended_Pictographic}\uFE0F?|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3))+$/u;
const CJK = /\p{Script_Extensions=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
const CLOSING_MARK = /[\p{Pe}\p{Pf}”’"'」』）】》]/u;
const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });
const CHINESE_WORD_SEGMENTER = new Intl.Segmenter("zh", { granularity: "word" });
const JAPANESE_WORD_SEGMENTER = new Intl.Segmenter("ja", { granularity: "word" });
const LATIN_WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const CJK_UNIT = /[\p{Script_Extensions=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const CJK_ANALYSIS_UNIT = /[\p{Script_Extensions=Han}\p{Script=Hiragana}\p{Script=Katakana}]|(?:(?![\p{Script_Extensions=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}])(?:(?![\p{Script_Extensions=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}'’-])*/gu;

const DIRECT_ENGLISH_QUESTION = /^(?:(?:can|could|would|should|do|does|did|is|are|was|were|will|have|has|am|can['’]t|couldn['’]t|wouldn['’]t|shouldn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|won['’]t|don['’]t|doesn['’]t|didn['’]t|hasn['’]t|haven['’]t)\s+(?:i|we|you|he|she|it|they|this|that|there)\b|(?:why|how|what|where|when|who|which)\s+(?:can|could|would|should|do|does|did|is|are|was|were|will|have|has|can['’]t|couldn['’]t|wouldn['’]t|shouldn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|won['’]t|don['’]t|doesn['’]t|didn['’]t|hasn['’]t|haven['’]t)\b|(?:how|what)\s+about\b|why\s+not\b)/iu;
const DIRECT_CJK_QUESTION = /^(?:请问|請問|为什么|為什麼|怎么|怎麼|如何|谁(?!都|也)|誰(?!都|也)|哪(?:里|裡)(?!都|也)|何时|何時|什么时候|什麼時候)(?=[^，。！？；：、\s])/u;
const DIRECT_JAPANESE_QUESTION = /^(?:なぜ|どうして|どうやって|どこ|いつ|誰|だれ|何|なに|どれ|どの|いくつ).+か$/u;
const DIRECT_GERMAN_QUESTION = /^(?:(?:warum|wieso|weshalb|wie|was|wo|wann|wer|wen|wem|welch\p{L}*)\s+(?:kann|können|könnte|soll|sollen|sollte|ist|sind|war|waren|wird|werden|hat|hast|haben|muss|müssen|darf|dürfen|möchte|möchtest|möchten|gibt|geht|funktioniert|passt|stimmt|weißt)\b|(?:kann|können|könnte|soll|sollen|sollte|bin|bist|ist|sind|seid|war|waren|wird|werden|hat|hast|habt|haben|muss|müssen|darf|dürfen|möchte|möchtest|möchten|will|willst|wollt|brauche|brauchst|brauchen|gibt|geht|funktioniert|passt|stimmt|kennst|kennen|weißt|wissen)\s+(?:ich|wir|du|ihr|er|sie|es|das|dies))/iu;
const ALTERNATIVE_CJK_QUESTION = /(?:是不是|能不能|有没有|有沒有|要不要|可不可以|行不行|对不对|對不對|好不好|会不会|會不會|该不该|該不該)/u;
const CJK_PERSON_MAIN_CLAUSE_SOURCE = "(?:我们|我們|我|你|他|她|它|大家)(?=(?:现在|現在|接下来|接下來|还|還|也|都|就|要|需要|可以|应该|應該|已经|已經|会|會|先|再|只要|继续|繼續|开始|開始|准备|準備|决定|決定|打算))";
const CJK_TOPIC_MAIN_CLAUSE_SOURCE = "(?:剩下|其余|其餘|后面|後面)(?=(?:的|还有|還有|就|再|需要|可以))";
const CJK_MAIN_CLAUSE_SOURCE = `(?:${CJK_PERSON_MAIN_CLAUSE_SOURCE}|${CJK_TOPIC_MAIN_CLAUSE_SOURCE})`;

const INCOMPLETE_ENGLISH = /\b(?:and|or|but|because|although|though|if|unless|when|while|to|of|for|with|without|the|a|an|not|can|could|would|should)$/iu;
const INCOMPLETE_CJK = /(?:因为|因為|如果|虽然|雖然|但是|不过|不過|和|与|與|及|以及|或|在|把|被|的|地|得)$/u;
const INCOMPLETE_JAPANESE = /(?:もし|そして|しかし|の|に|を|が|は|で|と|から|まで)$/u;
const INCOMPLETE_GERMAN = /\b(?:und|oder|aber|weil|dass|wenn|falls|obwohl|mit|ohne|für|zu|der|die|das|ein|eine|nicht)$/iu;
const SPOKEN_PUNCTUATION_TAIL = /(?:逗号|逗點|句号|句點|问号|問號|感叹号|感嘆號|冒号|冒號|分号|分號|顿号|頓號|破折号|破折號|comma|period|full stop|question mark|exclamation mark|colon|semicolon|em dash|読点|句点|ダッシュ|Komma|Punkt|Fragezeichen|Gedankenstrich)\s*$/iu;

/**
 * Returns insertions against the original UTF-16 string. Applying them in
 * descending offset order makes the plan auditable and preserves every input
 * code unit exactly.
 */
export function planSpokenTranscriptPunctuation(
  input: SpokenTranscriptInput,
): readonly PunctuationInsertion[] {
  if (input.text.length === 0) return Object.freeze([]);
  const protectedSpans = findProtectedSpans(input.text);
  const graphemeBoundaries = findGraphemeBoundaries(input.text);
  const candidates: Candidate[] = [];
  addPauseCandidates(candidates, input, protectedSpans);
  addSemanticCandidates(candidates, input, protectedSpans);
  addFinalCandidate(candidates, input);

  const selected = new Map<number, Candidate>();
  for (const candidate of candidates) {
    if (!validInsertionBoundary(input.text, candidate.atCodeUnit, graphemeBoundaries)) continue;
    if (hasMarkAtBoundary(input.text, candidate.atCodeUnit)) continue;
    if (
      candidate.reason !== "final-stop" &&
      isProtectedBoundary(protectedSpans, candidate.atCodeUnit)
    ) continue;
    const current = selected.get(candidate.atCodeUnit);
    if (current === undefined || candidate.priority > current.priority) {
      selected.set(candidate.atCodeUnit, candidate);
    }
  }
  return Object.freeze(
    [...selected.values()]
      .sort((left, right) => left.atCodeUnit - right.atCodeUnit)
      .map((insertion) => Object.freeze({
        atCodeUnit: insertion.atCodeUnit,
        mark: insertion.mark,
        reason: insertion.reason,
      })),
  );
}

export function applySpokenTranscriptPunctuation(
  text: string,
  insertions: readonly PunctuationInsertion[],
): string {
  if (insertions.length === 0) return text;
  const ordered = [...insertions].sort((left, right) => left.atCodeUnit - right.atCodeUnit);
  const output: string[] = [];
  let cursor = 0;
  for (let index = 0; index < ordered.length;) {
    const at = ordered[index]?.atCodeUnit ?? cursor;
    output.push(text.slice(cursor, at));
    let groupEnd = index + 1;
    while (ordered[groupEnd]?.atCodeUnit === at) groupEnd += 1;
    // The former descending-offset application prepended same-boundary marks
    // in reverse input order. Preserve that edge behavior without repeatedly
    // copying the whole transcript for every insertion.
    for (let markIndex = groupEnd - 1; markIndex >= index; markIndex -= 1) {
      output.push(ordered[markIndex]?.mark ?? "");
    }
    cursor = at;
    index = groupEnd;
  }
  output.push(text.slice(cursor));
  return output.join("");
}

/** Shared final STT floor for admission, inquiry, and spoken tool direction. */
export function normalizeSpokenTranscript(input: SpokenTranscriptInput): string {
  let text = input.text.trim();
  if (text.length === 0) return "";
  const shift = input.text.indexOf(text);
  const pauses = shift < 0 ? undefined : input.pauses?.map((pause) => ({
    ...pause,
    afterCodeUnit: pause.afterCodeUnit - shift,
  }));
  const unpunctuated = normalizePunctuationSpacing(text, input.locale);
  text = normalizePunctuationSpacing(applySpokenTranscriptPunctuation(
    text,
    planSpokenTranscriptPunctuation({ text, locale: input.locale, pauses }),
  ), input.locale);
  if (!exceedsConsumerCapacity(text, input)) return text;
  return exceedsConsumerCapacity(unpunctuated, input) ? input.text.trim() : unpunctuated;
}

/** Shared direct-question oracle for later deterministic repair passes. */
export function isSpokenTranscriptQuestion(text: string, locale: string): boolean {
  // An existing human emoji is lexical material, but it is not part of the
  // sentence shape used by the shared question oracle.
  const trimmed = text.trim().replace(TRAILING_EXPRESSION, "").trimEnd();
  if (/[?？]+[\p{Pe}\p{Pf}”’"'」』）】》]*$/u.test(trimmed)) return true;
  const withoutTerminal = trimmed.replace(
    /[。！？.!?]+[\p{Pe}\p{Pf}”’"'」』）】》]*$/u,
    "",
  );
  return isQuestion(withoutTerminal, locale);
}

function normalizePunctuationSpacing(text: string, locale: string): string {
  // ASCII separators keep Latin spacing even inside a CJK-primary utterance;
  // this is what lets each supported locale safely host an English clause.
  const outputSpaced = mapUnprotected(text, findProtectedSpans(text), (part) =>
    part
      .replace(/\s+([，。！？、,.!?;；:：])/gu, "$1")
      .replace(/([，、；：])\s+/gu, "$1")
      .replace(/[,;:](?=\S)/gu, (mark, offset: number, whole: string) => {
        const left = whole[offset - 1] ?? "";
        const right = whole[offset + 1] ?? "";
        if (EXISTING_MARK.test(right)) return mark;
        return (mark === "," || mark === ":") && /\p{Nd}/u.test(left) && /\p{Nd}/u.test(right)
          ? mark
          : `${mark} `;
      }));
  const protectedSpans = findProtectedSpans(outputSpaced);
  let output = outputSpaced;
  const trailingIndex = output.length - 1;
  if (
    !isProtectedIndex(protectedSpans, trailingIndex) &&
    (output.endsWith("，") || output.endsWith(",") || output.endsWith("、"))
  ) {
    output = `${output.slice(0, -1).trimEnd()}${periodFor(locale, output)}`;
  }
  return output;
}

function mapUnprotected(
  text: string,
  spans: readonly ProtectedTranscriptLiteralSpan[],
  transform: (part: string) => string,
): string {
  if (spans.length === 0) return transform(text);
  const parts: string[] = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    parts.push(transform(text.slice(cursor, start)), text.slice(start, end));
    cursor = end;
  }
  parts.push(transform(text.slice(cursor)));
  return parts.join("");
}

function exceedsConsumerCapacity(text: string, input: SpokenTranscriptInput): boolean {
  return (
    input.maxOutputCodeUnits !== undefined && text.length > input.maxOutputCodeUnits
  ) || (
    input.maxOutputCodePoints !== undefined && Array.from(text).length > input.maxOutputCodePoints
  );
}

function addPauseCandidates(
  candidates: Candidate[],
  input: SpokenTranscriptInput,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  const pauses = validPauses(input.text, input.locale, input.pauses);
  if (pauses.length === 0) return;
  const thresholds = pauseThresholds(pauses.map((pause) => pause.durationMs));
  let lastAcceptedSentenceBoundary = 0;
  for (const pause of pauses) {
    if (pause.durationMs < thresholds.commaMs) continue;
    const at = pause.afterCodeUnit;
    if (isProtectedBoundary(protectedSpans, at) || numericBoundary(input.text, at)) continue;
    const existingSentenceBoundary = lastExistingSentenceBoundary(input.text, at);
    const sides = Object.freeze({
      left: input.text.slice(
        Math.max(lastAcceptedSentenceBoundary, existingSentenceBoundary),
        at,
      ).trim(),
      right: clauseSides(input.text, at).right,
    });
    const counts = sideCounts(sides, input.locale);
    const sentenceReady = counts.left >= sentenceMinimum(input.locale, "left") &&
      counts.right >= sentenceMinimum(input.locale, "right") &&
      !isIncomplete(sides.left, input.locale) &&
      !isIncompleteStart(sides.right, input.locale);
    if (pause.durationMs >= thresholds.sentenceMs && sentenceReady) {
      const question = isQuestion(sides.left, input.locale);
      candidates.push(candidate(
        at,
        question ? questionFor(input.locale, sides.left) : periodFor(input.locale, sides.left),
        question ? "question" : "pause",
        question ? 100 : 60,
      ));
      lastAcceptedSentenceBoundary = at;
    } else if (
      counts.left >= commaMinimum(input.locale, "left") &&
      counts.right >= commaMinimum(input.locale, "right")
    ) {
      candidates.push(candidate(at, commaFor(input.locale, input.text, at), "pause", 30));
    }
  }
}

function addSemanticCandidates(
  candidates: Candidate[],
  input: SpokenTranscriptInput,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  const { text, locale } = input;
  const unknown = !["zh-CN", "zh-TW", "ja-JP", "de-DE", "en-US"].includes(locale);
  const inferredJapanese = unknown && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  const inferredChinese = unknown && !inferredJapanese && /\p{Script_Extensions=Han}/u.test(text);
  const inferredGerman = unknown && /[äöüß]|\b(?:weil|dass|obwohl|wenn|falls|während|bevor|nachdem|damit|sodass)\b/iu.test(text);

  if (locale === "zh-CN" || locale === "zh-TW" || inferredChinese || (
    locale === "en-US" && /\p{Script_Extensions=Han}/u.test(text)
  )) addChineseSemanticCandidates(candidates, text, locale === "zh-TW" ? "zh-TW" : "zh-CN", protectedSpans);
  if (locale === "ja-JP" || inferredJapanese || (
    locale === "en-US" && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
  )) addJapaneseSemanticCandidates(candidates, text, protectedSpans);
  if (locale === "de-DE" || inferredGerman) addGermanMarkers(candidates, text, protectedSpans);
  // English is the supported code-switch bridge for every locale pack. Its
  // rules are token-anchored, so running them does not reinterpret CJK text.
  addEnglishSemanticCandidates(candidates, text, protectedSpans);
}

function addChineseSemanticCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
): void {
  const clauseAnalysis = buildClauseAnalysis(text);
  const wordBoundaries = findLocaleWordBoundaries(text, locale);
  addCjkOpeningFrameCandidates(candidates, text, locale, protectedSpans, clauseAnalysis);
  addOpeningMarkers(candidates, text, /^(然后呢|然後呢|所以呢|然后的话|然後的話|然后这样的话|然後這樣的話|接下来呢|接下來呢|接下来|接下來|所以|然后|然後|不过|不過|可是|然而|其实|其實|首先|其次|最后|最後|总之|總之|例如|换句话说|換句話說|换言之|換言之|也就是说|也就是說|这么一来|這麼一來|如此一来|如此一來|这样一来|這樣一來|这样的话|這樣的話|除此之外|话虽如此|話雖如此|即便如此|与此同时|與此同時|尽管如此|儘管如此|话又说回来|話又說回來|反过来说|反過來說|具体来说|具體來說|更准确地说|更準確地說|总的来说|總的來說|归根结底|歸根結底|由此可见|由此可見|从这个角度看|從這個角度看)(?=[^，。！？；：、\s])/u, "，", locale, wordBoundaries);
  addFramedMarkers(
    candidates,
    text,
    /(然后呢|然後呢|所以呢|接下来呢|接下來呢|或者说|或者說|其次|最后|最後)/gu,
    locale,
    protectedSpans,
    wordBoundaries,
    clauseAnalysis,
  );
  addInternalMarkers(candidates, text, /(但是|不过|不過|可是|然而|然后|然後|接着|接著|所以|因此|于是|於是|而且|另外|同时|同時|否则|否則|反而|其实|其實)/gu, locale, "，", protectedSpans, wordBoundaries, clauseAnalysis);
  addCjkConditionalPairCandidates(candidates, text, locale, protectedSpans);
  addPairedMarker(candidates, text, /(因为|因為|由于|由於)([^，。！？；：]{2,120}?)(所以|因此)(?=[^，。！？；：、\s])/gu, 1, 2, "，", protectedSpans);
  addPairedMarker(candidates, text, /(虽然|雖然)([^，。！？；：]{2,120}?)(但是|可是|却|卻)(?=[^，。！？；：、\s])/gu, 1, 2, "，", protectedSpans);
  addPairedMarker(candidates, text, /(即使|即便|哪怕|纵然|縱然)([^，。！？；：]{2,120}?)(也|仍然|还是|還是)(?=[^，。！？；：、\s])/gu, 1, 2, "，", protectedSpans);
  addPairedMarker(candidates, text, /(无论|無論|不论|不論|不管)([^，。！？；：]{2,120}?)(都|也)(?=[^，。！？；：、\s])/gu, 1, 2, "，", protectedSpans);
  addResetMarkers(candidates, text, /(总之|總之|总而言之|總而言之|换句话说|換句話說|换言之|換言之|另一个问题是|另一個問題是|接下来|接下來|话又说回来|話又說回來|反过来说|反過來說|换个角度看|換個角度看|说到这里|說到這裡|更重要的是|归根结底|歸根結底)/gu, locale, "。", protectedSpans, wordBoundaries, clauseAnalysis);
  addCjkFrameTailCandidates(candidates, text, locale, protectedSpans, clauseAnalysis);
  addCjkInitialDependentClauseCandidates(candidates, text, locale, protectedSpans, clauseAnalysis);
  addCjkParallelCandidates(candidates, text, protectedSpans);
  addCjkCompletionRestartCandidates(candidates, text, locale, protectedSpans, clauseAnalysis);
  addEnumerationColonCandidates(candidates, text, locale, protectedSpans);
  addCjkOrdinalEnumerationCandidates(candidates, text, locale, protectedSpans, wordBoundaries);
}

/**
 * These openings carry their own syntactic frame. Unlike length-based cadence,
 * the seam is recoverable from the words alone and remains insertion-only.
 */
function addCjkOpeningFrameCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
  analysis: ClauseAnalysis,
): void {
  const patterns = [
    [/^(?:我觉得|我覺得|我认为|我認為|我感觉|我感覺|我们觉得|我們覺得|我们认为|我們認為|我的意思是)/u, 9],
    [/^(?:說實話|说实话|坦白说|坦白說|老实说|老實說)/u, 3],
    [/^(?:从|從)[^，。！？；：、\s]{2,28}?(?:来看|來看|来说|來說)/u, 3],
    [/^在[^，。！？；：、\s]{2,28}?(?:情况下|情況下|阶段|階段|时候|時候)/u, 3],
    [/^(?:至于|至於)[^，。！？；：、\s]{2,28}?(?:问题|問題|事情|部分|方案|版本|功能|结果|結果)/u, 3],
    [/^(?:好吧|行吧|算了吧|这样吧|這樣吧|对了|對了|没错|沒錯)/u, 3],
  ] as const;
  for (const [pattern, rightMinimum] of patterns) {
    const match = text.match(pattern);
    if (match === null || match[0].length === text.length) continue;
    const after = match[0].length;
    if (
      intersectsProtectedSpan(protectedSpans, 0, after) ||
      analyzedClauseRightUnits(analysis, locale, after) < rightMinimum
    ) continue;
    candidates.push(candidate(after, "，", "connective", 44));
    return;
  }
}

function addCjkFrameTailCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
  analysis: ClauseAnalysis,
): void {
  const pattern = new RegExp(`(?:\u7684\u8bdd|\u7684\u8a71|\u7684\u65f6\u5019|\u7684\u6642\u5019|\u4ee5\u540e|\u4ee5\u5f8C|\u4e4b\u540e|\u4e4b\u5f8C|\u60c5\u51b5\u4e0b|\u60c5\u6cc1\u4e0b)(?=${CJK_MAIN_CLAUSE_SOURCE})`, "gu");
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const after = start + match[0].length;
    if (
      analyzedClauseLeftUnits(analysis, locale, after) < 4 ||
      analyzedClauseRightUnits(analysis, locale, after) < 3 ||
      intersectsProtectedSpan(protectedSpans, start, after)
    ) continue;
    candidates.push(candidate(after, "，", "paired-clause", 52));
  }

  for (const match of text.matchAll(/(?:这个|這個|那个|那個)?(?:问题|問題|事情|方案|部分|功能|结果|結果|想法)呢(?=(?:我们|我們|我|你|他|她|它|大家|接下来|接下來))/gu)) {
    const start = match.index;
    if (start === undefined) continue;
    const after = start + match[0].length;
    if (
      analyzedClauseLeftUnits(analysis, locale, after) >= 3 &&
      analyzedClauseRightUnits(analysis, locale, after) >= 3 &&
      !intersectsProtectedSpan(protectedSpans, start, after)
    ) candidates.push(candidate(after, "，", "connective", 44));
  }
}

function addCjkConditionalPairCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
): void {
  const pattern = /(如果|假如|只要|除非|既然)([^，。！？；：]{2,120}?)(那么|那麼|就)(?=[^，。！？；：、\s])/gu;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const middle = match[2];
    if (start === undefined || middle === undefined) continue;
    const middleStart = start + (match[1]?.length ?? 0);
    const secondStart = middleStart + middle.length;
    if (
      intersectsProtectedSpan(protectedSpans, start, start + match[0].length) ||
      hasSpokenPunctuationTail(text, secondStart)
    ) continue;

    let at = secondStart;
    const tail = Array.from(middle.matchAll(/(?:的话|的話)/gu)).at(-1);
    if (tail?.index !== undefined) {
      at = middleStart + tail.index + tail[0].length;
    } else {
      const restart = Array.from(middle.matchAll(new RegExp(CJK_MAIN_CLAUSE_SOURCE, "gu")))
        .find((entry) => entry.index !== undefined && contentUnits(middle.slice(0, entry.index), locale) >= 3);
      if (restart?.index !== undefined) at = middleStart + restart.index;
    }
    candidates.push(candidate(at, "，", "paired-clause", 52));
  }
}

function addCjkInitialDependentClauseCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
  analysis: ClauseAnalysis,
): void {
  if (!/^(?:如果|假如|要是|只要|除非|万一|萬一|因为|因為|由于|由於|虽然|雖然|尽管|儘管|即使|即便|哪怕)/u.test(text)) return;
  const mainClause = new RegExp(CJK_PERSON_MAIN_CLAUSE_SOURCE, "gu");
  for (const match of text.matchAll(mainClause)) {
    const at = match.index;
    if (at === undefined) continue;
    const leftTail = text.slice(Math.max(0, at - 8), at).trimEnd();
    if (
      analyzedContentUnits(analysis, locale, 0, at) < 4 ||
      analyzedClauseRightUnits(analysis, locale, at) < 4 ||
      /(?:那么|那麼|所以|因此|但是|可是|就)$/u.test(leftTail) ||
      intersectsProtectedSpan(protectedSpans, 0, at + match[0].length)
    ) continue;
    candidates.push(candidate(at, "，", "paired-clause", 51));
    return;
  }
}

function addCjkParallelCandidates(
  candidates: Candidate[],
  text: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  for (const pattern of [
    /((?<!不)(?:不但|不僅|不仅|不只|不光))([^，。！？；：]{2,100}?)(而且|还|還|也)(?=[^，。！？；：、\s])/gu,
    /(一方面)([^，。！？；：]{2,100}?)(另一方面)(?=[^，。！？；：、\s])/gu,
    /(不是)([^，。！？；：]{2,100}?)(而是)(?=[^，。！？；：、\s])/gu,
    /((?<![首为為优優领領爭争抢搶])先(?!生|祖|知|进|進|天|后|後|例|决|決|行|辈|輩|驱|驅|烈|贤|賢))((?:(?!第[二三四五六七八九十]|呢|的话|的話|我们|我們|我|你|他|她|它|大家)[^，。！？；：]){2,100}?)(再)(?=[^，。！？；：、\s])/gu,
    /(既)([^，。！？；：]{2,100}?)(又|也)(?=[^，。！？；：、\s])/gu,
    /(与其|與其)([^，。！？；：]{2,100}?)(不如)(?=[^，。！？；：、\s])/gu,
    /(一边|一邊)([^，。！？；：]{2,100}?)(一边|一邊)(?=[^，。！？；：、\s])/gu,
    /(要么|要麼)([^，。！？；：]{2,100}?)(要么|要麼)(?=[^，。！？；：、\s])/gu,
    /(有[^，。！？；：]{1,20}?(?:的话|的話))([^，。！？；：]{3,80}?)(?:没有|沒有)[^，。！？；：]{1,20}?(?:的话|的話)(?=[^，。！？；：、\s])/gu,
  ] as const) {
    addPairedMarker(candidates, text, pattern, 1, 2, "，", protectedSpans);
  }
}

function addCjkCompletionRestartCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
  analysis: ClauseAnalysis,
): void {
  const restart = new RegExp(CJK_MAIN_CLAUSE_SOURCE, "gu");
  const complete = /(?:了|过|過|完|做好|清楚|明白|完成|结束|結束|成功|失败|失敗|可行|合理|稳定|穩定|复杂|複雜|简单|簡單|重要|足够|足夠|明确|明確|一致|一样|一樣|隐蔽|隱蔽|清晰|明显|明顯|顺畅|順暢|自然|成熟|可靠|稳妥|穩妥|困难|困難|麻烦|麻煩)$/u;
  for (const match of text.matchAll(restart)) {
    const at = match.index;
    if (at === undefined || at === 0) continue;
    const leftBoundary = analysis.sentenceStart[at] ?? 0;
    const leftTail = text.slice(Math.max(leftBoundary, at - 8), at).trimEnd();
    if (
      analyzedContentUnits(analysis, locale, leftBoundary, at) < 4 ||
      analyzedClauseRightUnits(analysis, locale, at) < 4 ||
      !complete.test(leftTail) ||
      /(?:为了|為了|除了|免不了|少不了|不得了)$/u.test(leftTail) ||
      intersectsProtectedSpan(protectedSpans, leftBoundary, at + match[0].length)
    ) continue;
    candidates.push(candidate(at, "，", "discourse-reset", 46));
  }
}

function addJapaneseSemanticCandidates(
  candidates: Candidate[],
  text: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  const wordBoundaries = findLocaleWordBoundaries(text, "ja-JP");
  addOpeningMarkers(candidates, text, /^(それでですね|でですね|それでね|そうすると|そういうわけで|しかし(?!ながら)|ただし(?!書き)|したがって|ところが|それでも|とはいえ|その一方で|その結果|加えて|逆に|言い換えると|具体的には|結論として|つまり|まず|次に|最後に|要するに)(?=[^、。！？\s])/u, "、", "ja-JP", wordBoundaries);
  addInternalMarkers(candidates, text, /(しかし|ただし|だが|けれども|一方で|そのため|ところが|それでも|とはいえ|その一方で)/gu, "ja-JP", "、", protectedSpans, wordBoundaries);
  addEnumerationColonCandidates(candidates, text, "ja-JP", protectedSpans);
}

function addEnglishSemanticCandidates(
  candidates: Candidate[],
  text: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  addOpeningMarkers(candidates, text, /^(on the other hand|to put it another way|at the same time|in other words|more specifically|for example|for instance|as a result|by the way|that said|in contrast|to sum up|in fact|nevertheless|nonetheless|therefore|actually|instead|finally|meanwhile|ultimately|however|anyway|first|second|third|in short)\b/iu, ",", "en-US");
  addEnglishInternalMarkers(candidates, text, protectedSpans);
  addEnglishHowever(candidates, text, protectedSpans);
  addPairedMarker(candidates, text, /\b(if|although|though|unless)(\b[^.!?]{2,180}?)\b(then)\b/giu, 1, 2, ",", protectedSpans);
  addEnumerationColonCandidates(candidates, text, "en-US", protectedSpans);
}

function addOpeningMarkers(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  mark: Candidate["mark"],
  locale: string,
  wordBoundaries?: ReadonlySet<number>,
): void {
  const match = text.match(pattern);
  if (match?.index !== 0 || match[0].length === text.length) return;
  if (
    isFixedCompoundMarker(text, 0, match[0]) ||
    !isExactLocaleWordMarker(text, 0, match[0], locale, wordBoundaries)
  ) return;
  if (locale === "en-US" && (
    !/^\s+(?:i|we|you|he|she|it|they|this|that|there|the|a|an)\b/iu.test(text.slice(match[0].length)) ||
    contentUnits(text.slice(match[0].length), "en-US") < 2
  )) return;
  candidates.push(candidate(match[0].length, mark, "connective", 40));
}

function addInternalMarkers(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  locale: string,
  mark: Candidate["mark"],
  protectedSpans: readonly (readonly [number, number])[],
  wordBoundaries?: ReadonlySet<number>,
  analysis?: ClauseAnalysis,
): void {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (
      at === undefined || at === 0 ||
      intersectsProtectedSpan(protectedSpans, at, at + match[0].length)
    ) continue;
    if (
      isFixedCompoundMarker(text, at, match[0]) ||
      !isExactLocaleWordMarker(text, at, match[0], locale, wordBoundaries)
    ) continue;
    if (hasSpokenPunctuationTail(text, at)) continue;
    const left = analysis === undefined
      ? contentUnits(clauseSides(text, at).left, locale)
      : analyzedClauseLeftUnits(analysis, locale, at);
    const right = analysis === undefined
      ? contentUnits(clauseRight(text, at + match[0].length), locale)
      : analyzedClauseRightUnits(analysis, locale, at + match[0].length);
    if (left >= pairedMinimum(locale) && right >= pairedMinimum(locale)) {
      candidates.push(candidate(at, mark, "connective", 40));
    }
  }
}

function isFixedCompoundMarker(text: string, at: number, marker: string): boolean {
  const before = text[at - 1] ?? "";
  const after = text.slice(at + marker.length, at + marker.length + 12);
  return (
    marker === "但是" && before === "不"
  ) || (
    (marker === "不过" || marker === "不過") && (before === "只" || /^(?:关|關|瘾|癮)/u.test(after))
  ) || (
    (marker === "接着" || marker === "接著") && /[连連承衔銜]/u.test(before)
  ) || (
    marker === "然而" && /[偶自必突显顯]/u.test(before)
  ) || (
    (marker === "于是" || marker === "於是") && before === "等"
  ) || (
    marker === "所以" && (before === "之" || /^(?:然|呢)/u.test(after))
  ) || (
    (marker === "同时" || marker === "同時") && after.startsWith("代")
  ) || (
    marker === "ただし" && after.startsWith("書き")
  ) || (
    (marker === "然后" || marker === "然後") && (
      /[偶自必突]/u.test(before) || after.startsWith("呢")
    )
  ) || (
    (marker === "最后" || marker === "最後") && /^(?:期限|端|一个|一個|一项|一項|一次|阶段|階段|部分|方案|版本|设备|設備)/u.test(after)
  ) || (
    (marker === "其实" || marker === "其實") && /^(?:质|質)/u.test(after)
  ) || (
    marker === "まず" && after.startsWith("い")
  ) || (
    marker === "つまり" && /^(?:ます|ません|ました)/u.test(after)
  ) || (
    marker === "そのため" && after.startsWith("らい")
  ) || (
    marker.toLocaleLowerCase() === "dass" && /\b(?:ohne|außer|so)\s*$/iu.test(text.slice(0, at))
  ) || (
    marker.toLocaleLowerCase() === "ob" && /\bals\s*$/iu.test(text.slice(0, at))
  );
}

function addFramedMarkers(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
  wordBoundaries?: ReadonlySet<number>,
  analysis?: ClauseAnalysis,
): void {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at === undefined || at === 0) continue;
    const after = at + match[0].length;
    if (
      intersectsProtectedSpan(protectedSpans, at, after) ||
      isFixedCompoundMarker(text, at, match[0]) ||
      !isExactLocaleWordMarker(text, at, match[0], locale, wordBoundaries)
    ) continue;
    const left = analysis === undefined
      ? contentUnits(clauseSides(text, at).left, locale)
      : analyzedClauseLeftUnits(analysis, locale, at);
    const right = analysis === undefined
      ? contentUnits(clauseRight(text, after), locale)
      : analyzedClauseRightUnits(analysis, locale, after);
    if (left >= 3 && right >= 2) {
      candidates.push(candidate(at, "，", "connective", 42));
      candidates.push(candidate(after, "，", "connective", 42));
    }
  }
}

function isExactLocaleWordMarker(
  text: string,
  at: number,
  marker: string,
  locale: string,
  wordBoundaries?: ReadonlySet<number>,
): boolean {
  const boundaries = wordBoundaries ?? findLocaleWordBoundaries(text, locale);
  if (boundaries === undefined) return true;
  return boundaries.has(at) && boundaries.has(at + marker.length);
}

function findLocaleWordBoundaries(
  text: string,
  locale: string,
): ReadonlySet<number> | undefined {
  const segmenter = locale === "ja-JP"
    ? JAPANESE_WORD_SEGMENTER
    : locale === "zh-CN" || locale === "zh-TW"
      ? CHINESE_WORD_SEGMENTER
      : undefined;
  if (segmenter === undefined) return undefined;
  const boundaries = new Set<number>([0, text.length]);
  for (const segment of segmenter.segment(text)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  return boundaries;
}

function addEnglishInternalMarkers(
  candidates: Candidate[],
  text: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  for (const match of text.matchAll(/\b(but|yet|so|then)\b/giu)) {
    const at = match.index;
    if (
      at === undefined || at === 0 ||
      intersectsProtectedSpan(protectedSpans, at, at + match[0].length)
    ) continue;
    const marker = match[1]?.toLocaleLowerCase();
    const before = text.slice(0, at);
    if (marker === "then" && /\band\s*$/iu.test(before)) continue;
    const right = text.slice(at + match[0].length).trimStart();
    if (marker === "so" && /^that\b/iu.test(right)) continue;
    if (marker === "but" && /\b(?:nothing|anything|all|not only)\s*$/iu.test(before)) continue;
    if (!/^(?:i|we|you|he|she|it|they|this|that|there|the|a|an)\b/iu.test(right)) continue;
    const left = contentUnits(clauseSides(text, at).left, "en-US");
    const rightCount = contentUnits(right, "en-US");
    if (left >= 2 && rightCount >= 2) {
      candidates.push(candidate(at, ",", "connective", 40));
    }
  }
}

function addGermanMarkers(
  candidates: Candidate[],
  text: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  for (const match of text.matchAll(/\b(ohne dass|außer dass|so dass|als ob|als wenn)\b/giu)) {
    const at = match.index;
    if (
      at === undefined || at === 0 ||
      intersectsProtectedSpan(protectedSpans, at, at + match[0].length)
    ) continue;
    const left = contentUnits(clauseSides(text, at).left, "de-DE");
    const right = contentUnits(clauseRight(text, at + match[0].length), "de-DE");
    if (left >= 2 && right >= 2) candidates.push(candidate(at, ",", "connective", 45));
  }
  addInternalMarkers(
    candidates,
    text,
    /\b(weil|dass|obwohl|wenn|falls|während|bevor|nachdem|damit|sodass|ob|indem|sobald|solange|sofern|obgleich|obschon|wenngleich|ehe|seitdem|zumal)\b/giu,
    "de-DE",
    ",",
    protectedSpans,
  );
  addInternalMarkers(
    candidates,
    text,
    /\b(sondern)\b/giu,
    "de-DE",
    ",",
    protectedSpans,
  );
  for (const match of text.matchAll(/\b(aber|denn)\b/giu)) {
    const at = match.index;
    if (
      at === undefined || at === 0 ||
      intersectsProtectedSpan(protectedSpans, at, at + match[0].length)
    ) continue;
    const right = text.slice(at + match[0].length).trimStart();
    if (!germanClauseStart(right)) continue;
    const left = contentUnits(clauseSides(text, at).left, "de-DE");
    if (left >= 2 && contentUnits(right, "de-DE") >= 3) {
      candidates.push(candidate(at, ",", "connective", 40));
    }
  }
  addEnumerationColonCandidates(candidates, text, "de-DE", protectedSpans);
}

function germanClauseStart(text: string): boolean {
  return /^(?:ich|wir|du|er|sie|es|das|dies)\b(?=[^,.!?]{0,80}\b(?:bin|bist|ist|sind|seid|war|waren|wird|werden|hat|haben|kann|können|muss|müssen|soll|sollen|darf|dürfen|bleibt|bleiben|geht|gehen)\b)/iu.test(text);
}

function addEnglishHowever(
  candidates: Candidate[],
  text: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  for (const match of text.matchAll(/\b(however|nevertheless|nonetheless|therefore|consequently|otherwise|instead|meanwhile)\b/giu)) {
    const at = match.index;
    if (
      at === undefined || at === 0 ||
      intersectsProtectedSpan(protectedSpans, at, at + match[0].length)
    ) continue;
    const after = at + match[0].length;
    const right = text.slice(after).trimStart();
    if (!/^(?:i|we|you|he|she|it|they|this|that|there|the|a|an)\b/iu.test(right)) continue;
    const leftCount = contentUnits(clauseSides(text, at).left, "en-US");
    const rightCount = contentUnits(right, "en-US");
    if (leftCount >= 3 && rightCount >= 3) {
      candidates.push(candidate(at, ";", "discourse-reset", 55));
      candidates.push(candidate(after, ",", "connective", 40));
    }
  }
}

function addPairedMarker(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  firstGroup: number,
  middleGroup: number,
  mark: Candidate["mark"],
  protectedSpans: readonly (readonly [number, number])[],
): void {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const at = match.index + (match[firstGroup]?.length ?? 0) + (match[middleGroup]?.length ?? 0);
    if (
      !hasSpokenPunctuationTail(text, at) &&
      !intersectsProtectedSpan(protectedSpans, match.index, match.index + match[0].length)
    ) {
      candidates.push(candidate(at, mark, "paired-clause", 50));
    }
  }
}

function addEnumerationColonCandidates(
  candidates: Candidate[],
  text: string,
  locale: string,
  protectedSpans: readonly (readonly [number, number])[],
): void {
  const pattern = locale === "zh-CN" || locale === "zh-TW"
    ? /(具体如下|具體如下|理由如下|结论如下|結論如下|包括以下几点|包括以下幾點|有以下几个方面|有以下幾個方面)(?=\s*(?:第一|首先|一是|其一|[1１](?:[.、．]|是)))/gu
    : locale === "ja-JP"
      ? /(次のとおり)(?=\s*(?:一つ目|第一|[1１](?:[.、．])))/gu
      : locale === "de-DE"
        ? /\b(wie folgt|die folgenden (?:Punkte|Gründe|Schritte))\b(?=\s+(?:erstens|zuerst|1(?:[.)])))/giu
        : /\b(as follows|the following (?:points|reasons|steps|items|options))\b(?=\s+(?:first|one|1(?:[.)])))/giu;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const at = start + match[0].length;
    if (!intersectsProtectedSpan(protectedSpans, start, at)) {
      candidates.push(candidate(
        at,
        locale === "zh-CN" || locale === "zh-TW" || locale === "ja-JP" ? "：" : ":",
        "enumeration",
        65,
      ));
    }
  }
}

function addCjkOrdinalEnumerationCandidates(
  candidates: Candidate[],
  text: string,
  locale: "zh-CN" | "zh-TW",
  protectedSpans: readonly (readonly [number, number])[],
  wordBoundaries?: ReadonlySet<number>,
): void {
  const matches = Array.from(text.matchAll(/第([一二三])(?=[^，。！？；：、\s])/gu));
  if (matches.length < 3) return;
  const ordered = matches.slice(0, 3);
  if (ordered.map((match) => match[1]).join("") !== "一二三") return;
  const points = ordered.map((match) => Object.freeze({
    at: match.index ?? -1,
    marker: match[0],
    after: (match.index ?? -1) + match[0].length,
  }));
  if (points.some(({ at, after, marker }) =>
    at < 0 ||
    intersectsProtectedSpan(protectedSpans, at, after) ||
    !isExactLocaleWordMarker(text, at, marker, locale, wordBoundaries) ||
    /^(?:章|节|節|次|天|年|期|季|代|时间|時間|印象|感觉|感覺|反应|反應)/u.test(text.slice(after))
  )) return;
  const first = points[0];
  const second = points[1];
  const third = points[2];
  if (first === undefined || second === undefined || third === undefined) return;
  if (
    contentUnits(text.slice(first.after, second.at), locale) < 2 ||
    contentUnits(text.slice(second.after, third.at), locale) < 2 ||
    contentUnits(text.slice(third.after), locale) < 2
  ) return;
  if (contentUnits(text.slice(0, first.at), locale) >= 2) {
    candidates.push(candidate(first.at, "：", "enumeration", 65));
  }
  for (const point of points) {
    candidates.push(candidate(point.after, "，", "enumeration", 65));
  }
  candidates.push(candidate(second.at, "；", "enumeration", 65));
  candidates.push(candidate(third.at, "；", "enumeration", 65));
}

function addResetMarkers(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  locale: string,
  mark: Candidate["mark"],
  protectedSpans: readonly (readonly [number, number])[],
  wordBoundaries?: ReadonlySet<number>,
  analysis?: ClauseAnalysis,
): void {
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (
      at === undefined || at === 0 ||
      intersectsProtectedSpan(protectedSpans, at, at + match[0].length) ||
      isFixedCompoundMarker(text, at, match[0]) ||
      !isExactLocaleWordMarker(text, at, match[0], locale, wordBoundaries)
    ) continue;
    if (
      (locale === "zh-CN" || locale === "zh-TW") &&
      /(?:但是|不过|不過|可是|然而|然后|然後|所以|而且|另外|同时|同時|否则|否則|反而)\s*$/u.test(text.slice(Math.max(0, at - 12), at))
    ) continue;
    const left = analysis === undefined
      ? contentUnits(clauseSides(text, at).left, locale)
      : analyzedClauseLeftUnits(analysis, locale, at);
    const right = analysis === undefined
      ? contentUnits(clauseRight(text, at + match[0].length), locale)
      : analyzedClauseRightUnits(analysis, locale, at + match[0].length);
    if (left >= resetMinimum(locale, "left") && right >= resetMinimum(locale, "right")) {
      candidates.push(candidate(at, mark, "discourse-reset", 55));
      candidates.push(candidate(at + match[0].length, commaFor(locale, text, at), "connective", 40));
    }
  }
}

function addFinalCandidate(candidates: Candidate[], input: SpokenTranscriptInput): void {
  if (TERMINAL.test(input.text)) return;
  const at = terminalInsertionOffset(input.text, input.locale);
  const candidateBoundary = candidates.reduce(
    (latest, entry) => isSentenceMark(entry.mark) && entry.atCodeUnit < at
      ? Math.max(latest, entry.atCodeUnit)
      : latest,
    0,
  );
  const existingBoundary = lastExistingSentenceBoundary(input.text, at);
  const question = isQuestion(
    input.text.slice(Math.max(candidateBoundary, existingBoundary), at),
    input.locale,
  );
  candidates.push(candidate(
    at,
    question
      ? questionFor(input.locale, input.text.slice(existingBoundary, at))
      : periodFor(input.locale, input.text.slice(0, at)),
    question ? "question" : "final-stop",
    question ? 100 : 10,
  ));
}

function isSentenceMark(mark: Candidate["mark"]): boolean {
  return mark === "." || mark === "。" || mark === "?" || mark === "？";
}

function lastExistingSentenceBoundary(text: string, before: number): number {
  let latest = 0;
  for (const match of text.slice(0, before).matchAll(/[。！？.!?]+/gu)) {
    latest = (match.index ?? 0) + match[0].length;
  }
  return latest;
}

function candidate(
  atCodeUnit: number,
  mark: Candidate["mark"],
  reason: Candidate["reason"],
  priority: number,
): Candidate {
  return Object.freeze({ atCodeUnit, mark, reason, priority });
}

function validPauses(
  text: string,
  locale: string,
  pauses: readonly TranscriptPauseEvidence[] | undefined,
): readonly TranscriptPauseEvidence[] {
  if (pauses === undefined || pauses.length === 0 || pauses.length > 1_024) return Object.freeze([]);
  const graphemeBoundaries = findGraphemeBoundaries(text);
  let previous = -1;
  for (const pause of pauses) {
    if (
      !Number.isSafeInteger(pause.afterCodeUnit) ||
      pause.afterCodeUnit <= previous ||
      !validInsertionBoundary(text, pause.afterCodeUnit, graphemeBoundaries) ||
      !validPauseSeam(text, locale, pause.afterCodeUnit) ||
      !Number.isFinite(pause.durationMs) ||
      pause.durationMs < 0 ||
      pause.durationMs > 65_000 ||
      (pause.source !== "word-timestamp" && pause.source !== "segment-timestamp")
    ) return Object.freeze([]);
    previous = pause.afterCodeUnit;
  }
  return pauses;
}

function pauseThresholds(durations: readonly number[]): Readonly<{ commaMs: number; sentenceMs: number }> {
  if (durations.length < 6) return Object.freeze({ commaMs: 420, sentenceMs: 900 });
  const median = percentile(durations, .5);
  const deviations = durations.map((value) => Math.abs(value - median));
  const mad = percentile(deviations, .5);
  return Object.freeze({
    commaMs: clamp(Math.round(median + 2.5 * mad), 360, 650),
    sentenceMs: clamp(Math.round(median + 5 * mad), 850, 1_400),
  });
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
}

function clauseSides(text: string, at: number): Readonly<{ left: string; right: string }> {
  const leftBoundary = Math.max(
    text.lastIndexOf("。", at - 1), text.lastIndexOf(".", at - 1),
    text.lastIndexOf("！", at - 1), text.lastIndexOf("!", at - 1),
    text.lastIndexOf("？", at - 1), text.lastIndexOf("?", at - 1),
  );
  const tail = text.slice(at);
  const next = tail.search(/[。.!！?？]/u);
  return Object.freeze({
    left: text.slice(leftBoundary + 1, at).trim(),
    right: tail.slice(0, next < 0 ? undefined : next).trim(),
  });
}

function clauseRight(text: string, start: number): string {
  const tail = text.slice(start);
  const next = tail.search(/[。.!！?？]/u);
  return tail.slice(0, next < 0 ? undefined : next).trim();
}

function sideCounts(
  sides: Readonly<{ left: string; right: string }>,
  locale: string,
): Readonly<{ left: number; right: number }> {
  return Object.freeze({
    left: contentUnits(sides.left, locale),
    right: contentUnits(sides.right, locale),
  });
}

function contentUnits(text: string, locale: string): number {
  const matches = text.match(locale === "en-US" || locale === "de-DE" ? LATIN_WORD : CJK_UNIT);
  return matches?.length ?? 0;
}

function buildClauseAnalysis(text: string): ClauseAnalysis {
  const cjkContentPrefix = new Uint32Array(text.length + 1);
  const latinContentPrefix = new Uint32Array(text.length + 1);
  for (const match of text.matchAll(new RegExp(CJK_ANALYSIS_UNIT.source, CJK_ANALYSIS_UNIT.flags))) {
    cjkContentPrefix[(match.index ?? 0) + match[0].length] += 1;
  }
  for (const match of text.matchAll(new RegExp(LATIN_WORD.source, LATIN_WORD.flags))) {
    latinContentPrefix[(match.index ?? 0) + match[0].length] += 1;
  }
  for (let at = 1; at <= text.length; at += 1) {
    cjkContentPrefix[at] = (cjkContentPrefix[at] ?? 0) + (cjkContentPrefix[at - 1] ?? 0);
    latinContentPrefix[at] = (latinContentPrefix[at] ?? 0) + (latinContentPrefix[at - 1] ?? 0);
  }

  const sentenceStart = new Uint32Array(text.length + 1);
  let latestStart = 0;
  for (let at = 0; at <= text.length; at += 1) {
    sentenceStart[at] = latestStart;
    if (at < text.length && isSentenceBoundaryCodeUnit(text[at] ?? "")) latestStart = at + 1;
  }
  const sentenceEnd = new Uint32Array(text.length + 1);
  let nearestEnd = text.length;
  for (let at = text.length; at >= 0; at -= 1) {
    if (at < text.length && isSentenceBoundaryCodeUnit(text[at] ?? "")) nearestEnd = at;
    sentenceEnd[at] = nearestEnd;
  }
  return Object.freeze({ cjkContentPrefix, latinContentPrefix, sentenceStart, sentenceEnd });
}

function isSentenceBoundaryCodeUnit(value: string): boolean {
  return value === "。" || value === "." || value === "！" || value === "!" || value === "？" || value === "?";
}

function hasSpokenPunctuationTail(text: string, before: number): boolean {
  // The longest command token is bounded; scanning the entire preceding
  // transcript for every connective would make dense speech quadratic.
  return SPOKEN_PUNCTUATION_TAIL.test(text.slice(Math.max(0, before - 32), before));
}

function analyzedContentUnits(
  analysis: ClauseAnalysis,
  locale: string,
  start: number,
  end: number,
): number {
  const prefix = locale === "en-US" || locale === "de-DE"
    ? analysis.latinContentPrefix
    : analysis.cjkContentPrefix;
  const boundedStart = clamp(start, 0, prefix.length - 1);
  const boundedEnd = clamp(end, boundedStart, prefix.length - 1);
  return (prefix[boundedEnd] ?? 0) - (prefix[boundedStart] ?? 0);
}

function analyzedClauseLeftUnits(
  analysis: ClauseAnalysis,
  locale: string,
  at: number,
): number {
  return analyzedContentUnits(analysis, locale, analysis.sentenceStart[at] ?? 0, at);
}

function analyzedClauseRightUnits(
  analysis: ClauseAnalysis,
  locale: string,
  start: number,
): number {
  return analyzedContentUnits(analysis, locale, start, analysis.sentenceEnd[start] ?? analysis.sentenceEnd.length - 1);
}

function commaMinimum(locale: string, side: "left" | "right"): number {
  if (locale === "en-US" || locale === "de-DE") return side === "left" ? 3 : 2;
  if (locale === "ja-JP") return side === "left" ? 5 : 4;
  return side === "left" ? 4 : 3;
}

function sentenceMinimum(locale: string, side: "left" | "right"): number {
  if (locale === "en-US" || locale === "de-DE") return side === "left" ? 5 : 4;
  if (locale === "ja-JP") return side === "left" ? 9 : 7;
  return side === "left" ? 8 : 6;
}

function pairedMinimum(locale: string): number {
  return locale === "en-US" || locale === "de-DE" ? 2 : locale === "ja-JP" ? 3 : 2;
}

function resetMinimum(locale: string, side: "left" | "right"): number {
  if (locale === "en-US" || locale === "de-DE") return side === "left" ? 4 : 3;
  if (locale === "ja-JP") return side === "left" ? 6 : 4;
  return side === "left" ? 5 : 2;
}

function isIncomplete(text: string, locale: string): boolean {
  if (locale === "zh-CN" || locale === "zh-TW") return INCOMPLETE_CJK.test(text);
  if (locale === "ja-JP") return INCOMPLETE_JAPANESE.test(text);
  if (locale === "de-DE") return INCOMPLETE_GERMAN.test(text);
  return INCOMPLETE_ENGLISH.test(text);
}

function isIncompleteStart(text: string, locale: string): boolean {
  if (locale === "zh-CN" || locale === "zh-TW") {
    return /^(?:并且|並且|而且|以及|和|与|與|或|的|地|得)(?=[^，。！？；：、\s])/u.test(text);
  }
  if (locale === "ja-JP") {
    return /^(?:そして|しかし|の|に|を|が|は|で|と|から|まで)(?=[^、。！？\s])/u.test(text);
  }
  if (locale === "de-DE") {
    return /^(?:und|oder|aber|denn|weil|dass|wenn|falls|obwohl|mit|ohne|für|zu|von|bei|in|an|auf)\b/iu.test(text);
  }
  return /^(?:and|or|but|because|although|though|if|unless|when|while|to|of|for|with|without|from|by|at|in|on)\b/iu.test(text);
}

function isQuestion(text: string, locale: string): boolean {
  const candidate = text.trim().replace(/[\p{Pe}\p{Pf}”’"'」』）】》]+$/gu, "");
  const english = DIRECT_ENGLISH_QUESTION.test(candidate);
  if (locale === "zh-CN" || locale === "zh-TW") return isChineseQuestion(candidate) || english;
  if (locale === "ja-JP") return isJapaneseQuestion(candidate) || english;
  if (locale === "de-DE") return isGermanQuestion(candidate) || english;
  if (locale === "en-US") {
    return english ||
      (/\p{Script_Extensions=Han}/u.test(candidate) && isChineseQuestion(candidate)) ||
      (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(candidate) && isJapaneseQuestion(candidate)) ||
      (/[äöüß]/iu.test(candidate) && isGermanQuestion(candidate));
  }
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(candidate)) {
    return isJapaneseQuestion(candidate) || english;
  }
  if (/\p{Script_Extensions=Han}/u.test(candidate)) return isChineseQuestion(candidate) || english;
  return english || isGermanQuestion(candidate);
}

function isChineseQuestion(candidate: string): boolean {
  if (/^(?:我|我们|我們).{0,16}(?:不知道|不确定|不確定|想知道|确认|確認)/u.test(candidate)) {
    return false;
  }
  const alternative = candidate.match(ALTERNATIVE_CJK_QUESTION);
  const embeddedAlternative = alternative?.index !== undefined && (
    /(?:讨论|討論|研究|确认|確認|决定|決定|考虑|考慮|知道|了解|看看|说明|說明)$/u
      .test(candidate.slice(0, alternative.index)) ||
    /(?:还|還|尚|仍)(?:不确定|不確定|未知)$|(?:有待(?:确认|確認|讨论|討論)|取决于|取決於|是个问题|是個問題)$/u
      .test(candidate.slice(alternative.index + alternative[0].length))
  );
  return /[吗嗎]$/u.test(candidate) ||
    DIRECT_CJK_QUESTION.test(candidate) ||
    (alternative !== null && !embeddedAlternative) ||
    /^(?:然后呢|然後呢|所以呢|接下来呢|接下來呢|你呢|这个呢|這個呢)$/u.test(candidate);
}

function isJapaneseQuestion(candidate: string): boolean {
  if (/(?:誰|だれ|何|なに|どこ|いつ|なぜ)か$|(?:かどうか|かもしれない|かも知れない)$/u.test(candidate)) {
    return false;
  }
  return /(?:です|ます|でした|ました|でしょう|だろう|なの|の)か$/u.test(candidate) ||
    DIRECT_JAPANESE_QUESTION.test(candidate) ||
    /^(?:どうする|どうしたら(?:いい|よい)|どうすれば(?:いい|よい)|どう思う|どうです|どうなる)$/u.test(candidate);
}

function isGermanQuestion(candidate: string): boolean {
  return !/^was für\b/iu.test(candidate) && DIRECT_GERMAN_QUESTION.test(candidate);
}

const findProtectedSpans = findProtectedTranscriptLiteralSpans;

function isProtectedBoundary(spans: readonly (readonly [number, number])[], at: number): boolean {
  return spans.some(([start, end]) => at > start && at < end);
}

function intersectsProtectedSpan(
  spans: readonly (readonly [number, number])[],
  start: number,
  end: number,
): boolean {
  return spans.some(([protectedStart, protectedEnd]) =>
    protectedStart < end && protectedEnd > start);
}

function isProtectedIndex(spans: readonly (readonly [number, number])[], index: number): boolean {
  return spans.some(([start, end]) => index >= start && index < end);
}

function numericBoundary(text: string, at: number): boolean {
  const left = text.slice(0, at).trimEnd().at(-1) ?? "";
  const right = text.slice(at).trimStart().at(0) ?? "";
  return /\p{N}/u.test(left) && /\p{N}/u.test(right);
}

function hasMarkAtBoundary(text: string, at: number): boolean {
  const left = text.slice(0, at).trimEnd().at(-1) ?? "";
  const right = text.slice(at).trimStart().at(0) ?? "";
  return EXISTING_MARK.test(left) || EXISTING_MARK.test(right);
}

function validInsertionBoundary(
  text: string,
  at: number,
  graphemeBoundaries = findGraphemeBoundaries(text),
): boolean {
  if (!Number.isSafeInteger(at) || at < 1 || at > text.length) return false;
  return graphemeBoundaries.has(at);
}

function findGraphemeBoundaries(text: string): ReadonlySet<number> {
  const boundaries = new Set<number>([0, text.length]);
  for (const segment of GRAPHEME_SEGMENTER.segment(text)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  return boundaries;
}

function validPauseSeam(text: string, locale: string, at: number): boolean {
  const left = text.slice(0, at).at(-1) ?? "";
  const right = text.slice(at).at(0) ?? "";
  if (locale === "en-US" || locale === "de-DE") {
    return /\s/u.test(left) || /\s/u.test(right);
  }
  if (!["zh-CN", "zh-TW", "ja-JP"].includes(locale)) {
    return !/[\p{Script=Latin}\p{N}'’-]/u.test(left) ||
      !/[\p{Script=Latin}\p{N}'’-]/u.test(right);
  }
  return true;
}

function terminalInsertionOffset(text: string, locale: string): number {
  const expression = text.match(TRAILING_EXPRESSION);
  let at = expression?.index ?? text.length;
  const lexicalText = text.slice(0, at).trimEnd();
  at = lexicalText.length;
  if (!isCjkLocale(locale, lexicalText)) return at;
  if (/^[“「『].+[”」』]$/u.test(lexicalText) || /[）】》]+$/u.test(lexicalText)) {
    while (at > 0 && CLOSING_MARK.test(text[at - 1]!)) at -= 1;
    return at;
  }
  return at;
}

function commaFor(locale: string, text = "", at = text.length): Candidate["mark"] {
  if (locale === "zh-CN" || locale === "zh-TW") return "，";
  if (locale === "ja-JP") return "、";
  if (locale !== "en-US" && locale !== "de-DE") {
    const left = text.slice(0, at).trimEnd();
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(left)) return "、";
    if (/\p{Script_Extensions=Han}$/u.test(left)) return "，";
  }
  return ",";
}

function periodFor(locale: string, text: string): Candidate["mark"] {
  if (locale === "zh-CN" || locale === "zh-TW" || locale === "ja-JP") return "。";
  if (locale === "en-US" || locale === "de-DE") return ".";
  return /[\p{Script_Extensions=Han}\p{Script=Hiragana}\p{Script=Katakana}][\p{Pe}\p{Pf}”’"'」』）】》]*$/u.test(text.trim()) ? "。" : ".";
}

function questionFor(locale: string, text: string): Candidate["mark"] {
  if (locale === "zh-CN" || locale === "zh-TW" || locale === "ja-JP") return "？";
  if (locale === "en-US" || locale === "de-DE") return "?";
  return /[\p{Script_Extensions=Han}\p{Script=Hiragana}\p{Script=Katakana}][\p{Pe}\p{Pf}”’"'」』）】》]*$/u.test(text.trim()) ? "？" : "?";
}

function isCjkLocale(locale: string, text: string): boolean {
  if (locale === "zh-CN" || locale === "zh-TW" || locale === "ja-JP") return true;
  if (locale === "en-US" || locale === "de-DE") return false;
  return CJK.test(text);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
