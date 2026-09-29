import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  AdmissionAnchor,
  AdmissionErrorCode,
  AdmissionInteractionState,
} from "../runtime/admission-interaction";
import { admissionFeedbackActions } from "./admission-feedback-copy";
import {
  CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT,
  localizeCanvasGuidance,
  localizeOutcome,
  localizeParkedRelease,
  outcomeGuidanceId,
  projectCanvasGuidance,
  type CanvasGuidanceInput,
  type CanvasLanguageGuidanceState,
  type CanvasMaterialGuidanceState,
} from "./canvas-guidance";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import type { MaterialOutcome } from "./outcome-line";

const ANCHOR: AdmissionAnchor = {
  kind: "child",
  treeId: "tree_1",
  baseRevision: 4,
  parentNodeId: "thought_1",
};

const NONE: CanvasLanguageGuidanceState = { kind: "none" };
const FULL_UNSELECTED: CanvasMaterialGuidanceState = { kind: "full", selected: null };
const IDLE: AdmissionInteractionState = { phase: "idle" };
type AdmissionAttempt = Exclude<AdmissionInteractionState, { phase: "idle" }>;
type WithoutAttemptIdentity<T> = T extends unknown
  ? Omit<T, "token" | "attempt" | "anchor">
  : never;
type AdmissionAttemptPayload = WithoutAttemptIdentity<AdmissionAttempt>;

function input(overrides: Partial<CanvasGuidanceInput> = {}): CanvasGuidanceInput {
  return {
    admission: IDLE,
    camera: { kind: "none" },
    language: NONE,
    material: FULL_UNSELECTED,
    ...overrides,
  };
}

function attempt(state: AdmissionAttemptPayload): AdmissionAttempt {
  return {
    token: "voice_1",
    attempt: 1,
    anchor: ANCHOR,
    ...state,
  } as AdmissionAttempt;
}

describe("canvas guidance projection", () => {
  it("keeps every locale's guidance table complete instead of spreading another language", () => {
    const source = readFileSync(new URL("./canvas-guidance.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/Object\.freeze\(\{\s*\.\.\.GUIDANCE_COPY/u);
    expect(source.match(/\} satisfies Readonly<Record<CanvasActionGuidanceId, string>>\);/gu)).toHaveLength(5);
  });

  it.each([
    [attempt({ phase: "requesting" }), "allow-microphone", "action", "Allow microphone access."],
    [attempt({ phase: "recording", startedAtMs: 20 }), "speak-recording", "action", "Speak your thought."],
    [attempt({ phase: "stopping", reason: "person" }), "wait-recording", "progress", "Wait for recording to finish."],
    [attempt({ phase: "transcribing" }), "wait-transcription", "progress", "Wait while voice becomes material."],
    [attempt({ phase: "committing", transcript: "thought" }), "wait-commit", "progress", "Wait while the thought is placed."],
  ] as const)("projects admission %s before every material handle", (admission, id, kind, text) => {
    expect(projectCanvasGuidance(input({
      admission,
      language: { kind: "selected", stretch: { kind: "pending", amount: 1 } },
      material: { kind: "empty" },
    }))).toEqual({ id, kind, text });
    expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
  });

  it.each([
    ["MICROPHONE_DENIED", "enable-microphone", "Enable microphone access."],
    ["MICROPHONE_UNAVAILABLE", "connect-microphone", "Connect a microphone."],
    ["RECORDING_UNSUPPORTED", "use-recording-browser", "Use a browser that can record."],
    ["NO_AUDIO", "record-again", "Record your thought again."],
    ["EMPTY_TRANSCRIPT", "record-again", "Record your thought again."],
    ["RECORDING_FAILED", "record-again", "Record your thought again."],
    ["TRANSCRIPTION_FAILED", "record-again", "Record your thought again."],
    ["TRANSCRIPTION_TIMEOUT", "record-again", "Record your thought again."],
    ["INTERNAL_FAILURE", "record-again", "Record your thought again."],
    ["COMMIT_REJECTED", "dismiss-stale-recording", "Dismiss this recording."],
    ["STALE_TARGET", "dismiss-stale-recording", "Dismiss this recording."],
  ] satisfies readonly [AdmissionErrorCode, string, string][])(
    "gives %s one truthful recovery action",
    (errorCode, id, text) => {
      expect(projectCanvasGuidance(input({
        admission: attempt({ phase: "error", errorCode, submitted: false }),
      }))).toEqual({ id, kind: "recovery", text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it.each([
    ["unavailable", "text-swap-unavailable", "Not rewritten. Text unchanged."],
    ["stale", "text-swap-stale", "Passage changed. Not rewritten."],
  ] as const)("reports a released %s rewrite in place of the next hint", (reason, id, text) => {
    const outcome: MaterialOutcome = { owner: "rewrite", reason };
    expect(projectCanvasGuidance(input({
      outcome,
      language: { kind: "lasso-ready" },
    }))).toEqual({ id, kind: "recovery", text });
    expect(outcomeGuidanceId(outcome)).toBe(id);
    expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    // Live voice still owns the line.
    expect(projectCanvasGuidance(input({
      outcome,
      admission: attempt({ phase: "recording", startedAtMs: 1 }),
    })).id).toBe("speak-recording");
    for (const language of ["zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      expect(localizeCanvasGuidance({ id, kind: "recovery", text }, language).text)
        .not.toBe(text);
    }
    expect(localizeOutcome(outcome, "en-US")).toBe(text);
    expect(localizeOutcome(outcome, "zh-CN"))
      .toBe(localizeCanvasGuidance({ id, kind: "recovery", text }, "zh-CN").text);
  });

  it("says once that Wiki could not record an explicit choice", () => {
    const text = "Wiki could not save that.";
    const outcome: MaterialOutcome = { owner: "wiki", reason: "unsaved" };
    expect(projectCanvasGuidance(input({
      outcome,
      language: { kind: "lasso-ready" },
    }))).toEqual({ id: "wiki-unsaved", kind: "recovery", text });
    expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    // Live voice keeps the line first; the outcome waits rather than hiding.
    expect(projectCanvasGuidance(input({
      outcome,
      admission: attempt({ phase: "recording", startedAtMs: 1 }),
    })).id).toBe("speak-recording");
    for (const language of ["zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      const localized = localizeOutcome(outcome, language);
      expect(localized).not.toBe(text);
      expect(localized.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    }
    expect(localizeOutcome(outcome, "en-US")).toBe(text);
  });

  it("says a refused Wiki restore on the line instead of a timed notice at the word", () => {
    const outcome: MaterialOutcome = { owner: "wiki", reason: "passage-changed" };
    expect(projectCanvasGuidance(input({ outcome }))).toEqual({
      id: "wiki-passage-changed",
      kind: "recovery",
      text: "Passage changed. Not restored.",
    });
    expect(localizeOutcome(outcome, "zh-CN")).toBe("段落已变化，未恢复。");
    for (const language of ["zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      expect(localizeOutcome(outcome, language)).not.toBe(localizeOutcome(outcome, "en-US"));
    }
  });

  it("says the shown outcome ahead of a parked result, then the parked result", () => {
    const outcome: MaterialOutcome = { owner: "wiki", reason: "unsaved" };
    expect(projectCanvasGuidance(input({
      outcome,
      expansion: { kind: "parked" },
      rewrite: { kind: "parked" },
    })).id).toBe("wiki-unsaved");
    expect(projectCanvasGuidance(input({
      expansion: { kind: "parked" },
      rewrite: { kind: "parked" },
    })).id).toBe("expansion-parked");
  });

  it("asks to place or discard held words instead of dismissing the recording", () => {
    expect(projectCanvasGuidance(input({
      admission: attempt({
        phase: "error",
        errorCode: "STALE_TARGET",
        submitted: true,
        transcript: "held words",
      }),
    }))).toEqual({
      id: "place-held-words",
      kind: "recovery",
      text: "Place or discard these words.",
    });
  });

  it.each([
    [0.6, 60],
    [1, 100],
    [1.8, 180],
  ])("projects Pan camera scale %s as a stable %s percent readout", (zoom, percent) => {
    expect(projectCanvasGuidance(input({
      camera: { kind: "pan", zoom },
    }))).toEqual({
      id: "canvas-zoom",
      kind: "readout",
      percent,
      text: `${percent}%`,
    });
  });

  it.each([
    [{ kind: "parked" } as const, undefined, "expansion-parked", "Expansion waits for its passage."],
    [undefined, { owner: "expansion", reason: "unavailable" } as const, "expansion-unavailable", "Not expanded. Text unchanged."],
    [undefined, { owner: "expansion", reason: "stale" } as const, "expansion-stale", "Passage changed. Not expanded."],
  ])(
    "keeps a submitted expansion's %o / %o state ahead of lasso guidance",
    (expansion, outcome, id, text) => {
      expect(projectCanvasGuidance(input({
        expansion,
        outcome,
        language: { kind: "selected", stretch: { kind: "adjusted", amount: 0.4 } },
      }))).toEqual({ id, kind: "recovery", text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it("says why a parked Point-and-Talk result keeps its owner busy", () => {
    expect(projectCanvasGuidance(input({
      rewrite: { kind: "parked" },
      language: { kind: "lasso-ready" },
    }))).toEqual({
      id: "text-swap-parked",
      kind: "recovery",
      text: "Rewording waits for its passage.",
    });
    expect(localizeCanvasGuidance(
      projectCanvasGuidance(input({ rewrite: { kind: "parked" } })),
      "de-DE",
    ).text).toBe("Die Umformulierung wartet auf ihre Passage.");
  });

  it("keeps live voice guidance ahead of an expansion outcome", () => {
    expect(projectCanvasGuidance(input({
      admission: attempt({ phase: "recording", startedAtMs: 20 }),
      expansion: { kind: "parked" },
    })).id).toBe("speak-recording");
  });

  it("localizes the expansion announcement and its explicit release", () => {
    expect(localizeOutcome({ owner: "expansion", reason: "unavailable" }, "en-US"))
      .toBe("Not expanded. Text unchanged.");
    expect(localizeOutcome({ owner: "expansion", reason: "stale" }, "zh-CN"))
      .toBe("段落已变化，未展开。");
    expect(localizeParkedRelease("en-US")).toBe("Discard");
    expect(localizeParkedRelease("zh-CN")).toBe("丢弃");
    expect(localizeParkedRelease("zh-TW")).toBe("丟棄");
    expect(localizeParkedRelease("ja-JP")).toBe("破棄");
  });

  it("names releasing held work with one word in every locale", () => {
    // A parked result and held admission words are both work kept for the
    // person; one Discard means one consequence wherever it appears.
    for (const { value: language } of CANVAS_LANGUAGE_OPTIONS) {
      expect(localizeParkedRelease(language)).toBe(admissionFeedbackActions(language).discard);
    }
  });

  it("keeps urgent interaction guidance ahead of the Pan readout", () => {
    const camera = { kind: "pan", zoom: 1.25 } as const;

    expect(projectCanvasGuidance(input({
      admission: attempt({ phase: "recording", startedAtMs: 20 }),
      camera,
    })).id).toBe("speak-recording");
    expect(projectCanvasGuidance(input({
      camera,
      material: { kind: "empty" },
    })).id).toBe("speak-root");
    expect(projectCanvasGuidance(input({
      camera,
      language: { kind: "lasso-drawing" },
    })).id).toBe("close-lasso");
    expect(projectCanvasGuidance(input({
      camera,
      language: { kind: "selected", stretch: { kind: "pending", amount: 0.6 } },
    })).id).toBe("wait-expansion");
  });

  it("falls back to truthful material guidance for an invalid camera scale", () => {
    expect(projectCanvasGuidance(input({
      camera: { kind: "pan", zoom: 0 },
    }))).toEqual({
      id: "select-thought",
      kind: "action",
      text: "Select one thought.",
    });
  });

  it.each([
    [{ kind: "empty" }, "speak-root", "Speak to place your first thought."],
    [{ kind: "full", selected: null }, "select-thought", "Select one thought."],
    [{ kind: "full", selected: { folded: false } }, "speak-child", "Speak to grow beneath it."],
    [{ kind: "full", selected: { folded: true } }, "unfold-thought", "Unfold this thought."],
    [{ kind: "focus" }, "circle-selection", "Circle text between punctuation."],
  ] satisfies readonly [CanvasMaterialGuidanceState, string, string][])(
    "projects material state %s",
    (material, id, text) => {
      expect(projectCanvasGuidance(input({ material }))).toEqual({ id, kind: "action", text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it.each([
    [{ kind: "lasso-ready" }, "circle-selection", "action", "Circle text between punctuation."],
    [{ kind: "lasso-drawing" }, "close-lasso", "action", "Close the loop around a phrase."],
    [{ kind: "selected", stretch: { kind: "armed", amount: 0 } }, "set-degree", "action", "Pull either handle outward."],
    [{ kind: "selected", stretch: { kind: "dragging", amount: 0 } }, "begin-stretch", "action", "Pull to begin."],
    [{ kind: "selected", stretch: { kind: "dragging", amount: 0.8 } }, "release-stretch", "action", "Release to set the degree."],
    [{ kind: "selected", stretch: { kind: "adjusted", amount: 0.1 } }, "apply-stretch", "action", "Tap the selection to confirm."],
    [{ kind: "selected", stretch: { kind: "adjusted", amount: 0.6 } }, "apply-stretch", "action", "Tap the selection to confirm."],
    [{ kind: "selected", stretch: { kind: "pending", amount: 0.6 } }, "wait-expansion", "progress", "Confirmed. Expanding."],
  ] satisfies readonly [CanvasLanguageGuidanceState, string, string, string][])(
    "projects language state %s before rooted navigation",
    (language, id, kind, text) => {
      expect(projectCanvasGuidance(input({
        language,
        material: { kind: "focus" },
      }))).toEqual({ id, kind, text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it("lets an empty document outrank stale lasso and stretch state", () => {
    expect(projectCanvasGuidance(input({
      language: { kind: "selected", stretch: { kind: "pending", amount: 1 } },
      material: { kind: "empty" },
    }))).toEqual({
      id: "speak-root",
      kind: "action",
      text: "Speak to place your first thought.",
    });
  });

  it.each([
    [{ kind: "armed", amount: 0 }, "set-degree", "action", "Pull either handle outward."],
    [{ kind: "pending", amount: 0.6 }, "wait-expansion", "progress", "Confirmed. Expanding."],
  ] satisfies readonly [
    Extract<CanvasLanguageGuidanceState, { kind: "selected" }>["stretch"],
    string,
    string,
    string,
  ][])(
    "lets current Elastic state %s outrank a dismissed admission error",
    (stretch, id, kind, text) => {
      expect(projectCanvasGuidance(input({
        admission: attempt({ phase: "error", errorCode: "NO_AUDIO", submitted: true }),
        language: { kind: "selected", stretch },
        material: { kind: "focus" },
      }))).toEqual({ id, kind, text });
    },
  );

  it("returns an immutable disposable projection", () => {
    expect(Object.isFrozen(projectCanvasGuidance(input()))).toBe(true);
  });

  it("localizes copy without changing guidance ownership or state", () => {
    const english = projectCanvasGuidance(input({
      material: { kind: "full", selected: { folded: false } },
    }));
    const chinese = localizeCanvasGuidance(english, "zh-CN");

    expect(chinese).toEqual({
      id: "speak-child",
      kind: "action",
      text: "说话，让想法向下生长。",
    });
    expect(localizeCanvasGuidance(english, "en-US")).toBe(english);
    expect(Object.isFrozen(chinese)).toBe(true);
  });

  it("keeps the instrument readout byte-stable across every canvas language", () => {
    const readout = projectCanvasGuidance(input({
      camera: { kind: "pan", zoom: 1.25 },
    }));

    for (const language of ["en-US", "zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      expect(localizeCanvasGuidance(readout, language)).toBe(readout);
    }
  });

  it("keeps every Chinese prompt inside the existing narrow copy budget", () => {
    const states = Object.keys({
      "allow-microphone": true,
      "speak-recording": true,
      "wait-recording": true,
      "wait-transcription": true,
      "wait-commit": true,
      "enable-microphone": true,
      "connect-microphone": true,
      "use-recording-browser": true,
      "record-again": true,
      "dismiss-stale-recording": true,
      "place-held-words": true,
      "speak-root": true,
      "close-lasso": true,
      "begin-stretch": true,
      "release-stretch": true,
      "set-degree": true,
      "apply-stretch": true,
      "wait-expansion": true,
      "expansion-parked": true,
      "text-swap-parked": true,
      "expansion-unavailable": true,
      "expansion-stale": true,
      "circle-selection": true,
      "unfold-thought": true,
      "speak-child": true,
      "select-thought": true,
      "text-swap-unavailable": true,
      "text-swap-stale": true,
      "wiki-unsaved": true,
      "wiki-passage-changed": true,
    }) as Array<Exclude<ReturnType<typeof projectCanvasGuidance>["id"], "canvas-zoom">>;

    for (const id of states) {
      const localized = localizeCanvasGuidance({ id, kind: "action", text: "" }, "zh-CN");
      expect(localized.text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    }
  });
});
