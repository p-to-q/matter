import { describe, expect, it } from "vitest";
import {
  WIKI_SCORE_POLICY,
  applyWikiEvent,
  applyWikiObservationBatch,
  applyWikiOccurrenceSettlement,
  clearWikiState,
  createWikiProjectionPolicy,
  createEmptyWikiState,
  createInitialWikiState,
  projectApplicableWikiRules,
} from "./wiki-evidence";
import {
  MAX_WIKI_EVIDENCE_COUNT,
  MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS,
  MAX_WIKI_HUMAN_CONFIRMED_LEXEMES,
  MAX_WIKI_LEXEME_TOMBSTONES,
  MAX_WIKI_OBSERVATIONS_PER_LEDGER,
  MAX_WIKI_REVERT_STRIKES,
  MAX_WIKI_SETTLED_OCCURRENCES,
  MAX_WIKI_TOMBSTONES,
  WIKI_SCORING_VERSION,
  type WikiAppliedRule,
  type WikiEvent,
  type WikiEvidenceTickDisposition,
  type WikiLedgerTick,
  type WikiObservationTick,
  type WikiObserveAliasEvidenceEvent,
  type WikiObserveEvidenceEvent,
  type WikiObserveTermEvidenceEvent,
  type WikiOccurrenceSettlement,
  type WikiState,
} from "./wiki-model";
import {
  MAX_WIKI_LEARNING_UNITS,
  type WikiAliasEvidenceProducer,
  type WikiOccurrenceOutcome,
} from "./wiki-learning-policy";
import type { WikiScriptClass } from "./wiki-script";
import { parseWikiState } from "./wiki-codec";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "./wiki-qualified-producer-releases";

const QUALIFIED = createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES);

describe("Wiki evidence and authority", () => {
  it("starts as a deeply immutable, versioned local state", () => {
    const state = createEmptyWikiState();

    expect(state).toEqual({
      schemaVersion: 7,
      scoringVersion: 4,
      fittingVersion: 1,
      revision: 0,
      nextLexemeId: 1,
      automaticLearningSaturated: false,
      lexemes: [],
      termEvidence: [],
      aliasEvidence: [],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
      revertStrikes: [],
      settledOccurrences: [],
    });
    expect(WIKI_SCORE_POLICY.version).toBe(WIKI_SCORING_VERSION);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.termEvidence)).toBe(true);
    expect(Object.isFrozen(state.aliasEvidence)).toBe(true);
  });

  it("keeps the first term observation hidden and collects it on the second turn", () => {
    let state = applyObservationBatch(createEmptyWikiState(), [observe("recent-material")]);
    expect(state.lexemes).toEqual([]);
    expect(state.termEvidence).toEqual([
      expect.objectContaining({ canonical: "Codex", phase: "candidate", support: 4 }),
    ]);

    state = applyObservationBatch(state, [observe("recent-material")]);
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Codex", provenance: "aggregate-evidence" }),
    ]);
    expect(state.termEvidence[0]).toMatchObject({ phase: "collected", support: 8 });
  });

  it("keeps untouched product starters outside the term-aging ledger", () => {
    const state = createInitialWikiState();
    const events = state.lexemes.map((lexeme) => ({
      type: "observe-evidence" as const,
      locale: lexeme.locale,
      canonical: lexeme.canonical,
      source: "recent-material" as const,
      producer: "locale-segment-v1" as const,
    }));
    const result = applyWikiObservationBatch(state, events, humanTick(events));

    expect(result).toEqual({ ok: true, state, changed: false });
    expect(state.termEvidence).toEqual([]);
  });

  it("fades one term observation across three quiet horizons without a global cohort", () => {
    let state = applyObservationBatch(createEmptyWikiState(), [observe("recent-material")]);
    for (let index = 0; index < 31; index += 1) state = applyObservationBatch(state, []);
    expect(state.termEvidence[0]).toMatchObject({ support: 4, quietTurns: 31 });

    state = applyObservationBatch(state, []);
    expect(state.termEvidence[0]).toMatchObject({ support: 2, quietTurns: 0 });
    for (let index = 0; index < 32; index += 1) state = applyObservationBatch(state, []);
    expect(state.termEvidence[0]).toMatchObject({ support: 1, quietTurns: 0 });
    for (let index = 0; index < 32; index += 1) state = applyObservationBatch(state, []);
    expect(state.termEvidence).toEqual([]);
    expect(state.lexemes).toEqual([]);
  });

  it("ticks term and alias ledgers independently and never ages censored evidence", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    state = repeatEvidence(state, "machine-inference", 4);
    const initialTerm = state.termEvidence[0];
    for (let turn = 0; turn < 8; turn += 1) {
      const result = applyWikiObservationBatch(state, [], tick("paused", "quiet"));
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    expect(state.termEvidence[0]).toEqual(initialTerm);
    expect(state.aliasEvidence[0]?.quietTurns).toBe(8);

    const censored = applyWikiObservationBatch(state, [], tick("censored", "censored"));
    if (!censored.ok) throw new Error(censored.error.message);
    expect(censored.state.termEvidence[0]).toEqual(initialTerm);
    expect(censored.state.aliasEvidence[0]).toEqual(state.aliasEvidence[0]);
  });

  it("replaces producer evidence for one visible relation instead of self-competing", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [{
        type: "observe-evidence",
        source: "machine-inference",
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "Englebart",
        canonical: "Engelbart",
        producer: "latin-internal-edit-v2",
      }]);
    }
    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ producer: "latin-internal-edit-v2", support: 16 }),
    ]);

    state = applyObservationBatch(state, [{
      type: "observe-evidence",
      source: "machine-inference",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "Englebart",
      canonical: "Engelbart",
      producer: "en-metaphone-v1",
    }]);

    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ producer: "en-metaphone-v1", support: 4 }),
    ]);
  });

  it("cannot apply events through paused, censored, or quiet dispositions", () => {
    const term = observe("recent-material");
    const alias = observe("machine-inference");
    for (const disposition of ["paused", "censored", "quiet"] as const) {
      const result = applyWikiObservationBatch(
        createEmptyWikiState(),
        [term, alias],
        tick(disposition, disposition),
      );
      expect(result).toEqual({ ok: true, state: createEmptyWikiState(), changed: false });
    }
  });

  it("evicts the weakest unseen candidate at capacity while existing evidence keeps moving", () => {
    const termEvidence = Object.freeze(Array.from(
      { length: MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS },
      (_, index) => Object.freeze({
        locale: "en-US" as const,
        canonical: `Term${index.toString().padStart(4, "0")}`,
        producer: "locale-segment-v1" as const,
        phase: "candidate" as const,
        support: 4,
        quietTurns: 0,
      }),
    ));
    const state: WikiState = Object.freeze({
      ...createEmptyWikiState(),
      termEvidence,
    });
    const events = [
      {
        type: "observe-evidence" as const,
        source: "recent-material" as const,
        locale: "en-US" as const,
        canonical: "Term0000",
        producer: "locale-segment-v1" as const,
      },
      {
        type: "observe-evidence" as const,
        source: "recent-material" as const,
        locale: "en-US" as const,
        canonical: "UnseenTerm",
        producer: "locale-segment-v1" as const,
      },
    ];
    const result = applyWikiObservationBatch(state, events, humanTick(events));

    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) return;
    expect(result.state.termEvidence).toHaveLength(MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS);
    expect(result.state.termEvidence.find((entry) => entry.canonical === "UnseenTerm"))
      .toMatchObject({ phase: "candidate", support: 4 });
    // Every unobserved row aged equally; the tie falls to code-unit identity.
    expect(result.state.termEvidence.map((entry) => entry.canonical))
      .not.toContain("Term0001");
    expect(result.state.termEvidence[0]).toMatchObject({ phase: "collected", support: 8 });
    expect(result.state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Term0000" }),
    ]);
  });

  it("ages zero-weight legacy alias evidence without activating it", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    state = repeatEvidence(state, "machine-inference", 4);
    expect(projectApplicableWikiRules(state)).toEqual([]);

    for (let index = 0; index < 32; index += 1) state = applyObservationBatch(state, []);

    expect(state.aliasEvidence[0]).toMatchObject({ support: 8, quietTurns: 0 });
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("collects a machine-only migrated lexeme after its alias expires", () => {
    const parsed = parseWikiState({
      schemaVersion: 4,
      scoringVersion: 2,
      fittingVersion: 1,
      revision: 3,
      nextLexemeId: 2,
      recentObservationCount: 0,
      automaticLearningSaturated: false,
      lexemes: [{
        id: 1,
        locale: "en-US",
        canonical: "Codex",
        scope: "both",
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      }],
      evidence: [{
        lexemeId: 1,
        channel: "spoken",
        boundary: "word",
        form: "code x",
        counts: { historicalMaterial: 0, recentMaterial: 0, machineInference: 1 },
      }],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
    });
    if (!parsed.ok) throw new Error(parsed.message);
    let state = parsed.state;

    expect(state.termEvidence).toEqual([
      expect.objectContaining({ canonical: "Codex", support: 0 }),
    ]);
    expect(state.aliasEvidence).toEqual([expect.objectContaining({ support: 4 })]);
    for (let index = 0; index < 96; index += 1) {
      state = applyObservationBatch(state, []);
    }

    expect(state.aliasEvidence).toEqual([]);
    expect(state.termEvidence).toEqual([]);
    expect(state.lexemes).toEqual([]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });
  });

  it("reclaims ownerless V5 and V6 automatic lexemes at the recovery boundary", () => {
    const base = {
      scoringVersion: 3,
      fittingVersion: 1,
      revision: 3,
      nextLexemeId: 2,
      automaticLearningSaturated: false,
      lexemes: [{
        id: 1,
        locale: "en-US",
        canonical: "Lexicorium",
        scope: "both",
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      }],
      termEvidence: [],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
    };
    const fixtures = [{
      ...base,
      schemaVersion: 5,
      aliasEvidence: [{
        lexemeId: 1,
        channel: "spoken",
        boundary: "word",
        form: "lexicoreum",
        producer: "legacy-v1",
        phase: "candidate",
        support: 1,
        quietTurns: 0,
      }],
    }, {
      ...base,
      schemaVersion: 6,
      aliasEvidence: [],
    }];

    for (const fixture of fixtures) {
      const parsed = parseWikiState(fixture);
      if (!parsed.ok) throw new Error(parsed.message);
      let state = parsed.state;
      for (let index = 0; index < 96; index += 1) {
        state = applyObservationBatch(state, []);
      }
      expect(state.termEvidence).toEqual([]);
      expect(state.aliasEvidence).toEqual([]);
      expect(state.lexemes).toEqual([]);
      expect(parseWikiState(state)).toMatchObject({ ok: true });
    }
  });

  it("retains a zero-support term until its last alias dependency expires", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    state = repeatEvidence(state, "machine-inference", 4);

    for (let index = 0; index < 130; index += 1) {
      state = applyObservationBatch(state, []);
    }

    expect(state.termEvidence).toEqual([
      expect.objectContaining({ canonical: "Codex", phase: "candidate", support: 0 }),
    ]);
    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ support: 1 }),
    ]);
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Codex", provenance: "aggregate-evidence" }),
    ]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });

    for (let index = 0; index < 30; index += 1) {
      state = applyObservationBatch(state, []);
    }

    expect(state.termEvidence).toEqual([]);
    expect(state.aliasEvidence).toEqual([]);
    expect(state.lexemes).toEqual([]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });
  });

  it("ages one human turn once even for a full observation batch", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    const events = Array.from({ length: 32 }, (_, index) => ({
      ...observe("machine-inference", "Engelbart"),
      form: `englebart-${index.toString().padStart(2, "0")}`,
      boundary: "literal" as const,
    }));

    state = applyObservationBatch(state, events);

    expect(state.aliasEvidence).toHaveLength(32);
    expect(state.aliasEvidence.every((entry) => entry.quietTurns === 0)).toBe(true);
  });

  it("counts one canonical at most once in a human-admission tick", () => {
    const state = applyObservationBatch(createEmptyWikiState(), [
      observe("recent-material"),
      observe("recent-material"),
    ]);

    expect(state.termEvidence).toEqual([
      expect.objectContaining({ canonical: "Codex", phase: "candidate", support: 4 }),
    ]);
    expect(state.lexemes).toEqual([]);
  });

  it("lets candidate-free human turns age an old machine proposal", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    state = repeatEvidence(state, "machine-inference", 4);

    for (let index = 0; index < 32; index += 1) {
      state = applyObservationBatch(state, []);
    }

    expect(state.aliasEvidence[0].support).toBe(8);
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("keeps an empty observation batch a no-op before evidence exists", () => {
    const state = createEmptyWikiState();
    expect(applyWikiObservationBatch(state, [], humanTick([])))
      .toEqual({ ok: true, state, changed: false });
  });

  it("removes fully decayed alias evidence without blocking a later observation", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    state = apply(state, observe("machine-inference"));
    for (let index = 0; index < 32; index += 1) state = applyObservationBatch(state, []);
    expect(state.aliasEvidence).toEqual([expect.objectContaining({ support: 2 })]);
    for (let index = 0; index < 64; index += 1) state = applyObservationBatch(state, []);
    expect(state.aliasEvidence).toEqual([]);
    state = apply(state, observe("machine-inference"));
    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ form: "code x", support: 4 }),
    ]);
  });

  it("does not let material frequency invent an alias relation", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 3);

    expect(state.termEvidence[0]).toMatchObject({ phase: "collected", support: 12 });
    expect(state.aliasEvidence).toEqual([]);
    expect(projectApplicableWikiRules(state)).toEqual([]);

    state = apply(state, observe("machine-inference"));
    expect(state.aliasEvidence[0]).toMatchObject({ producer: "legacy-v1", support: 4 });
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("keeps legacy migrated relations non-authoritative regardless of vote count", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2, "Codex");
    state = repeatEvidence(state, "machine-inference", 32, "Codex");
    expect(state.aliasEvidence[0]).toMatchObject({
      producer: "legacy-v1", phase: "candidate", support: 128,
    });
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("lets one human correction override a stronger provisional competitor", () => {
    let state = createEmptyWikiState();
    state = repeatEvidence(state, "machine-inference", 4, "Codex");
    state = repeatEvidence(state, "recent-material", 4, "Codex");
    state = repeatEvidence(state, "machine-inference", 8, "Codecs");
    state = repeatEvidence(state, "recent-material", 8, "Codecs");

    state = apply(state, decision("confirm-rule", "Codex"));

    expect(projectApplicableWikiRules(state)).toEqual([{
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "code x",
      canonical: "Codex",
      authority: "confirmed",
      provenance: "human-confirmed",
      score: WIKI_SCORE_POLICY.confirmedRuleScore,
    }]);
  });

  it("makes an exact human decision durable and idempotent", () => {
    const confirmed = apply(createEmptyWikiState(), decision("confirm-rule"));
    const repeated = applyWikiEvent(confirmed, decision("confirm-rule"));

    expect(repeated).toEqual({ ok: true, state: confirmed, changed: false });
    expect(projectApplicableWikiRules(confirmed)[0]).toMatchObject({
      form: "code x",
      canonical: "Codex",
      authority: "confirmed",
    });
  });

  it("scopes authority and rejection identity to one locale", () => {
    let state = apply(createEmptyWikiState(), decision("confirm-rule", "Present"));
    state = apply(state, {
      ...decision("confirm-rule", "Poison"),
      locale: "de-DE",
    });
    state = apply(state, decision("reject-rule", "Present"));

    expect(projectApplicableWikiRules(state)).toEqual([
      expect.objectContaining({
        locale: "de-DE",
        form: "code x",
        canonical: "Poison",
      }),
    ]);
    expect(state.aliasTombstones).toHaveLength(1);
    expect(canonicalOf(state, state.aliasTombstones[0].lexemeId)).toBe("Present");
  });

  it("clears learned authority while preserving monotonic lineage", () => {
    const confirmed = apply(createEmptyWikiState(), decision("confirm-rule"));
    const cleared = clearWikiState(confirmed);

    expect(cleared).toMatchObject({
      ok: true,
      changed: true,
      state: {
        revision: confirmed.revision + 1,
        termEvidence: [],
        aliasEvidence: [],
        authorities: [],
        aliasTombstones: [],
        lexemeTombstones: [],
      },
    });
  });

  it("keeps rejected candidates tombstoned through later observations", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    state = repeatEvidence(state, "machine-inference", 4);
    state = apply(state, decision("reject-rule"));
    state = repeatEvidence(state, "recent-material", 32);
    state = repeatEvidence(state, "machine-inference", 32);

    expect(projectApplicableWikiRules(state)).toEqual([]);
    expect(state.aliasTombstones).toHaveLength(1);

    state = apply(state, decision("confirm-rule"));
    expect(state.aliasTombstones).toEqual([]);
    expect(projectApplicableWikiRules(state)[0]).toMatchObject({ authority: "confirmed" });
  });

  it("keeps a rejected visible mapping blocked across matcher boundaries", () => {
    let state = createEmptyWikiState();
    state = apply(state, decision("reject-rule", "Codex"));
    state = apply(state, {
      ...observe("machine-inference", "Codex"),
      boundary: "literal",
    });

    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("tombstones a superseded human mapping so evidence cannot revive it", () => {
    let state = apply(createEmptyWikiState(), decision("confirm-rule", "Codex"));
    state = apply(state, decision("confirm-rule", "Codecs"));
    state = repeatEvidence(state, "machine-inference", 32, "Codex");
    state = repeatEvidence(state, "recent-material", 32, "Codex");

    expect(state.aliasTombstones).toHaveLength(1);
    expect(canonicalOf(state, state.aliasTombstones[0].lexemeId)).toBe("Codex");
    expect(projectApplicableWikiRules(state)).toEqual([
      expect.objectContaining({ canonical: "Codecs", authority: "confirmed" }),
    ]);
  });

  it("replaces one exact authority atomically across alias identity", () => {
    const before = decision("confirm-rule", "Codex");
    let state = apply(createEmptyWikiState(), before);
    const result = applyWikiEvent(state, {
      type: "replace-rule",
      before: {
        locale: before.locale,
        channel: before.channel,
        boundary: before.boundary,
        form: before.form,
        canonical: before.canonical,
      },
      after: {
        locale: "de-DE",
        channel: "written",
        boundary: "word",
        form: "kode x",
        canonical: "Codex",
      },
    });

    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) return;
    state = result.state;
    expect(state.revision).toBe(2);
    expect(projectApplicableWikiRules(state)).toEqual([
      expect.objectContaining({
        locale: "de-DE",
        channel: "written",
        form: "kode x",
        canonical: "Codex",
      }),
    ]);
    expect(state.aliasTombstones).toHaveLength(1);
    expect(canonicalOf(state, state.aliasTombstones[0].lexemeId)).toBe("Codex");
  });

  it("keeps one canonical lexeme while every confirmed alias follows a rename", () => {
    let state = apply(createEmptyWikiState(), decision("confirm-rule", "Engelbart"));
    state = apply(state, {
      ...decision("confirm-rule", "Engelbart"),
      form: "engel bard",
      channel: "written",
    });
    const lexeme = state.lexemes.find((entry) => entry.canonical === "Engelbart");
    if (lexeme === undefined) throw new Error("missing lexeme");

    state = apply(state, {
      type: "rename-lexeme",
      lexemeId: lexeme.id,
      locale: "en-US",
      canonical: "Douglas Engelbart",
      scope: "both",
    });

    expect(state.lexemes).toEqual([
      expect.objectContaining({ id: lexeme.id, canonical: "Douglas Engelbart" }),
    ]);
    expect(projectApplicableWikiRules(state).map((rule) => rule.canonical))
      .toEqual(["Douglas Engelbart", "Douglas Engelbart"]);
  });

  it("retires automatic recurrence when a person renames a collected term", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    const lexeme = state.lexemes[0];
    expect(lexeme).toMatchObject({
      canonical: "Codex",
      provenance: "aggregate-evidence",
    });

    state = apply(state, {
      type: "rename-lexeme",
      lexemeId: lexeme.id,
      locale: "en-US",
      canonical: "OpenAI Codex",
      scope: "both",
    });

    expect(state.lexemes[0]).toMatchObject({
      canonical: "OpenAI Codex",
      provenance: "human-confirmed",
    });
    expect(state.termEvidence).toEqual([]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });
  });

  it("retires recurrence through every human lexeme promotion path", () => {
    const collected = repeatEvidence(createEmptyWikiState(), "recent-material", 2);

    const created = apply(collected, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Codex",
      scope: "both",
    });
    expect(created.termEvidence).toEqual([]);
    expect(created.lexemes[0]).toMatchObject({ provenance: "human-confirmed" });

    const confirmed = apply(collected, decision("confirm-rule", "Codex"));
    expect(confirmed.termEvidence).toEqual([]);
    expect(confirmed.lexemes[0]).toMatchObject({ provenance: "human-confirmed" });

    let replaceBase = apply(createEmptyWikiState(), decision("confirm-rule", "Origin"));
    replaceBase = repeatEvidence(replaceBase, "recent-material", 2, "Codex");
    const replaced = apply(replaceBase, {
      type: "replace-rule",
      before: descriptor("code x", "Origin"),
      after: descriptor("codex voice", "Codex"),
    });
    expect(replaced.termEvidence).toEqual([]);
    expect(replaced.lexemes.find((entry) => entry.canonical === "Codex"))
      .toMatchObject({ provenance: "human-confirmed" });
  });

  it("bounds new human lexemes independently of the migration-safe structural table", () => {
    let state = stateWithHumanLexemes(MAX_WIKI_HUMAN_CONFIRMED_LEXEMES - 1);
    state = apply(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Last admitted term",
      scope: "both",
    });

    expect(state.lexemes.filter((entry) => entry.provenance === "human-confirmed"))
      .toHaveLength(MAX_WIKI_HUMAN_CONFIRMED_LEXEMES);
    expect(applyWikiEvent(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Overflow term",
      scope: "both",
    })).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });

    state = apply(state, { type: "remove-lexeme", lexemeId: 1 });
    state = apply(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Replacement term",
      scope: "both",
    });
    expect(state.lexemes.some((entry) => entry.canonical === "Replacement term")).toBe(true);
  });

  it("keeps edits and aliases open at the human limit but refuses aggregate takeover", () => {
    const state = stateWithHumanLexemes(MAX_WIKI_HUMAN_CONFIRMED_LEXEMES, true);
    const aggregate = state.lexemes.at(-1)!;

    const renamed = apply(state, {
      type: "rename-lexeme",
      lexemeId: 1,
      locale: "en-US",
      canonical: "Edited existing term",
      scope: "written",
    });
    expect(renamed.lexemes[0]).toMatchObject({
      canonical: "Edited existing term",
      scope: "written",
      provenance: "human-confirmed",
    });

    const aliased = apply(state, {
      type: "confirm-rule",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "term zero",
      canonical: state.lexemes[0].canonical,
    });
    expect(aliased.authorities).toHaveLength(1);

    expect(applyWikiEvent(state, {
      type: "create-lexeme",
      locale: aggregate.locale,
      canonical: aggregate.canonical,
      scope: "both",
    })).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
    expect(applyWikiEvent(state, {
      type: "rename-lexeme",
      lexemeId: aggregate.id,
      locale: aggregate.locale,
      canonical: aggregate.canonical,
      scope: "both",
    })).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });

  it("loads an oversized historical human ledger without admitting another entry", () => {
    const historical = stateWithHumanLexemes(MAX_WIKI_HUMAN_CONFIRMED_LEXEMES + 1);

    expect(parseWikiState(historical)).toMatchObject({ ok: true });
    expect(applyWikiEvent(historical, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "New historical term",
      scope: "both",
    })).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
    expect(apply(historical, {
      type: "rename-lexeme",
      lexemeId: 1,
      locale: "en-US",
      canonical: "Recovered term",
      scope: "both",
    }).lexemes[0]).toMatchObject({ canonical: "Recovered term" });
  });

  it("does not recreate recurrence after a person owns the canonical", () => {
    const confirmed = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Codex",
      scope: "both",
    });
    const events = [observe("recent-material"), observe("recent-material")];
    const result = applyWikiObservationBatch(confirmed, events, humanTick(events));

    expect(result).toEqual({ ok: true, state: confirmed, changed: false });
    expect(confirmed.termEvidence).toEqual([]);
  });

  it("does not project a stored active alias before its producer is qualified", () => {
    const base = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    const state = Object.freeze({
      ...base,
      aliasEvidence: Object.freeze([Object.freeze({
        lexemeId: base.lexemes[0].id,
        channel: "spoken" as const,
        boundary: "word" as const,
        form: "code x",
        producer: "en-exact-homophone-v1" as const,
        phase: "active" as const,
        support: 12,
        quietTurns: 0,
        kept: 0,
        keptQuietTurns: 0,
      })]),
    });

    expect(parseWikiState(state)).toMatchObject({ ok: true });
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("persists activation, retention, and demotion across a codec round trip", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    const alias = {
      ...observe("machine-inference"),
      canonical: "Engelbart",
      producer: "en-metaphone-v1" as const,
    };
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [alias]);
    }
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "active", support: 16 });

    const parsed = parseWikiState(JSON.parse(JSON.stringify(state)));
    if (!parsed.ok) throw new Error(parsed.message);
    state = applyObservationBatch(parsed.state, []);
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "active", support: 16 });

    for (let turn = 1; turn < 32; turn += 1) {
      state = applyObservationBatch(state, []);
    }
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "candidate", support: 8 });
  });

  it("withdraws aliases when their automatic target producer is no longer qualified", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    const alias = {
      ...observe("machine-inference"),
      producer: "en-metaphone-v1" as const,
    };
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [alias]);
    }
    const all = createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES);
    expect(projectApplicableWikiRules(state, all)).toEqual([
      expect.objectContaining({ form: "code x", canonical: "Codex" }),
    ]);

    const withoutCollector = createWikiProjectionPolicy(
      MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.filter((release) =>
        release.identity.producerId !== "locale-segment-v1"),
    );
    expect(projectApplicableWikiRules(state, withoutCollector)).toEqual([]);
  });

  it("advances one revision when release reconciliation is the only batch change", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    const alias = {
      ...observe("machine-inference"),
      canonical: "Engelbart",
      producer: "en-metaphone-v1" as const,
    };
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [alias]);
    }
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "active" });

    const previousRevision = state.revision;
    const reconciled = applyWikiObservationBatch(
      state,
      [],
      tick("paused", "censored"),
      new Set(),
    );

    expect(reconciled).toMatchObject({ ok: true, changed: true });
    if (!reconciled.ok) return;
    expect(reconciled.state.revision).toBe(previousRevision + 1);
    expect(reconciled.state.aliasEvidence[0]).toMatchObject({ phase: "candidate" });
  });

  it("does not spend a second revision when aging already advanced the batch", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    const alias = {
      ...observe("machine-inference"),
      canonical: "Engelbart",
      producer: "en-metaphone-v1" as const,
    };
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [alias]);
    }

    const previousRevision = state.revision;
    const reconciled = applyWikiObservationBatch(
      state,
      [],
      tick("paused", "quiet"),
      new Set(),
    );

    expect(reconciled).toMatchObject({ ok: true, changed: true });
    if (!reconciled.ok) return;
    expect(reconciled.state.revision).toBe(previousRevision + 1);
    expect(reconciled.state.aliasEvidence[0]).toMatchObject({
      phase: "candidate",
      quietTurns: 1,
    });
  });

  it("fails phase-only reconciliation at the revision bound", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    const alias = {
      ...observe("machine-inference"),
      canonical: "Engelbart",
      producer: "en-metaphone-v1" as const,
    };
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [alias]);
    }
    const bounded = Object.freeze({ ...state, revision: Number.MAX_SAFE_INTEGER });

    expect(applyWikiObservationBatch(
      bounded,
      [],
      tick("paused", "censored"),
      new Set(),
    )).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });

  it("changes applicability without deleting disabled-channel lineage", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    state = apply(state, {
      ...decision("confirm-rule", "Engelbart"),
      form: "engle bart",
      channel: "spoken",
    });
    state = apply(state, {
      ...decision("confirm-rule", "Engelbart"),
      form: "engel-bart",
      channel: "written",
    });
    state = apply(state, {
      ...decision("reject-rule", "Engelbart"),
      form: "englebar",
      channel: "written",
    });
    const beforeRelations = JSON.stringify({
      termEvidence: state.termEvidence,
      aliasEvidence: state.aliasEvidence,
      authorities: state.authorities,
      aliasTombstones: state.aliasTombstones,
      lexemeTombstones: state.lexemeTombstones,
    });

    state = apply(state, {
      type: "rename-lexeme",
      lexemeId: state.lexemes[0].id,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "spoken",
    });

    expect(projectApplicableWikiRules(state).map((rule) => rule.channel))
      .toEqual(["spoken"]);
    expect(JSON.stringify({
      termEvidence: state.termEvidence,
      aliasEvidence: state.aliasEvidence,
      authorities: state.authorities,
      aliasTombstones: state.aliasTombstones,
      lexemeTombstones: state.lexemeTombstones,
    })).toBe(beforeRelations);

    state = apply(state, {
      type: "rename-lexeme",
      lexemeId: state.lexemes[0].id,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    expect(projectApplicableWikiRules(state).map((rule) => rule.channel).sort())
      .toEqual(["spoken", "written"]);
    expect(JSON.stringify({
      termEvidence: state.termEvidence,
      aliasEvidence: state.aliasEvidence,
      authorities: state.authorities,
      aliasTombstones: state.aliasTombstones,
      lexemeTombstones: state.lexemeTombstones,
    })).toBe(beforeRelations);
  });

  it("does not let automatic observations widen a person-selected scope", () => {
    const state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "written",
    });

    const observed = applyWikiEvent(state, {
      ...observe("machine-inference", "Engelbart"),
      form: "Englebart",
      channel: "spoken",
    });

    expect(observed).toEqual({ ok: true, state, changed: false });
    expect(state.lexemes[0].scope).toBe("written");
  });

  it("moves every hidden alias when a person corrects the lexeme language", () => {
    let state = apply(createEmptyWikiState(), decision("confirm-rule", "Engelbart"));
    const lexeme = state.lexemes[0];

    state = apply(state, {
      type: "rename-lexeme",
      lexemeId: lexeme.id,
      locale: "de-DE",
      canonical: "Engelbart",
      scope: "both",
    });

    expect(state.lexemes[0]).toEqual(expect.objectContaining({
      id: lexeme.id,
      locale: "de-DE",
      canonical: "Engelbart",
      provenance: "human-confirmed",
    }));
    expect(projectApplicableWikiRules(state)).toEqual([
      expect.objectContaining({ locale: "de-DE", canonical: "Engelbart" }),
    ]);
    expect(state.lexemeTombstones).toEqual([
      expect.objectContaining({ locale: "en-US", canonical: "Engelbart" }),
    ]);
    expect(Object.keys(state.lexemeTombstones[0] ?? {})).toEqual([
      "locale", "canonical", "rejectedAtRevision",
    ]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });
  });

  it("cascades a removed lexeme and prevents automatic recreation", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    state = repeatEvidence(state, "machine-inference", 4, "Engelbart");
    const lexeme = state.lexemes[0];
    state = apply(state, { type: "remove-lexeme", lexemeId: lexeme.id });

    expect(state.lexemes).toEqual([]);
    expect(state.termEvidence).toEqual([]);
    expect(state.aliasEvidence).toEqual([]);
    expect(state.lexemeTombstones).toHaveLength(1);
    expect(Object.keys(state.lexemeTombstones[0] ?? {})).toEqual([
      "locale", "canonical", "rejectedAtRevision",
    ]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });
    const observed = applyWikiEvent(state, observe("machine-inference", "Engelbart"));
    expect(observed).toEqual({ ok: true, state, changed: false });
  });

  it("lets a person-declared canonical take over the same visible alias", () => {
    let state = apply(createEmptyWikiState(), decision("confirm-rule", "Codex"));
    state = apply(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "code x",
      scope: "both",
    });

    expect(projectApplicableWikiRules(state)).toEqual([]);
    expect(state.authorities).toEqual([]);
    expect(state.aliasTombstones).toHaveLength(1);
    expect(state.lexemes.map((entry) => entry.canonical)).toEqual(["Codex", "code x"]);
  });

  it("protects a same-spelling automatic lexeme when a person takes it over", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Other", scope: "both",
    });
    state = apply(state, {
      ...observe("machine-inference", "Other"),
      form: "Codex",
    });
    state = repeatEvidence(state, "recent-material", 2, "Codex");
    const automatic = state.lexemes.find((entry) => entry.canonical === "Codex");
    if (automatic === undefined) throw new Error("automatic lexeme was not collected");

    state = apply(state, {
      type: "rename-lexeme",
      lexemeId: automatic.id,
      locale: automatic.locale,
      canonical: automatic.canonical,
      scope: automatic.scope,
    });

    expect(state.aliasTombstones).toContainEqual(expect.objectContaining({
      form: "Codex",
    }));
    state = apply(state, { type: "remove-lexeme", lexemeId: automatic.id });
    expect(state.aliasTombstones).toContainEqual(expect.objectContaining({
      form: "Codex",
    }));
  });

  it("rejects a human alias decision that would rewrite another canonical", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "code x",
      scope: "both",
    });
    const before = state;

    expect(applyWikiEvent(state, decision("confirm-rule", "Codex")))
      .toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(state).toBe(before);

    state = apply(state, {
      ...decision("confirm-rule", "OpenAI"),
      form: "open eye",
    });
    const withAuthority = state;
    expect(applyWikiEvent(state, {
      type: "replace-rule",
      before: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "open eye",
        canonical: "OpenAI",
      },
      after: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "code x",
        canonical: "OpenAI",
      },
    })).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(state).toBe(withAuthority);
  });

  it("disables automatic learning rather than forgetting a user removal", () => {
    const base = apply(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Newest",
      scope: "both",
    });
    const full: WikiState = {
      ...base,
      revision: MAX_WIKI_TOMBSTONES + 1,
      lexemeTombstones: Array.from(
        { length: MAX_WIKI_LEXEME_TOMBSTONES },
        (_, index) => ({
          locale: "en-US" as const,
          canonical: `Old-${index.toString().padStart(4, "0")}`,
          rejectedAtRevision: index + 1,
        }),
      ),
    };
    const newest = full.lexemes[0];
    const removed = apply(full, { type: "remove-lexeme", lexemeId: newest.id });

    expect(removed.lexemeTombstones).toHaveLength(MAX_WIKI_LEXEME_TOMBSTONES);
    expect(removed.lexemeTombstones.some((entry) => entry.canonical === "Old-0000"))
      .toBe(true);
    expect(removed.automaticLearningSaturated).toBe(true);
    expect(applyWikiEvent(removed, observe("machine-inference", "Newest")))
      .toEqual({ ok: true, state: removed, changed: false });

    const restored = apply(removed, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Newest",
      scope: "both",
    });
    expect(restored.lexemes).toContainEqual(expect.objectContaining({
      canonical: "Newest",
      provenance: "human-confirmed",
    }));
    expect(restored.automaticLearningSaturated).toBe(true);
  });

  it("keeps every old alias rejection when the negative cache saturates", () => {
    const confirmed = apply(createEmptyWikiState(), decision("confirm-rule"));
    const lexeme = confirmed.lexemes[0];
    const full: WikiState = {
      ...confirmed,
      revision: MAX_WIKI_LEXEME_TOMBSTONES + 1,
      authorities: [{
        ...confirmed.authorities[0],
        confirmedAtRevision: MAX_WIKI_TOMBSTONES + 1,
      }],
      aliasTombstones: Array.from(
        { length: MAX_WIKI_TOMBSTONES },
        (_, index) => ({
          lexemeId: lexeme.id,
          channel: "spoken" as const,
          boundary: "literal" as const,
          form: `old-${index.toString().padStart(4, "0")}`,
          rejectedAtRevision: index + 1,
        }),
      ),
    };

    const rejected = apply(full, decision("reject-rule"));

    expect(rejected.authorities).toEqual([]);
    expect(rejected.aliasTombstones).toHaveLength(MAX_WIKI_TOMBSTONES);
    expect(rejected.aliasTombstones[0]).toEqual(expect.objectContaining({ form: "old-0000" }));
    expect(rejected.automaticLearningSaturated).toBe(true);
    expect(projectApplicableWikiRules(rejected)).toEqual([]);
  }, 20_000);

  it("rejects a stale or colliding replacement without a partial mutation", () => {
    let state = apply(createEmptyWikiState(), decision("confirm-rule", "Codex"));
    state = apply(state, {
      ...decision("confirm-rule", "OpenAI"),
      form: "open eye",
    });
    const before = state;

    expect(applyWikiEvent(state, {
      type: "replace-rule",
      before: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "missing",
        canonical: "Missing",
      },
      after: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "other",
        canonical: "Other",
      },
    })).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(applyWikiEvent(state, {
      type: "replace-rule",
      before: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "code x",
        canonical: "Codex",
      },
      after: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "open eye",
        canonical: "OtherAI",
      },
    })).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(state).toBe(before);
  });

  it("saturates bounded aggregate counts without advancing an unchanged revision", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    for (let index = 0; index < MAX_WIKI_EVIDENCE_COUNT; index += 1) {
      state = apply(state, observe("machine-inference"));
    }
    expect(state.aliasEvidence[0].support).toBe(MAX_WIKI_LEARNING_UNITS);
    const saturatedRevision = state.revision;

    const result = applyWikiEvent(state, observe("machine-inference"));
    expect(result).toEqual({ ok: true, state, changed: false });
    expect(state.revision).toBe(saturatedRevision);
  });

  it("rejects malformed events atomically", () => {
    const state = createEmptyWikiState();
    const malformedAlias = applyWikiEvent(state, {
      ...observe("machine-inference"),
      form: " code x",
    });
    const unknownTermProducer = applyWikiEvent(state, {
      ...observe("recent-material"),
      producer: "unknown-term-producer",
    } as never);

    expect(malformedAlias).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(unknownTermProducer)
      .toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(state).toEqual(createEmptyWikiState());
  });

  it("ages evidence only on a comparable human opportunity", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    state = applyObservationBatch(state, [observe("machine-inference")]);
    const termQuiet = state.termEvidence[0]!.quietTurns;

    for (const other of [
      { locale: "zh-CN" as const, channel: "spoken" as const, scripts: ["latin" as const] },
      { locale: "en-US" as const, channel: "spoken" as const, scripts: ["han" as const] },
    ]) {
      expect(applyWikiObservationBatch(state, [], tick("quiet", "quiet", other)))
        .toEqual({ ok: true, state, changed: false });
    }

    // Term recurrence has no channel; a relation ages only on its own channel.
    const written = applyObservationBatch(state, [], tick("quiet", "quiet", {
      locale: "en-US",
      channel: "written",
      scripts: ["latin"],
    }));
    expect(written.termEvidence[0]!.quietTurns).toBe(termQuiet + 1);
    expect(written.aliasEvidence[0]).toEqual(state.aliasEvidence[0]);

    const mixed = applyObservationBatch(state, [], tick("quiet", "quiet", {
      locale: "en-US",
      channel: "spoken",
      scripts: ["han", "latin"],
    }));
    expect(mixed.aliasEvidence[0]!.quietTurns).toBe(1);
    expect(mixed.termEvidence[0]!.quietTurns).toBe(termQuiet + 1);
  });

  it("ages the routed Latin ledger only on CJK turns that contained Latin words", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    state = applyObservationBatch(state, [observe("machine-inference")]);
    const termQuiet = state.termEvidence[0]!.quietTurns;
    const chinese = Object.freeze({
      locale: "zh-CN" as const,
      channel: "spoken" as const,
      scripts: Object.freeze(["han" as const]),
    });

    expect(applyWikiObservationBatch(state, [], tick("quiet", "quiet", chinese)))
      .toEqual({ ok: true, state, changed: false });
    const aged = applyObservationBatch(state, [], routedTick(
      "quiet",
      "quiet",
      { ...chinese, scripts: ["latin", "han"] },
    ));
    expect(aged.termEvidence[0]).toMatchObject({ locale: "en-US", quietTurns: termQuiet + 1 });
    expect(aged.aliasEvidence[0]).toMatchObject({ quietTurns: 1 });

    // A routed observation in a Chinese turn is an ordinary en-US vote.
    const observed = applyObservationBatch(state, [observe("recent-material")], routedTick(
      "observed",
      "quiet",
      { ...chinese, scripts: ["latin", "han"] },
    ));
    expect(observed.termEvidence[0]).toMatchObject({ support: 12, quietTurns: 0 });
    expect(observed.aliasEvidence[0]).toMatchObject({ quietTurns: 1 });
  });

  it("retires a turn-locale Latin term that routing can no longer observe", () => {
    const chineseLatin = Object.freeze({
      locale: "zh-CN" as const,
      channel: "spoken" as const,
      scripts: Object.freeze(["latin" as const]),
    });
    const legacy = applyObservationBatch(
      createEmptyWikiState(),
      [observe("recent-material", "OpenAI", "zh-CN")],
      tick("observed", "paused", chineseLatin),
    );
    const aged = applyObservationBatch(legacy, [], routedTick(
      "quiet",
      "paused",
      { ...chineseLatin, scripts: ["latin", "han"] },
    ));

    expect(aged.termEvidence).toEqual([
      expect.objectContaining({ locale: "zh-CN", canonical: "OpenAI", quietTurns: 1 }),
    ]);
  });

  it("rejects a routed opportunity for any ledger but the turn's own route", () => {
    const own = { locale: "zh-CN", channel: "spoken", scripts: ["latin", "han"] };
    const latin = { locale: "en-US", channel: "spoken", scripts: ["latin"] };
    for (const [opportunity, routedOpportunity] of [
      [{ ...own, locale: "en-US" }, latin],
      [{ ...own, locale: "de-DE" }, latin],
      [own, { ...latin, locale: "zh-TW" }],
      [own, { ...latin, channel: "written" }],
      [own, { ...latin, scripts: ["latin", "han"] }],
      [own, { ...latin, scripts: [] }],
      [own, { ...latin, excerpt: "Englebart" }],
    ]) {
      expect(applyWikiObservationBatch(createEmptyWikiState(), [], {
        term: { disposition: "quiet", opportunity, routedOpportunity },
        alias: { disposition: "paused" },
      } as never)).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    }
    expect(applyWikiObservationBatch(createEmptyWikiState(), [], {
      term: { disposition: "partial", routedOpportunity: latin },
      alias: { disposition: "paused" },
    } as never)).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    expect(applyWikiObservationBatch(createEmptyWikiState(), [], {
      term: { disposition: "quiet", opportunity: own, routedOpportunity: latin },
      alias: { disposition: "paused" },
    } as never)).toEqual({ ok: true, state: createEmptyWikiState(), changed: false });
  });

  it("scores what a partial scan saw and ages nothing it did not", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    state = applyObservationBatch(state, [observe("machine-inference")]);
    state = applyObservationBatch(state, []);
    expect(state.aliasEvidence[0]).toMatchObject({ form: "code x", quietTurns: 1 });

    const partial = applyObservationBatch(state, [
      { ...observe("machine-inference"), form: "code ex" },
      observe("recent-material", "Other"),
    ], tick("partial", "partial"));

    expect(partial.aliasEvidence).toEqual([
      expect.objectContaining({ form: "code ex", support: 4, quietTurns: 0 }),
      expect.objectContaining({ form: "code x", support: 4, quietTurns: 1 }),
    ]);
    expect(partial.termEvidence).toEqual([
      expect.objectContaining({ canonical: "Other", support: 4 }),
    ]);
  });

  it("rejects malformed ticks and batches beyond one ledger bound", () => {
    const state = createEmptyWikiState();
    const opportunity = { locale: "en-US", channel: "spoken", scripts: ["latin"] };
    for (const malformed of [
      { term: { disposition: "quiet" }, alias: { disposition: "paused" } },
      {
        term: { disposition: "quiet", opportunity: { ...opportunity, scripts: ["cyrillic"] } },
        alias: { disposition: "paused" },
      },
      {
        term: { disposition: "quiet", opportunity: { ...opportunity, scripts: ["latin", "latin"] } },
        alias: { disposition: "paused" },
      },
      { term: { disposition: "partial", opportunity }, alias: { disposition: "paused" } },
      { term: { disposition: "paused" }, alias: { disposition: "paused" }, excerpt: "x" },
      { term: "observed", alias: "quiet" },
    ]) {
      expect(applyWikiObservationBatch(state, [], malformed as never))
        .toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    }

    const aliases = Array.from({ length: MAX_WIKI_OBSERVATIONS_PER_LEDGER + 1 }, (_, index) => ({
      ...observe("machine-inference"),
      form: `code-${index.toString().padStart(2, "0")}`,
    }));
    expect(applyWikiObservationBatch(state, aliases, humanTick(aliases)))
      .toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
    const full = [
      ...aliases.slice(0, MAX_WIKI_OBSERVATIONS_PER_LEDGER),
      ...Array.from({ length: MAX_WIKI_OBSERVATIONS_PER_LEDGER }, (_, index) =>
        observe("recent-material", `Term${index.toString().padStart(2, "0")}`)),
    ];
    expect(applyWikiObservationBatch(state, full, humanTick(full)))
      .toMatchObject({ ok: true, changed: true });
  });

  it("lets explicit precedence, not input order, choose one producer per turn", () => {
    const base = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    const latin = {
      ...observe("machine-inference", "Engelbart"),
      producer: "latin-internal-edit-v2" as const,
    };
    const metaphone = { ...latin, producer: "en-metaphone-v1" as const };
    for (const order of [[latin, metaphone], [metaphone, latin]]) {
      expect(applyObservationBatch(base, order).aliasEvidence).toEqual([
        expect.objectContaining({ producer: "latin-internal-edit-v2", support: 4 }),
      ]);
    }

    const broad = observe("recent-material", "OpenAI");
    const shape = { ...broad, producer: "shape-specific-v1" as const };
    for (const order of [[broad, shape], [shape, broad]]) {
      expect(applyObservationBatch(createEmptyWikiState(), order).termEvidence).toEqual([
        expect.objectContaining({
          producer: "shape-specific-v1",
          phase: "collected",
          support: 8,
        }),
      ]);
    }
  });

  it("reinforces an applied provisional alias at most once per comparable turn", () => {
    let state = activeMetaphoneAlias();

    state = settle(state, "accepted-implicit", appliedRule(state, "Engelbart"));
    expect(state.aliasEvidence[0]).toMatchObject({ kept: 4, keptQuietTurns: 0 });
    const rule = appliedRule(state, "Engelbart");
    expect(applyWikiOccurrenceSettlement(state, {
      occurrenceId: "second-occurrence",
      outcome: "accepted-implicit",
      rule,
      origin: "generated",
    })).toEqual({ ok: true, state, changed: false });

    state = applyObservationBatch(state, []);
    expect(state.aliasEvidence[0]).toMatchObject({ kept: 4, keptQuietTurns: 1 });
    state = settle(state, "accepted-implicit", appliedRule(state, "Engelbart"), "generated");
    expect(state.aliasEvidence[0]).toMatchObject({ kept: 8, keptQuietTurns: 0 });
    state = settle(state, "inspected-kept", appliedRule(state, "Engelbart"));
    state = settle(state, "inspected-kept", appliedRule(state, "Engelbart"));
    expect(state.aliasEvidence[0]).toMatchObject({
      phase: "active",
      kept: 24,
      keptQuietTurns: 0,
    });
    expect(state.authorities).toEqual([]);
    expect(state.lexemes[0]).toMatchObject({ provenance: "human-confirmed" });
    expect(parseWikiState(JSON.parse(JSON.stringify(state))))
      .toEqual({ ok: true, state });
  });

  it("records at most one scoring effect per occurrence identity", () => {
    let state = activeMetaphoneAlias();
    const settlement = {
      occurrenceId: "occurrence-a",
      outcome: "accepted-implicit" as const,
      rule: appliedRule(state, "Engelbart"),
      origin: "human-admission" as const,
    };
    state = expectChanged(applyWikiOccurrenceSettlement(state, settlement));
    expect(state.settledOccurrences).toEqual(["occurrence-a"]);
    state = applyObservationBatch(state, []);
    for (const duplicate of [
      settlement,
      { ...settlement, outcome: "inspected-kept" as const },
      { ...settlement, outcome: "reverted" as const },
    ]) {
      expect(applyWikiOccurrenceSettlement(state, duplicate))
        .toEqual({ ok: true, state, changed: false });
    }
    // A person's explicit decision is never swallowed by the settled window.
    const confirmed = expectChanged(applyWikiOccurrenceSettlement(state, {
      ...settlement,
      outcome: "explicit-confirm",
    }));
    expect(confirmed.authorities).toHaveLength(1);
    expect(confirmed.settledOccurrences).toEqual(["occurrence-a"]);

    let bounded = state;
    for (let index = 0; index < MAX_WIKI_SETTLED_OCCURRENCES + 2; index += 1) {
      bounded = applyObservationBatch(bounded, []);
      bounded = settle(
        bounded,
        "accepted-implicit",
        appliedRule(bounded, "Engelbart"),
        "human-admission",
        `window-${index}`,
      );
    }
    expect(bounded.settledOccurrences).toHaveLength(MAX_WIKI_SETTLED_OCCURRENCES);
    expect(bounded.settledOccurrences[0]).toBe("window-2");
    expect(bounded.settledOccurrences.at(-1))
      .toBe(`window-${MAX_WIKI_SETTLED_OCCURRENCES + 1}`);
  });

  it("keeps a used rule retained where silence alone would demote it", () => {
    const activated = activeMetaphoneAlias();
    let used = settle(activated, "inspected-kept", appliedRule(activated, "Engelbart"));
    used = applyObservationBatch(used, []);
    used = settle(used, "accepted-implicit", appliedRule(used, "Engelbart"));
    let unused = applyObservationBatch(activated, []);
    for (let turn = 0; turn < 31; turn += 1) {
      used = applyObservationBatch(used, []);
      unused = applyObservationBatch(unused, []);
    }

    expect(used.aliasEvidence[0]).toMatchObject({
      phase: "active",
      support: 8,
      kept: 12,
      keptQuietTurns: 31,
    });
    expect(projectApplicableWikiRules(used, QUALIFIED)).toEqual([
      expect.objectContaining({ form: "code x", canonical: "Engelbart" }),
    ]);
    expect(unused.aliasEvidence[0]).toMatchObject({ phase: "candidate", support: 8 });
    expect(projectApplicableWikiRules(unused, QUALIFIED)).toEqual([]);
  });

  it("never creates or activates a relation from implicit evidence", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    expect(applyWikiOccurrenceSettlement(state, {
      occurrenceId: "no-relation",
      outcome: "accepted-implicit",
      rule: appliedRule(state, "Engelbart"),
      origin: "human-admission",
    })).toEqual({ ok: true, state, changed: false });

    for (let turn = 0; turn < 3; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart")]);
    }
    for (let occurrence = 0; occurrence < 3; occurrence += 1) {
      state = settle(state, "inspected-kept", appliedRule(state, "Engelbart"));
    }
    expect(state.aliasEvidence[0]).toMatchObject({
      phase: "candidate",
      support: 12,
      kept: 24,
    });
    expect(projectApplicableWikiRules(state, QUALIFIED)).toEqual([]);
  });

  it("does not re-activate a demoted relation through settlements after demotion", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    state = apply(state, {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbert", scope: "both",
    });
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart")]);
    }
    const appliedWhileActive = appliedRule(state, "Engelbart");
    for (let turn = 0; turn < 3; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbert")]);
    }
    expect(projectApplicableWikiRules(state, QUALIFIED)).toEqual([]);

    state = settle(state, "inspected-kept", appliedWhileActive);
    state = settle(state, "inspected-kept", appliedWhileActive);
    expect(state.aliasEvidence.find((entry) =>
      entry.lexemeId === lexemeIdOf(state, "Engelbart"))).toMatchObject({
      phase: "candidate",
      support: 16,
      kept: 16,
    });
    expect(projectApplicableWikiRules(state, QUALIFIED)).toEqual([]);
  });

  it("returns a reverted form to zero, then tombstones a later-epoch second revert", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    state = apply(state, {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbert", scope: "both",
    });
    for (let turn = 0; turn < 2; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart"), metaphone("Engelbert")]);
    }
    for (let turn = 0; turn < 2; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart")]);
    }
    expect(projectApplicableWikiRules(state, QUALIFIED)).toEqual([
      expect.objectContaining({ canonical: "Engelbart", authority: "provisional" }),
    ]);

    const sameEpoch = appliedRule(state, "Engelbart");
    state = settle(state, "reverted", sameEpoch);
    expect(state.aliasEvidence).toEqual([]);
    expect(state.revertStrikes).toEqual([{
      lexemeId: lexemeIdOf(state, "Engelbart"),
      channel: "spoken",
      form: "code x",
      quietTurns: 0,
      struckAtRevision: state.revision,
    }]);
    expect(projectApplicableWikiRules(state, QUALIFIED)).toEqual([]);

    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart")]);
    }
    expect(state.revertStrikes[0]).toMatchObject({ quietTurns: 4 });
    expect(projectApplicableWikiRules(state, QUALIFIED)).toHaveLength(1);

    // A late revert of an occurrence applied before the strike is the same epoch.
    expect(applyWikiOccurrenceSettlement(state, {
      occurrenceId: "late-same-epoch",
      outcome: "reverted",
      rule: sameEpoch,
      origin: "human-admission",
    })).toEqual({ ok: true, state, changed: false });

    state = settle(state, "reverted", appliedRule(state, "Engelbart"));
    expect(state.revertStrikes).toEqual([]);
    expect(state.aliasEvidence).toEqual([]);
    expect(state.aliasTombstones).toEqual([
      expect.objectContaining({ lexemeId: lexemeIdOf(state, "Engelbart"), form: "code x" }),
    ]);
    expect(parseWikiState(JSON.parse(JSON.stringify(state))))
      .toEqual({ ok: true, state });
  });

  it("strikes once for two reverts from one application epoch", () => {
    let state = activeMetaphoneAlias();
    const epoch = appliedRule(state, "Engelbart");
    state = settle(state, "reverted", epoch, "human-admission", "first");
    const struck = state;
    expect(applyWikiOccurrenceSettlement(state, {
      occurrenceId: "second",
      outcome: "reverted",
      rule: epoch,
      origin: "human-admission",
    })).toEqual({ ok: true, state: struck, changed: false });
    expect(struck.revertStrikes).toHaveLength(1);
    expect(struck.aliasTombstones).toEqual([]);
  });

  it("treats a revert without relation evidence as neutral, even with full strike memory", () => {
    const base = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    expect(applyWikiOccurrenceSettlement(base, {
      occurrenceId: "orphan",
      outcome: "reverted",
      rule: appliedRule(base, "Engelbart"),
      origin: "human-admission",
    })).toEqual({ ok: true, state: base, changed: false });

    const full = withFullStrikeMemory(base);
    expect(applyWikiOccurrenceSettlement(full, {
      occurrenceId: "orphan",
      outcome: "reverted",
      rule: appliedRule(full, "Engelbart"),
      origin: "human-admission",
    })).toEqual({ ok: true, state: full, changed: false });
  });

  it("escalates a revert with evidence to a tombstone when strike memory is full", () => {
    const full = withFullStrikeMemory(activeMetaphoneAlias());
    expect(parseWikiState(full)).toMatchObject({ ok: true });

    const reverted = settle(full, "reverted", appliedRule(full, "Engelbart"));
    expect(reverted.revertStrikes).toHaveLength(MAX_WIKI_REVERT_STRIKES);
    expect(reverted.aliasTombstones).toEqual([
      expect.objectContaining({ lexemeId: lexemeIdOf(full, "Engelbart"), form: "code x" }),
    ]);
    expect(projectApplicableWikiRules(reverted, QUALIFIED)).toEqual([]);
  });

  it("ignores acceptance of an occurrence applied before a later revert", () => {
    let state = activeMetaphoneAlias();
    const beforeRevert = appliedRule(state, "Engelbart");
    state = settle(state, "reverted", beforeRevert);
    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart")]);
    }
    expect(applyWikiOccurrenceSettlement(state, {
      occurrenceId: "accepted-before-revert",
      outcome: "inspected-kept",
      rule: beforeRevert,
      origin: "human-admission",
    })).toEqual({ ok: true, state, changed: false });
    state = settle(state, "inspected-kept", appliedRule(state, "Engelbart"));
    expect(state.aliasEvidence[0]).toMatchObject({ kept: 8 });
  });

  it("lets any human decision supersede a strike", () => {
    const active = activeMetaphoneAlias();
    let state = settle(active, "reverted", appliedRule(active, "Engelbart"));
    expect(state.revertStrikes).toHaveLength(1);

    const confirmed = apply(state, decision("confirm-rule", "Engelbart"));
    expect(confirmed.revertStrikes).toEqual([]);
    expect(confirmed.authorities).toHaveLength(1);

    state = apply(state, { type: "remove-lexeme", lexemeId: lexemeIdOf(state, "Engelbart") });
    expect(state.revertStrikes).toEqual([]);
  });

  it("reads authority from state, so confirmed rules stay outside scoring", () => {
    const confirmed = apply(createEmptyWikiState(), decision("confirm-rule", "Codex"));
    for (const outcome of ["accepted-implicit", "inspected-kept", "reverted", "censored"] as const) {
      expect(applyWikiOccurrenceSettlement(confirmed, {
        occurrenceId: `confirmed-${outcome}`,
        outcome,
        rule: appliedRule(confirmed, "Codex"),
        origin: "human-admission",
      })).toEqual({ ok: true, state: confirmed, changed: false });
    }

    // A provisional rule confirmed in the Wiki surface before its occurrence
    // settled is now human authority; a caller cannot relabel it either way.
    const active = activeMetaphoneAlias();
    const rule = appliedRule(active, "Engelbart");
    const promoted = apply(active, decision("confirm-rule", "Engelbart"));
    expect(applyWikiOccurrenceSettlement(promoted, {
      occurrenceId: "promoted",
      outcome: "reverted",
      rule,
      origin: "human-admission",
    })).toEqual({ ok: true, state: promoted, changed: false });
    expect(applyWikiOccurrenceSettlement(active, {
      occurrenceId: "relabelled",
      outcome: "reverted",
      rule: { ...rule, authority: "confirmed" } as never,
      origin: "human-admission",
    })).toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });

    expect(applyWikiOccurrenceSettlement(active, {
      occurrenceId: "censored",
      outcome: "censored",
      rule,
      origin: "human-admission",
    })).toEqual({ ok: true, state: active, changed: false });
  });

  it("routes explicit outcomes through the existing human authority paths", () => {
    const active = activeMetaphoneAlias();
    const kept = settle(active, "explicit-confirm", appliedRule(active, "Engelbart"), "generated");
    expect(kept.authorities).toEqual([
      expect.objectContaining({ form: "code x", lexemeId: lexemeIdOf(kept, "Engelbart") }),
    ]);
    expect(projectApplicableWikiRules(kept, QUALIFIED)).toEqual([
      expect.objectContaining({ canonical: "Engelbart", authority: "confirmed" }),
    ]);

    const rejected = settle(active, "explicit-reject", appliedRule(active, "Engelbart"));
    expect(rejected.aliasTombstones).toHaveLength(1);
    expect(projectApplicableWikiRules(rejected, QUALIFIED)).toEqual([]);

    const replaced = settle(kept, "explicit-replace", appliedRule(kept, "Engelbart"));
    expect(projectApplicableWikiRules(replaced, QUALIFIED)).toEqual([
      expect.objectContaining({ form: "code ex", canonical: "Engelbart", authority: "confirmed" }),
    ]);
  });

  it("ignores implicit acceptance once automatic learning is saturated", () => {
    const active = activeMetaphoneAlias();
    const saturated = Object.freeze({ ...active, automaticLearningSaturated: true });
    expect(applyWikiOccurrenceSettlement(saturated, {
      occurrenceId: "saturated",
      outcome: "inspected-kept",
      rule: appliedRule(active, "Engelbart"),
      origin: "human-admission",
    })).toEqual({ ok: true, state: saturated, changed: false });
  });

  it("rejects malformed occurrence settlements without mutation", () => {
    const state = activeMetaphoneAlias();
    const rule = appliedRule(state, "Engelbart");
    const base = { occurrenceId: "valid-id", rule, origin: "human-admission" };
    for (const malformed of [
      { ...base, outcome: "survived-horizon" },
      { ...base, outcome: "accepted-implicit", origin: "model" },
      { ...base, outcome: "accepted-implicit", rule: { ...rule, excerpt: "x" } },
      { ...base, outcome: "accepted-implicit", excerpt: "x" },
      { ...base, outcome: "explicit-replace" },
      { ...base, outcome: "reverted", replacement: descriptor("a", "B") },
      { ...base, outcome: "accepted-implicit", occurrenceId: "" },
      { ...base, outcome: "accepted-implicit", occurrenceId: "has space" },
      { ...base, outcome: "accepted-implicit", occurrenceId: "x".repeat(65) },
      { ...base, outcome: "accepted-implicit", rule: { ...rule, appliedAtRevision: -1 } },
      { ...base, outcome: "accepted-implicit", rule: { ...rule, appliedAtRevision: 1.5 } },
      {
        ...base,
        outcome: "accepted-implicit",
        rule: { ...rule, appliedAtRevision: state.revision + 1 },
      },
      { outcome: "accepted-implicit", rule, origin: "human-admission" },
    ]) {
      expect(applyWikiOccurrenceSettlement(state, malformed as never))
        .toMatchObject({ ok: false, error: { code: "INVALID_EVENT" } });
    }
  });

  it("keeps learning live after a locale switch fills the term reservoir", () => {
    let state = createEmptyWikiState();
    let word = 0;
    while (state.termEvidence.length < MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS) {
      const events = Array.from({ length: MAX_WIKI_OBSERVATIONS_PER_LEDGER }, () =>
        observe("recent-material", hanWord(word++), "zh-CN"));
      state = applyObservationBatch(state, events, tick("observed", "paused", HAN_TURN));
    }
    expect(state.termEvidence.every((entry) => entry.locale === "zh-CN")).toBe(true);

    const english = observe("recent-material", "morphogenesis");
    state = applyObservationBatch(state, [english], tick("observed", "paused"));
    expect(state.termEvidence).toHaveLength(MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS);
    expect(state.termEvidence.find((entry) => entry.locale === "en-US"))
      .toMatchObject({ canonical: "morphogenesis", phase: "candidate", support: 4 });
    state = applyObservationBatch(state, [english], tick("observed", "paused"));
    expect(state.termEvidence.find((entry) => entry.locale === "en-US"))
      .toMatchObject({ phase: "collected", support: 8 });
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "morphogenesis", provenance: "aggregate-evidence" }),
    ]);
  });

  it("evicts the weakest independent term and never one a relation depends on", () => {
    const zh = (canonical: string, support: number, quietTurns: number) => Object.freeze({
      locale: "zh-CN" as const,
      canonical,
      producer: "locale-segment-v1" as const,
      phase: support >= 8 ? "collected" as const : "candidate" as const,
      support,
      quietTurns,
    });
    const filler = Array.from({ length: MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS - 3 }, (_, index) =>
      zh(hanWord(index), 6, 0));
    const lexeme = Object.freeze({
      id: 1,
      locale: "zh-CN" as const,
      canonical: "材料",
      scope: "both" as const,
      provenance: "aggregate-evidence" as const,
      confirmedAtRevision: null,
    });
    const state: WikiState = Object.freeze({
      ...createEmptyWikiState(),
      revision: 1,
      nextLexemeId: 2,
      lexemes: Object.freeze([lexeme]),
      termEvidence: Object.freeze([
        ...filler,
        zh("材料", 0, 0),
        zh("甲乙", 4, 3),
        zh("丙丁", 4, 9),
      ]),
      aliasEvidence: Object.freeze([Object.freeze({
        lexemeId: 1,
        channel: "spoken" as const,
        boundary: "word" as const,
        form: "才料",
        producer: "zh-exact-homophone-v1" as const,
        phase: "candidate" as const,
        support: 4,
        quietTurns: 0,
        kept: 0,
        keptQuietTurns: 0,
      })]),
    });
    expect(parseWikiState(state)).toMatchObject({ ok: true });

    const next = applyObservationBatch(
      state,
      [observe("recent-material", "morphogenesis")],
      tick("observed", "paused"),
    );
    expect(next.termEvidence.map((entry) => entry.canonical)).not.toContain("丙丁");
    expect(next.termEvidence.map((entry) => entry.canonical)).toContain("甲乙");
    expect(next.termEvidence.map((entry) => entry.canonical)).toContain("材料");
    expect(next.lexemes).toEqual([expect.objectContaining({ canonical: "材料" })]);
  });

  it("keeps learning live after a locale switch fills the relation reservoir", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "zh-CN", canonical: "材料", scope: "both",
    });
    state = apply(state, {
      type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
    });
    let form = 0;
    while (state.aliasEvidence.length < MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS) {
      const events = Array.from({ length: MAX_WIKI_OBSERVATIONS_PER_LEDGER }, () => ({
        type: "observe-evidence" as const,
        source: "machine-inference" as const,
        locale: "zh-CN" as const,
        channel: "spoken" as const,
        boundary: "word" as const,
        form: `才${hanWord(form++)}`,
        canonical: "材料",
        producer: "zh-exact-homophone-v1" as const,
      }));
      state = applyObservationBatch(state, events, tick("paused", "observed", HAN_TURN));
    }

    for (let turn = 0; turn < 4; turn += 1) {
      state = applyObservationBatch(state, [metaphone("Engelbart")]);
    }
    expect(state.aliasEvidence).toHaveLength(MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS);
    expect(projectApplicableWikiRules(state, QUALIFIED)).toEqual([
      expect.objectContaining({ form: "code x", canonical: "Engelbart" }),
    ]);
  });

  it("never evicts an active relation or one observed in the same turn", () => {
    let state = activeMetaphoneAlias();
    const lexemeId = lexemeIdOf(state, "Engelbart");
    const quiet = Array.from({ length: MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS - 1 }, (_, index) =>
      Object.freeze({
        lexemeId,
        channel: "spoken" as const,
        boundary: "literal" as const,
        form: `old-${index.toString().padStart(3, "0")}`,
        producer: "en-metaphone-v1" as const,
        phase: "candidate" as const,
        support: 1,
        quietTurns: 0,
        kept: 0,
        keptQuietTurns: 0,
      }));
    state = Object.freeze({
      ...state,
      aliasEvidence: Object.freeze([...state.aliasEvidence, ...quiet]),
    });
    expect(parseWikiState(state)).toMatchObject({ ok: true });

    const newcomers = Array.from({ length: MAX_WIKI_OBSERVATIONS_PER_LEDGER }, (_, index) => ({
      ...metaphone("Engelbart"),
      form: `new-${index.toString().padStart(2, "0")}`,
    }));
    const next = applyObservationBatch(state, newcomers);
    expect(next.aliasEvidence).toHaveLength(MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS);
    expect(next.aliasEvidence.filter((entry) => entry.form.startsWith("new-")))
      .toHaveLength(MAX_WIKI_OBSERVATIONS_PER_LEDGER);
    expect(next.aliasEvidence.find((entry) => entry.form === "code x"))
      .toMatchObject({ phase: "active" });
  });

  it("lets a strike keep an automatic lexeme neither through demotion nor through aging", () => {
    const struck = (support: number, producer: "shape-specific-v1" | "locale-segment-v1") =>
      Object.freeze({
        ...createEmptyWikiState(),
        revision: 1,
        nextLexemeId: 2,
        lexemes: Object.freeze([Object.freeze({
          id: 1,
          locale: "en-US" as const,
          canonical: "Codex",
          scope: "both" as const,
          provenance: "aggregate-evidence" as const,
          confirmedAtRevision: null,
        })]),
        termEvidence: Object.freeze([Object.freeze({
          locale: "en-US" as const,
          canonical: "Codex",
          producer,
          phase: "collected" as const,
          support,
          quietTurns: 31,
        })]),
        revertStrikes: Object.freeze([Object.freeze({
          lexemeId: 1,
          channel: "spoken" as const,
          form: "code x",
          quietTurns: 0,
          struckAtRevision: 1,
        })]),
      }) satisfies WikiState;

    // A producer change returns the collected term to candidate...
    const demoted = applyObservationBatch(
      struck(8, "shape-specific-v1"),
      [observe("recent-material")],
      tick("observed", "paused"),
    );
    expect(demoted.termEvidence[0]).toMatchObject({ phase: "candidate" });
    // ...and a quiet horizon halves it below retention.
    const aged = applyObservationBatch(struck(6, "locale-segment-v1"), [], tick("quiet", "paused"));
    expect(aged.termEvidence[0]).toMatchObject({ phase: "candidate", support: 3 });

    for (const state of [demoted, aged]) {
      expect(state.lexemes).toEqual([]);
      expect(state.revertStrikes).toEqual([]);
    }
  });

  it("publishes a batch whole or rejects it whole when its final state is invalid", () => {
    const nearBound = Object.freeze({
      ...createEmptyWikiState(),
      revision: Number.MAX_SAFE_INTEGER - 1,
    });
    const one = applyObservationBatch(
      nearBound,
      [observe("recent-material", "Codex")],
      tick("observed", "paused"),
    );
    expect(one.revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseWikiState(JSON.parse(JSON.stringify(one)))).toMatchObject({ ok: true });

    // The first observation alone would fit; the second overruns the revision
    // bound, so neither may be published.
    expect(applyWikiObservationBatch(
      nearBound,
      [observe("recent-material", "Codex"), observe("recent-material", "Morphogenesis")],
      tick("observed", "paused"),
    )).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });

  it("fails a turn whose aging cannot commit instead of skipping the aging", () => {
    const aging = Object.freeze({
      ...repeatEvidence(createEmptyWikiState(), "recent-material", 1),
      revision: Number.MAX_SAFE_INTEGER,
    });
    expect(parseWikiState(aging)).toMatchObject({ ok: true });

    expect(applyWikiObservationBatch(aging, [], tick("quiet", "paused")))
      .toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });

  it("stops listing an automatic lexeme once its term is no longer collected", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    expect(state.lexemes).toHaveLength(1);
    for (let turn = 0; turn < 64; turn += 1) state = applyObservationBatch(state, []);
    expect(state.termEvidence[0]).toMatchObject({ phase: "candidate", support: 2 });
    expect(state.lexemes).toEqual([]);

    state = applyObservationBatch(state, [observe("recent-material")]);
    expect(state.termEvidence[0]).toMatchObject({ phase: "candidate", support: 6 });
    state = applyObservationBatch(state, [observe("recent-material")]);
    expect(state.termEvidence[0]).toMatchObject({ phase: "collected", support: 10 });
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Codex", provenance: "aggregate-evidence" }),
    ]);
  });
});

function observe(
  source: "recent-material",
  canonical?: string,
  locale?: WikiState["lexemes"][number]["locale"],
): WikiObserveTermEvidenceEvent;
function observe(
  source: "machine-inference",
  canonical?: string,
  locale?: WikiState["lexemes"][number]["locale"],
): WikiObserveAliasEvidenceEvent;
function observe(
  source: WikiObserveEvidenceEvent["source"],
  canonical?: string,
  locale?: WikiState["lexemes"][number]["locale"],
): WikiObserveEvidenceEvent;
function observe(
  source: WikiObserveEvidenceEvent["source"],
  canonical = "Codex",
  locale: WikiState["lexemes"][number]["locale"] = "en-US",
): WikiObserveEvidenceEvent {
  const base = {
    type: "observe-evidence" as const,
    locale,
    channel: "spoken" as const,
    boundary: "word" as const,
    form: "code x",
    canonical,
  };
  return source === "recent-material"
    ? {
        type: "observe-evidence",
        source,
        locale,
        canonical,
        producer: "locale-segment-v1",
      }
    : { ...base, source, producer: "legacy-v1" as const };
}

function descriptor(form: string, canonical: string) {
  return {
    locale: "en-US" as const,
    channel: "spoken" as const,
    boundary: "word" as const,
    form,
    canonical,
  };
}

function repeatEvidence(
  state: WikiState,
  source: Extract<WikiEvent, { type: "observe-evidence" }>["source"],
  count: number,
  canonical = "Codex",
): WikiState {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = applyObservationBatch(next, [observe(source, canonical)]);
  }
  return next;
}

function applyObservationBatch(
  state: WikiState,
  events: readonly Extract<WikiEvent, { type: "observe-evidence" }>[],
  batchTick: WikiObservationTick = humanTick(events),
  qualifiedProducers?: ReadonlySet<WikiAliasEvidenceProducer>,
): WikiState {
  const result = applyWikiObservationBatch(state, events, batchTick, qualifiedProducers);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}

const LATIN_OPPORTUNITY = Object.freeze({
  locale: "en-US" as const,
  channel: "spoken" as const,
  scripts: Object.freeze(["latin" as const]),
});

/** One complete English spoken human turn containing Latin words. */
function humanTick(events: readonly WikiObserveEvidenceEvent[]): WikiObservationTick {
  return tick(
    events.some((event) => event.source === "recent-material") ? "observed" : "quiet",
    events.some((event) => event.source === "machine-inference") ? "observed" : "quiet",
  );
}

function tick(
  term: WikiEvidenceTickDisposition,
  alias: WikiEvidenceTickDisposition,
  opportunity: Readonly<{
    locale: WikiState["lexemes"][number]["locale"];
    channel: "spoken" | "written";
    scripts: readonly WikiScriptClass[];
  }> = LATIN_OPPORTUNITY,
): WikiObservationTick {
  return Object.freeze({
    term: ledgerTick(term, opportunity),
    alias: ledgerTick(alias, opportunity),
  });
}

function ledgerTick(
  disposition: WikiEvidenceTickDisposition,
  opportunity: Readonly<{
    locale: WikiState["lexemes"][number]["locale"];
    channel: "spoken" | "written";
    scripts: readonly WikiScriptClass[];
  }>,
  routedOpportunity?: typeof LATIN_OPPORTUNITY,
): WikiLedgerTick {
  if (disposition !== "observed" && disposition !== "quiet") {
    return Object.freeze({ disposition });
  }
  return routedOpportunity === undefined
    ? Object.freeze({ disposition, opportunity })
    : Object.freeze({ disposition, opportunity, routedOpportunity });
}

/** One complete Chinese spoken turn whose Latin words routed to en-US. */
function routedTick(
  term: WikiEvidenceTickDisposition,
  alias: WikiEvidenceTickDisposition,
  opportunity: Readonly<{
    locale: "zh-CN" | "zh-TW" | "ja-JP";
    channel: "spoken";
    scripts: readonly WikiScriptClass[];
  }>,
): WikiObservationTick {
  return Object.freeze({
    term: ledgerTick(term, opportunity, LATIN_OPPORTUNITY),
    alias: ledgerTick(alias, opportunity, LATIN_OPPORTUNITY),
  });
}

let occurrenceSequence = 0;

function settle(
  state: WikiState,
  outcome: WikiOccurrenceOutcome,
  rule: WikiAppliedRule,
  origin: WikiOccurrenceSettlement["origin"] = "human-admission",
  occurrenceId = `occurrence-${occurrenceSequence += 1}`,
): WikiState {
  const result = applyWikiOccurrenceSettlement(
    state,
    outcome === "explicit-replace"
      ? {
          occurrenceId,
          outcome,
          rule,
          origin,
          replacement: descriptor("code ex", rule.canonical),
        }
      : { occurrenceId, outcome, rule, origin },
  );
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}

function expectChanged(result: ReturnType<typeof applyWikiEvent>): WikiState {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  expect(result.changed).toBe(true);
  return result.state;
}

const HAN_TURN = Object.freeze({
  locale: "zh-CN" as const,
  channel: "spoken" as const,
  scripts: Object.freeze(["han" as const]),
});
const HAN_CHARACTERS = [...new Set(
  "的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果",
)];

/** A distinct three-character Han word for reservoir fixtures. */
function hanWord(index: number): string {
  return HAN_CHARACTERS[index % HAN_CHARACTERS.length]! +
    HAN_CHARACTERS[Math.floor(index / HAN_CHARACTERS.length) % HAN_CHARACTERS.length]! +
    "词";
}

function withFullStrikeMemory(state: WikiState): WikiState {
  const lexemeId = lexemeIdOf(state, "Engelbart");
  return Object.freeze({
    ...state,
    revertStrikes: Object.freeze(Array.from({ length: MAX_WIKI_REVERT_STRIKES }, (_, index) =>
      Object.freeze({
        lexemeId,
        channel: "spoken" as const,
        form: `old-${index.toString().padStart(3, "0")}`,
        quietTurns: 0,
        struckAtRevision: state.revision,
      }))),
  });
}

function decision(
  type: "confirm-rule" | "reject-rule",
  canonical = "Codex",
): Extract<WikiEvent, { type: typeof type }> {
  return {
    type,
    locale: "en-US",
    channel: "spoken",
    boundary: "word",
    form: "code x",
    canonical,
  } as Extract<WikiEvent, { type: typeof type }>;
}

function apply(state: WikiState, event: WikiEvent): WikiState {
  const result = applyWikiEvent(state, event);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}

function stateWithHumanLexemes(count: number, includeAggregate = false): WikiState {
  const base = createEmptyWikiState();
  const lexemes: WikiState["lexemes"][number][] = Array.from(
    { length: count },
    (_, index) => Object.freeze({
      id: index + 1,
      locale: "en-US" as const,
      canonical: `Term ${index.toString().padStart(5, "0")}`,
      scope: "both" as const,
      provenance: "human-confirmed" as const,
      confirmedAtRevision: 1,
    }),
  );
  if (includeAggregate) {
    lexemes.push(Object.freeze({
      id: count + 1,
      locale: "en-US" as const,
      canonical: "Collected candidate",
      scope: "both" as const,
      provenance: "aggregate-evidence" as const,
      confirmedAtRevision: null,
    }));
  }
  return Object.freeze({
    ...base,
    revision: 1,
    nextLexemeId: lexemes.length + 1,
    lexemes: Object.freeze(lexemes),
  });
}

function metaphone(canonical: string): WikiObserveAliasEvidenceEvent {
  return { ...observe("machine-inference", canonical), producer: "en-metaphone-v1" };
}

/** A human-owned target whose metaphone relation is active at 16 quarter-units. */
function activeMetaphoneAlias(): WikiState {
  let state = apply(createEmptyWikiState(), {
    type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both",
  });
  for (let turn = 0; turn < 4; turn += 1) {
    state = applyObservationBatch(state, [metaphone("Engelbart")]);
  }
  expect(state.aliasEvidence[0]).toMatchObject({ phase: "active", support: 16 });
  return state;
}

/** The occurrence was applied from the basis compiled at the current revision. */
function appliedRule(state: WikiState, canonical: string): WikiAppliedRule {
  return { ...descriptor("code x", canonical), appliedAtRevision: state.revision };
}

function lexemeIdOf(state: WikiState, canonical: string): number {
  const lexeme = state.lexemes.find((entry) => entry.canonical === canonical);
  if (lexeme === undefined) throw new Error(`missing lexeme ${canonical}`);
  return lexeme.id;
}

function canonicalOf(state: WikiState, lexemeId: number): string | undefined {
  return state.lexemes.find((entry) => entry.id === lexemeId)?.canonical;
}
