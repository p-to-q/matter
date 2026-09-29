import { describe, expect, it } from "vitest";
import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import {
  canonicalizeMaterialText,
} from "./material-lexical-port";
import { observeCommittedMaterialText } from "./material-lexical-observation-port";
import {
  createWikiMaterialLexicalObservationPort,
  createWikiMaterialLexicalPort,
} from "./wiki-material-lexical-adapter";
import { compileWikiBasis, type WikiBasis } from "../wiki/wiki-basis";
import { planWikiAdmissionBatch } from "../wiki/wiki-admission";
import {
  applyWikiEvent,
  applyWikiObservationBatch,
  createEmptyWikiState,
  createInitialWikiState,
  createWikiProjectionPolicy,
} from "../wiki/wiki-evidence";
import {
  MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
} from
  "../wiki/wiki-runtime-producer-releases";
import { collectCommittedWikiTermsResult } from "../wiki/wiki-term-collection";
import { fitCommittedWikiTextResult } from "../wiki/wiki-fitting";
import type { WikiState } from "../wiki/wiki-model";

describe("Wiki automation baseline", () => {
  it("surfaces distinctive terms immediately and broad terms on recurrence", () => {
    let state = createEmptyWikiState();
    let basis = compileRuntime(state, 0);
    const observer = createWikiMaterialLexicalObservationPort(
      (observation) => {
        const batch = planWikiAdmissionBatch(
          observation,
          collectCommittedWikiTermsResult(observation.committed),
          null,
        );
        const result = applyWikiObservationBatch(state, batch.events, batch.tick);
        if (!result.ok) throw new Error(result.error.message);
        state = result.state;
        basis = compileRuntime(state, basis.snapshot.generation + 1);
      },
    );
    const distinctive = Object.freeze({
      locale: "en-US" as const,
      channel: "spoken" as const,
      text: "We remember OpenAI",
    });

    observeCommittedMaterialText(observer, distinctive);
    expect(state.lexemes).toEqual([
      expect.objectContaining({
        canonical: "OpenAI",
        provenance: "aggregate-evidence",
      }),
    ]);
    const broad = Object.freeze({ ...distinctive, text: "We shape material" });
    observeCommittedMaterialText(observer, broad);
    expect(state.lexemes.some((entry) => entry.canonical === "material")).toBe(false);
    observeCommittedMaterialText(observer, broad);
    expect(state.lexemes).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonical: "material" }),
    ]));
  });

  it("activates a runtime fitting relation with collection enabled and pauses instantly", () => {
    let state = createEmptyWikiState();
    const created = applyWikiEvent(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    if (!created.ok) throw new Error(created.error.message);
    state = created.state;
    let basis = compileRuntime(state, 1);
    const observer = createWikiMaterialLexicalObservationPort(
      (observation) => {
        const batch = planWikiAdmissionBatch(
          observation,
          collectCommittedWikiTermsResult(
            observation.committed,
            new Set(["locale-segment-v1", "shape-specific-v1"]),
          ),
          fitCommittedWikiTextResult(
            basis.fitSnapshot,
            observation.observed,
            new Set(["latin-internal-edit-v2"]),
          ),
        );
        const result = applyWikiObservationBatch(state, batch.events, batch.tick);
        if (!result.ok) throw new Error(result.error.message);
        state = result.state;
        basis = compileRuntime(state, basis.snapshot.generation + 1);
      },
    );
    const request = Object.freeze({
      locale: "en-US" as const,
      channel: "spoken" as const,
      text: "Englebart spoke",
    });
    for (let turn = 0; turn < 3; turn += 1) {
      observeCommittedMaterialText(observer, request);
    }
    expect(state.lexemes.some((lexeme) => lexeme.canonical === "Englebart"))
      .toBe(false);
    expect(basis.snapshot.rules).toEqual([]);
    observeCommittedMaterialText(observer, request);
    expect(basis.snapshot.rules).toEqual([
      expect.objectContaining({ form: "Englebart", canonical: "Engelbart" }),
    ]);

    let fittingEnabled = true;
    const lexical = createWikiMaterialLexicalPort(
      () => basis,
      () => canonicalizeWikiText,
      { phoneticFittingEnabled: () => fittingEnabled },
    );
    expect(canonicalizeMaterialText(lexical.capture(), request).text)
      .toBe("Engelbart spoke");
    fittingEnabled = false;
    expect(canonicalizeMaterialText(lexical.capture(), request).text)
      .toBe("Englebart spoke");
  });

  it("learns and corrects a recurring Latin misspelling inside Chinese speech", () => {
    // The default interface admits zh-CN speech; the product starters provide
    // the en-US `Engelbart` target the routed Latin word reaches.
    let state = createInitialWikiState();
    let basis = compileRuntime(state, 1);
    const observer = createWikiMaterialLexicalObservationPort(
      (observation) => {
        const batch = planWikiAdmissionBatch(
          observation,
          collectCommittedWikiTermsResult(
            observation.committed,
            new Set(["locale-segment-v1", "shape-specific-v1"]),
          ),
          fitCommittedWikiTextResult(
            basis.fitSnapshot,
            observation.observed,
            new Set(["latin-internal-edit-v2"]),
          ),
        );
        const result = applyWikiObservationBatch(state, batch.events, batch.tick);
        if (!result.ok) throw new Error(result.error.message);
        state = result.state;
        basis = compileRuntime(state, basis.snapshot.generation + 1);
      },
    );
    const request = Object.freeze({
      locale: "zh-CN" as const,
      channel: "spoken" as const,
      text: "我读了Englebart的论文",
    });
    const lexical = createWikiMaterialLexicalPort(() => basis, () => canonicalizeWikiText);

    for (let turn = 0; turn < 3; turn += 1) {
      observeCommittedMaterialText(observer, request);
    }
    expect(basis.snapshot.rules.some((rule) => rule.form === "Englebart")).toBe(false);
    expect(canonicalizeMaterialText(lexical.capture(), request).text).toBe(request.text);
    observeCommittedMaterialText(observer, request);
    expect(basis.snapshot.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locale: "en-US",
        channel: "spoken",
        form: "Englebart",
        canonical: "Engelbart",
      }),
    ]));
    // The misspelling is claimed by the relation and never listed as a word.
    expect(state.lexemes.some((lexeme) => lexeme.canonical === "Englebart")).toBe(false);
    expect(state.termEvidence.some((entry) => entry.canonical === "Englebart")).toBe(false);

    expect(canonicalizeMaterialText(lexical.capture(), request).text)
      .toBe("我读了Engelbart的论文");
    for (const [locale, text, expected] of [
      ["zh-TW", "我讀了Englebart的論文", "我讀了Engelbart的論文"],
      ["ja-JP", "Englebartの論文", "Engelbartの論文"],
      ["en-US", "Englebart spoke", "Engelbart spoke"],
      ["de-DE", "Englebart sprach", "Englebart sprach"],
    ] as const) {
      expect(canonicalizeMaterialText(lexical.capture(), {
        locale,
        channel: "spoken",
        text,
      }).text).toBe(expected);
    }

    // A Chinese turn without Latin is no opportunity for the Latin ledger.
    const relationQuiet = () => state.aliasEvidence.find((entry) =>
      entry.form === "Englebart")?.quietTurns;
    observeCommittedMaterialText(observer, { ...request, text: "我们讨论材料" });
    expect(relationQuiet()).toBe(0);
    observeCommittedMaterialText(observer, { ...request, text: "我们讨论Morphogenesis" });
    expect(relationQuiet()).toBe(1);
  });
});

function compileRuntime(state: WikiState, generation: number): WikiBasis {
  const result = compileWikiBasis(
    state,
    generation,
    undefined,
    createWikiProjectionPolicy(MATTER_WIKI_RUNTIME_PRODUCER_RELEASES),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.basis;
}
