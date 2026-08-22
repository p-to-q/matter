import { isSpokenTranscriptQuestion } from "./spoken-transcript";
import { protectedTranscriptLiteralPattern } from "./protected-transcript-literal";

const SPOKEN_EXPRESSION_EMOJI = Object.freeze([
  "😄", "😠", "🎉", "😢",
  "✈️", "☕", "🎂", "🚀", "🎵", "☀️", "🌙",
] as const);

export type SpokenExpressionEmoji = typeof SPOKEN_EXPRESSION_EMOJI[number];

export type ExpressionInsertion = Readonly<{
  atCodeUnit: number;
  emoji: SpokenExpressionEmoji;
  reason: "explicit-affect" | "celebration" | "semantic-icon";
}>;

type Affect = "joy" | "anger" | "celebration" | "sadness";

const EXISTING_EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)/u;
const CHINESE_WORD_SEGMENTER = new Intl.Segmenter("zh", { granularity: "word" });
const JAPANESE_WORD_SEGMENTER = new Intl.Segmenter("ja", { granularity: "word" });
const CONDITIONAL_OR_REPORTED = /(?:如果|假如|要是|倘若|只要|除非|当.+时|當.+時|(?:说|說)(?!服|明|笑|法)|(?:写|寫|表示|提到)|听说|聽說|这个词|這個詞|这个词语|這個詞語|\b(?:if|when|unless|whenever|provided that|as long as)\b|\b(?:said|say|says|wrote|writes|felt|reported)\b|\bthe (?:word|term)\b|なら|もし|とき|と言った|と言って|という言葉|\bwenn\b|\bfalls\b|\bsobald\b|\bsofern\b|\b(?:sagte|sagten|meinte|meinten|schrieb|schrieben)\b|\bdas Wort\b)/iu;
const NEGATED_AFFECT = /(?:不|没|沒|没有|沒有|并不|並不).{0,6}(?:开心|開心|高兴|高興|生气|生氣|难过|難過|伤心|傷心)|\b(?:not|never|don['’]?t|isn['’]?t|aren['’]?t)\b.{0,24}\b(?:happy|excited|angry|furious|sad|upset)\b|(?:嬉しくない|怒っていない|悲しくない|嬉しくありません)|\b(?:nicht|nie|kein\p{L}*)\b.{0,24}\b(?:glücklich|wütend|traurig|froh)\b/iu;

const CHINESE_RULES: ReadonlyArray<readonly [Affect, RegExp]> = Object.freeze([
  ["celebration", /(?:太好了|太棒了|我们成功了|我們成功了|终于成功了|終於成功了|终于做到了|終於做到了|搞定了|恭喜(?:你|你们|你們)?|祝贺(?:你|你们|你們)?)/u],
  ["joy", /(?:我(?:真的|实在|實在)?(?:很|太|特别|特別|非常)(?:开心|開心|高兴|高興)|哈哈哈+)/u],
  ["anger", /(?:我(?:真的|实在|實在)?(?:很|太|特别|特別|非常)(?:生气|生氣|愤怒)|气死我了|氣死我了|我受够了|我受夠了)/u],
  ["sadness", /(?:我(?:真的|实在|實在)?(?:很|太|特别|特別|非常)(?:难过|難過|伤心|傷心)|我真的想哭|呜呜呜+)/u],
]);

const ENGLISH_RULES: ReadonlyArray<readonly [Affect, RegExp]> = Object.freeze([
  ["celebration", /\b(?:(?:we|i) (?:finally )?(?:did it|made it)|congratulations|happy birthday)\b/iu],
  ["joy", /\bI(?:['’]m| am) (?:really |so |very )?(?:happy|excited|thrilled)\b|\bha(?:ha){2,}\b/iu],
  ["anger", /\bI(?:['’]m| am) (?:really |so |very )?(?:angry|furious)\b|\bI(?:['’]ve| have) had enough\b/iu],
  ["sadness", /\bI(?:['’]m| am) (?:really |so |very )?(?:sad|heartbroken|upset)\b/iu],
]);

const JAPANESE_RULES: ReadonlyArray<readonly [Affect, RegExp]> = Object.freeze([
  ["celebration", /(?:やった|ついに成功した|おめでとう)/u],
  ["joy", /(?:私は)?本当に(?:嬉しい|楽しい)/u],
  ["anger", /(?:私は)?本当に(?:怒っている|腹が立っている)/u],
  ["sadness", /(?:私は)?本当に(?:悲しい|つらい)/u],
]);

const GERMAN_RULES: ReadonlyArray<readonly [Affect, RegExp]> = Object.freeze([
  ["celebration", /\b(?:wir haben es (?:endlich )?geschafft|endlich geschafft|herzlichen Glückwunsch)\b/iu],
  ["joy", /\bich bin (?:wirklich |so |sehr )?(?:glücklich|froh|begeistert)\b/iu],
  ["anger", /\bich bin (?:wirklich |so |sehr )?(?:wütend|sauer)\b/iu],
  ["sadness", /\bich bin (?:wirklich |so |sehr )?(?:traurig|niedergeschlagen)\b/iu],
]);

type EntityRule = Readonly<{
  id: string;
  language: "zh" | "ja" | "en" | "de";
  pattern: RegExp;
  emoji: SpokenExpressionEmoji;
}>;

const ENTITY_RULES: readonly EntityRule[] = Object.freeze([
  { id: "zh-airplane", language: "zh", pattern: /(?:飞机|飛機)/gu, emoji: "✈️" },
  { id: "zh-coffee", language: "zh", pattern: /咖啡/gu, emoji: "☕" },
  { id: "zh-birthday", language: "zh", pattern: /生日/gu, emoji: "🎂" },
  { id: "zh-rocket", language: "zh", pattern: /火箭/gu, emoji: "🚀" },
  { id: "zh-music", language: "zh", pattern: /(?:音乐|音樂)/gu, emoji: "🎵" },
  { id: "zh-sun", language: "zh", pattern: /(?:太阳|太陽)/gu, emoji: "☀️" },
  { id: "zh-moon", language: "zh", pattern: /月亮/gu, emoji: "🌙" },
  { id: "ja-airplane", language: "ja", pattern: /飛行機/gu, emoji: "✈️" },
  { id: "ja-coffee", language: "ja", pattern: /コーヒー/gu, emoji: "☕" },
  { id: "ja-birthday", language: "ja", pattern: /誕生日/gu, emoji: "🎂" },
  { id: "ja-rocket", language: "ja", pattern: /ロケット/gu, emoji: "🚀" },
  { id: "ja-music", language: "ja", pattern: /音楽/gu, emoji: "🎵" },
  { id: "ja-sun", language: "ja", pattern: /太陽/gu, emoji: "☀️" },
  { id: "ja-moon", language: "ja", pattern: /月/gu, emoji: "🌙" },
  { id: "en-airplane", language: "en", pattern: /\b(?:airplane|aeroplane)\b/giu, emoji: "✈️" },
  { id: "en-coffee", language: "en", pattern: /\bcoffee\b/giu, emoji: "☕" },
  { id: "en-birthday", language: "en", pattern: /\bbirthday\b/giu, emoji: "🎂" },
  { id: "en-rocket", language: "en", pattern: /\brocket\b/giu, emoji: "🚀" },
  { id: "en-music", language: "en", pattern: /\bmusic\b/giu, emoji: "🎵" },
  { id: "en-sun", language: "en", pattern: /\bsun\b/giu, emoji: "☀️" },
  { id: "en-moon", language: "en", pattern: /\bmoon\b/giu, emoji: "🌙" },
  { id: "de-airplane", language: "de", pattern: /\bFlugzeug\b/giu, emoji: "✈️" },
  { id: "de-coffee", language: "de", pattern: /\bKaffee\b/giu, emoji: "☕" },
  { id: "de-birthday", language: "de", pattern: /\bGeburtstag\b/giu, emoji: "🎂" },
  { id: "de-rocket", language: "de", pattern: /\bRakete\b/giu, emoji: "🚀" },
  { id: "de-music", language: "de", pattern: /\bMusik\b/giu, emoji: "🎵" },
  { id: "de-sun", language: "de", pattern: /\bSonne\b/giu, emoji: "☀️" },
  { id: "de-moon", language: "de", pattern: /\bMond\b/giu, emoji: "🌙" },
]);

const ENTITY_SAMPLE_RATE = 0.24;

const CONFLICT_HINTS: ReadonlyArray<readonly [Affect, RegExp]> = Object.freeze([
  ["joy", /(?:开心|開心|高兴|高興|嬉しい|楽しい|\bhappy\b|\bexcited\b|\bglücklich\b|\bfroh\b)/iu],
  ["anger", /(?:生气|生氣|愤怒|怒って|腹が立って|\bangry\b|\bfurious\b|\bwütend\b|\bsauer\b)/iu],
  ["sadness", /(?:难过|難過|伤心|傷心|悲しい|つらい|\bsad\b|\bheartbroken\b|\btraurig\b)/iu],
  ["celebration", /(?:成功了|恭喜|祝贺|成功した|おめでとう|\bcongratulations\b|\bdid it\b|\bmade it\b|\bgeschafft\b)/iu],
]);

/** Plans at most one conservative local or sentence-final expression mark. */
export function planSpokenExpression(input: Readonly<{
  text: string;
  locale: string;
  sampleSeed?: string;
}>): ExpressionInsertion | undefined {
  const text = input.text.trim();
  const leadingCodeUnits = input.text.length - input.text.trimStart().length;
  if (
    text.length === 0 ||
    EXISTING_EMOJI.test(text) ||
    /[?？]/u.test(text) ||
    CONDITIONAL_OR_REPORTED.test(text) ||
    NEGATED_AFFECT.test(text) ||
    isSpokenTranscriptQuestion(text, input.locale)
  ) return undefined;

  const visible = maskProtected(text);
  const affects = new Set<Affect>();
  const unknown = !["zh-CN", "zh-TW", "ja-JP", "de-DE", "en-US"].includes(input.locale);
  const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(visible);
  const hasHan = /\p{Script_Extensions=Han}/u.test(visible);
  const hasGerman = /[äöüß]|\b(?:glücklich|wütend|traurig|geschafft)\b/iu.test(visible);

  if (input.locale === "zh-CN" || input.locale === "zh-TW" || (unknown && hasHan && !hasKana)) {
    collectAffects(affects, visible, CHINESE_RULES);
  }
  if (input.locale === "ja-JP" || (unknown && hasKana)) {
    collectAffects(affects, visible, JAPANESE_RULES);
  }
  if (input.locale === "de-DE" || (unknown && hasGerman)) {
    collectAffects(affects, visible, GERMAN_RULES);
  }
  // English remains a token-anchored bridge for every primary locale.
  collectAffects(affects, visible, ENGLISH_RULES);
  if (affects.size === 1) {
    const affect = [...affects][0]!;
    const conflictHints = new Set<Affect>();
    collectAffects(conflictHints, visible, CONFLICT_HINTS);
    if ([...conflictHints].some((hint) => hint !== affect)) return undefined;
    return Object.freeze({
      atCodeUnit: leadingCodeUnits + text.length,
      emoji: emojiFor(affect),
      reason: affect === "celebration" ? "celebration" : "explicit-affect",
    });
  }
  if (affects.size > 1) return undefined;
  const entity = sampleEntityInsertion(text, visible, input.locale, input.sampleSeed ?? "");
  return entity === undefined ? undefined : Object.freeze({
    ...entity,
    atCodeUnit: leadingCodeUnits + entity.atCodeUnit,
  });
}

export function decorateSpokenExpression(input: Readonly<{
  text: string;
  locale: string;
  maxOutputCodeUnits?: number;
  sampleSeed?: string;
}>): string {
  const plan = planSpokenExpression(input);
  if (plan === undefined) return input.text;
  const output = `${input.text.slice(0, plan.atCodeUnit)}${plan.emoji}${input.text.slice(plan.atCodeUnit)}`;
  return input.maxOutputCodeUnits !== undefined && output.length > input.maxOutputCodeUnits
    ? input.text
    : output;
}

/** Reverses only the exact closed-set decoration this planner would produce.
 * Undefined means the candidate omitted, forged, or misplaced an expression. */
export function canonicalSpokenExpressionBase(input: Readonly<{
  text: string;
  locale: string;
  maxOutputCodeUnits?: number;
  sampleSeed?: string;
}>): string | undefined {
  for (const emoji of SPOKEN_EXPRESSION_EMOJI) {
    let at = input.text.indexOf(emoji);
    while (at >= 0) {
      const base = `${input.text.slice(0, at)}${input.text.slice(at + emoji.length)}`;
      if (decorateSpokenExpression({
        text: base,
        locale: input.locale,
        maxOutputCodeUnits: input.maxOutputCodeUnits,
        sampleSeed: input.sampleSeed,
      }) === input.text) return base;
      at = input.text.indexOf(emoji, at + emoji.length);
    }
  }
  if (EXISTING_EMOJI.test(input.text)) return undefined;
  return decorateSpokenExpression(input) === input.text ? input.text : undefined;
}

function sampleEntityInsertion(
  text: string,
  visible: string,
  locale: string,
  sampleSeed: string,
): ExpressionInsertion | undefined {
  // Sampling is an admission property, not a property of the sentence text.
  // Without an admission identity there is no reproducible probability space.
  if (sampleSeed.length === 0) return undefined;
  const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(visible);
  const hasHan = /\p{Script_Extensions=Han}/u.test(visible);
  const knownLocale = ["zh-CN", "zh-TW", "ja-JP", "de-DE", "en-US"].includes(locale);
  const inferredLanguage = knownLocale
    ? undefined
    : hasKana
      ? "ja"
      : hasHan
        ? "zh"
        : undefined;
  if (stableSample(`${sampleSeed}\u0000${locale}\u0000${text}\u0000entity-gate`) >= ENTITY_SAMPLE_RATE) {
    return undefined;
  }
  const candidates: Array<Readonly<{
    atCodeUnit: number;
    emoji: SpokenExpressionEmoji;
    sample: number;
  }>> = [];
  const cjkWordSpans = new Map<"zh" | "ja", ReadonlySet<string>>();
  for (const rule of ENTITY_RULES) {
    if (!entityLanguageEnabled(rule.language, locale, inferredLanguage)) continue;
    rule.pattern.lastIndex = 0;
    for (const match of visible.matchAll(rule.pattern)) {
      const start = match.index;
      if (start === undefined) continue;
      const end = start + match[0].length;
      if (
        !isEntityWord(text, start, end, rule.language, cjkWordSpans) ||
        hasAdjacentLiteralJoin(text, start, end) ||
        hasEntityCompoundCollision(text, end, rule.id)
      ) continue;
      candidates.push(Object.freeze({
        atCodeUnit: end,
        emoji: rule.emoji,
        sample: stableSample(`${sampleSeed}\u0000${locale}\u0000${text}\u0000${rule.id}\u0000${end}`),
      }));
    }
  }
  const selected = candidates.sort((left, right) =>
    left.sample - right.sample || left.atCodeUnit - right.atCodeUnit)[0];
  if (selected === undefined) return undefined;
  return Object.freeze({
    atCodeUnit: selected.atCodeUnit,
    emoji: selected.emoji,
    reason: "semantic-icon",
  });
}

function entityLanguageEnabled(
  language: EntityRule["language"],
  locale: string,
  inferredLanguage: "zh" | "ja" | undefined,
): boolean {
  // English is the only cross-locale bridge. A known primary locale never
  // silently activates a second non-English dictionary.
  if (language === "en") return true;
  if (language === "zh") {
    return locale === "zh-CN" || locale === "zh-TW" || inferredLanguage === "zh";
  }
  if (language === "ja") return locale === "ja-JP" || inferredLanguage === "ja";
  return locale === "de-DE";
}

function isEntityWord(
  text: string,
  start: number,
  end: number,
  language: EntityRule["language"],
  cjkWordSpans: Map<"zh" | "ja", ReadonlySet<string>>,
): boolean {
  if (language === "en" || language === "de") {
    // A CJK/Latin script seam is a valid code-switch boundary even without a
    // space. Only a neighbouring Latin letter, number, apostrophe, or dash can
    // make this match a fragment of a larger Latin token.
    return !/[\p{Script=Latin}\p{N}'’-]/u.test(text[start - 1] ?? "") &&
      !/[\p{Script=Latin}\p{N}'’-]/u.test(text[end] ?? "");
  }
  let spans = cjkWordSpans.get(language);
  if (spans === undefined) {
    const segmenter = language === "ja" ? JAPANESE_WORD_SEGMENTER : CHINESE_WORD_SEGMENTER;
    spans = new Set(Array.from(segmenter.segment(text), (segment) =>
      `${segment.index}:${segment.index + segment.segment.length}`));
    cjkWordSpans.set(language, spans);
  }
  return spans.has(`${start}:${end}`);
}

function hasAdjacentLiteralJoin(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start);
  const after = text.slice(end);
  return /[\p{L}\p{N}_$][._/\\-]$/u.test(before) ||
    /^[._/\\-](?=[\p{L}\p{N}_$])/u.test(after);
}

function hasEntityCompoundCollision(text: string, end: number, ruleId: string): boolean {
  const after = text.slice(end);
  if (ruleId.endsWith("airplane")) return /^(?:场|場|票|型|翼|员|員|云|雲)/u.test(after);
  if (ruleId.endsWith("coffee")) return /^(?:因|机|機|厅|廳|馆|館|豆|色|店)/u.test(after);
  if (ruleId.endsWith("birthday")) return /^(?:会|會|蛋糕|ケーキ)/u.test(after);
  if (ruleId.endsWith("rocket")) return /^(?:队|隊|筒|弹|彈|エンジン)/u.test(after);
  if (ruleId.endsWith("music")) return /^(?:会|會|家|剧|厅|廳|祭|室)/u.test(after);
  if (ruleId.endsWith("sun")) return /^(?:能|系|镜|鏡|光|電池)/u.test(after);
  if (ruleId === "ja-moon") return /^(?:に(?:一度|二度|三度|\d)|ごと|間|分|額|曜日)/u.test(after);
  return false;
}

function stableSample(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function collectAffects(
  target: Set<Affect>,
  text: string,
  rules: ReadonlyArray<readonly [Affect, RegExp]>,
): void {
  for (const [affect, pattern] of rules) {
    if (pattern.test(text)) target.add(affect);
  }
}

function maskProtected(text: string): string {
  return text.replace(protectedTranscriptLiteralPattern(), (literal) => " ".repeat(literal.length));
}

function emojiFor(affect: Affect): SpokenExpressionEmoji {
  switch (affect) {
    case "celebration": return "🎉";
    case "joy": return "😄";
    case "anger": return "😠";
    case "sadness": return "😢";
  }
}
