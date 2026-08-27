import { deriveMaterialTitle } from "./material-files";

/**
 * Owns the deterministic half of thought labelling: it compresses one node's
 * text into a short navigation label, decides whether a model is worth asking,
 * and judges a model answer against the deterministic one.
 *
 * It must not own transport, caching, React state, or durable material. A label
 * is derived presentation: it never enters `ThoughtTree`, command history, or an
 * archive, so an unchanged node always re-derives the same floor label.
 */

/** Hard ceiling for any label, independent of script and locale. */
export const MAX_SEMANTIC_LABEL_GRAPHEMES = 32;
/**
 * Preferred lengths.
 *
 * A name has to sound like the thought its author wrote, not like the folder it
 * would go in. Two or three characters name a topic — `恐惧`, `成本` — and a
 * person cannot tell their own thinking apart from a list of topics. The target
 * is therefore a phrase, and lengths well under it are penalised rather than
 * forbidden: material that is genuinely that short still keeps its own words.
 */
export const HAN_TARGET_GRAPHEMES = 11;
/** Preferred length for a Japanese label; kana inflection costs graphemes. */
export const KANA_TARGET_GRAPHEMES = 15;
/** Preferred length for a Latin label. */
export const LATIN_TARGET_GRAPHEMES = 26;
/** A Han label shorter than this starts to read as a topic rather than a thought. */
const HAN_SHORT_GRAPHEMES = 6;
/**
 * How much a maximally short candidate gives up. Set against the kind bonuses:
 * a `question` or `contrast` candidate carries enough salience to survive it,
 * a bare keyphrase does not.
 */
const SHORT_LABEL_WEIGHT = 2.6;
export const MAX_SIBLING_LABELS = 8;
export const MAX_PARENT_EXCERPT_CODE_UNITS = 240;

/**
 * Bumping this invalidates every cached label without a schema change, because
 * it participates in the label fingerprint on both sides of the boundary.
 */
export const SEMANTIC_LABEL_PROMPT_VERSION = "thought-label/3";

export type SemanticLabelSource = "provisional" | "model";

export type LabelCandidateKind =
  | "already-compact"
  | "heading"
  | "contrast"
  | "conclusion"
  | "question"
  | "informative-clause"
  | "keyphrase"
  | "material-title";

export type SemanticLabelContext = Readonly<{
  parentLabel?: string | null;
  parentExcerpt?: string | null;
  siblingLabels?: readonly string[];
}>;

export type SemanticLabelInput = Readonly<{
  text: string;
  locale?: string;
  maxGraphemes?: number;
  context?: SemanticLabelContext;
}>;

export type NormalizedLabelContext = Readonly<{
  parentLabel: string | null;
  parentExcerpt: string | null;
  siblingLabels: readonly string[];
}>;

export type NormalizedLabelInput = Readonly<{
  text: string;
  locale: string;
  maxGraphemes: number;
  context: NormalizedLabelContext;
}>;

export type ProvisionalLabel = Readonly<{
  text: string;
  kind: LabelCandidateKind;
  score: number;
}>;

export type LabelRejectionCode =
  | "EMPTY"
  | "TOO_LONG"
  | "MARKUP"
  | "TERMINAL_PUNCTUATION"
  | "GENERIC"
  | "SIBLING_DUPLICATE";

export type SemanticLabelValidation =
  | Readonly<{ ok: true; label: string }>
  | Readonly<{ ok: false; code: LabelRejectionCode }>;

export type SemanticLabelValidationOptions = Readonly<{
  locale?: string;
  maxGraphemes?: number;
  siblingLabels?: readonly string[];
}>;

export type LabelAdjudicationReason =
  | "not-grounded-in-material"
  | "drops-a-stable-identifier"
  | "less-distinct-than-provisional";

export type SemanticLabelAdjudication =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reasons: readonly LabelAdjudicationReason[] }>;

export type ModelRequestReason =
  | "provisional-is-sufficient"
  | "material-is-long"
  | "material-has-many-clauses"
  | "material-is-spoken"
  | "material-depends-on-context"
  | "provisional-is-weak"
  | "provisional-collides-with-a-sibling";

export type ModelRequestDecision = Readonly<{
  request: boolean;
  reason: ModelRequestReason;
}>;

// A single fixed segmenter keeps label length locale-independent, matching the
// protocol rule that a client locale never changes a shared address space.
const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

const HAN_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// Kana carry less meaning per grapheme than Han, so Japanese needs a wider
// bound to reach the same amount of thought.
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
// A word never spans a script boundary: `token语义` is two words, and treating
// it as one makes a grounded label look invented.
const LATIN_WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{Script=Latin}\p{M}\p{N}]+(?:['’_.-][\p{Script=Latin}\p{M}\p{N}]+)*/gu;

const LEADING_FILLERS = [
  /^(?:嗯+|呃+|额+|啊+|诶+|唔+|哦+)[，,、\s]*/u,
  // Discourse connectives open a spoken continuation; they are never the name
  // of the thought, even though they still mark it as context-dependent.
  /^(?:然后呢|然后|还有|另外|而且|再说|所以说|反正|对了)[，,、\s]*/u,
  /^(?:就是说|就是|其实|基本上|大概|可能|也许|我觉得|我认为|我想说|我想|我感觉|你知道)[，,、\s]*/u,
  // Japanese hesitation and continuation openers.
  /^(?:えー+と?|あの+|その+|まあ|なんか|ちょっと|やっぱり?|うーん)[、,\s]*/u,
  /^(?:それで|そして|あと|ところで|というか|つまり)[、,\s]*/u,
  /^(?:um+|uh+|erm+|hmm+)[,\s]*/iu,
  /^(?:well|so|actually|basically|you know|i think|i feel like|i guess)[,\s]+/iu,
];

const LEADING_INTENT = [
  /^(?:我(?:想|需要|打算|希望)(?:要)?|我们(?:想|需要|要|来))(?:去|先|再)?/u,
  /^(?:帮我|请你|麻烦你)(?:去|把|来)?/u,
  /^(?:关于|对于|有关)/u,
];

// Function words that may open or close a Han chunk but never carry the name.
const HAN_FUNCTION_EDGE = /^[的了着过在从对把被让给和与及或而但也都就还]+|[的了着过在从对把被让给和与及或而但也都就还]+$/gu;
// Longest alternatives first so a two-character function word is not clipped
// into a single-character one. `着` and `过` are excluded: they are aspect
// markers, but they are also the first character of ordinary nouns such as
// `过去`, and clipping those produces a label nobody wrote.
const HAN_FUNCTION_SPLIT =
  /(?:相当于|为什么|仍然|可能|也许|其实|一个|一种|一些|这个|那个|这些|那些|我们|你们|他们|它们|自己|什么|怎么|如何|是否|可以|能够|需要|应该|的|了|在|从|对|把|被|让|给|和|与|及|或|但|而|也|都|就|还|由|为|向|于|到|跟)/u;
/**
 * Japanese particles mark chunk boundaries the way Han function words do, but
 * only the high-precision ones may be used without a morphological analyser.
 * `か`, `と`, `に`, `で`, `も`, `へ`, `や` are particles *and* ordinary syllables
 * inside common words — splitting on `か` turns `懐かしんでいる` into
 * `懐` + `しんでいる`, which is damage, not compression. `の`, `を`, `は`, `が`
 * and the multi-character particles are safe enough to be worth the boundary.
 */
const KANA_FUNCTION_SPLIT =
  /(?:という|について|によって|のように|けれど|ながら|ので|のに|から|まで|より|など|でも|とか|しか|だけ|ほど|こそ|さえ|くらい|ぐらい|そして|しかし|の|を|は|が)/u;
const HAN_FUNCTION_BOUNDARY = new RegExp(HAN_FUNCTION_SPLIT.source, "gu");
const KANA_FUNCTION_BOUNDARY = new RegExp(
  `${KANA_FUNCTION_SPLIT.source}|${HAN_FUNCTION_SPLIT.source}`,
  "gu",
);
const HAN_INTERROGATIVE_OPENER = /^(?:为什么|为何|如何|怎么样|怎样|怎么|是否|能否)/u;
const KANA_INTERROGATIVE_OPENER = /^(?:なぜ|どうして|どのように|どうやって|どう)/u;
/**
 * A window aligned to a particle boundary can still open on the particle
 * itself. A label never begins with one, and never ends on a particle that
 * leaves the phrase hanging.
 */
const KANA_FUNCTION_EDGE = /^[はがをのにでともへやかねよ]+|[はがをのにと]+$/gu;

const LOW_INFORMATION_PREFIX = [
  "但是", "不过", "不過", "然而", "可是",
  "这个", "那个", "这些", "那些", "一个", "一种", "一些",
  "其他", "我们", "自己", "现在", "今天", "其实", "可能", "也许", "比较", "非常",
];

const GENERIC_ONLY =
  /^(?:问题|事情|东西|内容|想法|思考|情况|部分|方面|方式|方法|总结|记录|未命名|新想法|thought|note|idea|untitled(?: thought)?|new note|summary)$/iu;

const CONTEXT_DEPENDENT =
  /^(?:这个|那个|这些|那些|上述|刚才|前面|后面|另外|还有|然后|而且|再说|它|他们|这一点|第[一二三四五六七八九十]+(?:个|点)?)|^(?:this|that|these|those|it|they|also|and then|besides)\b/iu;

const SPOKEN_DISFLUENCY =
  /(?:嗯|呃|额|唔|就是说|我觉得|我认为|然后呢|反正|你知道|\bum+\b|\buh+\b|\byou know\b|\bi think\b)/iu;

const CLAUSE_BREAK = /[\n\r，,、；;：:（）()「」『』【】]+/u;
// A Latin full stop is a sentence seam only when it is not inside a stable
// identifier such as `v2.3`, an IP address, or a dotted product name.
const SENTENCE_BREAK = /(?<=[。．!！?？])\s*|(?<=\.)(?![\p{L}\p{N}])\s*|[\n\r]+/u;

const LATIN_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "for", "in", "on", "at",
  "with", "from", "this", "that", "these", "those", "it", "we", "i", "you",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "can", "could", "should", "would", "may", "might",
  "as", "by", "into", "than", "then", "so", "if", "not", "no", "there",
]);

/**
 * A token that behaves like a stable identifier — a version, an acronym, or a
 * dotted/underscored name. Losing one of these turns a precise label into a
 * vague one, so adjudication refuses a model answer that drops it.
 */
const STABLE_IDENTIFIER = /\b(?:v\d+(?:\.\d+)*|[A-Z]{2,}\d*|[A-Za-z][A-Za-z0-9]*[._-][A-Za-z0-9._-]+|[A-Za-z]+\d+)\b/gu;

/** Two labels this close read as the same row in a list. */
const SIBLING_CONFUSION_SIMILARITY = 0.62;
/** How much worse than the deterministic label is worth refusing. */
const SIBLING_DISTINCTNESS_MARGIN = 0.12;

export function normalizeLabelInput(input: SemanticLabelInput): NormalizedLabelInput {
  // Line structure survives normalization because a heading, a list, and a
  // spoken run-on are different material; only horizontal runs collapse.
  const text = normalizeMaterialText(input.text ?? "");
  const locale = normalizeLocale(input.locale);
  const context = input.context ?? {};
  const siblingLabels = Object.freeze(
    (context.siblingLabels ?? [])
      .map((label) => collapseWhitespace(label))
      .filter((label) => label.length > 0)
      .slice(0, MAX_SIBLING_LABELS),
  );
  const parentExcerpt = trimToCodeUnits(
    collapseWhitespace(context.parentExcerpt ?? ""),
    MAX_PARENT_EXCERPT_CODE_UNITS,
  );
  const parentLabel = collapseWhitespace(context.parentLabel ?? "");
  return Object.freeze({
    text,
    locale,
    maxGraphemes: resolveMaxGraphemes(text, input.maxGraphemes),
    context: Object.freeze({
      parentLabel: parentLabel.length === 0 ? null : parentLabel,
      parentExcerpt: parentExcerpt.length === 0 ? null : parentExcerpt,
      siblingLabels,
    }),
  });
}

/**
 * Produces the label a person sees immediately after a thought is admitted.
 * It is synchronous, deterministic, and always defined: when no compression
 * candidate validates, the existing material title becomes the floor.
 */
export function deriveProvisionalLabel(input: NormalizedLabelInput): ProvisionalLabel {
  const best = rankCandidates(input)[0];
  if (best !== undefined) return best;

  // Nothing validated. Prefer a bounded excerpt of the material itself over the
  // longer material title, and only then the fixed empty-material name.
  const excerpt = fitToBound(input.text, input);
  const fallback = excerpt.length > 0 ? excerpt : hardFit(deriveMaterialTitle(input.text), input);
  return Object.freeze({
    text: fallback.length === 0 ? "Untitled thought" : fallback,
    kind: "material-title",
    score: 0,
  });
}

/** Every ranked candidate, best first. Exposed for evaluation and tests. */
export function deriveLabelCandidates(input: NormalizedLabelInput): readonly ProvisionalLabel[] {
  return rankCandidates(input);
}

export function validateSemanticLabel(
  value: string,
  options: SemanticLabelValidationOptions = {},
): SemanticLabelValidation {
  const maxGraphemes = clampBound(options.maxGraphemes ?? MAX_SEMANTIC_LABEL_GRAPHEMES);
  const label = collapseWhitespace(value);
  if (label.length === 0) return reject("EMPTY");
  // Control characters would corrupt a row; markup would leak authoring syntax
  // into a name that is rendered as plain text.
  if (/[\u0000-\u001F\u007F]/u.test(value)) return reject("MARKUP");
  // `·` only ever appears as a synthetic keyword separator, never as language.
  if (/[`*_~<>[\]{}|\\·]|^["'“”‘’]|["'“”‘’]$/u.test(label)) return reject("MARKUP");
  if (/^#{1,6}\s/u.test(label)) return reject("MARKUP");
  if (/[。．.!！?？,，、；;：:…]$/u.test(label)) return reject("TERMINAL_PUNCTUATION");
  if (graphemeCount(label) > maxGraphemes) return reject("TOO_LONG");
  if (GENERIC_ONLY.test(label)) return reject("GENERIC");
  if (labelCollidesWithSibling(label, options.siblingLabels ?? [])) {
    return reject("SIBLING_DUPLICATE");
  }
  return Object.freeze({ ok: true, label });
}

/**
 * Decides whether a syntactically valid model label may replace the
 * deterministic one. A prettier label that loses grounding, an identifier, or
 * distinctiveness is worse than the label it would overwrite.
 */
export function adjudicateModelLabel(
  input: NormalizedLabelInput,
  provisional: string,
  candidate: string,
): SemanticLabelAdjudication {
  const reasons: LabelAdjudicationReason[] = [];
  if (!isGroundedInMaterial(candidate, input)) reasons.push("not-grounded-in-material");
  if (dropsStableIdentifier(provisional, candidate, input.text)) {
    reasons.push("drops-a-stable-identifier");
  }
  // The deterministic label is often a long clause, which is distinct by
  // accident rather than by design. Requiring a model answer to beat it
  // outright refuses good short names, so only a materially worse answer that
  // is genuinely close to a sibling is refused.
  const siblings = input.context.siblingLabels;
  if (siblings.length > 0) {
    const candidateSimilarity = maximumSimilarity(candidate, siblings);
    if (
      candidateSimilarity >= SIBLING_CONFUSION_SIMILARITY &&
      candidateSimilarity > maximumSimilarity(provisional, siblings) + SIBLING_DISTINCTNESS_MARGIN
    ) {
      reasons.push("less-distinct-than-provisional");
    }
  }
  return reasons.length === 0
    ? Object.freeze({ ok: true })
    : Object.freeze({ ok: false, reasons: Object.freeze(reasons) });
}

/**
 * Gates the network. Short, clean, already-distinct material keeps its
 * deterministic label and costs nothing; the model is asked only where
 * compression is genuinely hard.
 */
export function decideModelRequest(
  input: NormalizedLabelInput,
  provisional: ProvisionalLabel,
): ModelRequestDecision {
  if (labelCollidesWithSibling(provisional.text, input.context.siblingLabels)) {
    return decision(true, "provisional-collides-with-a-sibling");
  }
  if (CONTEXT_DEPENDENT.test(input.text)) return decision(true, "material-depends-on-context");
  if (SPOKEN_DISFLUENCY.test(input.text)) return decision(true, "material-is-spoken");
  if (provisional.kind === "already-compact" || provisional.kind === "heading") {
    return decision(false, "provisional-is-sufficient");
  }
  if (graphemeCount(input.text) > input.maxGraphemes * 2) return decision(true, "material-is-long");
  if (splitClauses(input.text).length >= 3) return decision(true, "material-has-many-clauses");
  if (provisional.kind === "material-title" || provisional.score < 4) {
    return decision(true, "provisional-is-weak");
  }
  return decision(false, "provisional-is-sufficient");
}

/**
 * A stable, non-cryptographic key over everything that can change a label.
 * Two 32-bit FNV-1a lanes plus the byte length give a 72-bit key without
 * pulling in WebCrypto, which is unavailable synchronously and on insecure
 * origins. It is a cache key, never an integrity or authentication value, and
 * it never carries node text into a shared namespace.
 */
export function labelFingerprint(
  input: NormalizedLabelInput,
  promptVersion: string = SEMANTIC_LABEL_PROMPT_VERSION,
): string {
  return fingerprint([
    promptVersion,
    input.locale,
    input.maxGraphemes,
    input.text,
    input.context.parentLabel,
    input.context.parentExcerpt,
    input.context.siblingLabels,
  ]);
}

/**
 * Identifies the material a label was derived from, deliberately excluding
 * reference context.
 *
 * Context must not participate: a parent's label is itself derived, so folding
 * it into the identity of a child's label makes labelling a fixpoint problem —
 * naming a parent would invalidate its children, whose new names would then
 * invalidate their siblings. Material identity is stable, so labelling
 * terminates.
 */
export function materialFingerprint(
  input: NormalizedLabelInput,
  promptVersion: string = SEMANTIC_LABEL_PROMPT_VERSION,
): string {
  return fingerprint([promptVersion, input.locale, input.maxGraphemes, input.text]);
}

function fingerprint(parts: readonly unknown[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  let forward = 0x811c9dc5;
  let reverse = 0x01000193;
  for (let index = 0; index < bytes.length; index += 1) {
    forward = Math.imul(forward ^ (bytes[index] as number), 0x01000193) >>> 0;
    const mirrored = bytes[bytes.length - 1 - index] as number;
    reverse = Math.imul(reverse ^ mirrored, 0x811c9dc5) >>> 0;
  }
  return `${forward.toString(16).padStart(8, "0")}${reverse.toString(16).padStart(8, "0")}${bytes.length.toString(16)}`;
}

export function graphemeCount(value: string): number {
  return Array.from(GRAPHEME_SEGMENTER.segment(value)).length;
}

export function isMostlyHan(value: string): boolean {
  const letters = value.match(/[\p{L}\p{N}]/gu) ?? [];
  if (letters.length === 0) return false;
  const han = letters.filter((letter) => HAN_SCRIPTS.test(letter)).length;
  return han * 2 >= letters.length;
}

/** Dice coefficient over normalized character bigrams; 1 means identical. */
export function labelSimilarity(left: string, right: string): number {
  const leftKey = comparisonKey(left);
  const rightKey = comparisonKey(right);
  if (leftKey.length === 0 || rightKey.length === 0) return 0;
  if (leftKey === rightKey) return 1;
  const leftGrams = bigrams(leftKey);
  const rightGrams = bigrams(rightKey);
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;
  let shared = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared += 1;
  return (2 * shared) / (leftGrams.size + rightGrams.size);
}

function rankCandidates(input: NormalizedLabelInput): readonly ProvisionalLabel[] {
  const candidates = new Map<string, ProvisionalLabel>();
  const cleaned = stripOpening(input.text);

  if (isAlreadyCompact(input, cleaned)) {
    addCandidate(candidates, cleaned, "already-compact", input);
  }
  addCandidate(candidates, firstHeading(input.text), "heading", input);

  const contrast = contrastTail(input.text);
  addCandidate(candidates, contrast, "contrast", input);
  addCandidate(candidates, keyphrase(contrast, input), "keyphrase", input);

  const conclusion = conclusionClause(input.text);
  addCandidate(candidates, conclusion, "conclusion", input);
  addCandidate(candidates, keyphrase(conclusion, input), "keyphrase", input);

  addCandidate(candidates, questionSentence(input.text), "question", input);

  const informative = bestClause(input);
  addCandidate(candidates, informative, "informative-clause", input);
  addCandidate(candidates, keyphrase(informative ?? cleaned, input), "keyphrase", input);

  addCandidate(candidates, deriveMaterialTitle(input.text), "material-title", input);

  return Object.freeze(
    Array.from(candidates.values()).sort(
      (left, right) =>
        right.score - left.score || graphemeCount(left.text) - graphemeCount(right.text),
    ),
  );
}

function addCandidate(
  target: Map<string, ProvisionalLabel>,
  raw: string | null | undefined,
  kind: LabelCandidateKind,
  input: NormalizedLabelInput,
): void {
  if (raw === null || raw === undefined) return;
  const text = fitToBound(raw, input);
  if (text.length === 0) return;
  const validation = validateSemanticLabel(text, {
    locale: input.locale,
    maxGraphemes: input.maxGraphemes,
  });
  if (!validation.ok) return;

  const score = scoreCandidate(validation.label, kind, input);
  const existing = target.get(validation.label);
  if (existing === undefined || score > existing.score) {
    target.set(validation.label, Object.freeze({ text: validation.label, kind, score }));
  }
}

function scoreCandidate(
  candidate: string,
  kind: LabelCandidateKind,
  input: NormalizedLabelInput,
): number {
  const length = graphemeCount(candidate);
  const target = Math.min(
    input.maxGraphemes,
    isMostlyHan(candidate)
      ? (KANA.test(candidate) ? KANA_TARGET_GRAPHEMES : HAN_TARGET_GRAPHEMES)
      : LATIN_TARGET_GRAPHEMES,
  );
  let score = contentDensity(candidate) * 5;
  score += Math.max(0, 2 - Math.abs(length - target) * 0.24);
  score += KIND_BONUS[kind];
  if (GENERIC_ONLY.test(candidate)) score -= 4;
  if (CONTEXT_DEPENDENT.test(candidate)) score -= 1.5;
  if (length < 2) score -= 4;
  // A grounded version, protocol, or product identifier carries more naming
  // information than a generic trailing clause and must never lose merely
  // because Han and Latin use different length targets.
  score += stableIdentifiers(candidate).length * 1.4;

  // Brevity is a weight, not a veto.
  //
  // The penalty rises smoothly as a candidate falls below a comfortable
  // phrase, so a short label is unusual rather than impossible: a three-
  // character answer that is dense, salient, and unlike its siblings can still
  // out-score a limp long one, and a short one that is merely a topic word
  // cannot. A step function made short labels unreachable; a random draw would
  // be worse still, because an unchanged node must never rename itself.
  //
  // Material that was already this short is exempt: those are its own words.
  if (kind !== "already-compact" && kind !== "heading") {
    const scale = isMostlyHan(candidate) ? (KANA.test(candidate) ? 1.4 : 1) : 2.4;
    const comfortable = HAN_SHORT_GRAPHEMES * scale;
    const shortfall = Math.max(0, comfortable - length) / comfortable;
    score -= shortfall * SHORT_LABEL_WEIGHT;
  }

  const similarity = maximumSimilarity(candidate, input.context.siblingLabels);
  if (similarity >= 0.82) score -= 3;
  else if (similarity >= 0.55) score -= 1.2;
  return score;
}

const KIND_BONUS: Readonly<Record<LabelCandidateKind, number>> = Object.freeze({
  "already-compact": 2,
  heading: 2.2,
  contrast: 1.6,
  conclusion: 1.6,
  question: 2,
  "informative-clause": 1,
  // Keyphrase compression discards the language that made the thought
  // recognisable, so it wins only when nothing longer survives the bound.
  keyphrase: 0.2,
  "material-title": 0.2,
});

function isAlreadyCompact(input: NormalizedLabelInput, cleaned: string): boolean {
  if (graphemeCount(cleaned) > input.maxGraphemes) return false;
  if (splitClauses(cleaned).length > 1) return false;
  if (SPOKEN_DISFLUENCY.test(input.text) || CONTEXT_DEPENDENT.test(cleaned)) return false;
  return contentDensity(cleaned) >= 0.6;
}

function firstHeading(text: string): string | null {
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (match?.[1] !== undefined) return match[1];
    if (line.trim().length > 0) return null;
  }
  return null;
}

function contrastTail(text: string): string | null {
  const patterns = [
    /(?:并)?不是[^。．.!！?？\n]*?(?:而是|而在于)(.+?)(?=[。．.!！?？\n]|$)/u,
    /\bnot\s+.+?\s+but\s+(?:rather\s+)?(.+?)(?=[.!?\n]|$)/iu,
    /\brather than\s+.+?[,;:]\s*(.+?)(?=[.!?\n]|$)/iu,
  ];
  for (const pattern of patterns) {
    const tail = pattern.exec(text)?.[1]?.trim();
    if (tail !== undefined && tail.length > 0) return tail;
  }
  return null;
}

function conclusionClause(text: string): string | null {
  const patterns = [
    /(?:所以|因此|于是|这意味着|最终|关键(?:是|在于)|本质(?:是|上是))[，,：:\s]*(.+?)(?=[。．.!！?？\n]|$)/u,
    /\b(?:therefore|which means|the point is|the key is)\b[,:\s]+(.+?)(?=[.!?\n]|$)/iu,
  ];
  for (const pattern of patterns) {
    const result = pattern.exec(text)?.[1]?.trim();
    if (result !== undefined && result.length > 0) return result;
  }
  return null;
}

function questionSentence(text: string): string | null {
  for (const sentence of splitSentences(text)) {
    const cleaned = stripOpening(sentence);
    if (
      /[?？]\s*$/u.test(sentence) ||
      /^(?:为什么|为何|如何|怎么|怎样|能否|是否)/u.test(cleaned) ||
      /^(?:what|why|how|when|where|should|can|does|do)\b/iu.test(cleaned)
    ) {
      return sentence;
    }
  }
  return null;
}

function bestClause(input: NormalizedLabelInput): string | null {
  const clauses = splitSentences(input.text).flatMap((sentence) => splitClauses(sentence));
  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [index, clause] of clauses.entries()) {
    const score = clauseScore(clause, index);
    if (score > bestScore) {
      bestScore = score;
      best = clause;
    }
  }
  return best;
}

function clauseScore(clause: string, position: number): number {
  const clean = stripOpening(clause);
  const length = graphemeCount(clean);
  if (length === 0) return Number.NEGATIVE_INFINITY;
  let score = contentDensity(clean) * 4 + Math.min(2, length / 8) - position * 0.08;
  if (/^(?:因为|由于|然后|以及|还有|另外|但是|不过|所以说)/u.test(clean)) score -= 0.8;
  if (CONTEXT_DEPENDENT.test(clean)) score -= 1.1;
  if (GENERIC_ONLY.test(clean)) score -= 2;
  if (/(?:不是.+而是|关键|核心|本质|为什么|如何|怎样|意味着)/u.test(clean)) score += 0.8;
  return score;
}

function keyphrase(value: string | null, input: NormalizedLabelInput): string | null {
  if (value === null || isMostlyHan(value)) return null;
  return latinKeyphrase(value, input);
}

/**
 * Han has no keyphrase path.
 *
 * Removing function words from Han and rejoining what is left produces strings
 * nobody wrote — `只是的人来付` out of `只是这个代价通常由不制定秩序的那些人来付` —
 * which read as damage rather than as a name. Every other candidate reaches the
 * bound through a contiguous window instead, so the language always stays the
 * author's own. Latin keeps its keyphrase path because dropping `the` and `of`
 * leaves a phrase a person would actually write.
 */
function latinKeyphrase(value: string, input: NormalizedLabelInput): string | null {
  const tokens = latinWords(stripOpening(value)).filter(
    (token) => !LATIN_STOPWORDS.has(token.toLocaleLowerCase("und")),
  );
  if (tokens.length === 0) return null;
  const selected: string[] = [];
  for (const token of tokens) {
    const next = [...selected, token].join(" ");
    if (graphemeCount(next) > input.maxGraphemes) break;
    selected.push(token);
  }
  return selected.length === 0 ? null : selected.join(" ");
}

/**
 * Brings a candidate inside the length bound without inventing words. It only
 * removes material — fillers, low-information openers, and then whole units
 * from one end. It never rewrites or substitutes, because a rewrite the person
 * did not say is no longer their material.
 *
 * The surviving text stays contiguous. Concatenating disjoint chunks fits the
 * bound too, but it produces phrases nobody wrote and reads as broken language
 * in a list of names; a contiguous window always reads as an excerpt.
 */
function fitToBound(value: string, input: NormalizedLabelInput): string {
  const cleaned = stripOpening(value);
  if (cleaned.length === 0) return "";
  if (graphemeCount(cleaned) <= input.maxGraphemes) return cleaned;

  const trimmed = trimLowInformationEdges(cleaned);
  if (graphemeCount(trimmed) <= input.maxGraphemes) return trimmed;

  // An interrogative opener is the first thing a long question can afford to
  // lose: the remaining statement still names the same thought.
  const withoutOpener = trimmed
    .replace(HAN_INTERROGATIVE_OPENER, "")
    .replace(KANA_INTERROGATIVE_OPENER, "")
    .trim();
  if (withoutOpener.length > 0 && graphemeCount(withoutOpener) <= input.maxGraphemes) {
    return withoutOpener;
  }

  const source = withoutOpener.length === 0 ? trimmed : withoutOpener;
  const stableWindow = stableIdentifierWindow(source, input.maxGraphemes);
  if (stableWindow !== null) return stableWindow;
  const window = isMostlyHan(source)
    ? hanTailWindow(source, input.maxGraphemes)
    : latinHeadWindow(source, input.maxGraphemes);
  if (window === null) return "";
  const fitted = trimLowInformationEdges(stripOpening(window));
  return graphemeCount(fitted) <= input.maxGraphemes ? fitted : "";
}

/**
 * A version or protocol name is usually the identity of a technical thought,
 * not optional detail. Preserve the contiguous identifier run and use the
 * nearest grounded tail as its description instead of cutting through the
 * identifier to satisfy a Han-sized bound.
 */
function stableIdentifierWindow(value: string, maxGraphemes: number): string | null {
  const identifiers = Array.from(value.matchAll(STABLE_IDENTIFIER));
  if (identifiers.length === 0) return null;
  const first = identifiers[0];
  const last = identifiers[identifiers.length - 1];
  if (first?.index === undefined || last?.index === undefined) return null;
  const start = first.index;
  const end = last.index + last[0].length;
  const identity = value.slice(start, end).trim();
  if (identity.length === 0 || graphemeCount(identity) > maxGraphemes) return null;

  const right = trimLowInformationEdges(
    value.slice(end).replace(/^[\s的之，,、：:；;。．.!！?？]+/u, ""),
  );
  const rightUnit = splitClauses(right)[0] ?? "";
  if (rightUnit.length > 0) {
    const described = `${identity} ${rightUnit}`;
    if (graphemeCount(described) <= maxGraphemes) return described;
  }
  return identity;
}

/**
 * The last resort when no candidate survives. It may cut inside a word, which
 * is why every other path refuses to: a slightly broken name is still better
 * than an unnamed row, but only once nothing else is available.
 */
function hardFit(value: string, input: NormalizedLabelInput): string {
  const cleaned = stripOpening(value);
  if (cleaned.length === 0) return "";
  if (graphemeCount(cleaned) <= input.maxGraphemes) return cleaned;
  const units: string[] = [];
  for (const segment of GRAPHEME_SEGMENTER.segment(cleaned)) {
    if (units.length === input.maxGraphemes) break;
    units.push(segment.segment);
  }
  const cut = units.join("");
  // The cut may land on punctuation or a function edge; clean it, but never
  // return empty, because this path exists to guarantee a name.
  return trimLowInformationEdges(stripOpening(cut)) || stripOpening(cut) || cut;
}

/**
 * Han sentences carry the point at the end, so the surviving window is a
 * suffix. It grows one function-word boundary at a time rather than cutting at
 * an exact grapheme offset, because an exact cut lands inside a word.
 */
function hanTailWindow(value: string, maxGraphemes: number): string | null {
  if (graphemeCount(value) <= maxGraphemes) return value;
  const segments = hanSegments(value);
  const selected: string[] = [];
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const next = [segments[index] as string, ...selected];
    if (graphemeCount(next.join("")) > maxGraphemes) break;
    selected.unshift(segments[index] as string);
  }
  // Every boundary-aligned window is still too long. Han has no space to cut
  // on, so any further cut would land inside a word; the candidate is dropped
  // instead, and a shorter candidate from elsewhere wins the ranking.
  return selected.length > 0 ? selected.join("") : null;
}

/** Splits after each function word, keeping the function word on its left. */
function hanSegments(value: string): string[] {
  const segments: string[] = [];
  let cursor = 0;
  // Japanese needs its particles as boundaries too, and a mixed passage is
  // safest read with both sets.
  const boundary = KANA.test(value) ? KANA_FUNCTION_BOUNDARY : HAN_FUNCTION_BOUNDARY;
  boundary.lastIndex = 0;
  for (const match of value.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end > cursor) {
      segments.push(value.slice(cursor, end));
      cursor = end;
    }
  }
  if (cursor < value.length) segments.push(value.slice(cursor));
  return segments.length === 0 ? [value] : segments;
}

/**
 * Latin sentences carry the point at the front, so the surviving window is a
 * word-aligned prefix with any dangling function word removed.
 */
function latinHeadWindow(value: string, maxGraphemes: number): string {
  const tokens = value.split(/\s+/u).filter((token) => token.length > 0);
  while (tokens.length > 1 && isLatinStopword(tokens[0] as string)) tokens.shift();
  const selected: string[] = [];
  for (const token of tokens) {
    if (graphemeCount([...selected, token].join(" ")) > maxGraphemes) break;
    selected.push(token);
  }
  while (selected.length > 1 && isLatinStopword(selected[selected.length - 1] as string)) {
    selected.pop();
  }
  if (selected.length > 0) return selected.join(" ");
  return Array.from(value).slice(0, maxGraphemes).join("");
}

function isLatinStopword(token: string): boolean {
  return LATIN_STOPWORDS.has(token.replace(/[^\p{L}\p{N}]+/gu, "").toLocaleLowerCase("und"));
}

function stripOpening(value: string): string {
  let result = collapseWhitespace(value);
  for (let pass = 0; pass < 8; pass += 1) {
    const before = result;
    for (const pattern of LEADING_FILLERS) result = result.replace(pattern, "").trim();
    if (result === before) break;
  }
  for (const pattern of LEADING_INTENT) {
    const next = result.replace(pattern, "").trim();
    if (graphemeCount(next) >= 2) result = next;
  }
  return result
    .replace(/^[，,、：:；;。．.!！?？\s]+/u, "")
    .replace(/[，,、：:；;。．.!！?？\s]+$/u, "")
    .trim();
}

function trimLowInformationEdges(value: string): string {
  let result = value.trim();
  result = result.replace(/^是(?!非)(?=.{5,})/u, "");
  for (let pass = 0; pass < 4; pass += 1) {
    const before = result;
    for (const token of LOW_INFORMATION_PREFIX) {
      // Stripping down to three characters trades a phrase for a topic word,
      // which is the failure this whole module exists to avoid.
      if (result.startsWith(token) && graphemeCount(result.slice(token.length)) >= 5) {
        result = result.slice(token.length).trim();
      }
    }
    if (result === before) break;
  }
  const withoutHanEdges = result.replace(HAN_FUNCTION_EDGE, "").trim();
  return KANA.test(withoutHanEdges)
    ? withoutHanEdges.replace(KANA_FUNCTION_EDGE, "").trim()
    : withoutHanEdges;
}

function contentDensity(value: string): number {
  const units = Array.from(value);
  if (units.length === 0) return 0;
  const content = value.match(/[\p{L}\p{N}]/gu) ?? [];
  return Math.min(1, content.length / units.length);
}

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_BREAK)
    .flatMap((part) => part.split(SENTENCE_BREAK))
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function latinWords(value: string): string[] {
  return Array.from(value.matchAll(LATIN_WORD), (match) => match[0]);
}

/**
 * Grounding asks whether the material supports the label, not whether the
 * label is a quotation from it.
 *
 * Han is measured per character, not per bigram. A bigram measure looks
 * stricter but is wrong here: recombining words the person did use — `过去` and
 * `想象` into `过去允许想象` — produces adjacent pairs that never occurred, and
 * refusing that refuses exactly the compression a model is asked for. A label
 * that mostly does not occur in the material still fails, which is what an
 * invented topic looks like; a two-character paraphrase inside an otherwise
 * grounded label does not, because inference is what a name is for.
 *
 * Latin keeps a word-level rule: word boundaries exist, so an introduced word
 * is unambiguous.
 */
function isGroundedInMaterial(candidate: string, input: NormalizedLabelInput): boolean {
  const source = comparisonKey(
    `${input.text} ${input.context.parentLabel ?? ""} ${input.context.parentExcerpt ?? ""}`,
  );
  const key = comparisonKey(candidate);
  if (source.length === 0 || key.length === 0) return false;
  if (source.includes(key)) return true;

  // Each token is judged by its own script, not the label's majority script.
  // `token 语义不变` is one Latin word and one Han run; checking the Han run as
  // though it were a word asks whether that exact string occurs, which no
  // paraphrase ever does.
  for (const token of latinWords(candidate)) {
    if (HAN_SCRIPTS.test(token)) {
      if (!hanRunIsGrounded(token, source)) return false;
      continue;
    }
    const word = token.toLocaleLowerCase("und");
    if (LATIN_STOPWORDS.has(word)) continue;
    if (!source.includes(word)) return false;
  }
  return true;
}

/**
 * A Han run is grounded when most of its characters occur in the material.
 * The threshold has to tolerate paraphrase — `没有算过` becomes `未计算`, and
 * the thought is unchanged — while still rejecting an introduced topic, which
 * shares almost nothing. Measured on the corpus, faithful paraphrases sit at
 * 0.6 and above and invented topics at 0.4 and below.
 */
function hanRunIsGrounded(run: string, source: string): boolean {
  const units = Array.from(comparisonKey(run));
  if (units.length === 0) return true;
  let present = 0;
  for (const unit of units) if (source.includes(unit)) present += 1;
  return present * 10 >= units.length * 6;
}

function dropsStableIdentifier(provisional: string, candidate: string, text: string): boolean {
  const inCandidate = new Set(stableIdentifiers(candidate));
  for (const identifier of stableIdentifiers(provisional)) {
    if (!text.includes(identifier)) continue;
    if (!inCandidate.has(identifier)) return true;
  }
  return false;
}

function stableIdentifiers(value: string): string[] {
  return Array.from(value.matchAll(STABLE_IDENTIFIER), (match) => match[0]);
}

function labelCollidesWithSibling(label: string, siblings: readonly string[]): boolean {
  return maximumSimilarity(label, siblings) >= 0.94;
}

function maximumSimilarity(label: string, siblings: readonly string[]): number {
  let maximum = 0;
  for (const sibling of siblings) {
    maximum = Math.max(maximum, labelSimilarity(label, sibling));
    if (maximum === 1) break;
  }
  return maximum;
}

function comparisonKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value: string): Set<string> {
  const units = Array.from(value);
  const grams = new Set<string>();
  if (units.length === 1) {
    grams.add(units[0] as string);
    return grams;
  }
  for (let index = 0; index + 1 < units.length; index += 1) {
    grams.add(`${units[index]}${units[index + 1]}`);
  }
  return grams;
}

function collapseWhitespace(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeMaterialText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/\n{2,}/gu, "\n")
    .trim();
}

function trimToCodeUnits(value: string, maxCodeUnits: number): string {
  if (value.length <= maxCodeUnits) return value;
  const sliced = value.slice(0, maxCodeUnits);
  // Never split a surrogate pair; a lone surrogate is not valid text on the wire.
  return /[\uD800-\uDBFF]$/u.test(sliced) ? sliced.slice(0, -1) : sliced;
}

function resolveMaxGraphemes(text: string, requested: number | undefined): number {
  if (requested !== undefined) return clampBound(requested);
  if (!isMostlyHan(text)) return MAX_SEMANTIC_LABEL_GRAPHEMES;
  // Han packs a name into fewer graphemes than Latin, but not as few as a tag:
  // 14 is roughly one clause, which is what a person recognises. Japanese
  // spends graphemes on kana inflection, so the same clause needs more room.
  return KANA.test(text) ? 20 : 14;
}

function clampBound(value: number): number {
  if (!Number.isSafeInteger(value)) return MAX_SEMANTIC_LABEL_GRAPHEMES;
  return Math.min(MAX_SEMANTIC_LABEL_GRAPHEMES, Math.max(2, value));
}

function normalizeLocale(value: string | undefined): string {
  return value !== undefined && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
    ? value
    : "zh-CN";
}

function decision(request: boolean, reason: ModelRequestReason): ModelRequestDecision {
  return Object.freeze({ request, reason });
}

function reject(code: LabelRejectionCode): SemanticLabelValidation {
  return Object.freeze({ ok: false, code });
}
