import {
  MAX_WIKI_APPLICABLE_CODE_POINTS,
  MAX_WIKI_APPLICABLE_RULES,
  MAX_WIKI_CANONICAL_CODE_POINTS,
  MAX_WIKI_FORM_CODE_POINTS,
  type WikiBoundary,
  type WikiChannel,
  type WikiMatchRule,
} from "./wiki-model";
import {
  MATTER_LOCALES,
  isMatterLocale,
  type MatterLocale,
} from "../config/locales";

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", {
  granularity: "grapheme",
});
const ASCII_CONTROL = /[\u0000-\u001f\u007f]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

export const MAX_COMPILED_WIKI_RULES = MAX_WIKI_APPLICABLE_RULES;
export const MAX_COMPILED_WIKI_CODE_POINTS = MAX_WIKI_APPLICABLE_CODE_POINTS;

export type CompiledWikiRule = Readonly<{
  locale: MatterLocale;
  channel: WikiChannel;
  boundary: WikiBoundary;
  form: string;
  canonical: string;
  sourceIndex: number;
  graphemeLength: number;
}>;

export type CompiledWikiTrieNode = Readonly<{
  edges: Readonly<Record<string, number>>;
  terminalRuleIndex: number | null;
}>;

export type CompiledWikiView = Readonly<{
  nodes: readonly CompiledWikiTrieNode[];
  ruleCount: number;
  maxFormGraphemes: number;
}>;

export type CompiledWikiSnapshot = Readonly<{
  generation: number;
  rules: readonly CompiledWikiRule[];
  views: Readonly<Record<
    MatterLocale,
    Readonly<Record<WikiChannel, CompiledWikiView>>
  >>;
  stats: Readonly<{
    ruleCount: number;
    trieNodeCount: number;
    totalCodePoints: number;
  }>;
}>;

export type WikiCompileIssueCode =
  | "INVALID_GENERATION"
  | "TOO_MANY_RULES"
  | "INVALID_RULE"
  | "CONFLICT"
  | "CORPUS_TOO_LARGE";

export type WikiCompileIssue = Readonly<{
  code: WikiCompileIssueCode;
  ruleIndexes: readonly number[];
  message: string;
}>;

export type CompileWikiResult =
  | Readonly<{ ok: true; snapshot: CompiledWikiSnapshot }>
  | Readonly<{ ok: false; issues: readonly WikiCompileIssue[] }>;

type CandidateRule = Omit<CompiledWikiRule, "graphemeLength">;

type MutableTrieNode = {
  edges: Map<string, number>;
  terminalRuleIndex: number | null;
};

/**
 * Compiles the already-applicable rules projected by Wiki evidence policy.
 * Authority, provenance, and score are deliberately absent from match order.
 */
export function compileWikiRules(
  rules: readonly WikiMatchRule[],
  generation: number,
): CompileWikiResult {
  const issues: WikiCompileIssue[] = [];
  if (!Number.isSafeInteger(generation) || generation < 0) {
    issues.push(issue(
      "INVALID_GENERATION",
      [],
      "Wiki generation must be a non-negative safe integer.",
    ));
  }
  if (rules.length > MAX_COMPILED_WIKI_RULES) {
    issues.push(issue(
      "TOO_MANY_RULES",
      [],
      `A compiled Wiki may contain at most ${MAX_COMPILED_WIKI_RULES} rules.`,
    ));
  }

  // Stop before traversing an attacker-controlled collection beyond its hard
  // bound. The caller can surface both collection and generation failures.
  if (issues.some((candidate) => candidate.code === "TOO_MANY_RULES")) {
    return failure(issues);
  }

  const candidates: CandidateRule[] = [];
  for (let sourceIndex = 0; sourceIndex < rules.length; sourceIndex += 1) {
    const rule = rules[sourceIndex];
    if (!isCompilableWikiRule(rule)) {
      issues.push(issue(
        "INVALID_RULE",
        [sourceIndex],
        "A compiled Wiki rule violates its text, channel, boundary, or identity invariant.",
      ));
      continue;
    }
    candidates.push(Object.freeze({
      locale: rule.locale,
      channel: rule.channel,
      boundary: rule.boundary,
      form: rule.form,
      canonical: rule.canonical,
      sourceIndex,
    }));
  }

  const grouped = new Map<string, CandidateRule[]>();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.locale, candidate.channel, candidate.form]);
    const group = grouped.get(key);
    if (group === undefined) grouped.set(key, [candidate]);
    else group.push(candidate);
  }

  const distinct: CandidateRule[] = [];
  for (const key of [...grouped.keys()].sort(compareText)) {
    const group = grouped.get(key) ?? [];
    const descriptors = new Map<string, CandidateRule[]>();
    for (const candidate of group) {
      const descriptor = JSON.stringify([candidate.boundary, candidate.canonical]);
      const matches = descriptors.get(descriptor);
      if (matches === undefined) descriptors.set(descriptor, [candidate]);
      else matches.push(candidate);
    }
    if (descriptors.size > 1) {
      issues.push(issue(
        "CONFLICT",
        group.map((candidate) => candidate.sourceIndex).sort(compareNumber),
        "One Wiki locale, channel, and form cannot resolve to multiple boundaries or canonical forms.",
      ));
      continue;
    }
    const duplicates = [...descriptors.values()][0] ?? [];
    const representative = duplicates.reduce((left, right) =>
      left.sourceIndex <= right.sourceIndex ? left : right);
    distinct.push(representative);
  }

  distinct.sort(compareCandidate);
  const totalCodePoints = distinct.reduce(
    (sum, rule) => sum + codePointLength(rule.form) + codePointLength(rule.canonical),
    0,
  );
  if (totalCodePoints > MAX_COMPILED_WIKI_CODE_POINTS) {
    issues.push(issue(
      "CORPUS_TOO_LARGE",
      [],
      `A compiled Wiki may contain at most ${MAX_COMPILED_WIKI_CODE_POINTS} code points.`,
    ));
  }

  if (issues.length > 0) return failure(issues);

  const compiledRules = Object.freeze(distinct.map((rule) => {
    const graphemeLength = graphemes(rule.form).length;
    // The model invariant already bounds code points. This assertion keeps a
    // malformed platform segmenter result from creating an unbounded matcher.
    if (graphemeLength < 1 || graphemeLength > MAX_WIKI_FORM_CODE_POINTS) {
      throw new Error("A valid Wiki form produced an invalid grapheme count.");
    }
    return Object.freeze({ ...rule, graphemeLength });
  }));

  const views = Object.freeze(Object.fromEntries(MATTER_LOCALES.map((locale) => [
    locale,
    Object.freeze({
      spoken: compileView(compiledRules, locale, "spoken"),
      written: compileView(compiledRules, locale, "written"),
    }),
  ])) as Record<MatterLocale, Readonly<Record<WikiChannel, CompiledWikiView>>>);
  const trieNodeCount = MATTER_LOCALES.reduce(
    (sum, locale) => sum + views[locale].spoken.nodes.length + views[locale].written.nodes.length,
    0,
  );
  return Object.freeze({
    ok: true,
    snapshot: Object.freeze({
      generation,
      rules: compiledRules,
      views,
      stats: Object.freeze({
        ruleCount: compiledRules.length,
        trieNodeCount,
        totalCodePoints,
      }),
    }),
  });
}

function compileView(
  rules: readonly CompiledWikiRule[],
  locale: MatterLocale,
  channel: WikiChannel,
): CompiledWikiView {
  const nodes: MutableTrieNode[] = [{ edges: new Map(), terminalRuleIndex: null }];
  let ruleCount = 0;
  let maxFormGraphemes = 0;

  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
    const rule = rules[ruleIndex];
    if (rule.locale !== locale || rule.channel !== channel) continue;
    ruleCount += 1;
    maxFormGraphemes = Math.max(maxFormGraphemes, rule.graphemeLength);
    let nodeIndex = 0;
    for (const grapheme of graphemes(rule.form)) {
      const next = nodes[nodeIndex].edges.get(grapheme);
      if (next !== undefined) {
        nodeIndex = next;
        continue;
      }
      const created = nodes.length;
      nodes.push({ edges: new Map(), terminalRuleIndex: null });
      nodes[nodeIndex].edges.set(grapheme, created);
      nodeIndex = created;
    }
    nodes[nodeIndex].terminalRuleIndex = ruleIndex;
  }

  const frozenNodes = Object.freeze(nodes.map((node) => {
    const edges: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [grapheme, nodeIndex] of [...node.edges].sort(([left], [right]) =>
      compareText(left, right))) {
      edges[grapheme] = nodeIndex;
    }
    return Object.freeze({
      edges: Object.freeze(edges),
      terminalRuleIndex: node.terminalRuleIndex,
    });
  }));

  return Object.freeze({ nodes: frozenNodes, ruleCount, maxFormGraphemes });
}

function graphemes(value: string): string[] {
  return Array.from(GRAPHEME_SEGMENTER.segment(value), ({ segment }) => segment);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isCompilableWikiRule(rule: WikiMatchRule): boolean {
  return isMatterLocale(rule.locale) &&
    (rule.channel === "spoken" || rule.channel === "written") &&
    (rule.boundary === "literal" || rule.boundary === "word") &&
    isBoundedWikiText(rule.form, MAX_WIKI_FORM_CODE_POINTS) &&
    isBoundedWikiText(rule.canonical, MAX_WIKI_CANONICAL_CODE_POINTS) &&
    rule.form !== rule.canonical;
}

function isBoundedWikiText(value: unknown, maximumCodePoints: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    !LONE_SURROGATE.test(value) &&
    !ASCII_CONTROL.test(value) &&
    value.trim() === value &&
    value.normalize("NFC") === value &&
    codePointLength(value) <= maximumCodePoints;
}

function compareCandidate(left: CandidateRule, right: CandidateRule): number {
  return compareText(left.locale, right.locale) ||
    compareText(left.channel, right.channel) ||
    compareText(left.form, right.form) ||
    compareText(left.canonical, right.canonical) ||
    compareText(left.boundary, right.boundary) ||
    compareNumber(left.sourceIndex, right.sourceIndex);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareNumber(left: number, right: number): number {
  return left - right;
}

function issue(
  code: WikiCompileIssueCode,
  ruleIndexes: readonly number[],
  message: string,
): WikiCompileIssue {
  return Object.freeze({ code, ruleIndexes: Object.freeze([...ruleIndexes]), message });
}

function failure(issues: readonly WikiCompileIssue[]): CompileWikiResult {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}
