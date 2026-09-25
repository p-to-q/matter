import { describe, expect, it } from "vitest";
import { compileWikiBasis, type WikiBasis } from "../wiki/wiki-basis";
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
    });
  });

  it("reports fitting evidence from committed human speech against the captured basis", () => {
    const created = applyWikiEvent(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    if (!created.ok) throw new Error(created.error.message);
    const compiled = compileWikiBasis(created.state, 3);
    if (!compiled.ok) throw new Error(compiled.error.message);
    const observed: unknown[] = [];
    const observer = createWikiMaterialLexicalObservationPort(
      () => compiled.basis,
      (events) => observed.push({ events }),
      { mode: "latin-conservative" },
    );

    observeCommittedMaterialText(observer, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart spoke",
    });
    observeCommittedMaterialText(observer, {
      locale: "en-US",
      channel: "written",
      text: "Englebart wrote",
    });

    expect(observed).toEqual([{
      events: [expect.objectContaining({ form: "Englebart", canonical: "Engelbart" })],
    }, {
      events: [],
    }]);
  });

  it("keeps automatic fitting off while still reporting a human turn", () => {
    const compiled = compileWikiBasis(createEmptyWikiState(), 0);
    if (!compiled.ok) throw new Error(compiled.error.message);
    const observed: unknown[] = [];
    const observer = createWikiMaterialLexicalObservationPort(
      () => compiled.basis,
      (events) => observed.push(events),
      { mode: "off" },
    );

    observeCommittedMaterialText(observer, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart spoke",
    });

    expect(observed).toEqual([[]]);
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
