import { describe, expect, it } from "vitest";
import { parseWikiEvent, parseWikiState, wikiStateStorageBytes } from "./wiki-codec";
import { applyWikiEvent, createEmptyWikiState } from "./wiki-evidence";
import { MAX_WIKI_STATE_BYTES, type WikiEvent } from "./wiki-model";

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
        schemaVersion: 5,
        lexemes: [{ canonical: "Engelbart", scope: "both" }],
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
        schemaVersion: 5,
        scoringVersion: 3,
        termEvidence: [{
          locale: "en-US",
          canonical: "Codex",
          phase: "candidate",
          support: 1,
          quietTurns: 0,
        }],
        aliasEvidence: [{
          lexemeId: 1,
          form: "code x",
          producer: "legacy-v1",
          phase: "candidate",
          support: 4,
          quietTurns: 0,
        }],
      },
    });
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
        aliasEvidence: [{ producer: "legacy-v1", support: 1 }],
        authorities: [{ form: "code x" }],
      },
    });
  });

  it("rejects V5 recurrence attached to a human-owned lexeme", () => {
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
        schemaVersion: 5,
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
  });
});

function event(type: "confirm-rule" | "reject-rule"): WikiEvent;
function event(type: "observe-evidence"): WikiEvent;
function event(type: "confirm-rule" | "reject-rule" | "observe-evidence"): WikiEvent {
  const value = descriptor("code x", "Codex");
  if (type === "observe-evidence") {
    return { type, ...value, source: "machine-inference" };
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
