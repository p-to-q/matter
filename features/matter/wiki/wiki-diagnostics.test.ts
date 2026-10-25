import { describe, expect, it } from "vitest";
import { applyWikiEvent, applyWikiOccurrenceSettlement, createEmptyWikiState } from "./wiki-evidence";
import { deriveWikiDiagnostics, incrementWikiOutcome } from "./wiki-diagnostics";
import { encodeWikiStateAsV7, parseWikiState } from "./wiki-codec";
import { validateWikiState } from "./wiki-invariants";
import { MAX_WIKI_OUTCOME_COUNT, MAX_WIKI_RULE_MATURITY, type WikiState,
  type WikiOccurrenceSettlement } from "./wiki-model";

const descriptor = { locale: "en-US", channel: "spoken", boundary: "word",
  form: "Englebart", canonical: "Engelbart" } as const;
function confirmed() {
  const result = applyWikiEvent(createEmptyWikiState(), { type: "confirm-rule", ...descriptor });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
function settlement(state: WikiState, id: string, outcome: Exclude<WikiOccurrenceSettlement["outcome"], "explicit-replace">,
  appliedAtRevision = state.revision) {
  return applyWikiOccurrenceSettlement(state, { occurrenceId: id, outcome,
    rule: { ...descriptor, appliedAtRevision }, origin: "human-admission" });
}
function kept(state: WikiState, id: string) {
  const result = settlement(state, id, "inspected-kept");
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe("V8 effectful maturity and diagnostics", () => {
  it("matures confirmed keeps exactly three times without changing authority or scoring", () => {
    const start = confirmed();
    let state = start;
    for (let index = 1; index <= 3; index += 1) {
      state = kept(state, `keep-${index}`);
      expect(state.ruleMaturity[0].keptSettlements).toBe(index);
      expect(state.authorities).toEqual(start.authorities);
      expect(state.aliasEvidence).toEqual([]);
    }
    expect(state.ruleMaturity[0].establishedAt).toBe(state.revision);
    expect(state.outcomeCounters.inspectedKept).toBe(3);
    expect(settlement(state, "fourth", "inspected-kept")).toEqual({ ok: true, changed: false, state });
    expect(settlement(state, "keep-1", "inspected-kept")).toEqual({ ok: true, changed: false, state });
  });

  it("resets maturity on revert, retains confirmed authority and ignores pre-revert occurrences", () => {
    const start = confirmed();
    const mature = kept(kept(kept(start, "a"), "b"), "c");
    const reverted = settlement(mature, "revert", "reverted");
    if (!reverted.ok) throw new Error(reverted.error.message);
    expect(reverted.state.ruleMaturity).toMatchObject([{ keptSettlements: 0,
      establishedAt: null, lastRevertedAtRevision: reverted.state.revision }]);
    expect(reverted.state.authorities).toEqual(start.authorities);
    expect(reverted.state.outcomeCounters.reverted).toBe(1);
    expect(settlement(reverted.state, "old", "inspected-kept", start.revision))
      .toEqual({ ok: true, changed: false, state: reverted.state });
    expect(kept(reverted.state, "new").ruleMaturity[0].keptSettlements).toBe(1);
  });

  it("does not deduplicate away a later explicit human decision on the same occurrence", () => {
    let state = createEmptyWikiState();
    const created = applyWikiEvent(state, { type: "create-lexeme", locale: "en-US", canonical: "Engelbart", scope: "both" });
    if (!created.ok) throw new Error(created.error.message);
    state = created.state;
    for (let index = 0; index < 4; index += 1) {
      const observed = applyWikiEvent(state, { type: "observe-evidence", source: "machine-inference",
        producer: "latin-internal-edit-v2", ...descriptor });
      if (!observed.ok) throw new Error(observed.error.message);
      state = observed.state;
    }
    const accepted = kept(state, "same");
    const explicit = settlement(accepted, "same", "explicit-confirm");
    if (!explicit.ok) throw new Error(explicit.error.message);
    expect(explicit.state.authorities).toHaveLength(1);
    expect(explicit.state.ruleMaturity[0].keptSettlements).toBe(1);
    expect(explicit.state.outcomeCounters).toMatchObject({ inspectedKept: 1, explicitConfirm: 1 });
  });

  it("reconciles maturity with rename/removal and saturates only effectful counters", () => {
    const state = kept(confirmed(), "kept");
    const renamed = applyWikiEvent(state, { type: "rename-lexeme", lexemeId: 1,
      locale: "en-US", canonical: "Douglas Engelbart", scope: "both" });
    expect(renamed).toMatchObject({ ok: true, state: { ruleMaturity: [] } });
    const removed = applyWikiEvent(state, { type: "remove-lexeme", lexemeId: 1 });
    expect(removed).toMatchObject({ ok: true, state: { ruleMaturity: [] } });
    expect(incrementWikiOutcome({ ...state.outcomeCounters, inspectedKept: MAX_WIKI_OUTCOME_COUNT }, "inspectedKept").inspectedKept)
      .toBe(MAX_WIKI_OUTCOME_COUNT);
    const censored = settlement(state, "censored", "censored");
    expect(censored).toEqual({ ok: true, changed: false, state });
    const receipt = deriveWikiDiagnostics(state, { censored: 2, failed: 1, unattributed: 3 });
    expect(receipt).toMatchObject({ outcomes: { inspectedKept: 1 }, transient: { censored: 2, failed: 1, unattributed: 3 } });
    expect(JSON.stringify(receipt)).not.toContain("Engelbart");
    expect(MAX_WIKI_RULE_MATURITY).toBe(10_000);
  });

  it("refuses malformed maturity without deriving an identity or throwing", () => {
    const state = confirmed();
    for (const value of [null, [], {}, { lexemeId: null },
      { lexemeId: 1n, channel: "spoken", boundary: "word", form: "Englebart" }]) {
      const candidate = { ...state, ruleMaturity: [value] } as unknown as WikiState;
      expect(() => validateWikiState(candidate)).not.toThrow();
      expect(validateWikiState(candidate).ok).toBe(false);
      expect(encodeWikiStateAsV7(candidate).ok).toBe(false);
      expect(parseWikiState(candidate).ok).toBe(false);
    }
  });
});
