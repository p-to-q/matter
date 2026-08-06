import { describe, expect, it } from "vitest";
import type {
  AdmissionAnchor,
  AdmissionErrorCode,
  AdmissionInteractionState,
} from "../runtime/admission-interaction";
import {
  CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT,
  localizeCanvasGuidance,
  projectCanvasGuidance,
  type CanvasGuidanceInput,
  type CanvasLanguageGuidanceState,
  type CanvasMaterialGuidanceState,
} from "./canvas-guidance";

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
  it.each([
    [attempt({ phase: "requesting" }), "allow-microphone", "action", "Allow microphone access."],
    [attempt({ phase: "recording", startedAtMs: 20 }), "speak-recording", "action", "Speak your thought."],
    [attempt({ phase: "stopping", reason: "person" }), "wait-recording", "progress", "Wait for recording to finish."],
    [attempt({ phase: "transcribing" }), "wait-transcription", "progress", "Wait while voice becomes material."],
    [attempt({ phase: "committing" }), "wait-commit", "progress", "Wait while the thought is placed."],
  ] as const)("projects admission %s before every material handle", (admission, id, kind, text) => {
    expect(projectCanvasGuidance(input({
      admission,
      language: { kind: "selected", stretch: { kind: "committed", amount: 1 } },
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
        admission: attempt({ phase: "error", errorCode }),
      }))).toEqual({ id, kind: "recovery", text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it.each([
    [{ kind: "empty" }, "speak-root", "Speak to place your first thought."],
    [{ kind: "full", selected: null }, "select-thought", "Select one thought."],
    [{ kind: "full", selected: { folded: false } }, "speak-child", "Speak to grow beneath it."],
    [{ kind: "full", selected: { folded: true } }, "unfold-thought", "Unfold this thought."],
    [{ kind: "focus" }, "circle-focus", "Circle the phrase to change."],
  ] satisfies readonly [CanvasMaterialGuidanceState, string, string][])(
    "projects material state %s",
    (material, id, text) => {
      expect(projectCanvasGuidance(input({ material }))).toEqual({ id, kind: "action", text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it.each([
    [{ kind: "lasso-ready" }, "circle-reference", "Circle one phrase as reference."],
    [{ kind: "lasso-drawing" }, "close-lasso", "Close the loop around a phrase."],
    [{ kind: "selected", stretch: { kind: "armed", amount: 0 } }, "set-degree", "Drag a handle to set the degree."],
    [{ kind: "selected", stretch: { kind: "dragging", amount: 0 } }, "release-stretch", "Release at the right degree."],
    [{ kind: "selected", stretch: { kind: "dragging", amount: 0.8 } }, "release-stretch", "Release at the right degree."],
    [{ kind: "selected", stretch: { kind: "committed", amount: 0.6 } }, "refine-degree", "Adjust a handle to refine it."],
  ] satisfies readonly [CanvasLanguageGuidanceState, string, string][])(
    "projects language state %s before rooted navigation",
    (language, id, text) => {
      expect(projectCanvasGuidance(input({
        language,
        material: { kind: "focus" },
      }))).toEqual({ id, kind: "action", text });
      expect(text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    },
  );

  it("lets an empty document outrank stale lasso and stretch state", () => {
    expect(projectCanvasGuidance(input({
      language: { kind: "selected", stretch: { kind: "committed", amount: 1 } },
      material: { kind: "empty" },
    }))).toEqual({
      id: "speak-root",
      kind: "action",
      text: "Speak to place your first thought.",
    });
  });

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
      "speak-root": true,
      "close-lasso": true,
      "release-stretch": true,
      "set-degree": true,
      "refine-degree": true,
      "circle-reference": true,
      "circle-focus": true,
      "unfold-thought": true,
      "speak-child": true,
      "select-thought": true,
    }) as Array<ReturnType<typeof projectCanvasGuidance>["id"]>;

    for (const id of states) {
      const localized = localizeCanvasGuidance({ id, kind: "action", text: "" }, "zh-CN");
      expect(localized.text.length).toBeLessThanOrEqual(CANVAS_GUIDANCE_NARROW_CHARACTER_LIMIT);
    }
  });
});
