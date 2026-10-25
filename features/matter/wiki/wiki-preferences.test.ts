import { describe, expect, it } from "vitest";
import { DEFAULT_WIKI_PREFERENCES, isWikiPreferences } from "./wiki-preferences";
import { applyWikiEvent, applyWikiObservationBatch, createEmptyWikiState,
  createWikiProjectionPolicy, projectApplicableWikiRules } from "./wiki-evidence";
import { freezeWikiState } from "./wiki-invariants";
import { compileWikiBasis } from "./wiki-basis";
import { fitCommittedWikiTextResult } from "./wiki-fitting";
import { planWikiAdmissionBatch } from "./wiki-admission";
import { parseWikiEvent } from "./wiki-codec";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from "./wiki-qualified-producer-releases";
import type { WikiEvent, WikiState, WikiProducerFamily, WikiChannel } from "./wiki-model";

const policy = createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES);
const alias = { type: "observe-evidence", source: "machine-inference", producer: "latin-internal-edit-v2",
  locale: "en-US", channel: "spoken", boundary: "word", form: "Englebart", canonical: "Engelbart" } as const;

function change(state: WikiState, event: WikiEvent) {
  const result = applyWikiEvent(state, event);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
function active() {
  let state = change(createEmptyWikiState(), { type: "create-lexeme", locale: "en-US",
    canonical: "Engelbart", scope: "both" });
  for (let index = 0; index < 4; index += 1) state = change(state, alias);
  const reconciled = applyWikiObservationBatch(state, [], {
    term: { disposition: "paused" }, alias: { disposition: "paused" },
  }, new Set(["latin-internal-edit-v2"] as const));
  if (!reconciled.ok) throw new Error(reconciled.error.message);
  return reconciled.state;
}
function quiet(state: WikiState, channel: WikiChannel, families: readonly WikiProducerFamily[]) {
  const ledger = { disposition: "quiet", opportunity: { locale: "en-US", channel,
    scripts: ["latin"], producerFamilies: families } } as const;
  return applyWikiObservationBatch(state, [], { term: ledger, alias: ledger });
}

describe("V8 restrictive Wiki preferences and comparable opportunities", () => {
  it("ages on a real enabled no-vote scan, including a routed scan, but not disabled or partial scans", () => {
    const state = active();
    const basis = compileWikiBasis(state, 1, undefined, policy);
    if (!basis.ok) throw new Error(basis.error.message);
    for (const locale of ["en-US", "zh-CN"] as const) {
      const request = { locale, channel: "spoken", text: "ordinary" } as const;
      const scan = fitCommittedWikiTextResult(basis.basis.fitSnapshot, request,
        new Set(["latin-internal-edit-v2"]));
      expect(scan).toMatchObject({ status: "ok", events: [], producerFamilies: ["latin-internal-edit"] });
      const batch = planWikiAdmissionBatch({ observed: request, committed: request }, null, scan);
      expect(applyWikiObservationBatch(state, batch.events, batch.tick)).toMatchObject({ ok: true,
        state: { aliasEvidence: [{ quietTurns: 1 }] } });
      for (const withheld of [
        fitCommittedWikiTextResult(basis.basis.fitSnapshot, request, new Set()),
        { ...scan, producerFamilies: ["zh-final-pair"] as const },
        { ...scan, status: "partial" as const },
      ]) {
        const paused = planWikiAdmissionBatch({ observed: request, committed: request }, null, withheld);
        expect(applyWikiObservationBatch(state, paused.events, paused.tick))
          .toEqual({ ok: true, changed: false, state });
      }
    }
  });

  it("keeps legacy producer-less strikes until an enabled comparable alias family scanned", () => {
    const state = active();
    const struck = freezeWikiState({ ...state, aliasEvidence: [], revertStrikes: [{ lexemeId: 1,
      channel: "spoken", form: "Englebart", quietTurns: 0, struckAtRevision: state.revision }] });
    expect(quiet(struck, "spoken", [])).toEqual({ ok: true, state: struck, changed: false });
    expect(quiet(struck, "spoken", ["latin-internal-edit"])).toMatchObject({ ok: true,
      state: { revertStrikes: [{ quietTurns: 1 }] } });
  });
  it("rejects duplicate, unsorted, unknown and future permission fields", () => {
    expect(isWikiPreferences(DEFAULT_WIKI_PREFERENCES)).toBe(true);
    for (const value of [
      { nearSound: [{ locale: "en-US", enabled: false }, { locale: "en-US", enabled: true }], accents: [], hints: null },
      { nearSound: [{ locale: "zh-CN", enabled: true }, { locale: "en-US", enabled: false }], accents: [], hints: null },
      { nearSound: [{ locale: "fr-FR", enabled: true }], accents: [], hints: null },
      { nearSound: [], accents: ["arbitrary"], hints: null },
      { nearSound: [], accents: [], hints: true },
      { nearSound: [], accents: [], hints: null, automaticCollection: true },
    ]) expect(isWikiPreferences(value)).toBe(false);
    expect(parseWikiEvent({ type: "set-near-sound", locale: "en-US", enabled: false, hints: true }).ok).toBe(false);
  });

  it("defaults to existing authority and changes only through a real bounded transition", () => {
    const state = active();
    expect(applyWikiEvent(state, { type: "set-near-sound", locale: "en-US", enabled: true }))
      .toEqual({ ok: true, state, changed: false });
    const disabled = change(state, { type: "set-near-sound", locale: "en-US", enabled: false });
    expect(disabled.revision).toBe(state.revision + 1);
    expect(projectApplicableWikiRules(disabled, policy)).toEqual([]);
    expect(disabled.aliasEvidence).toEqual(state.aliasEvidence);
    expect(applyWikiEvent(disabled, alias)).toEqual({ ok: true, state: disabled, changed: false });
    expect(quiet(disabled, "spoken", ["latin-internal-edit"]))
      .toEqual({ ok: true, state: disabled, changed: false });
    expect(applyWikiEvent(disabled, { type: "set-near-sound", locale: "en-US", enabled: false }))
      .toEqual({ ok: true, state: disabled, changed: false });
  });

  it("invalidates projection/fit caches but never withholds exact confirmed authority", () => {
    const state = active();
    const before = compileWikiBasis(state, 1, undefined, policy);
    if (!before.ok) throw new Error(before.error.message);
    const disabled = change(state, { type: "set-near-sound", locale: "en-US", enabled: false });
    const after = compileWikiBasis(disabled, 2, before.basis, policy);
    if (!after.ok) throw new Error(after.error.message);
    expect(before.basis.snapshot.rules).toHaveLength(1);
    expect(after.basis.snapshot.rules).toEqual([]);
    expect(after.basis.fitSnapshot).not.toBe(before.basis.fitSnapshot);
    expect(after.basis.fitSnapshot.stats.eligibleLexemeCount).toBe(0);
    const confirmed = change(disabled, { type: "confirm-rule", locale: "en-US", channel: "spoken",
      boundary: "word", form: "Englebart", canonical: "Engelbart" });
    expect(projectApplicableWikiRules(confirmed, policy)).toMatchObject([{ authority: "confirmed" }]);
  });

  it("uses the routed ledger preference instead of the CJK turn preference", () => {
    const ownOff = change(active(), { type: "set-near-sound", locale: "zh-CN", enabled: false });
    const enabled = compileWikiBasis(ownOff, 1, undefined, policy);
    if (!enabled.ok) throw new Error(enabled.error.message);
    const request = { locale: "zh-CN", channel: "spoken", text: "Englebart的论文" } as const;
    expect(fitCommittedWikiTextResult(enabled.basis.fitSnapshot, request).events).toHaveLength(1);
    const routedOff = change(ownOff, { type: "set-near-sound", locale: "en-US", enabled: false });
    const disabled = compileWikiBasis(routedOff, 2, enabled.basis, policy);
    if (!disabled.ok) throw new Error(disabled.error.message);
    expect(fitCommittedWikiTextResult(disabled.basis.fitSnapshot, request)).toMatchObject({ status: "censored", events: [] });
  });

  it("ages new rows only for their scanned family while keeping legacy compatibility", () => {
    const state = active();
    expect(quiet(state, "spoken", ["zh-final-pair"]))
      .toEqual({ ok: true, state, changed: false });
    const comparable = quiet(state, "spoken", ["latin-internal-edit"]);
    expect(comparable).toMatchObject({ ok: true, changed: true,
      state: { aliasEvidence: [{ quietTurns: 1 }] } });
    const legacy = freezeWikiState({ ...state,
      aliasEvidence: state.aliasEvidence.map((entry) => ({ ...entry, producer: "legacy-v1", phase: "candidate" })) });
    expect(quiet(legacy, "spoken", [])).toMatchObject({ ok: true, changed: true,
      state: { aliasEvidence: [{ quietTurns: 1 }] } });
  });

  it("does not age the product term ledger on written or another-family turns", () => {
    const event = { type: "observe-evidence", source: "recent-material", locale: "en-US",
      canonical: "morphogenesis", producer: "locale-segment-v1" } as const;
    const state = change(change(createEmptyWikiState(), event), event);
    expect(quiet(state, "written", ["locale-segment"]))
      .toEqual({ ok: true, state, changed: false });
    expect(quiet(state, "spoken", ["shape-specific"]))
      .toEqual({ ok: true, state, changed: false });
    expect(quiet(state, "spoken", ["locale-segment"])).toMatchObject({ ok: true, changed: true,
      state: { termEvidence: [{ quietTurns: 1 }] } });
  });
});
