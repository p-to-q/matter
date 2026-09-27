import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MatterLocale } from "../../../features/matter/config/locales";
import {
  applyWikiEvent,
  applyWikiObservationBatch,
  createEmptyWikiState,
  createWikiProjectionPolicy,
  projectApplicableWikiRules,
} from "../../../features/matter/wiki/wiki-evidence";
import {
  MAX_WIKI_LEARNING_QUIET_TURNS,
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  WIKI_ALIAS_SCORE_POLICY,
  WIKI_LEARNING_POLICY_VERSION,
  WIKI_TERM_PRODUCER_WEIGHTS,
  WIKI_TERM_SCORE_POLICY,
  type WikiAliasEvidenceProducer,
  type WikiLearningReplayEnvironment,
  type WikiTermEvidenceProducer,
} from "../../../features/matter/wiki/wiki-learning-policy";
import {
  WIKI_SCORING_VERSION,
  type WikiBoundary,
  type WikiChannel,
  type WikiMatchRule,
  type WikiObservationDispositions,
  type WikiObserveEvidenceEvent,
  type WikiState,
} from "../../../features/matter/wiki/wiki-model";
import { digestWikiProducerArtifact } from
  "../../../features/matter/wiki/wiki-producer-qualification";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "../../../features/matter/wiki/wiki-qualified-producer-releases";
import type { WikiQualifiedLearningPolicyRelease } from
  "../../../features/matter/wiki/wiki-qualified-learning-policy";

const ROOT = resolve(import.meta.dirname, "../../..");
const POLICY_SOURCE_FILES = Object.freeze([
  "features/matter/wiki/wiki-learning-policy.ts",
  "features/matter/wiki/wiki-evidence.ts",
  "features/matter/wiki/wiki-model.ts",
  "features/matter/wiki/wiki-invariants.ts",
  "features/matter/wiki/wiki-producer-qualification.ts",
  "features/matter/wiki/wiki-text-safety.ts",
  "features/matter/config/locales.ts",
  "features/matter/tree/unicode-text.ts",
]);

export const WIKI_LEARNING_POLICY_QUALIFICATION_VERSION = 1 as const;

type QualifiedPolicyConstants = Readonly<{
  maximumQuietTurns: number;
  aliasScorePolicy: typeof WIKI_ALIAS_SCORE_POLICY;
  termScorePolicy: typeof WIKI_TERM_SCORE_POLICY;
  aliasProducerWeights: typeof WIKI_ALIAS_PRODUCER_WEIGHTS;
  termProducerWeights: typeof WIKI_TERM_PRODUCER_WEIGHTS;
}>;

type ScenarioLexeme = Readonly<{
  locale: "en-US" | "zh-CN";
  canonical: string;
}>;

type AliasObservation = Readonly<{
  canonical: string;
}>;

type AliasTurn = Readonly<{
  environment: WikiLearningReplayEnvironment;
  observations: readonly AliasObservation[];
}>;

type TermTurn = Readonly<{
  environment: WikiLearningReplayEnvironment;
  observedCanonicalIds: readonly string[];
}>;

type ExpectedAliasEvidence = Readonly<{
  canonical: string;
  phase: "candidate" | "active";
  support: number;
  quietTurns: number;
}>;

type ExpectedTermEvidence = Readonly<{
  canonical: string;
  phase: "candidate" | "collected";
  support: number;
  quietTurns: number;
}>;

type ScenarioCheckpoint = Readonly<{
  afterTurn: number;
  aliasEvidence: readonly ExpectedAliasEvidence[];
  termEvidence: readonly ExpectedTermEvidence[];
  aggregateLexemes: readonly string[];
  qualifiedProjection: readonly string[];
  unqualifiedProjection: readonly string[];
}>;

type AliasScenario = Readonly<{
  scenarioId: string;
  kind: "alias";
  locale: ScenarioLexeme["locale"];
  channel: "spoken";
  boundary: "word";
  form: string;
  producer: WikiAliasEvidenceProducer;
  lexemes: readonly ScenarioLexeme[];
  turns: readonly AliasTurn[];
  checkpointTurns: readonly number[];
  expected: readonly ScenarioCheckpoint[];
}>;

type TermScenario = Readonly<{
  scenarioId: string;
  kind: "term";
  locale: ScenarioLexeme["locale"];
  producer: WikiTermEvidenceProducer;
  turns: readonly TermTurn[];
  checkpointTurns: readonly number[];
  expected: readonly ScenarioCheckpoint[];
}>;

export type WikiLearningPolicyQualificationScenario = AliasScenario | TermScenario;

export type WikiLearningPolicyScenarioResult = Readonly<{
  scenarioId: string;
  checkpoints: readonly ScenarioCheckpoint[];
}>;

export type WikiLearningPolicyQualificationRun = Readonly<{
  manifest: typeof WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST;
  results: readonly WikiLearningPolicyScenarioResult[];
  mismatchedScenarioIds: readonly string[];
  release: WikiQualifiedLearningPolicyRelease;
  qualified: boolean;
}>;

const POLICY_CONSTANTS: QualifiedPolicyConstants = Object.freeze({
  maximumQuietTurns: MAX_WIKI_LEARNING_QUIET_TURNS,
  aliasScorePolicy: WIKI_ALIAS_SCORE_POLICY,
  termScorePolicy: WIKI_TERM_SCORE_POLICY,
  aliasProducerWeights: WIKI_ALIAS_PRODUCER_WEIGHTS,
  termProducerWeights: WIKI_TERM_PRODUCER_WEIGHTS,
});

/**
 * The manifest owns both opportunities and expected outcomes. The runner may
 * report only what the production policy actually did; it cannot relabel a
 * failed result while generating a release receipt.
 */
export const WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST = Object.freeze({
  qualificationVersion: WIKI_LEARNING_POLICY_QUALIFICATION_VERSION,
  corpusVersion: "wiki-learning-policy-v3-corpus/1",
  policyVersion: WIKI_LEARNING_POLICY_VERSION,
  scoringVersion: WIKI_SCORING_VERSION,
  policyConstants: POLICY_CONSTANTS,
  scenarios: Object.freeze([
    aliasScenario({
      scenarioId: "exact-three-turn-activation",
      locale: "zh-CN",
      form: "才料",
      producer: "zh-exact-homophone-v1",
      lexemes: [lexeme("zh-CN", "材料")],
      turns: [humanAlias("材料"), humanAlias("材料"), humanAlias("材料")],
      checkpointTurns: [1, 2, 3],
      expected: [
        checkpoint(1, [aliasEvidence("材料", "candidate", 1, 0)]),
        checkpoint(2, [aliasEvidence("材料", "candidate", 2, 0)]),
        checkpoint(3, [aliasEvidence("材料", "active", 3, 0)], [], [], [
          actionId("zh-CN", "spoken", "word", "才料", "材料"),
        ]),
      ],
    }),
    aliasScenario({
      scenarioId: "restricted-four-turn-activation",
      locale: "zh-CN",
      form: "近音",
      producer: "zh-final-pair-v1",
      lexemes: [lexeme("zh-CN", "静音")],
      turns: [humanAlias("静音"), humanAlias("静音"), humanAlias("静音"),
        humanAlias("静音")],
      checkpointTurns: [3, 4],
      expected: [
        checkpoint(3, [aliasEvidence("静音", "candidate", 3, 0)]),
        checkpoint(4, [aliasEvidence("静音", "active", 4, 0)], [], [], [
          actionId("zh-CN", "spoken", "word", "近音", "静音"),
        ]),
      ],
    }),
    aliasScenario({
      scenarioId: "competition-margin-abstention",
      locale: "en-US",
      form: "Write",
      producer: "en-exact-homophone-v1",
      lexemes: [lexeme("en-US", "Right"), lexeme("en-US", "Rite")],
      turns: [humanAliases("Right", "Rite"), humanAliases("Right", "Rite"),
        humanAlias("Right")],
      checkpointTurns: [3],
      expected: [checkpoint(3, [
        aliasEvidence("Right", "candidate", 3, 0),
        aliasEvidence("Rite", "candidate", 2, 1),
      ])],
    }),
    aliasScenario({
      scenarioId: "quiet-decay-retention",
      locale: "zh-CN",
      form: "才料",
      producer: "zh-exact-homophone-v1",
      lexemes: [lexeme("zh-CN", "材料")],
      turns: [
        humanAlias("材料"),
        humanAlias("材料"),
        humanAlias("材料"),
        ...Array.from({ length: MAX_WIKI_LEARNING_QUIET_TURNS }, humanQuiet),
        humanQuiet(),
      ],
      checkpointTurns: [3, 34, 35],
      expected: [
        checkpoint(3, [aliasEvidence("材料", "active", 3, 0)], [], [], [
          actionId("zh-CN", "spoken", "word", "才料", "材料"),
        ]),
        checkpoint(34, [aliasEvidence("材料", "active", 3, 31)], [], [], [
          actionId("zh-CN", "spoken", "word", "才料", "材料"),
        ]),
        checkpoint(35, [aliasEvidence("材料", "candidate", 1, 0)]),
      ],
    }),
    termScenario({
      scenarioId: "broad-term-two-turn-collection",
      locale: "en-US",
      producer: "locale-segment-v1",
      turns: [humanTerm("morphogenesis"), humanTerm("morphogenesis")],
      checkpointTurns: [1, 2],
      expected: [
        checkpoint(1, [], [termEvidence("morphogenesis", "candidate", 1, 0)]),
        checkpoint(2, [], [termEvidence("morphogenesis", "collected", 2, 0)], [
          "morphogenesis",
        ]),
      ],
    }),
    aliasScenario({
      scenarioId: "non-human-zero-vote",
      locale: "en-US",
      form: "Englebart",
      producer: "en-exact-homophone-v1",
      lexemes: [lexeme("en-US", "Engelbart")],
      turns: [nonHumanAlias("generated-output", "Engelbart"),
        nonHumanAlias("protected-text", "Engelbart")],
      checkpointTurns: [1, 2],
      expected: [checkpoint(1), checkpoint(2)],
    }),
  ]),
});

/** Replays the controlled policy corpus and creates one compact release identity. */
export async function runWikiLearningPolicyQualification():
Promise<WikiLearningPolicyQualificationRun> {
  const results = WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.scenarios
    .map(runScenario);
  const mismatchedScenarioIds = results.flatMap((result, index) =>
    JSON.stringify(result.checkpoints) === JSON.stringify(
      WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.scenarios[index]?.expected,
    ) ? [] : [result.scenarioId]);
  const [policySourceDigest, corpusDigest, resultDigest,
    producerQualificationDigest] = await Promise.all([
    digestCombinedSource(POLICY_SOURCE_FILES),
    digestJson({
      qualificationVersion: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST
        .qualificationVersion,
      corpusVersion: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.corpusVersion,
      policyVersion: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.policyVersion,
      scoringVersion: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.scoringVersion,
      policyConstants: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.policyConstants,
      scenarios: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.scenarios,
    }),
    digestJson(results),
    digestJson(canonicalProducerQualifications()),
  ]);
  const release: WikiQualifiedLearningPolicyRelease = Object.freeze({
    qualificationVersion: WIKI_LEARNING_POLICY_QUALIFICATION_VERSION,
    policyVersion: WIKI_LEARNING_POLICY_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    policyConstants: POLICY_CONSTANTS,
    policySourceDigest,
    corpus: Object.freeze({
      corpusVersion: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.corpusVersion,
      corpusDigest,
      scenarioCount: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.scenarios.length,
    }),
    resultDigest,
    producerQualificationDigest,
  });
  return Object.freeze({
    manifest: WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST,
    results: Object.freeze(results),
    mismatchedScenarioIds: Object.freeze(mismatchedScenarioIds),
    release,
    qualified: mismatchedScenarioIds.length === 0,
  });
}

/** Hash inputs include every local module that contributes runtime values to
 * replay, validation, and release admission. */
export function readWikiLearningPolicyQualificationBytes(): Promise<Uint8Array> {
  return readCombinedSourceBytes(POLICY_SOURCE_FILES);
}

function runScenario(
  scenario: WikiLearningPolicyQualificationScenario,
): WikiLearningPolicyScenarioResult {
  let state = createEmptyWikiState();
  if (scenario.kind === "alias") {
    for (const item of scenario.lexemes) {
      const created = applyWikiEvent(state, {
        type: "create-lexeme",
        locale: item.locale,
        canonical: item.canonical,
        scope: "both",
      });
      if (!created.ok) throw new Error(created.error.message);
      state = created.state;
    }
  }

  const checkpointTurns = new Set(scenario.checkpointTurns);
  const checkpoints: ScenarioCheckpoint[] = [];
  scenario.turns.forEach((turn, index) => {
    const afterTurn = index + 1;
    const events = scenario.kind === "alias"
      ? aliasEvents(scenario, turn as AliasTurn)
      : termEvents(scenario, turn as TermTurn);
    const applied = applyWikiObservationBatch(
      state,
      events,
      dispositionsFor(turn, scenario.kind),
      qualifiedAliasProducers(),
    );
    if (!applied.ok) throw new Error(applied.error.message);
    state = applied.state;
    if (checkpointTurns.has(afterTurn)) checkpoints.push(snapshot(state, afterTurn));
  });
  return Object.freeze({
    scenarioId: scenario.scenarioId,
    checkpoints: Object.freeze(checkpoints),
  });
}

function aliasEvents(
  scenario: AliasScenario,
  turn: AliasTurn,
): readonly WikiObserveEvidenceEvent[] {
  return Object.freeze(turn.observations.map((observation) => Object.freeze({
    type: "observe-evidence" as const,
    source: "machine-inference" as const,
    locale: scenario.locale,
    channel: scenario.channel,
    boundary: scenario.boundary,
    form: scenario.form,
    canonical: observation.canonical,
    producer: scenario.producer,
  })));
}

function termEvents(
  scenario: TermScenario,
  turn: TermTurn,
): readonly WikiObserveEvidenceEvent[] {
  return Object.freeze(turn.observedCanonicalIds.map((canonical) => Object.freeze({
    type: "observe-evidence" as const,
    source: "recent-material" as const,
    locale: scenario.locale,
    canonical,
    producer: scenario.producer,
  })));
}

function dispositionsFor(
  turn: AliasTurn | TermTurn,
  kind: WikiLearningPolicyQualificationScenario["kind"],
): WikiObservationDispositions {
  if (turn.environment !== "human-admission") {
    return Object.freeze({ term: "censored", alias: "censored" });
  }
  if (kind === "alias") {
    const observed = (turn as AliasTurn).observations.length > 0;
    return Object.freeze({
      term: "paused",
      alias: observed ? "observed" : "quiet",
    });
  }
  const observed = (turn as TermTurn).observedCanonicalIds.length > 0;
  return Object.freeze({
    term: observed ? "observed" : "quiet",
    alias: "paused",
  });
}

function snapshot(state: WikiState, afterTurn: number): ScenarioCheckpoint {
  const lexemes = new Map(state.lexemes.map((entry) => [entry.id, entry]));
  const aliasRows = state.aliasEvidence.map((entry) => ({
    canonical: lexemes.get(entry.lexemeId)?.canonical ?? "",
    phase: entry.phase,
    support: entry.support,
    quietTurns: entry.quietTurns,
  })).sort(compareEvidence);
  const termRows = state.termEvidence.map((entry) => ({
    canonical: entry.canonical,
    phase: entry.phase,
    support: entry.support,
    quietTurns: entry.quietTurns,
  })).sort(compareEvidence);
  const aggregateLexemes = state.lexemes
    .filter((entry) => entry.provenance === "aggregate-evidence")
    .map((entry) => entry.canonical)
    .sort();
  const qualifiedProjection = projectApplicableWikiRules(
    state,
    createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES),
  ).map(projectedActionId).sort();
  const unqualifiedProjection = projectApplicableWikiRules(
    state,
    createWikiProjectionPolicy([]),
  ).map(projectedActionId).sort();
  return Object.freeze({
    afterTurn,
    aliasEvidence: Object.freeze(aliasRows),
    termEvidence: Object.freeze(termRows),
    aggregateLexemes: Object.freeze(aggregateLexemes),
    qualifiedProjection: Object.freeze(qualifiedProjection),
    unqualifiedProjection: Object.freeze(unqualifiedProjection),
  });
}

function projectedActionId(rule: WikiMatchRule): string {
  return actionId(rule.locale, rule.channel, rule.boundary, rule.form, rule.canonical);
}

function actionId(
  locale: MatterLocale,
  channel: WikiChannel,
  boundary: WikiBoundary,
  form: string,
  canonical: string,
): string {
  return `${locale}:${channel}:${boundary}:${form}=>${canonical}`;
}

function compareEvidence(
  left: ExpectedAliasEvidence | ExpectedTermEvidence,
  right: ExpectedAliasEvidence | ExpectedTermEvidence,
): number {
  return left.canonical.localeCompare(right.canonical);
}

function qualifiedAliasProducers(): ReadonlySet<WikiAliasEvidenceProducer> {
  return new Set(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.flatMap((release) =>
    Object.hasOwn(WIKI_ALIAS_PRODUCER_WEIGHTS, release.identity.producerId)
      ? [release.identity.producerId as WikiAliasEvidenceProducer]
      : []));
}

function canonicalProducerQualifications() {
  return [...MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES]
    .map((release) => ({
      qualificationVersion: release.qualificationVersion,
      identity: release.identity,
      corpus: release.corpus,
    }))
    .sort((left, right) =>
      left.identity.producerId.localeCompare(right.identity.producerId));
}

async function digestCombinedSource(files: readonly string[]): Promise<string> {
  return digestWikiProducerArtifact(await readCombinedSourceBytes(files));
}

async function readCombinedSourceBytes(files: readonly string[]): Promise<Uint8Array> {
  const chunks = await Promise.all(files.map(async (file) => {
    const bytes = await readFile(resolve(ROOT, file));
    return new TextEncoder().encode(`${file}\n${bytes.toString("utf8")}\n`);
  }));
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function digestJson(value: unknown): Promise<string> {
  return digestWikiProducerArtifact(new TextEncoder().encode(JSON.stringify(value)));
}

function aliasScenario(
  value: Omit<AliasScenario, "kind" | "channel" | "boundary">,
): AliasScenario {
  return Object.freeze({ ...value, kind: "alias", channel: "spoken", boundary: "word" });
}

function termScenario(
  value: Omit<TermScenario, "kind">,
): TermScenario {
  return Object.freeze({ ...value, kind: "term" });
}

function lexeme(locale: ScenarioLexeme["locale"], canonical: string): ScenarioLexeme {
  return Object.freeze({ locale, canonical });
}

function humanAlias(...canonicals: string[]): AliasTurn {
  return Object.freeze({
    environment: "human-admission",
    observations: Object.freeze(canonicals.map((canonical) => Object.freeze({ canonical }))),
  });
}

function humanAliases(...canonicals: string[]): AliasTurn {
  return humanAlias(...canonicals);
}

function humanQuiet(): AliasTurn {
  return humanAlias();
}

function nonHumanAlias(
  environment: "generated-output" | "protected-text",
  ...canonicals: string[]
): AliasTurn {
  return Object.freeze({
    environment,
    observations: Object.freeze(canonicals.map((canonical) => Object.freeze({ canonical }))),
  });
}

function humanTerm(...observedCanonicalIds: string[]): TermTurn {
  return Object.freeze({
    environment: "human-admission",
    observedCanonicalIds: Object.freeze(observedCanonicalIds),
  });
}

function aliasEvidence(
  canonical: string,
  phase: ExpectedAliasEvidence["phase"],
  support: number,
  quietTurns: number,
): ExpectedAliasEvidence {
  return Object.freeze({ canonical, phase, support, quietTurns });
}

function termEvidence(
  canonical: string,
  phase: ExpectedTermEvidence["phase"],
  support: number,
  quietTurns: number,
): ExpectedTermEvidence {
  return Object.freeze({ canonical, phase, support, quietTurns });
}

function checkpoint(
  afterTurn: number,
  aliasEvidenceRows: readonly ExpectedAliasEvidence[] = [],
  termEvidenceRows: readonly ExpectedTermEvidence[] = [],
  aggregateLexemes: readonly string[] = [],
  qualifiedProjection: readonly string[] = [],
  unqualifiedProjection: readonly string[] = [],
): ScenarioCheckpoint {
  return Object.freeze({
    afterTurn,
    aliasEvidence: Object.freeze(aliasEvidenceRows),
    termEvidence: Object.freeze(termEvidenceRows),
    aggregateLexemes: Object.freeze(aggregateLexemes),
    qualifiedProjection: Object.freeze(qualifiedProjection),
    unqualifiedProjection: Object.freeze(unqualifiedProjection),
  });
}
