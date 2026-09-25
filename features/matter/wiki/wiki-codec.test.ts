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

  it("rejects invisible and bidi format controls but keeps emoji joiners", () => {
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
      canonical: "👩‍💻",
    }).ok).toBe(true);
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
      ...JSON.parse(JSON.stringify(created.state)),
      schemaVersion: 3,
      lexemes: created.state.lexemes.map((lexeme) => ({
        id: lexeme.id,
        locale: lexeme.locale,
        canonical: lexeme.canonical,
        provenance: lexeme.provenance,
        confirmedAtRevision: lexeme.confirmedAtRevision,
      })),
    };

    const parsed = parseWikiState(legacy);

    expect(parsed).toMatchObject({
      ok: true,
      state: {
        schemaVersion: 4,
        lexemes: [{ canonical: "Engelbart", scope: "both" }],
      },
    });
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
        schemaVersion: 4,
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
