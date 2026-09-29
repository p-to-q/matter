import { describe, expect, it } from "vitest";
import {
  compileWikiBasis,
  EMPTY_WIKI_BASIS,
  type WikiBasis,
} from "../wiki/wiki-basis";
import { compileWikiRules } from "../wiki/wiki-compiler";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";
import {
  canonicalizeMaterialText,
} from "./material-lexical-port";
import { observeCommittedMaterialText } from "./material-lexical-observation-port";
import {
  createWikiMaterialLexicalObservationPort,
  createWikiMaterialLexicalPort,
} from "./wiki-material-lexical-adapter";

describe("Wiki material lexical adapter", () => {
  it("captures one immutable basis for a complete material turn", () => {
    let current = basis("Codex", 1);
    const port = createWikiMaterialLexicalPort(() => current);
    const first = port.capture();
    current = basis("CODEX", 2);
    const second = port.capture();
    const request = Object.freeze({
      locale: "en-US" as const,
      channel: "spoken" as const,
      text: "code x helps",
    });

    expect(canonicalizeMaterialText(first, request).text).toBe("Codex helps");
    expect(canonicalizeMaterialText(second, request).text).toBe("CODEX helps");
    expect(first.snapshot).toEqual({ generation: 1, sourceRevision: 1 });
    expect(second.snapshot).toEqual({ generation: 2, sourceRevision: 1 });
  });

  it("turns an unusable Wiki match into an identity suggestion", () => {
    const session = createWikiMaterialLexicalPort(() => basis("Codex", 1)).capture();
    expect(canonicalizeMaterialText(session, {
      locale: "en-US",
      channel: "spoken",
      text: "bad\uD800text",
    })).toEqual({
      status: "unchanged",
      text: "bad\uD800text",
      changed: false,
      editCount: 0,
      edits: [],
    });
  });

  it("forwards one ephemeral human admission without importing producer policy", () => {
    const observed: unknown[] = [];
    const observer = createWikiMaterialLexicalObservationPort((request) => {
      observed.push(request);
    });

    observeCommittedMaterialText(observer, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart spoke",
      eligibleRanges: [{ start: 0, end: 10 }],
    });

    expect(observed).toEqual([{
      observed: {
        locale: "en-US",
        channel: "spoken",
        text: "Englebart spoke",
        eligibleRanges: [{ start: 0, end: 10 }],
      },
      committed: {
        locale: "en-US",
        channel: "spoken",
        text: "Englebart spoke",
        eligibleRanges: [{ start: 0, end: 10 }],
      },
    }]);
  });

  it("captures the confirmed fallback while phonetic fitting is paused", () => {
    const released = compileWikiRules([{
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "englebart",
      canonical: "Engelbart",
      authority: "provisional",
      provenance: "aggregate-evidence",
      score: 1,
    }], 4);
    if (!released.ok) throw new Error(released.issues[0]?.message);
    const basisWithReleasedFitting: WikiBasis = Object.freeze({
      ...EMPTY_WIKI_BASIS,
      stateRevision: 7,
      snapshot: released.snapshot,
      confirmedSnapshot: Object.freeze({
        ...EMPTY_WIKI_BASIS.confirmedSnapshot,
        generation: 4,
      }),
    });
    let enabled = false;
    const port = createWikiMaterialLexicalPort(
      () => basisWithReleasedFitting,
      { phoneticFittingEnabled: () => enabled },
    );
    const request = Object.freeze({
      locale: "en-US" as const,
      channel: "spoken" as const,
      text: "englebart spoke",
    });

    expect(canonicalizeMaterialText(port.capture(), request).text).toBe(
      "englebart spoke",
    );
    enabled = true;
    expect(canonicalizeMaterialText(port.capture(), request).text).toBe(
      "Engelbart spoke",
    );
  });

  it("mints one opaque attribution per applied edit from the captured basis", () => {
    const minted: unknown[] = [];
    const port = createWikiMaterialLexicalPort(() => basis("Codex", 3), {
      mintOccurrence: (attribution) => {
        minted.push(attribution);
        return `occurrence_${minted.length}`;
      },
    });
    const result = canonicalizeMaterialText(port.capture(), {
      locale: "en-US",
      channel: "spoken",
      text: "code x, then code x",
    });

    expect(result.edits).toEqual([
      { start: 0, end: 5, sourceText: "code x", occurrence: "occurrence_1" },
      { start: 12, end: 17, sourceText: "code x", occurrence: "occurrence_2" },
    ]);
    expect(minted).toEqual([1, 2].map(() => ({
      rule: {
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "code x",
        canonical: "Codex",
        appliedAtRevision: 1,
      },
      origin: "human-admission",
    })));
  });

  it("keeps the edit when attribution is unavailable or its minting fails", () => {
    for (const mintOccurrence of [() => null, () => {
      throw new Error("no random source");
    }]) {
      const port = createWikiMaterialLexicalPort(() => basis("Codex", 3), { mintOccurrence });
      expect(canonicalizeMaterialText(port.capture(), {
        locale: "en-US",
        channel: "spoken",
        text: "code x helps",
      })).toMatchObject({
        text: "Codex helps",
        edits: [{ start: 0, end: 5, sourceText: "code x" }],
      });
    }
  });

  it("attributes a routed Latin match to its own ledger and keeps the written heard form", () => {
    const minted: { rule: { locale: string; form: string } }[] = [];
    const port = createWikiMaterialLexicalPort(() => basis("Codex", 3), {
      mintOccurrence: (attribution) => {
        minted.push(attribution);
        return `routed_${minted.length}`;
      },
    });
    const result = canonicalizeMaterialText(port.capture(), {
      locale: "zh-CN",
      channel: "spoken",
      text: "我用 ｃｏｄｅ ｘ 写",
    });

    expect(result.text).toBe("我用 Codex 写");
    expect(result.edits).toEqual([
      { start: 3, end: 8, sourceText: "ｃｏｄｅ ｘ", occurrence: "routed_1" },
    ]);
    // The correction belongs to the en-US ledger the span routed to.
    expect(minted).toMatchObject([{ rule: { locale: "en-US", form: "code x" } }]);
  });

  it("attributes written-channel edits to generated material", () => {
    const transitioned = applyWikiEvent(createEmptyWikiState(), {
      type: "confirm-rule",
      locale: "en-US",
      channel: "written",
      boundary: "word",
      form: "glass",
      canonical: "the pane",
    });
    if (!transitioned.ok) throw new Error(transitioned.error.message);
    const compiled = compileWikiBasis(transitioned.state, 2);
    if (!compiled.ok) throw new Error(compiled.error.message);
    const origins: string[] = [];
    const port = createWikiMaterialLexicalPort(() => compiled.basis, {
      mintOccurrence: (attribution) => {
        origins.push(attribution.origin);
        return "generated_occurrence";
      },
    });
    canonicalizeMaterialText(port.capture(), {
      locale: "en-US",
      channel: "written",
      text: "against glass",
    });
    expect(origins).toEqual(["generated"]);
  });
});

function basis(canonical: string, generation: number): WikiBasis {
  const transitioned = applyWikiEvent(createEmptyWikiState(), {
    type: "confirm-rule",
    locale: "en-US",
    channel: "spoken",
    boundary: "word",
    form: "code x",
    canonical,
  });
  if (!transitioned.ok) throw new Error(transitioned.error.message);
  const compiled = compileWikiBasis(transitioned.state, generation);
  if (!compiled.ok) throw new Error(compiled.error.message);
  return compiled.basis;
}
