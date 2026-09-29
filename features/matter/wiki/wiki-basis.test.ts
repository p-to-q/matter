import { describe, expect, it } from "vitest";
import { compileWikiBasis, EMPTY_WIKI_BASIS } from "./wiki-basis";
import { WikiBasisOwner } from "./wiki-basis-owner";
import { projectWikiConfigurationRules } from "./wiki-configuration";
import {
  applyWikiEvent,
  createEmptyWikiState,
  createWikiProjectionPolicy,
  WIKI_WITH_PROVISIONAL,
} from "./wiki-evidence";
import {
  MAX_WIKI_APPLICABLE_CODE_POINTS,
  MAX_WIKI_APPLICABLE_RULES,
  MAX_WIKI_LEXEMES,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  type WikiEvent,
  type WikiState,
} from "./wiki-model";
import { freezeWikiState, validateWikiState } from "./wiki-invariants";
import { parseWikiState } from "./wiki-codec";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "./wiki-qualified-producer-releases";

describe("Wiki basis", () => {
  it("provides one deeply immutable empty basis", () => {
    expect(EMPTY_WIKI_BASIS).toMatchObject({
      stateRevision: 0,
      snapshot: {
        generation: 0,
        rules: [],
        stats: { ruleCount: 0, trieNodeCount: 10, totalCodePoints: 0 },
      },
      confirmedSnapshot: {
        generation: 0,
        rules: [],
        stats: { ruleCount: 0, trieNodeCount: 10, totalCodePoints: 0 },
      },
    });
    expect(Object.isFrozen(EMPTY_WIKI_BASIS)).toBe(true);
    expect(Object.isFrozen(EMPTY_WIKI_BASIS.snapshot)).toBe(true);
    expect(Object.isFrozen(EMPTY_WIKI_BASIS.confirmedSnapshot)).toBe(true);
  });

  it("compiles only rules activated by evidence policy", () => {
    let state = apply(createEmptyWikiState(), {
      type: "observe-evidence",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "code x",
      canonical: "Codex",
      source: "machine-inference",
      producer: "legacy-v1",
    });
    state = apply(state, {
      type: "confirm-rule",
      locale: "en-US",
      channel: "written",
      boundary: "word",
      form: "open ai",
      canonical: "OpenAI",
    });

    const compiled = compileWikiBasis(state, 4);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.basis.stateRevision).toBe(state.revision);
    expect(compiled.basis.snapshot.generation).toBe(4);
    expect(compiled.basis.snapshot.rules).toEqual([
      expect.objectContaining({
        locale: "en-US",
        channel: "written",
        form: "open ai",
        canonical: "OpenAI",
      }),
    ]);
  });

  it("shares one matcher when the release projection adds no provisional rule", () => {
    const compiled = compileWikiBasis(
      confirmedState("code x", "Codex"),
      1,
      undefined,
      WIKI_WITH_PROVISIONAL,
    );

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.basis.confirmedSnapshot).toBe(compiled.basis.snapshot);
  });

  it("publishes and reads one exact compiled reference", () => {
    const owner = new WikiBasisOwner();
    const published = owner.publish(confirmedState("code x", "Codex"), 1);

    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(owner.read()).toBe(published.basis);
    expect(owner.read()).toBe(owner.read());
  });

  it("reuses both compiled indexes when evidence does not change authority", () => {
    const firstState = confirmedState("code x", "Codex");
    const first = compileWikiBasis(firstState, 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const observed = apply(firstState, {
      type: "observe-evidence",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "code ex",
      canonical: "Codex",
      source: "machine-inference",
      producer: "legacy-v1",
    });

    const second = compileWikiBasis(observed, 2, first.basis);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.basis.snapshot.generation).toBe(2);
    expect(second.basis.snapshot.views).toBe(first.basis.snapshot.views);
    expect(second.basis.snapshot.rules).toBe(first.basis.snapshot.rules);
    expect(second.basis.confirmedSnapshot.rules).toBe(
      first.basis.confirmedSnapshot.rules,
    );
    expect(second.basis.fitSnapshot).toBe(first.basis.fitSnapshot);
  });

  it("rejects invalid generations before the immutable reuse path", () => {
    const state = confirmedState("code x", "Codex");
    const first = compileWikiBasis(state, 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    for (const generation of [-1, Number.NaN]) {
      expect(compileWikiBasis(state, generation, first.basis)).toMatchObject({
        ok: false,
        error: {
          code: "COMPILE_FAILED",
          message: "The applicable Wiki rules could not be compiled.",
          issues: [{ code: "INVALID_GENERATION", ruleIndexes: [] }],
        },
      });
    }
  });

  it("reuses fitting only for the same complete qualified release identity", () => {
    const state = confirmedState("code x", "Codex");
    const release = MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.find((candidate) =>
      candidate.identity.producerId === "latin-internal-edit-v2");
    if (release === undefined) throw new Error("Missing latin-internal-edit-v2 release.");
    const policy = createWikiProjectionPolicy([release]);
    const first = compileWikiBasis(state, 1, undefined, policy);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const same = compileWikiBasis(state, 2, first.basis, policy);
    expect(same.ok).toBe(true);
    if (!same.ok) return;
    expect(same.basis.fitSnapshot).toBe(first.basis.fitSnapshot);

    const changedRelease = Object.freeze({
      ...release,
      identity: Object.freeze({
        ...release.identity,
        resourceVersion: "2.0.2",
      }),
    });
    const changed = compileWikiBasis(
      state,
      3,
      same.basis,
      createWikiProjectionPolicy([changedRelease]),
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.basis.fitSnapshot).not.toBe(same.basis.fitSnapshot);
    expect(changed.basis.fitSnapshot.qualifiedProducerReleases[0]?.identity)
      .toMatchObject({
        producerId: "latin-internal-edit-v2",
        resourceVersion: "2.0.2",
      });
  });

  it("does not replace the current reference for stale or failed candidates", () => {
    const owner = new WikiBasisOwner();
    const published = owner.publish(confirmedState("code x", "Codex"), 2);
    expect(published.ok).toBe(true);
    const current = owner.read();

    const stale = owner.publish(confirmedState("open ai", "OpenAI"), 1);
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "STALE_GENERATION" },
    });
    expect(owner.read()).toBe(current);

    const failed = owner.publish({ ...oversizedWikiState(), nextLexemeId: 1 }, 3);
    expect(failed).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATE" },
    });
    expect(owner.read()).toBe(current);
  });

  it("does not retain mutable input state", () => {
    const input = JSON.parse(JSON.stringify(
      confirmedState("code x", "Codex"),
    )) as {
      revision: number;
      authorities: Array<{ form: string; canonical: string }>;
    };
    const compiled = compileWikiBasis(input, 1);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    input.revision = 99;
    input.authorities[0].form = "mutated";
    input.authorities[0].canonical = "Mutated";

    expect(compiled.basis.stateRevision).toBe(1);
    expect(compiled.basis.snapshot.rules[0]).toMatchObject({
      form: "code x",
      canonical: "Codex",
    });
  });

  it("projects and compiles the maximum declared matcher corpus within its structural budget", () => {
    const state = maximumMatcherState();

    const configuration = projectWikiConfigurationRules(state);
    const compiled = compileWikiBasis(state, 1);

    expect(configuration).toHaveLength(MAX_WIKI_APPLICABLE_RULES);
    expect(configuration[0]).toMatchObject({ id: "1", origin: "confirmed" });
    expect(configuration.at(-1)).toMatchObject({
      id: String(MAX_WIKI_APPLICABLE_RULES),
      origin: "confirmed",
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.basis.snapshot.stats).toMatchObject({
      ruleCount: MAX_WIKI_APPLICABLE_RULES,
      totalCodePoints: MAX_WIKI_APPLICABLE_CODE_POINTS,
    });
    expect(compiled.basis.snapshot.views["en-US"].written).toMatchObject({
      ruleCount: MAX_WIKI_APPLICABLE_RULES,
      maxFormGraphemes: 32,
    });
    // A trie may allocate at most one node per input grapheme plus one root
    // for each locale/channel view. This guards the declared capacity without
    // relying on host-dependent wall-clock timing.
    expect(compiled.basis.snapshot.stats.trieNodeCount).toBeLessThanOrEqual(
      10 + MAX_WIKI_APPLICABLE_RULES * 32,
    );
  }, 20_000);

  it("reuses a recovery-sized immutable basis without rescanning 15,000 rows", () => {
    const state = recoverySizeState();
    const first = compileWikiBasis(state, 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const parsed = parseWikiState(state);
    expect(parsed.ok && parsed.state === state).toBe(true);

    const startedAt = performance.now();
    const next = compileWikiBasis(state, 2, first.basis);
    const compileMillis = performance.now() - startedAt;

    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.basis.snapshot.generation).toBe(2);
    expect(next.basis.snapshot.views).toBe(first.basis.snapshot.views);
    expect(next.basis.snapshot.rules).toBe(first.basis.snapshot.rules);
    expect(next.basis.fitSnapshot).toBe(first.basis.fitSnapshot);
    // Before the immutable-source receipt this path took 469-1,578 ms on the
    // verifier host despite returning the same indexes. Keep ample CI headroom
    // while proving that the recovery ledger is no longer on the hot path.
    expect(compileMillis).toBeLessThan(250);
  }, 20_000);

  it("reuses recovery-sized indexes when compact term support changes no authority", () => {
    const state = recoverySizeState(true);
    const first = compileWikiBasis(state, 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const changed = freezeWikiState({
      ...state,
      revision: 2,
      termEvidence: Object.freeze([
        Object.freeze({ ...state.termEvidence[0]!, support: 12 }),
      ]),
    });
    expect(validateWikiState(changed)).toEqual({ ok: true });
    expect(changed.lexemes).toBe(state.lexemes);
    expect(changed.authorities).toBe(state.authorities);
    const parsed = parseWikiState(changed);
    expect(parsed.ok && parsed.state === changed).toBe(true);

    const startedAt = performance.now();
    const next = compileWikiBasis(changed, 2, first.basis);
    const compileMillis = performance.now() - startedAt;

    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.basis.snapshot.views).toBe(first.basis.snapshot.views);
    expect(next.basis.fitSnapshot).toBe(first.basis.fitSnapshot);
    expect(compileMillis).toBeLessThan(250);
  }, 20_000);
});

function confirmedState(form: string, canonical: string): WikiState {
  return apply(createEmptyWikiState(), {
    type: "confirm-rule",
    locale: "en-US",
    channel: "spoken",
    boundary: "word",
    form,
    canonical,
  });
}

function oversizedWikiState(): WikiState {
  const lexemes = Array.from({ length: 2_000 }, (_, index) => {
    const suffix = index.toString().padStart(4, "0");
    return {
      id: index + 1,
      locale: "en-US" as const,
      canonical: `${"x".repeat(120)}${suffix}`,
      scope: "both" as const,
      provenance: "human-confirmed" as const,
      confirmedAtRevision: 1,
    };
  });
  return {
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: 1,
    revision: 1,
    nextLexemeId: 2_001,
    automaticLearningSaturated: false,
    lexemes,
    termEvidence: [],
    aliasEvidence: [],
    authorities: lexemes.map((lexeme, index) => {
      const suffix = index.toString().padStart(4, "0");
      return {
        lexemeId: lexeme.id,
        channel: "written" as const,
        boundary: "literal" as const,
        form: `alias-${suffix}`,
        confirmedAtRevision: 1,
      };
    }),
    aliasTombstones: [],
    lexemeTombstones: [],
    revertStrikes: [],
    settledOccurrences: [],
  };
}

function maximumMatcherState(): WikiState {
  const lexemes = Array.from({ length: MAX_WIKI_APPLICABLE_RULES }, (_, index) => {
    const suffix = index.toString().padStart(4, "0");
    const canonicalLength = index < 1_000 ? 20 : 19;
    return {
      id: index + 1,
      locale: "en-US" as const,
      canonical: `Canonical-${suffix}`.padEnd(canonicalLength, "c"),
      scope: "both" as const,
      provenance: "human-confirmed" as const,
      confirmedAtRevision: 1,
    };
  });
  return {
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: 1,
    revision: 1,
    nextLexemeId: MAX_WIKI_APPLICABLE_RULES + 1,
    automaticLearningSaturated: false,
    lexemes,
    termEvidence: [],
    aliasEvidence: [],
    authorities: lexemes.map((lexeme, index) => ({
      lexemeId: lexeme.id,
      channel: "written" as const,
      boundary: "literal" as const,
      form: `alias-${index.toString().padStart(4, "0")}`.padEnd(32, "f"),
      confirmedAtRevision: 1,
    })),
    aliasTombstones: [],
    lexemeTombstones: [],
    revertStrikes: [],
    settledOccurrences: [],
  };
}

function recoverySizeState(withTermEvidence = false): WikiState {
  const lexemes = Array.from({ length: MAX_WIKI_LEXEMES }, (_, index) => ({
    id: index + 1,
    locale: "en-US" as const,
    canonical: `Term${index.toString(36).padStart(8, "0")}`,
    scope: "both" as const,
    provenance: index === 0 && withTermEvidence
      ? "aggregate-evidence" as const
      : "human-confirmed" as const,
    confirmedAtRevision: index === 0 && withTermEvidence ? null : 1,
  }));
  return freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: 1,
    revision: 1,
    nextLexemeId: MAX_WIKI_LEXEMES + 1,
    automaticLearningSaturated: false,
    lexemes,
    termEvidence: withTermEvidence
      ? Object.freeze([Object.freeze({
          locale: "en-US" as const,
          canonical: lexemes[0]!.canonical,
          producer: "locale-segment-v1" as const,
          phase: "collected" as const,
          support: 8,
          quietTurns: 0,
        })])
      : Object.freeze([]),
    aliasEvidence: Object.freeze([]),
    authorities: Object.freeze([]),
    aliasTombstones: Object.freeze([]),
    lexemeTombstones: Object.freeze([]),
    revertStrikes: Object.freeze([]),
    settledOccurrences: Object.freeze([]),
  });
}

function apply(state: WikiState, event: WikiEvent): WikiState {
  const result = applyWikiEvent(state, event);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}
