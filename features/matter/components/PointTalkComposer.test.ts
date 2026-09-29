import { describe, expect, it } from "vitest";
import type {
  TextSwapErrorCode,
  TextSwapInteractionState,
} from "../runtime/text-swap-interaction";
import {
  emptySettledStatus,
  projectSettledStatus,
  settledStatusDeadline,
  syncSettledStatus,
} from "./presence";
import {
  pointTalkCopy,
  pointTalkOutsidePointerDismisses,
  pointTalkPhaseLabel,
  pointTalkRecoveryAction,
  pointTalkStatusInput,
} from "./PointTalkComposer";

const BASIS = Object.freeze({
  treeId: "tree_1",
  baseRevision: 1,
  documentEpoch: 1,
  selection: Object.freeze({
    type: "segment-range" as const,
    nodeId: "thought_1",
    start: 0,
    end: 4,
    selectedText: "Rain",
  }),
  sourceText: "Rain",
  locale: "en-US" as const,
  lineage: Object.freeze([]),
});

function failure(
  errorCode: TextSwapErrorCode,
  options: Readonly<{ direction?: string; retryable?: boolean; submitted?: boolean }> = {},
): Extract<TextSwapInteractionState, { phase: "error" }> {
  return Object.freeze({
    phase: "error",
    interactionId: "point_talk_1",
    attempt: 1,
    basis: BASIS,
    errorCode,
    retryable: options.retryable ?? true,
    submitted: options.submitted ?? false,
    ...(options.direction === undefined ? {} : { direction: options.direction }),
  });
}

describe("Point Talk recovery", () => {
  it("treats canvas chrome as temporary occlusion rather than dismissal", () => {
    expect(pointTalkOutsidePointerDismisses({
      insideBubble: true,
      insideCanvasChrome: false,
      insideVoiceTool: false,
      submitted: false,
    })).toBe(false);
    expect(pointTalkOutsidePointerDismisses({
      insideBubble: false,
      insideCanvasChrome: true,
      insideVoiceTool: false,
      submitted: true,
    })).toBe(false);
    expect(pointTalkOutsidePointerDismisses({
      insideBubble: false,
      insideCanvasChrome: true,
      insideVoiceTool: false,
      submitted: false,
    })).toBe(true);
    expect(pointTalkOutsidePointerDismisses({
      insideBubble: false,
      insideCanvasChrome: false,
      insideVoiceTool: false,
      submitted: true,
    })).toBe(true);
    expect(pointTalkOutsidePointerDismisses({
      insideBubble: false,
      insideCanvasChrome: false,
      insideVoiceTool: true,
      submitted: false,
    })).toBe(false);
  });

  it("keeps request retry and voice retry as distinct pointer actions", () => {
    expect(pointTalkRecoveryAction(
      failure("REQUEST_FAILED", { direction: "Make it quieter" }),
      true,
    )).toBe("request");

    for (const errorCode of [
      "MICROPHONE_UNAVAILABLE",
      "RECORDING_FAILED",
      "NO_AUDIO",
      "TRANSCRIPTION_FAILED",
      "TRANSCRIPTION_TIMEOUT",
    ] satisfies TextSwapErrorCode[]) {
      expect(pointTalkRecoveryAction(failure(errorCode), true)).toBe("voice");
      expect(pointTalkRecoveryAction(failure(errorCode), false)).toBeNull();
    }

    expect(pointTalkRecoveryAction(failure("INVALID_DIRECTION"), true)).toBeNull();
    expect(pointTalkRecoveryAction(
      failure("MICROPHONE_DENIED", { retryable: false }),
      true,
    )).toBeNull();
  });

  it("names each status phase without the transient partial it may paint", () => {
    for (const locale of ["en-US", "zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      for (const phase of ["permission", "recording", "transcribing", "pending", "error"] as const) {
        expect(pointTalkPhaseLabel(phase, locale).length).toBeGreaterThan(0);
      }
    }
    expect(pointTalkPhaseLabel("recording", "en-US")).toBe("Listening…");
    expect(pointTalkPhaseLabel("error", "zh-CN")).toBe("原文没有改变。");
  });

  it("stops claiming to listen the moment the person taps Stop", () => {
    const scope = "0:thought_1:1";
    const listening = syncSettledStatus(
      emptySettledStatus(),
      pointTalkStatusInput(scope, "recording"),
      1_000,
    );
    expect(listening.shown).toBe("recording");
    // Stop 3 s later: recording becomes transcribing, a settling system phase.
    const stopped = syncSettledStatus(listening, pointTalkStatusInput(scope, "transcribing"), 4_000);
    expect(projectSettledStatus(stopped, pointTalkStatusInput(scope, "transcribing"))).toBeNull();
    expect(stopped.shown).toBeNull();
    expect(settledStatusDeadline(stopped)).toBe(4_150);
    // A submit shows at once; waiting for the microphone settles first.
    expect(pointTalkStatusInput(scope, "pending")).toMatchObject({ urgent: true, lingers: true });
    expect(pointTalkStatusInput(scope, "permission")).toMatchObject({ urgent: false, lingers: true });
    expect(pointTalkStatusInput(scope, "error")).toMatchObject({ urgent: true, lingers: false });
  });
});

describe("Point and Talk copy", () => {
  it("speaks each locale's own status lines", () => {
    const english = pointTalkCopy("en-US");
    for (const locale of ["ja-JP", "de-DE"] as const) {
      const copy = pointTalkCopy(locale);
      expect(copy.listening).not.toBe(english.listening);
      expect(copy.rewording).not.toBe(english.rewording);
      expect(copy.originalKept).not.toBe(english.originalKept);
    }
    expect(pointTalkCopy("zh-TW").originalKept).toBe("原文沒有改變。");
    expect(pointTalkCopy("zh-CN").originalKept).toBe("原文没有改变。");
  });
});
