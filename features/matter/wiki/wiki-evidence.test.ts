import { describe, expect, it } from "vitest";
import {
  WIKI_SCORE_POLICY,
  applyWikiEvent,
  applyWikiObservationBatch,
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
  MAX_WIKI_TOMBSTONES,
  WIKI_SCORING_VERSION,
  type WikiEvent,
  type WikiObserveAliasEvidenceEvent,
  type WikiObserveEvidenceEvent,
  type WikiObserveTermEvidenceEvent,
  type WikiState,
} from "./wiki-model";
import { parseWikiState } from "./wiki-codec";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "./wiki-qualified-producer-releases";

describe("Wiki evidence and authority", () => {
  it("starts as a deeply immutable, versioned local state", () => {
    const state = createEmptyWikiState();

    expect(state).toEqual({
      schemaVersion: 6,
      scoringVersion: 3,
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
      expect.objectContaining({ canonical: "Codex", phase: "candidate", support: 1 }),
    ]);

    state = applyObservationBatch(state, [observe("recent-material")]);
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Codex", provenance: "aggregate-evidence" }),
    ]);
    expect(state.termEvidence[0]).toMatchObject({ phase: "collected", support: 2 });
  });

  it("keeps untouched product starters outside the term-aging ledger", () => {
    const state = createInitialWikiState();
    const result = applyWikiObservationBatch(state, state.lexemes.map((lexeme) => ({
      type: "observe-evidence" as const,
      locale: lexeme.locale,
      canonical: lexeme.canonical,
      source: "recent-material" as const,
      producer: "locale-segment-v1" as const,
    })));

    expect(result).toEqual({ ok: true, state, changed: false });
    expect(state.termEvidence).toEqual([]);
  });

  it("ages term evidence on its own quiet horizon without a global cohort", () => {
    let state = applyObservationBatch(createEmptyWikiState(), [observe("recent-material")]);
    for (let index = 0; index < 31; index += 1) state = applyObservationBatch(state, []);
    expect(state.termEvidence[0]).toMatchObject({ support: 1, quietTurns: 31 });

    state = applyObservationBatch(state, []);
    expect(state.termEvidence).toEqual([]);
    expect(state.lexemes).toEqual([]);
  });

  it("ticks term and alias ledgers independently and never ages censored evidence", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2);
    state = repeatEvidence(state, "machine-inference", 4);
    const initialTerm = state.termEvidence[0];
    for (let turn = 0; turn < 8; turn += 1) {
      const result = applyWikiObservationBatch(state, [], {
        term: "paused",
        alias: "quiet",
      });
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    expect(state.termEvidence[0]).toEqual(initialTerm);
    expect(state.aliasEvidence[0]?.quietTurns).toBe(8);

    const censored = applyWikiObservationBatch(state, [], {
      term: "censored",
      alias: "censored",
    });
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
      expect.objectContaining({ producer: "latin-internal-edit-v2", support: 4 }),
    ]);

    const next = applyWikiObservationBatch(state, [{
      type: "observe-evidence",
      source: "machine-inference",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "Englebart",
      canonical: "Engelbart",
      producer: "en-metaphone-v1",
    }]);
    if (!next.ok) throw new Error(next.error.message);
    state = next.state;

    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ producer: "en-metaphone-v1", support: 1 }),
    ]);
  });

  it("cannot apply events through paused, censored, or quiet dispositions", () => {
    const term = observe("recent-material");
    const alias = observe("machine-inference");
    for (const disposition of ["paused", "censored", "quiet"] as const) {
      const result = applyWikiObservationBatch(createEmptyWikiState(), [term, alias], {
        term: disposition,
        alias: disposition,
      });
      expect(result).toEqual({ ok: true, state: createEmptyWikiState(), changed: false });
    }
  });

  it("drops unseen soft candidates at capacity while existing evidence keeps moving", () => {
    const termEvidence = Object.freeze(Array.from(
      { length: MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS },
      (_, index) => Object.freeze({
        locale: "en-US" as const,
        canonical: `Term${index.toString().padStart(4, "0")}`,
        producer: "locale-segment-v1" as const,
        phase: "candidate" as const,
        support: 1,
        quietTurns: 0,
      }),
    ));
    const state: WikiState = Object.freeze({
      ...createEmptyWikiState(),
      termEvidence,
    });
    const result = applyWikiObservationBatch(state, [
      {
        type: "observe-evidence",
        source: "recent-material",
        locale: "en-US",
        canonical: "Term0000",
        producer: "locale-segment-v1",
      },
      {
        type: "observe-evidence",
        source: "recent-material",
        locale: "en-US",
        canonical: "UnseenTerm",
        producer: "locale-segment-v1",
      },
    ]);

    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) return;
    expect(result.state.termEvidence).toHaveLength(MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS);
    expect(result.state.termEvidence.find((entry) => entry.canonical === "UnseenTerm"))
      .toBeUndefined();
    expect(result.state.termEvidence[0]).toMatchObject({ phase: "collected", support: 2 });
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

    expect(state.aliasEvidence[0]).toMatchObject({ support: 2, quietTurns: 0 });
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
    for (let index = 0; index < 32; index += 1) {
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
      for (let index = 0; index < 32; index += 1) {
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

    for (let index = 0; index < 60; index += 1) {
      state = applyObservationBatch(state, []);
    }

    expect(state.termEvidence).toEqual([
      expect.objectContaining({ canonical: "Codex", phase: "candidate", support: 0 }),
    ]);
    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ support: 2 }),
    ]);
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Codex", provenance: "aggregate-evidence" }),
    ]);
    expect(parseWikiState(state)).toMatchObject({ ok: true });

    for (let index = 0; index < 36; index += 1) {
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
      expect.objectContaining({ canonical: "Codex", phase: "candidate", support: 1 }),
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

    expect(state.aliasEvidence[0].support).toBe(2);
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("keeps an empty observation batch a no-op before evidence exists", () => {
    const state = createEmptyWikiState();
    expect(applyWikiObservationBatch(state, []))
      .toEqual({ ok: true, state, changed: false });
  });

  it("removes fully decayed alias evidence without blocking a later observation", () => {
    let state = apply(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Codex", scope: "both",
    });
    state = apply(state, observe("machine-inference"));
    for (let index = 0; index < 32; index += 1) state = applyObservationBatch(state, []);
    expect(state.aliasEvidence).toEqual([]);
    state = apply(state, observe("machine-inference"));
    expect(state.aliasEvidence).toEqual([
      expect.objectContaining({ form: "code x", support: 1 }),
    ]);
  });

  it("does not let material frequency invent an alias relation", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 3);

    expect(state.termEvidence[0]).toMatchObject({ phase: "collected", support: 3 });
    expect(state.aliasEvidence).toEqual([]);
    expect(projectApplicableWikiRules(state)).toEqual([]);

    state = apply(state, observe("machine-inference"));
    expect(state.aliasEvidence[0]).toMatchObject({ producer: "legacy-v1", support: 1 });
    expect(projectApplicableWikiRules(state)).toEqual([]);
  });

  it("keeps legacy migrated relations non-authoritative regardless of vote count", () => {
    let state = repeatEvidence(createEmptyWikiState(), "recent-material", 2, "Codex");
    state = repeatEvidence(state, "machine-inference", 32, "Codex");
    expect(state.aliasEvidence[0]).toMatchObject({
      producer: "legacy-v1", phase: "candidate", support: 32,
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
    const result = applyWikiObservationBatch(confirmed, [
      observe("recent-material"),
      observe("recent-material"),
    ]);

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
        support: 3,
        quietTurns: 0,
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
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "active", support: 4 });

    const parsed = parseWikiState(JSON.parse(JSON.stringify(state)));
    if (!parsed.ok) throw new Error(parsed.message);
    state = applyObservationBatch(parsed.state, []);
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "active", support: 4 });

    for (let turn = 1; turn < 32; turn += 1) {
      state = applyObservationBatch(state, []);
    }
    expect(state.aliasEvidence[0]).toMatchObject({ phase: "candidate", support: 2 });
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
      { term: "paused", alias: "censored" },
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
      { term: "paused", alias: "quiet" },
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
      { term: "paused", alias: "censored" },
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
    expect(state.aliasEvidence[0].support).toBe(MAX_WIKI_EVIDENCE_COUNT);
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
});

function observe(
  source: "recent-material",
  canonical?: string,
): WikiObserveTermEvidenceEvent;
function observe(
  source: "machine-inference",
  canonical?: string,
): WikiObserveAliasEvidenceEvent;
function observe(
  source: WikiObserveEvidenceEvent["source"],
  canonical?: string,
): WikiObserveEvidenceEvent;
function observe(
  source: WikiObserveEvidenceEvent["source"],
  canonical = "Codex",
): WikiObserveEvidenceEvent {
  const base = {
    type: "observe-evidence" as const,
    locale: "en-US" as const,
    channel: "spoken" as const,
    boundary: "word" as const,
    form: "code x",
    canonical,
  };
  return source === "recent-material"
    ? {
        type: "observe-evidence",
        source,
        locale: base.locale,
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
): WikiState {
  const result = applyWikiObservationBatch(state, events);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
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

function canonicalOf(state: WikiState, lexemeId: number): string | undefined {
  return state.lexemes.find((entry) => entry.id === lexemeId)?.canonical;
}
