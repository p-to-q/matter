import { describe, expect, it } from "vitest";
import { compileWikiBasis, EMPTY_WIKI_BASIS } from "./wiki-basis";
import { WikiBasisOwner } from "./wiki-basis-owner";
import { projectWikiConfigurationRules } from "./wiki-configuration";
import { applyWikiEvent, createEmptyWikiState } from "./wiki-evidence";
import {
  MAX_WIKI_APPLICABLE_CODE_POINTS,
  MAX_WIKI_APPLICABLE_RULES,
  WIKI_SCHEMA_VERSION,
  type WikiEvent,
  type WikiState,
} from "./wiki-model";

describe("Wiki basis", () => {
  it("provides one deeply immutable empty basis", () => {
    expect(EMPTY_WIKI_BASIS).toMatchObject({
      stateRevision: 0,
      snapshot: {
        generation: 0,
        rules: [],
        stats: { ruleCount: 0, trieNodeCount: 10, totalCodePoints: 0 },
      },
    });
    expect(Object.isFrozen(EMPTY_WIKI_BASIS)).toBe(true);
    expect(Object.isFrozen(EMPTY_WIKI_BASIS.snapshot)).toBe(true);
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
    });

    const second = compileWikiBasis(observed, 2, first.basis);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.basis.snapshot.generation).toBe(2);
    expect(second.basis.snapshot.views).toBe(first.basis.snapshot.views);
    expect(second.basis.snapshot.rules).toBe(first.basis.snapshot.rules);
    expect(second.basis.fitSnapshot).toBe(first.basis.fitSnapshot);
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
  });
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
    scoringVersion: 2,
    fittingVersion: 1,
    revision: 1,
    nextLexemeId: 2_001,
    recentObservationCount: 0,
    automaticLearningSaturated: false,
    lexemes,
    evidence: [],
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
    scoringVersion: 2,
    fittingVersion: 1,
    revision: 1,
    nextLexemeId: MAX_WIKI_APPLICABLE_RULES + 1,
    recentObservationCount: 0,
    automaticLearningSaturated: false,
    lexemes,
    evidence: [],
    authorities: lexemes.map((lexeme, index) => ({
      lexemeId: lexeme.id,
      channel: "written" as const,
      boundary: "literal" as const,
      form: `alias-${index.toString().padStart(4, "0")}`.padEnd(32, "f"),
      confirmedAtRevision: 1,
    })),
    aliasTombstones: [],
    lexemeTombstones: [],
  };
}

function apply(state: WikiState, event: WikiEvent): WikiState {
  const result = applyWikiEvent(state, event);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}
