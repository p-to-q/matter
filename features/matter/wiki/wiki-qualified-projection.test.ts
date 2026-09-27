import { describe, expect, it } from "vitest";
import {
  applyWikiEvent,
  createEmptyWikiState,
  createWikiProjectionPolicy,
  projectApplicableWikiRules,
} from "./wiki-evidence";
import {
  MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
} from
  "./wiki-qualified-producer-releases";
import { MATTER_WIKI_RUNTIME_PRODUCER_RELEASES } from
  "./wiki-runtime-producer-releases";

describe("qualified Wiki projection", () => {
  it("keeps producer evidence inert until the complete release is supplied", () => {
    let state = createEmptyWikiState();
    const created = applyWikiEvent(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    if (!created.ok) throw new Error(created.error.message);
    state = created.state;
    for (let turn = 0; turn < 4; turn += 1) {
      const observed = applyWikiEvent(state, {
        type: "observe-evidence",
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "Englebart",
        canonical: "Engelbart",
        source: "machine-inference",
        producer: "latin-internal-edit-v2",
      });
      if (!observed.ok) throw new Error(observed.error.message);
      state = observed.state;
    }

    expect(projectApplicableWikiRules(state)).toEqual([]);
    expect(projectApplicableWikiRules(
      state,
      createWikiProjectionPolicy(MATTER_WIKI_RUNTIME_PRODUCER_RELEASES),
    )).toEqual([
      expect.objectContaining({
        form: "Englebart",
        canonical: "Engelbart",
        authority: "provisional",
      }),
    ]);
  });

  it("keeps high-ambiguity qualified producers out of product projection", () => {
    let state = createEmptyWikiState();
    const created = applyWikiEvent(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Right",
      scope: "both",
    });
    if (!created.ok) throw new Error(created.error.message);
    state = created.state;
    for (let turn = 0; turn < 4; turn += 1) {
      const observed = applyWikiEvent(state, {
        type: "observe-evidence",
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "Write",
        canonical: "Right",
        source: "machine-inference",
        producer: "en-metaphone-v1",
      });
      if (!observed.ok) throw new Error(observed.error.message);
      state = observed.state;
    }

    expect(projectApplicableWikiRules(
      state,
      createWikiProjectionPolicy(MATTER_WIKI_RUNTIME_PRODUCER_RELEASES),
    )).toEqual([]);
  });

  it("never projects an alias over another canonical", () => {
    let state = createEmptyWikiState();
    for (const canonical of ["Englebart", "Engelbart"]) {
      const created = applyWikiEvent(state, {
        type: "create-lexeme",
        locale: "en-US",
        canonical,
        scope: "both",
      });
      if (!created.ok) throw new Error(created.error.message);
      state = created.state;
    }
    for (let turn = 0; turn < 4; turn += 1) {
      const observed = applyWikiEvent(state, {
        type: "observe-evidence",
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "Englebart",
        canonical: "Engelbart",
        source: "machine-inference",
        producer: "latin-internal-edit-v2",
      });
      if (!observed.ok) throw new Error(observed.error.message);
      state = observed.state;
    }

    expect(projectApplicableWikiRules(
      state,
      createWikiProjectionPolicy(MATTER_WIKI_RUNTIME_PRODUCER_RELEASES),
    )).toEqual([]);
  });

  it("fails a malformed or duplicate release list closed", () => {
    expect(createWikiProjectionPolicy([
      ...MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
      ...MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
    ])).toMatchObject({ includeProvisional: false });
  });
});
