import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MatterLocale } from "../../../features/matter/config/locales";
import {
  applyWikiEvent,
  applyWikiObservationBatch,
  applyWikiOccurrenceSettlement,
  createEmptyWikiState,
  createWikiProjectionPolicy,
  projectApplicableWikiRules,
} from "../../../features/matter/wiki/wiki-evidence";
import {
  MAX_WIKI_LEARNING_QUIET_TURNS,
  MAX_WIKI_LEARNING_UNITS,
  WIKI_ALIAS_PRODUCER_PRECEDENCE,
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  WIKI_ALIAS_SCORE_POLICY,
  WIKI_EVIDENCE_UNITS_PER_OBSERVATION,
  WIKI_LEARNING_POLICY_VERSION,
  WIKI_OCCURRENCE_OUTCOME_POLICY,
  WIKI_PRODUCER_PRECEDENCE_VERSION,
  WIKI_TERM_PRODUCER_PRECEDENCE,
  WIKI_TERM_PRODUCER_WEIGHTS,
  WIKI_TERM_SCORE_POLICY,
  type WikiAliasEvidenceProducer,
  type WikiLearningReplayEnvironment,
  type WikiOccurrenceOrigin,
  type WikiOccurrenceOutcome,
  type WikiTermEvidenceProducer,
} from "../../../features/matter/wiki/wiki-learning-policy";
import {
  WIKI_SCORING_VERSION,
  type WikiBoundary,
  type WikiChannel,
  type WikiLedgerTick,
  type WikiMatchRule,
  type WikiObservationTick,
  type WikiObserveEvidenceEvent,
  type WikiState,
} from "../../../features/matter/wiki/wiki-model";
import type { WikiScriptClass } from "../../../features/matter/wiki/wiki-script";
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
  "features/matter/wiki/wiki-script.ts",
  "features/matter/wiki/wiki-producer-qualification.ts",
  "features/matter/wiki/wiki-text-safety.ts",
  "features/matter/config/locales.ts",
  "features/matter/tree/unicode-text.ts",
]);

export const WIKI_LEARNING_POLICY_QUALIFICATION_VERSION = 2 as const;

type QualifiedPolicyConstants = WikiQualifiedLearningPolicyRelease["policyConstants"];

type ScenarioLexeme = Readonly<{
  locale: "en-US" | "zh-CN";
  canonical: string;
}>;

/**
 * One human-admission tick. `context` states whether the turn was a comparable
 * opportunity for the scenario's candidates; `scan` states whether the
 * producer scanned the whole turn.
 */
type AdmissionTurn = Readonly<{
  kind: "admission";
  environment: WikiLearningReplayEnvironment;
  observations: readonly string[];
  scan: "complete" | "partial";
  context: "comparable" | "other-locale" | "other-script";
}>;

/**
 * The settlement of one applied occurrence of the scenario's form. Every
 * occurrence is applied from the basis of the latest admission turn, and the
 * current state decides whether its rule is human-confirmed.
 */
type SettlementTurn = Readonly<{
  kind: "settlement";
  occurrence: string;
  canonical: string;
  outcome: WikiOccurrenceOutcome;
  origin: WikiOccurrenceOrigin;
}>;

type ScenarioTurn = AdmissionTurn | SettlementTurn;

type ExpectedAliasEvidence = Readonly<{
  canonical: string;
  phase: "candidate" | "active";
  support: number;
  quietTurns: number;
  kept: number;
  keptQuietTurns: number;
}>;

type ExpectedTermEvidence = Readonly<{
  canonical: string;
  phase: "candidate" | "collected";
  support: number;
  quietTurns: number;
}>;

type ExpectedStrike = Readonly<{
  canonical: string;
  quietTurns: number;
}>;

type ScenarioCheckpoint = Readonly<{
  afterTurn: number;
  aliasEvidence: readonly ExpectedAliasEvidence[];
  termEvidence: readonly ExpectedTermEvidence[];
  revertStrikes: readonly ExpectedStrike[];
  aliasTombstones: readonly string[];
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
  scripts: readonly WikiScriptClass[];
  form: string;
  producer: WikiAliasEvidenceProducer;
  lexemes: readonly ScenarioLexeme[];
  turns: readonly ScenarioTurn[];
  checkpointTurns: readonly number[];
  expected: readonly ScenarioCheckpoint[];
}>;

type TermScenario = Readonly<{
  scenarioId: string;
  kind: "term";
  locale: ScenarioLexeme["locale"];
  channel: "spoken";
  scripts: readonly WikiScriptClass[];
  producer: WikiTermEvidenceProducer;
  turns: readonly AdmissionTurn[];
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
  unitsPerObservation: WIKI_EVIDENCE_UNITS_PER_OBSERVATION,
  maximumUnits: MAX_WIKI_LEARNING_UNITS,
  maximumQuietTurns: MAX_WIKI_LEARNING_QUIET_TURNS,
  aliasScorePolicy: WIKI_ALIAS_SCORE_POLICY,
  termScorePolicy: WIKI_TERM_SCORE_POLICY,
  aliasProducerWeights: WIKI_ALIAS_PRODUCER_WEIGHTS,
  termProducerWeights: WIKI_TERM_PRODUCER_WEIGHTS,
  producerPrecedenceVersion: WIKI_PRODUCER_PRECEDENCE_VERSION,
  aliasProducerPrecedence: WIKI_ALIAS_PRODUCER_PRECEDENCE,
  termProducerPrecedence: WIKI_TERM_PRODUCER_PRECEDENCE,
  occurrenceOutcomePolicy: WIKI_OCCURRENCE_OUTCOME_POLICY,
});

const PROVISIONAL_MATERIAL = "zh-CN:spoken:word:才料=>材料";
const RESTRICTED_SILENCE = "zh-CN:spoken:word:近音=>静音";
const RESTRICTED_PAIR = Object.freeze([lexeme("zh-CN", "静音"), lexeme("zh-CN", "境音")]);

/**
 * The manifest owns both opportunities and expected outcomes. The runner may
 * report only what the production policy actually did; it cannot relabel a
 * failed result while generating a release receipt. Every support, kept, and
 * strike value is an integer in quarter-observation units or turns.
 */
export const WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST = Object.freeze({
  qualificationVersion: WIKI_LEARNING_POLICY_QUALIFICATION_VERSION,
  corpusVersion: "wiki-learning-policy-v4-corpus/1",
  policyVersion: WIKI_LEARNING_POLICY_VERSION,
  scoringVersion: WIKI_SCORING_VERSION,
  policyConstants: POLICY_CONSTANTS,
  scenarios: Object.freeze([
    materialScenario({
      scenarioId: "exact-three-turn-activation",
      turns: [human("材料"), human("材料"), human("材料")],
      checkpointTurns: [1, 2, 3],
      expected: [
        checkpoint(1, { alias: [alias("材料", "candidate", 4, 0)] }),
        checkpoint(2, { alias: [alias("材料", "candidate", 8, 0)] }),
        checkpoint(3, {
          alias: [alias("材料", "active", 12, 0)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
      ],
    }),
    aliasScenario({
      scenarioId: "restricted-four-turn-activation",
      locale: "zh-CN",
      scripts: ["han"],
      form: "近音",
      producer: "zh-final-pair-v1",
      lexemes: [lexeme("zh-CN", "静音")],
      turns: [human("静音"), human("静音"), human("静音"), human("静音")],
      checkpointTurns: [3, 4],
      expected: [
        checkpoint(3, { alias: [alias("静音", "candidate", 12, 0)] }),
        checkpoint(4, {
          alias: [alias("静音", "active", 16, 0)],
          qualified: [RESTRICTED_SILENCE],
        }),
      ],
    }),
    materialScenario({
      scenarioId: "competition-margin-abstention",
      lexemes: [lexeme("zh-CN", "材料"), lexeme("zh-CN", "裁料")],
      turns: [human("材料", "裁料"), human("材料", "裁料"), human("材料"), human("材料")],
      checkpointTurns: [3, 4],
      expected: [
        checkpoint(3, { alias: [
          alias("材料", "candidate", 12, 0),
          alias("裁料", "candidate", 8, 1),
        ] }),
        checkpoint(4, {
          alias: [
            alias("材料", "active", 16, 0),
            alias("裁料", "candidate", 8, 2),
          ],
          qualified: [PROVISIONAL_MATERIAL],
        }),
      ],
    }),
    materialScenario({
      scenarioId: "quiet-decay-retention",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        ...quiet(MAX_WIKI_LEARNING_QUIET_TURNS),
        ...quiet(1),
      ],
      checkpointTurns: [3, 34, 35],
      expected: [
        checkpoint(3, {
          alias: [alias("材料", "active", 12, 0)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(34, {
          alias: [alias("材料", "active", 12, 31)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(35, { alias: [alias("材料", "candidate", 6, 0)] }),
      ],
    }),
    termScenario({
      scenarioId: "quarter-unit-gradual-decay",
      turns: [human("morphogenesis"), ...quiet(96)],
      checkpointTurns: [1, 33, 65, 97],
      expected: [
        checkpoint(1, { term: [term("morphogenesis", "candidate", 4, 0)] }),
        checkpoint(33, { term: [term("morphogenesis", "candidate", 2, 0)] }),
        checkpoint(65, { term: [term("morphogenesis", "candidate", 1, 0)] }),
        checkpoint(97),
      ],
    }),
    termScenario({
      scenarioId: "broad-term-two-turn-collection",
      turns: [human("morphogenesis"), human("morphogenesis")],
      checkpointTurns: [1, 2],
      expected: [
        checkpoint(1, { term: [term("morphogenesis", "candidate", 4, 0)] }),
        checkpoint(2, {
          term: [term("morphogenesis", "collected", 8, 0)],
          aggregate: ["morphogenesis"],
        }),
      ],
    }),
    materialScenario({
      scenarioId: "non-comparable-turns-do-not-age",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        ...quiet(40, "other-locale"),
        ...quiet(1, "other-script"),
        ...quiet(31),
        ...quiet(1),
      ],
      checkpointTurns: [44, 75, 76],
      expected: [
        checkpoint(44, {
          alias: [alias("材料", "active", 12, 0)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(75, {
          alias: [alias("材料", "active", 12, 31)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(76, { alias: [alias("材料", "candidate", 6, 0)] }),
      ],
    }),
    materialScenario({
      scenarioId: "partial-scan-scores-only-what-it-saw",
      lexemes: [lexeme("zh-CN", "材料"), lexeme("zh-CN", "裁料")],
      turns: [human("材料"), ...quiet(2), partial("裁料"), partial(), ...quiet(1)],
      checkpointTurns: [4, 5, 6],
      expected: [
        checkpoint(4, { alias: [
          alias("材料", "candidate", 4, 2),
          alias("裁料", "candidate", 4, 0),
        ] }),
        checkpoint(5, { alias: [
          alias("材料", "candidate", 4, 2),
          alias("裁料", "candidate", 4, 0),
        ] }),
        checkpoint(6, { alias: [
          alias("材料", "candidate", 4, 3),
          alias("裁料", "candidate", 4, 1),
        ] }),
      ],
    }),
    aliasScenario({
      scenarioId: "informed-acceptance-retains-a-used-rule",
      locale: "zh-CN",
      scripts: ["han"],
      form: "近音",
      producer: "zh-final-pair-v1",
      lexemes: [lexeme("zh-CN", "静音")],
      turns: [
        human("静音"),
        human("静音"),
        human("静音"),
        human("静音"),
        settle("o1", "静音", "accepted-implicit"),
        settle("o2", "静音", "accepted-implicit"),
        ...quiet(1),
        settle("o3", "静音", "inspected-kept"),
        settle("o4", "静音", "accepted-implicit"),
        ...quiet(32),
        ...quiet(31),
      ],
      checkpointTurns: [5, 6, 7, 8, 9, 40, 41, 72],
      expected: [
        checkpoint(5, {
          alias: [alias("静音", "active", 16, 0, 4, 0)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(6, {
          alias: [alias("静音", "active", 16, 0, 4, 0)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(7, {
          alias: [alias("静音", "active", 16, 1, 4, 1)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(8, {
          alias: [alias("静音", "active", 16, 1, 12, 0)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(9, {
          alias: [alias("静音", "active", 16, 1, 12, 0)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(40, {
          alias: [alias("静音", "active", 8, 0, 12, 31)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(41, {
          alias: [alias("静音", "active", 8, 1, 6, 32)],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(72, { alias: [alias("静音", "candidate", 4, 0, 6, 63)] }),
      ],
    }),
    materialScenario({
      scenarioId: "generated-implicit-acceptance-counts-by-policy",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o1", "材料", "accepted-implicit", "generated"),
      ],
      checkpointTurns: [4],
      expected: [
        checkpoint(4, {
          alias: [alias("材料", "active", 12, 0, 4, 0)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
      ],
    }),
    materialScenario({
      scenarioId: "two-strike-reversion",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o1", "材料", "reverted"),
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o2", "材料", "reverted"),
        human("材料"),
      ],
      checkpointTurns: [4, 7, 8, 9],
      expected: [
        checkpoint(4, { strikes: [strike("材料", 0)] }),
        checkpoint(7, {
          alias: [alias("材料", "active", 12, 0)],
          strikes: [strike("材料", 3)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(8, { tombstones: ["材料"] }),
        checkpoint(9, {
          alias: [alias("材料", "candidate", 4, 0)],
          tombstones: ["材料"],
        }),
      ],
    }),
    materialScenario({
      scenarioId: "revert-strike-memory-expires",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o1", "材料", "reverted"),
        ...quiet(127),
        ...quiet(1),
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o2", "材料", "reverted"),
      ],
      checkpointTurns: [131, 132, 136],
      expected: [
        checkpoint(131, { strikes: [strike("材料", 127)] }),
        checkpoint(132),
        checkpoint(136, { strikes: [strike("材料", 0)] }),
      ],
    }),
    materialScenario({
      scenarioId: "confirmed-authority-stays-outside-scoring",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o1", "材料", "explicit-confirm"),
        settle("o2", "材料", "reverted"),
        settle("o3", "材料", "accepted-implicit"),
      ],
      checkpointTurns: [4, 6],
      expected: [
        checkpoint(4, {
          alias: [alias("材料", "active", 12, 0)],
          qualified: [PROVISIONAL_MATERIAL],
          unqualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(6, {
          alias: [alias("材料", "active", 12, 0)],
          qualified: [PROVISIONAL_MATERIAL],
          unqualified: [PROVISIONAL_MATERIAL],
        }),
      ],
    }),
    materialScenario({
      scenarioId: "same-epoch-reverts-strike-once",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o1", "材料", "reverted"),
        settle("o2", "材料", "reverted"),
      ],
      checkpointTurns: [4, 5],
      expected: [
        checkpoint(4, { strikes: [strike("材料", 0)] }),
        checkpoint(5, { strikes: [strike("材料", 0)] }),
      ],
    }),
    materialScenario({
      scenarioId: "duplicate-delivery-settles-once",
      turns: [
        human("材料"),
        human("材料"),
        human("材料"),
        settle("o1", "材料", "accepted-implicit"),
        ...quiet(1),
        settle("o1", "材料", "accepted-implicit"),
        settle("o1", "材料", "inspected-kept"),
      ],
      checkpointTurns: [4, 7],
      expected: [
        checkpoint(4, {
          alias: [alias("材料", "active", 12, 0, 4, 0)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
        checkpoint(7, {
          alias: [alias("材料", "active", 12, 1, 4, 1)],
          qualified: [PROVISIONAL_MATERIAL],
        }),
      ],
    }),
    aliasScenario({
      scenarioId: "kept-evidence-never-reactivates",
      locale: "zh-CN",
      scripts: ["han"],
      form: "近音",
      producer: "zh-final-pair-v1",
      lexemes: RESTRICTED_PAIR,
      turns: [
        human("静音"),
        human("静音"),
        human("静音"),
        human("静音"),
        human("境音"),
        human("境音"),
        human("境音"),
        settle("o1", "静音", "inspected-kept"),
        settle("o2", "静音", "inspected-kept"),
      ],
      checkpointTurns: [6, 7, 9],
      expected: [
        checkpoint(6, {
          alias: [
            alias("境音", "candidate", 8, 0),
            alias("静音", "active", 16, 2),
          ],
          qualified: [RESTRICTED_SILENCE],
        }),
        checkpoint(7, { alias: [
          alias("境音", "candidate", 12, 0),
          alias("静音", "candidate", 16, 3),
        ] }),
        checkpoint(9, { alias: [
          alias("境音", "candidate", 12, 0),
          alias("静音", "candidate", 16, 3, 16, 0),
        ] }),
      ],
    }),
    aliasScenario({
      scenarioId: "non-human-zero-vote",
      locale: "en-US",
      scripts: ["latin"],
      form: "Englebart",
      producer: "latin-internal-edit-v2",
      lexemes: [lexeme("en-US", "Engelbart")],
      turns: [nonHuman("generated-output", "Engelbart"),
        nonHuman("protected-text", "Engelbart")],
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
  let appliedAtRevision = state.revision;
  scenario.turns.forEach((turn, index) => {
    const afterTurn = index + 1;
    const applied = turn.kind === "settlement"
      ? applyWikiOccurrenceSettlement(state, Object.freeze({
          occurrenceId: turn.occurrence,
          outcome: turn.outcome as Exclude<WikiOccurrenceOutcome, "explicit-replace">,
          rule: Object.freeze({
            locale: scenario.locale,
            channel: scenario.channel,
            boundary: "word" as const,
            form: (scenario as AliasScenario).form,
            canonical: turn.canonical,
            appliedAtRevision,
          }),
          origin: turn.origin,
        }), qualifiedAliasProducers())
      : applyWikiObservationBatch(
          state,
          scenario.kind === "alias"
            ? aliasEvents(scenario, turn)
            : termEvents(scenario, turn),
          tickFor(scenario, turn),
          qualifiedAliasProducers(),
        );
    if (!applied.ok) throw new Error(applied.error.message);
    state = applied.state;
    if (turn.kind === "admission") appliedAtRevision = state.revision;
    if (checkpointTurns.has(afterTurn)) checkpoints.push(snapshot(state, afterTurn));
  });
  return Object.freeze({
    scenarioId: scenario.scenarioId,
    checkpoints: Object.freeze(checkpoints),
  });
}

function aliasEvents(
  scenario: AliasScenario,
  turn: AdmissionTurn,
): readonly WikiObserveEvidenceEvent[] {
  return Object.freeze(turn.observations.map((canonical) => Object.freeze({
    type: "observe-evidence" as const,
    source: "machine-inference" as const,
    locale: scenario.locale,
    channel: scenario.channel,
    boundary: scenario.boundary,
    form: scenario.form,
    canonical,
    producer: scenario.producer,
  })));
}

function termEvents(
  scenario: TermScenario,
  turn: AdmissionTurn,
): readonly WikiObserveEvidenceEvent[] {
  return Object.freeze(turn.observations.map((canonical) => Object.freeze({
    type: "observe-evidence" as const,
    source: "recent-material" as const,
    locale: scenario.locale,
    canonical,
    producer: scenario.producer,
  })));
}

function tickFor(
  scenario: WikiLearningPolicyQualificationScenario,
  turn: AdmissionTurn,
): WikiObservationTick {
  const paused: WikiLedgerTick = Object.freeze({ disposition: "paused" });
  if (turn.environment !== "human-admission") {
    return Object.freeze({
      term: Object.freeze({ disposition: "censored" }),
      alias: Object.freeze({ disposition: "censored" }),
    });
  }
  const ledger: WikiLedgerTick = turn.scan === "partial"
    ? Object.freeze({ disposition: "partial" })
    : Object.freeze({
        disposition: turn.observations.length > 0 ? "observed" : "quiet",
        opportunity: Object.freeze({
          locale: turn.context === "other-locale"
            ? otherLocale(scenario.locale)
            : scenario.locale,
          channel: scenario.channel,
          scripts: turn.context === "other-script"
            ? otherScripts(scenario.scripts)
            : scenario.scripts,
        }),
      });
  return scenario.kind === "alias"
    ? Object.freeze({ term: paused, alias: ledger })
    : Object.freeze({ term: ledger, alias: paused });
}

function otherLocale(locale: ScenarioLexeme["locale"]): MatterLocale {
  return locale === "zh-CN" ? "en-US" : "zh-CN";
}

function otherScripts(scripts: readonly WikiScriptClass[]): readonly WikiScriptClass[] {
  return Object.freeze([scripts.includes("latin") ? "han" : "latin"]);
}

function snapshot(state: WikiState, afterTurn: number): ScenarioCheckpoint {
  const lexemes = new Map(state.lexemes.map((entry) => [entry.id, entry]));
  const canonicalOf = (lexemeId: number) => lexemes.get(lexemeId)?.canonical ?? "";
  const aliasRows = state.aliasEvidence.map((entry) => ({
    canonical: canonicalOf(entry.lexemeId),
    phase: entry.phase,
    support: entry.support,
    quietTurns: entry.quietTurns,
    kept: entry.kept,
    keptQuietTurns: entry.keptQuietTurns,
  })).sort(compareCanonical);
  const termRows = state.termEvidence.map((entry) => ({
    canonical: entry.canonical,
    phase: entry.phase,
    support: entry.support,
    quietTurns: entry.quietTurns,
  })).sort(compareCanonical);
  const strikeRows = state.revertStrikes.map((entry) => ({
    canonical: canonicalOf(entry.lexemeId),
    quietTurns: entry.quietTurns,
  })).sort(compareCanonical);
  const tombstones = state.aliasTombstones
    .map((entry) => canonicalOf(entry.lexemeId))
    .sort(compareCodeUnits);
  const aggregateLexemes = state.lexemes
    .filter((entry) => entry.provenance === "aggregate-evidence")
    .map((entry) => entry.canonical)
    .sort(compareCodeUnits);
  const qualifiedProjection = projectApplicableWikiRules(
    state,
    createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES),
  ).map(projectedActionId).sort(compareCodeUnits);
  const unqualifiedProjection = projectApplicableWikiRules(
    state,
    createWikiProjectionPolicy([]),
  ).map(projectedActionId).sort(compareCodeUnits);
  return Object.freeze({
    afterTurn,
    aliasEvidence: Object.freeze(aliasRows),
    termEvidence: Object.freeze(termRows),
    revertStrikes: Object.freeze(strikeRows),
    aliasTombstones: Object.freeze(tombstones),
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

function compareCanonical(
  left: Readonly<{ canonical: string }>,
  right: Readonly<{ canonical: string }>,
): number {
  return compareCodeUnits(left.canonical, right.canonical);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
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
      compareCodeUnits(left.identity.producerId, right.identity.producerId));
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

/** The zh-CN exact-homophone material relation reused by several scenarios. */
function materialScenario(
  value: Readonly<{
    scenarioId: string;
    lexemes?: readonly ScenarioLexeme[];
    turns: readonly ScenarioTurn[];
    checkpointTurns: readonly number[];
    expected: readonly ScenarioCheckpoint[];
  }>,
): AliasScenario {
  return aliasScenario({
    ...value,
    locale: "zh-CN",
    scripts: ["han"],
    form: "才料",
    producer: "zh-exact-homophone-v1",
    lexemes: value.lexemes ?? [lexeme("zh-CN", "材料")],
  });
}

function aliasScenario(
  value: Omit<AliasScenario, "kind" | "channel" | "boundary">,
): AliasScenario {
  return Object.freeze({
    ...value,
    kind: "alias",
    channel: "spoken",
    boundary: "word",
    scripts: Object.freeze([...value.scripts]),
    lexemes: Object.freeze([...value.lexemes]),
    turns: Object.freeze([...value.turns]),
    checkpointTurns: Object.freeze([...value.checkpointTurns]),
    expected: Object.freeze([...value.expected]),
  });
}

function termScenario(
  value: Readonly<{
    scenarioId: string;
    turns: readonly AdmissionTurn[];
    checkpointTurns: readonly number[];
    expected: readonly ScenarioCheckpoint[];
  }>,
): TermScenario {
  return Object.freeze({
    ...value,
    kind: "term",
    locale: "en-US",
    channel: "spoken",
    scripts: Object.freeze(["latin" as const]),
    producer: "locale-segment-v1",
    turns: Object.freeze([...value.turns]),
    checkpointTurns: Object.freeze([...value.checkpointTurns]),
    expected: Object.freeze([...value.expected]),
  });
}

function lexeme(locale: ScenarioLexeme["locale"], canonical: string): ScenarioLexeme {
  return Object.freeze({ locale, canonical });
}

function human(...observations: string[]): AdmissionTurn {
  return admission("human-admission", observations, "complete", "comparable");
}

function partial(...observations: string[]): AdmissionTurn {
  return admission("human-admission", observations, "partial", "comparable");
}

function quiet(
  count: number,
  context: AdmissionTurn["context"] = "comparable",
): readonly AdmissionTurn[] {
  return Array.from({ length: count }, () =>
    admission("human-admission", [], "complete", context));
}

function nonHuman(
  environment: "generated-output" | "protected-text",
  ...observations: string[]
): AdmissionTurn {
  return admission(environment, observations, "complete", "comparable");
}

function admission(
  environment: WikiLearningReplayEnvironment,
  observations: readonly string[],
  scan: AdmissionTurn["scan"],
  context: AdmissionTurn["context"],
): AdmissionTurn {
  return Object.freeze({
    kind: "admission",
    environment,
    observations: Object.freeze([...observations]),
    scan,
    context,
  });
}

function settle(
  occurrence: string,
  canonical: string,
  outcome: WikiOccurrenceOutcome,
  origin: WikiOccurrenceOrigin = "human-admission",
): SettlementTurn {
  return Object.freeze({ kind: "settlement", occurrence, canonical, outcome, origin });
}

function alias(
  canonical: string,
  phase: ExpectedAliasEvidence["phase"],
  support: number,
  quietTurns: number,
  kept = 0,
  keptQuietTurns = 0,
): ExpectedAliasEvidence {
  return Object.freeze({ canonical, phase, support, quietTurns, kept, keptQuietTurns });
}

function term(
  canonical: string,
  phase: ExpectedTermEvidence["phase"],
  support: number,
  quietTurns: number,
): ExpectedTermEvidence {
  return Object.freeze({ canonical, phase, support, quietTurns });
}

function strike(canonical: string, quietTurns: number): ExpectedStrike {
  return Object.freeze({ canonical, quietTurns });
}

function checkpoint(
  afterTurn: number,
  rows: Readonly<{
    alias?: readonly ExpectedAliasEvidence[];
    term?: readonly ExpectedTermEvidence[];
    strikes?: readonly ExpectedStrike[];
    tombstones?: readonly string[];
    aggregate?: readonly string[];
    qualified?: readonly string[];
    unqualified?: readonly string[];
  }> = {},
): ScenarioCheckpoint {
  return Object.freeze({
    afterTurn,
    aliasEvidence: Object.freeze([...(rows.alias ?? [])]),
    termEvidence: Object.freeze([...(rows.term ?? [])]),
    revertStrikes: Object.freeze([...(rows.strikes ?? [])]),
    aliasTombstones: Object.freeze([...(rows.tombstones ?? [])]),
    aggregateLexemes: Object.freeze([...(rows.aggregate ?? [])]),
    qualifiedProjection: Object.freeze([...(rows.qualified ?? [])]),
    unqualifiedProjection: Object.freeze([...(rows.unqualified ?? [])]),
  });
}
