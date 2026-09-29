import { describe, expect, it } from "vitest";
import {
  maximumRawWikiStateBytes,
  parseWikiEvent,
  parseWikiState,
  wikiStateStorageBytes,
} from "./wiki-codec";
import {
  applyWikiEvent,
  applyWikiObservationBatch,
  createEmptyWikiState,
  createWikiProjectionPolicy,
  projectApplicableWikiRules,
} from "./wiki-evidence";
import { compileWikiFitSnapshot } from "./wiki-fitting";
import {
  MAX_LEGACY_WIKI_STATE_BYTES,
  MAX_WIKI_EVIDENCE_RECORDS,
  MAX_WIKI_MIGRATION_HEADROOM_BYTES,
  MAX_WIKI_STATE_BYTES,
  MAX_WIKI_V6_STATE_BYTES,
  MAX_WIKI_V7_MIGRATION_HEADROOM_BYTES,
  type WikiEvent,
  type WikiObservationTick,
} from "./wiki-model";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "./wiki-qualified-producer-releases";

const LOCALE_SEGMENT_RELEASES = MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.filter(
  (release) => release.identity.producerId === "locale-segment-v1",
);

describe("Wiki codec", () => {
  it("round-trips a strict immutable state", () => {
    const transition = applyWikiEvent(createEmptyWikiState(), event("confirm-rule"));
    if (!transition.ok) throw new Error(transition.error.message);

    const parsed = parseWikiState(JSON.parse(JSON.stringify(transition.state)));

    expect(parsed).toEqual({ ok: true, state: transition.state });
    if (!parsed.ok) throw new Error(parsed.message);
    expect(Object.isFrozen(parsed.state)).toBe(true);
    expect(Object.isFrozen(parsed.state.authorities)).toBe(true);
    expect(Object.isFrozen(parsed.state.authorities[0])).toBe(true);
  });

  it("still detaches an externally frozen state before granting authority", () => {
    const transition = applyWikiEvent(createEmptyWikiState(), event("confirm-rule"));
    if (!transition.ok) throw new Error(transition.error.message);
    const external = deepFreeze(JSON.parse(JSON.stringify(transition.state)));

    const first = parseWikiState(external);
    const second = parseWikiState(external);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.state).not.toBe(external);
    expect(second.state).not.toBe(external);
    expect(second.state).not.toBe(first.state);
  });

  it("rejects schema v1 and unsupported locales instead of widening scope", () => {
    expect(parseWikiState({
      ...createEmptyWikiState(),
      schemaVersion: 1,
    })).toEqual({ ok: false, message: "The Wiki state fields are invalid." });
    expect(parseWikiEvent({
      ...event("confirm-rule"),
      locale: "en-GB",
    })).toEqual({ ok: false, message: "The Wiki decision event is invalid." });
    const withoutLocale: Record<string, unknown> = { ...event("confirm-rule") };
    delete withoutLocale.locale;
    expect(parseWikiEvent(withoutLocale)).toEqual({
      ok: false,
      message: "The Wiki decision event fields are invalid.",
    });
  });

  it("rejects unknown state and event fields instead of retaining raw material", () => {
    expect(parseWikiState({ ...createEmptyWikiState(), rawMaterial: "private passage" }))
      .toEqual({ ok: false, message: "The Wiki state fields are invalid." });
    expect(parseWikiEvent({ ...event("confirm-rule"), excerpt: "private passage" }))
      .toEqual({ ok: false, message: "The Wiki decision event fields are invalid." });
  });

  it("does not represent model or generated output as evidence", () => {
    expect(parseWikiEvent({
      ...event("observe-evidence"),
      source: "llm-output",
    })).toEqual({ ok: false, message: "The Wiki evidence event is invalid." });
    expect(parseWikiEvent({
      ...event("observe-evidence"),
      source: "generated-material",
    })).toEqual({ ok: false, message: "The Wiki evidence event is invalid." });
  });

  it("rejects non-NFC, surrounding whitespace, lone surrogates, and no-op rules", () => {
    for (const candidate of [
      { ...event("confirm-rule"), form: " eхample" },
      { ...event("confirm-rule"), form: "e\u0301" },
      { ...event("confirm-rule"), form: "\ud800" },
      { ...event("confirm-rule"), form: "Codex" },
    ]) {
      expect(parseWikiEvent(candidate).ok).toBe(false);
    }
    expect(parseWikiEvent({ ...event("confirm-rule"), form: "é" }).ok).toBe(true);
  });

  it("rejects invisible and bidi format controls but keeps valid emoji joiners", () => {
    for (const form of ["co\u200bdex", "co\u202edex", "co\u2066dex"]) {
      expect(parseWikiEvent({
        type: "confirm-rule",
        locale: "en-US",
        channel: "written",
        boundary: "word",
        form,
        canonical: "Codex",
      }).ok).toBe(false);
    }
    expect(parseWikiEvent({
      type: "confirm-rule",
      locale: "en-US",
      channel: "written",
      boundary: "literal",
      form: "woman developer",
      canonical: "👩🏽‍💻",
    }).ok).toBe(true);
    expect(parseWikiEvent({
      type: "confirm-rule",
      locale: "en-US",
      channel: "written",
      boundary: "literal",
      form: "family",
      canonical: "👨‍👩‍👧‍👦",
    }).ok).toBe(true);
    for (const canonical of ["a‍b", "‍👩", "👩‍", "👩‍‍💻"]) {
      expect(parseWikiEvent({
        type: "confirm-rule",
        locale: "en-US",
        channel: "written",
        boundary: "literal",
        form: "unsafe joiner",
        canonical,
      }).ok).toBe(false);
    }
  });

  it("rejects duplicated, future, and contradictory durable decisions", () => {
    const confirmed = applyWikiEvent(createEmptyWikiState(), event("confirm-rule"));
    if (!confirmed.ok) throw new Error(confirmed.error.message);
    const base = confirmed.state;
    const authority = base.authorities[0];

    expect(parseWikiState({ ...base, authorities: [authority, authority] }).ok).toBe(false);
    expect(parseWikiState({
      ...base,
      authorities: [{ ...authority, confirmedAtRevision: 2 }],
    }).ok).toBe(false);
    expect(parseWikiState({
      ...base,
      aliasTombstones: [{ ...authority, rejectedAtRevision: 1 }],
    }).ok).toBe(false);
  });

  it("parses canonical lexeme lifecycle events", () => {
    expect(parseWikiEvent({
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    }).ok).toBe(true);
    expect(parseWikiEvent({
      type: "rename-lexeme",
      lexemeId: 1,
      locale: "en-US",
      canonical: "Douglas Engelbart",
      scope: "spoken",
    }).ok).toBe(true);
    expect(parseWikiEvent({ type: "remove-lexeme", lexemeId: 1 }).ok).toBe(true);
    expect(parseWikiEvent({
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
    }).ok).toBe(false);
    expect(parseWikiEvent({
      type: "rename-lexeme",
      lexemeId: 1,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "unknown",
    }).ok).toBe(false);
  });

  it("migrates every V3 lexeme to the reversible both-channel scope", () => {
    const created = applyWikiEvent(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "spoken",
    });
    if (!created.ok) throw new Error(created.error.message);
    const legacy = {
      schemaVersion: 3,
      scoringVersion: 2,
      fittingVersion: 1,
      revision: created.state.revision,
      nextLexemeId: created.state.nextLexemeId,
      recentObservationCount: 0,
      automaticLearningSaturated: false,
      lexemes: created.state.lexemes.map((lexeme) => ({
        id: lexeme.id,
        locale: lexeme.locale,
        canonical: lexeme.canonical,
        provenance: lexeme.provenance,
        confirmedAtRevision: lexeme.confirmedAtRevision,
      })),
      evidence: [],
      authorities: created.state.authorities,
      aliasTombstones: created.state.aliasTombstones,
      lexemeTombstones: created.state.lexemeTombstones,
    };

    const parsed = parseWikiState(legacy);

    expect(parsed).toMatchObject({
      ok: true,
      state: {
        schemaVersion: 7,
        lexemes: [{ canonical: "Engelbart", scope: "both" }],
        revertStrikes: [],
      },
    });
  });

  it("strictly splits V4 recurrence from zero-weight legacy relation evidence", () => {
    const parsed = parseWikiState({
      schemaVersion: 4,
      scoringVersion: 2,
      fittingVersion: 1,
      revision: 7,
      nextLexemeId: 2,
      recentObservationCount: 19,
      automaticLearningSaturated: false,
      lexemes: [{
        id: 1,
        locale: "en-US",
        canonical: "Codex",
        scope: "both",
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      }],
      evidence: [
        {
          lexemeId: 1,
          channel: "spoken",
          boundary: "word",
          form: "code x",
          counts: { historicalMaterial: 0, recentMaterial: 1, machineInference: 4 },
        },
        {
          lexemeId: 1,
          channel: "written",
          boundary: "literal",
          form: "cod ex",
          counts: { historicalMaterial: 1, recentMaterial: 0, machineInference: 0 },
        },
      ],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
    });

    expect(parsed).toMatchObject({
      ok: true,
      state: {
        schemaVersion: 7,
        scoringVersion: 4,
        termEvidence: [{
          locale: "en-US",
          canonical: "Codex",
          producer: "legacy-term-v1",
          phase: "candidate",
          support: 4,
          quietTurns: 0,
        }],
        aliasEvidence: [{
          lexemeId: 1,
          form: "code x",
          producer: "legacy-v1",
          phase: "candidate",
          support: 16,
          quietTurns: 0,
          kept: 0,
          keptQuietTurns: 0,
        }],
      },
    });
  });

  it("migrates V5 recurrence without granting a qualified fitting target", () => {
    const legacy = {
      schemaVersion: 5,
      scoringVersion: 3,
      fittingVersion: 1,
      revision: 2,
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
      termEvidence: [{
        locale: "en-US",
        canonical: "Lexicorium",
        phase: "collected",
        support: 2,
        quietTurns: 0,
      }],
      aliasEvidence: [],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
    };
    const parsed = parseWikiState(legacy);
    if (!parsed.ok) throw new Error(parsed.message);

    expect(parsed.state.termEvidence).toEqual([
      expect.objectContaining({ producer: "legacy-term-v1", phase: "collected", support: 8 }),
    ]);
    expect(parseWikiState(JSON.parse(JSON.stringify(parsed.state))))
      .toEqual({ ok: true, state: parsed.state });
    expect(compileWikiFitSnapshot(
      parsed.state,
      LOCALE_SEGMENT_RELEASES,
    ).stats.eligibleLexemeCount).toBe(0);

    let observed = parsed.state;
    for (let turn = 0; turn < 2; turn += 1) {
      const result = applyWikiObservationBatch(observed, [{
        type: "observe-evidence",
        source: "recent-material",
        locale: "en-US",
        canonical: "Lexicorium",
        producer: "locale-segment-v1",
      }], englishTick("observed", "quiet"));
      if (!result.ok) throw new Error(result.error.message);
      observed = result.state;
    }
    expect(compileWikiFitSnapshot(
      observed,
      LOCALE_SEGMENT_RELEASES,
    ).stats.eligibleLexemeCount).toBe(0);
    expect(parseWikiState({
      ...legacy,
      termEvidence: [{ ...legacy.termEvidence[0], producer: "locale-segment-v1" }],
    }).ok).toBe(false);
  });

  it("reserves a proved byte allowance for the largest V5 term-ledger migration", () => {
    const lexemes = Array.from({ length: MAX_WIKI_EVIDENCE_RECORDS }, (_, index) => ({
      id: index + 1,
      locale: "en-US" as const,
      canonical: `Term ${index.toString().padStart(5, "0")}`,
      scope: "both" as const,
      provenance: "aggregate-evidence" as const,
      confirmedAtRevision: null,
    }));
    const legacy = {
      schemaVersion: 5,
      scoringVersion: 3,
      fittingVersion: 1,
      revision: 1,
      nextLexemeId: MAX_WIKI_EVIDENCE_RECORDS + 1,
      automaticLearningSaturated: false,
      lexemes,
      termEvidence: lexemes.map((entry) => ({
        locale: entry.locale,
        canonical: entry.canonical,
        phase: "candidate" as const,
        support: 1,
        quietTurns: 0,
      })),
      aliasEvidence: [],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
    };
    const legacyBytes = wikiStateStorageBytes(legacy);
    const parsed = parseWikiState(legacy);
    if (!parsed.ok) throw new Error(parsed.message);
    const migratedBytes = wikiStateStorageBytes(parsed.state);
    const producerFieldBytes = new TextEncoder()
      .encode(',"producer":"legacy-term-v1"').byteLength;
    const strikeCollectionBytes = new TextEncoder()
      .encode(',"revertStrikes":[]').byteLength;

    expect(legacyBytes).toBeLessThanOrEqual(MAX_LEGACY_WIKI_STATE_BYTES);
    // Support 1 scales to 4 without a new digit, isolating the producer field.
    expect(migratedBytes - legacyBytes)
      .toBe(producerFieldBytes * MAX_WIKI_EVIDENCE_RECORDS + strikeCollectionBytes);
    expect(migratedBytes - legacyBytes - strikeCollectionBytes).toBeLessThanOrEqual(
      MAX_WIKI_MIGRATION_HEADROOM_BYTES,
    );
    expect(migratedBytes).toBeLessThanOrEqual(MAX_WIKI_STATE_BYTES);
  }, 20_000);

  it("keeps V4 starter recurrence out of the term ledger while legacy aliases decay", () => {
    const parsed = parseWikiState({
      schemaVersion: 4,
      scoringVersion: 2,
      fittingVersion: 1,
      revision: 4,
      nextLexemeId: 2,
      recentObservationCount: 3,
      automaticLearningSaturated: false,
      lexemes: [{
        id: 1,
        locale: "en-US",
        canonical: "Engelbart",
        scope: "both",
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      }],
      evidence: [{
        lexemeId: 1,
        channel: "spoken",
        boundary: "word",
        form: "engel bard",
        counts: { historicalMaterial: 1, recentMaterial: 2, machineInference: 4 },
      }],
      authorities: [],
      aliasTombstones: [],
      lexemeTombstones: [],
    });
    if (!parsed.ok) throw new Error(parsed.message);

    expect(parsed.state.termEvidence).toEqual([]);
    expect(parsed.state.aliasEvidence).toEqual([
      expect.objectContaining({ form: "engel bard", support: 16 }),
    ]);

    let state = parsed.state;
    for (let index = 0; index < 160; index += 1) {
      const aged = applyWikiObservationBatch(state, [], englishTick("quiet", "quiet"));
      if (!aged.ok) throw new Error(aged.error.message);
      state = aged.state;
    }
    expect(state.aliasEvidence).toEqual([]);
    expect(state.lexemes).toEqual([
      expect.objectContaining({ canonical: "Engelbart", provenance: "aggregate-evidence" }),
    ]);
  });

  it("does not migrate automatic recurrence onto a human-owned lexeme", () => {
    const parsed = parseWikiState({
      schemaVersion: 4,
      scoringVersion: 2,
      fittingVersion: 1,
      revision: 2,
      nextLexemeId: 2,
      recentObservationCount: 7,
      automaticLearningSaturated: false,
      lexemes: [{
        id: 1,
        locale: "en-US",
        canonical: "Codex",
        scope: "both",
        provenance: "human-confirmed",
        confirmedAtRevision: 2,
      }],
      evidence: [{
        lexemeId: 1,
        channel: "spoken",
        boundary: "word",
        form: "code x",
        counts: { historicalMaterial: 3, recentMaterial: 2, machineInference: 1 },
      }],
      authorities: [{
        lexemeId: 1,
        channel: "spoken",
        boundary: "word",
        form: "code x",
        confirmedAtRevision: 2,
      }],
      aliasTombstones: [],
      lexemeTombstones: [],
    });

    expect(parsed).toMatchObject({
      ok: true,
      state: {
        termEvidence: [],
        aliasEvidence: [{ producer: "legacy-v1", support: 4 }],
        authorities: [{ form: "code x" }],
      },
    });
  });

  it("rejects V6 recurrence attached to a human-owned lexeme", () => {
    const state = applyWikiEvent(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Codex",
      scope: "both",
    });
    if (!state.ok) throw new Error(state.error.message);

    expect(parseWikiState({
      ...state.state,
      termEvidence: [{
        locale: "en-US",
        canonical: "Codex",
        producer: "locale-segment-v1",
        phase: "candidate",
        support: 1,
        quietTurns: 0,
      }],
    })).toMatchObject({ ok: false });
  });

  it("accepts only one evidence observation per event", () => {
    expect(parseWikiEvent({ ...event("observe-evidence"), count: 0 }).ok).toBe(false);
    expect(parseWikiEvent({ ...event("observe-evidence"), count: 33 }).ok).toBe(false);
    expect(parseWikiEvent(event("observe-evidence"))).toEqual({
      ok: true,
      event: event("observe-evidence"),
    });
  });

  it("parses one exact atomic replacement event", () => {
    const before = descriptor("code x", "Codex");
    const after = descriptor("open eye", "OpenAI");

    expect(parseWikiEvent({ type: "replace-rule", before, after })).toEqual({
      ok: true,
      event: { type: "replace-rule", before, after },
    });
    expect(parseWikiEvent({
      type: "replace-rule",
      before,
      after,
      excerpt: "private passage",
    })).toEqual({
      ok: false,
      message: "The Wiki replacement event fields are invalid.",
    });
  });

  it("migrates a strict V2 relation state to stable lexeme ids", () => {
    const parsed = parseWikiState({
      schemaVersion: 2,
      scoringVersion: 2,
      revision: 2,
      recentObservationCount: 0,
      evidence: [],
      authorities: [
        { ...descriptor("engel bard", "Engelbart"), confirmedAtRevision: 1 },
        {
          ...descriptor("英格尔巴特", "Engelbart"),
          locale: "zh-CN",
          boundary: "literal",
          confirmedAtRevision: 2,
        },
      ],
      tombstones: [],
    });

    expect(parsed).toMatchObject({
      ok: true,
      state: {
        schemaVersion: 7,
        fittingVersion: 1,
        revision: 2,
        nextLexemeId: 3,
        lexemes: [
          { id: 1, locale: "en-US", canonical: "Engelbart", scope: "both" },
          { id: 2, locale: "zh-CN", canonical: "Engelbart", scope: "both" },
        ],
        authorities: [
          { lexemeId: 1, form: "engel bard" },
          { lexemeId: 2, form: "英格尔巴特" },
        ],
      },
    });
  });

  it("assigns migrated ids with a locale-independent code-unit order", () => {
    const canonicals = ["中", "ä", "z", "A", "😀"];
    const migrate = (values: readonly string[]) => parseWikiState({
      schemaVersion: 2,
      scoringVersion: 2,
      revision: 1,
      recentObservationCount: 0,
      evidence: [],
      authorities: values.map((canonical, index) => ({
        ...descriptor(`alias-${index}-${canonical}`, canonical),
        confirmedAtRevision: 1,
      })),
      tombstones: [],
    });
    const forward = migrate(canonicals);
    const reverse = migrate([...canonicals].reverse());

    expect(forward.ok).toBe(true);
    expect(reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) return;
    expect(forward.state.lexemes).toEqual(reverse.state.lexemes);
    expect(forward.state.lexemes.map((entry) => entry.canonical))
      .toEqual(["A", "z", "ä", "中", "😀"]);
  });

  it("keeps a valid 5001-identity V2 recovery state writable after migration", () => {
    const evidence = Array.from({ length: 3_000 }, (_, index) => ({
      ...descriptor(`e-${index}`, `Evidence-${index}`),
      counts: { historicalMaterial: 0, recentMaterial: 0, machineInference: 1 },
    }));
    const tombstones = Array.from({ length: 2_001 }, (_, index) => ({
      ...descriptor(`t-${index}`, `Tombstone-${index}`),
      rejectedAtRevision: 1,
    }));
    const parsed = parseWikiState({
      schemaVersion: 2,
      scoringVersion: 2,
      revision: 1,
      recentObservationCount: 0,
      evidence,
      authorities: [],
      tombstones,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.lexemes).toHaveLength(5_001);
    expect(wikiStateStorageBytes(parsed.state)).toBeLessThanOrEqual(MAX_WIKI_STATE_BYTES);
  }, 20_000);

  it("migrates a V6 whole-unit state to exact V7 quarter-units", () => {
    const legacy = wholeUnitState({
      termEvidence: [
        term("Anemone", "candidate", 1, 7),
        term("Borealis", "collected", 2, 0),
        term("Codex", "collected", 255, 31),
      ],
      aliasEvidence: [
        alias(1, "aurora x", "zh-exact-homophone-v1", "active", 3, 4),
        alias(2, "borealis x", "legacy-v1", "candidate", 255, 0),
      ],
    });

    const parsed = parseWikiState(legacy);
    if (!parsed.ok) throw new Error(parsed.message);

    expect(parsed.state).toMatchObject({
      schemaVersion: 7,
      scoringVersion: 4,
      revertStrikes: [],
      termEvidence: [
        { canonical: "Anemone", phase: "candidate", support: 4, quietTurns: 7 },
        { canonical: "Borealis", phase: "collected", support: 8, quietTurns: 0 },
        { canonical: "Codex", phase: "collected", support: 1_020, quietTurns: 31 },
      ],
      aliasEvidence: [
        { form: "aurora x", phase: "active", support: 12, quietTurns: 4, kept: 0, keptQuietTurns: 0 },
        { form: "borealis x", phase: "candidate", support: 1_020, kept: 0, keptQuietTurns: 0 },
      ],
    });
    // Every former gate is preserved: the active exact relation still projects.
    expect(projectApplicableWikiRules(
      parsed.state,
      createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES),
    )).toEqual([expect.objectContaining({ form: "aurora x", canonical: "Aurora" })]);
    expect(parseWikiState(JSON.parse(JSON.stringify(parsed.state))))
      .toEqual({ ok: true, state: parsed.state });
  });

  it("rejects values outside each schema's own unit bands instead of repairing them", () => {
    const v6 = wholeUnitState({
      termEvidence: [term("Borealis", "collected", 2, 0)],
      aliasEvidence: [alias(1, "aurora x", "zh-exact-homophone-v1", "candidate", 2, 0)],
    });
    expect(parseWikiState(v6).ok).toBe(true);
    for (const invalid of [
      { ...v6, termEvidence: [term("Borealis", "candidate", 2, 0)] },
      { ...v6, termEvidence: [term("Borealis", "collected", 0, 0)] },
      { ...v6, aliasEvidence: [alias(1, "aurora x", "zh-exact-homophone-v1", "candidate", 256, 0)] },
      { ...v6, scoringVersion: 4 },
      { ...v6, revertStrikes: [] },
      { ...v6, aliasEvidence: [{
        ...alias(1, "aurora x", "zh-exact-homophone-v1", "candidate", 2, 0),
        kept: 0,
        keptQuietTurns: 0,
      }] },
    ]) expect(parseWikiState(invalid).ok).toBe(false);

    const parsed = parseWikiState(v6);
    if (!parsed.ok) throw new Error(parsed.message);
    const v7 = JSON.parse(JSON.stringify(parsed.state)) as Record<string, unknown> & {
      termEvidence: Record<string, unknown>[];
      aliasEvidence: Record<string, unknown>[];
    };
    const strike = { lexemeId: 1, channel: "spoken", form: "aurora x", quietTurns: 0 };
    expect(parseWikiState({ ...v7, revertStrikes: [strike] }).ok).toBe(true);
    for (const invalid of [
      { ...v7, scoringVersion: 3 },
      { ...v7, termEvidence: [{ ...v7.termEvidence[0], phase: "collected", support: 3 }] },
      { ...v7, termEvidence: [{ ...v7.termEvidence[0], phase: "candidate", support: 8 }] },
      { ...v7, termEvidence: [{ ...v7.termEvidence[0], support: 1_021 }] },
      { ...v7, aliasEvidence: [{ ...v7.aliasEvidence[0], kept: 25 }] },
      { ...v7, aliasEvidence: [{ ...v7.aliasEvidence[0], kept: 0, keptQuietTurns: 5 }] },
      { ...v7, aliasEvidence: [{ ...v7.aliasEvidence[0], kept: 24, keptQuietTurns: 32 }] },
      { ...v7, aliasEvidence: [{ ...v7.aliasEvidence[0], kept: 1, keptQuietTurns: 160 }] },
      { ...v7, revertStrikes: [{ ...strike, quietTurns: 128 }] },
      { ...v7, revertStrikes: [{ ...strike, form: "Aurora" }] },
      { ...v7, revertStrikes: [strike, strike] },
      { ...v7, revertStrikes: [{ ...strike, boundary: "word" }] },
      {
        ...v7,
        revertStrikes: [strike],
        aliasTombstones: [{
          lexemeId: 1, channel: "spoken", boundary: "word", form: "aurora x", rejectedAtRevision: 1,
        }],
      },
    ]) expect(parseWikiState(invalid).ok).toBe(false);
    const withoutStrikes: Record<string, unknown> = { ...v7 };
    delete withoutStrikes.revertStrikes;
    expect(parseWikiState(withoutStrikes).ok).toBe(false);
  });

  it("reserves a proved byte allowance for the largest V6-to-V7 migration", () => {
    const lexemes = Array.from({ length: MAX_WIKI_EVIDENCE_RECORDS }, (_, index) => ({
      id: index + 1,
      locale: "en-US" as const,
      canonical: `Term ${index.toString().padStart(5, "0")}`,
      scope: "both" as const,
      provenance: "aggregate-evidence" as const,
      confirmedAtRevision: null,
    }));
    const legacy = wholeUnitState({
      nextLexemeId: MAX_WIKI_EVIDENCE_RECORDS + 1,
      lexemes,
      // 255 whole observations gain one decimal digit at 1,020 quarter-units,
      // the largest per-row growth the scaling can cause.
      termEvidence: lexemes.map((entry) =>
        term(entry.canonical, "collected", 255, 0)),
      aliasEvidence: lexemes.map((entry) =>
        alias(entry.id, `alias ${entry.id}`, "zh-exact-homophone-v1", "candidate", 255, 0)),
    });
    const legacyBytes = wikiStateStorageBytes(legacy);
    const parsed = parseWikiState(legacy);
    if (!parsed.ok) throw new Error(parsed.message);
    const migratedBytes = wikiStateStorageBytes(parsed.state);
    const keptFieldBytes = new TextEncoder().encode(',"kept":0,"keptQuietTurns":0').byteLength;
    const strikeCollectionBytes = new TextEncoder().encode(',"revertStrikes":[]').byteLength;

    expect(legacyBytes).toBeLessThanOrEqual(MAX_WIKI_V6_STATE_BYTES);
    expect(migratedBytes - legacyBytes).toBe(
      MAX_WIKI_EVIDENCE_RECORDS * (keptFieldBytes + 1) +
      MAX_WIKI_EVIDENCE_RECORDS * 1 +
      strikeCollectionBytes,
    );
    expect(migratedBytes - legacyBytes)
      .toBeLessThanOrEqual(MAX_WIKI_V7_MIGRATION_HEADROOM_BYTES);
    expect(MAX_WIKI_STATE_BYTES)
      .toBe(MAX_WIKI_V6_STATE_BYTES + MAX_WIKI_V7_MIGRATION_HEADROOM_BYTES);
  }, 30_000);

  it("bounds raw storage by the schema version that wrote it", () => {
    expect(maximumRawWikiStateBytes({ schemaVersion: 7 })).toBe(MAX_WIKI_STATE_BYTES);
    expect(maximumRawWikiStateBytes({ schemaVersion: 6 })).toBe(MAX_WIKI_V6_STATE_BYTES);
    for (const legacy of [{ schemaVersion: 5 }, { schemaVersion: 2 }, null, "state"]) {
      expect(maximumRawWikiStateBytes(legacy)).toBe(MAX_LEGACY_WIKI_STATE_BYTES);
    }
  });
});

function englishTick(
  term: "observed" | "quiet",
  alias: "observed" | "quiet",
): WikiObservationTick {
  const opportunity = Object.freeze({
    locale: "en-US" as const,
    channel: "spoken" as const,
    scripts: Object.freeze(["latin" as const]),
  });
  return Object.freeze({
    term: Object.freeze({ disposition: term, opportunity }),
    alias: Object.freeze({ disposition: alias, opportunity }),
  });
}

function wholeUnitState(overrides: Record<string, unknown>) {
  return {
    schemaVersion: 6,
    scoringVersion: 3,
    fittingVersion: 1,
    revision: 4,
    nextLexemeId: 4,
    automaticLearningSaturated: false,
    lexemes: [
      {
        id: 1,
        locale: "en-US",
        canonical: "Aurora",
        scope: "both",
        provenance: "human-confirmed",
        confirmedAtRevision: 1,
      },
      {
        id: 2,
        locale: "en-US",
        canonical: "Borealis",
        scope: "both",
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      },
      {
        id: 3,
        locale: "en-US",
        canonical: "Codex",
        scope: "both",
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      },
    ],
    termEvidence: [],
    aliasEvidence: [],
    authorities: [],
    aliasTombstones: [],
    lexemeTombstones: [],
    ...overrides,
  };
}

function term(
  canonical: string,
  phase: "candidate" | "collected",
  support: number,
  quietTurns: number,
) {
  return {
    locale: "en-US",
    canonical,
    producer: "locale-segment-v1",
    phase,
    support,
    quietTurns,
  };
}

function alias(
  lexemeId: number,
  form: string,
  producer: string,
  phase: "candidate" | "active",
  support: number,
  quietTurns: number,
) {
  return {
    lexemeId,
    channel: "spoken",
    boundary: "word",
    form,
    producer,
    phase,
    support,
    quietTurns,
  };
}

function event(type: "confirm-rule" | "reject-rule"): WikiEvent;
function event(type: "observe-evidence"): WikiEvent;
function event(type: "confirm-rule" | "reject-rule" | "observe-evidence"): WikiEvent {
  const value = descriptor("code x", "Codex");
  if (type === "observe-evidence") {
    return { type, ...value, source: "machine-inference", producer: "legacy-v1" };
  }
  return { type, ...value };
}

function descriptor(form: string, canonical: string) {
  return Object.freeze({
    locale: "en-US" as const,
    channel: "spoken" as const,
    boundary: "word" as const,
    form,
    canonical,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
