import { describe, expect, it } from "vitest";
import type { AdmissionErrorCode } from "../runtime/admission-interaction";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import {
  admissionFeedbackActions,
  admissionFeedbackMessage,
  admissionPlacementLabel,
} from "./admission-feedback-copy";

const ANCHOR = Object.freeze({ kind: "root" as const, treeId: "tree_1", baseRevision: 0 });
const CHILD = Object.freeze({
  kind: "child" as const,
  treeId: "tree_1",
  baseRevision: 3,
  parentNodeId: "thought_1",
});

describe("admission feedback copy", () => {
  it("uses the selected canvas language for the first-recording recovery path", () => {
    expect(admissionFeedbackMessage("zh-CN", {
      phase: "error",
      token: "voice_1",
      attempt: 1,
      anchor: ANCHOR,
      errorCode: "MICROPHONE_DENIED",
      submitted: false,
    })).toBe("麦克风权限已被阻止。");
    expect(admissionFeedbackActions("zh-CN")).toEqual({
      stop: "停止录音",
      retry: "重新录音",
      dismiss: "关闭",
      cancel: "取消录音",
      cancelTranscription: "取消转写",
      discard: "丢弃",
    });
  });

  it("names held words and where an explicit placement would put them", () => {
    const held = {
      phase: "error" as const,
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      errorCode: "STALE_TARGET" as const,
      submitted: true,
      transcript: "held",
    };
    expect(admissionFeedbackMessage("en-US", held))
      .toBe("Where these words were going changed before they arrived.");
    expect(admissionFeedbackMessage("en-US", { ...held, transcript: undefined }))
      .toBe("That thought changed before the recording finished.");
    expect(admissionPlacementLabel("en-US", ANCHOR, null)).toBe("Place as the root thought");
    expect(admissionPlacementLabel("en-US", { ...CHILD, parentNodeId: "document" }, "document"))
      .toBe("Place as a top-level thought");
    expect(admissionPlacementLabel("en-US", CHILD, "document"))
      .toBe("Place below the selected material");
    for (const { value: language } of CANVAS_LANGUAGE_OPTIONS) {
      expect(admissionFeedbackMessage(language, held).length).toBeGreaterThan(0);
      for (const anchor of [ANCHOR, CHILD, { ...CHILD, parentNodeId: "document" }]) {
        expect(admissionPlacementLabel(language, anchor, "document").length).toBeGreaterThan(0);
      }
    }
  });

  it("covers every phase, error, action, and supported language", () => {
    const errorCodes: readonly AdmissionErrorCode[] = [
      "MICROPHONE_DENIED",
      "MICROPHONE_UNAVAILABLE",
      "RECORDING_UNSUPPORTED",
      "RECORDING_FAILED",
      "NO_AUDIO",
      "TRANSCRIPTION_FAILED",
      "TRANSCRIPTION_TIMEOUT",
      "EMPTY_TRANSCRIPT",
      "COMMIT_REJECTED",
      "STALE_TARGET",
      "INTERNAL_FAILURE",
    ];
    for (const { value: language } of CANVAS_LANGUAGE_OPTIONS) {
      const actions = admissionFeedbackActions(language);
      expect(Object.values(actions).every((label) => label.length > 0)).toBe(true);
      for (const errorCode of errorCodes) {
        expect(admissionFeedbackMessage(language, {
          phase: "error",
          token: "voice_1",
          attempt: 1,
          anchor: ANCHOR,
          errorCode,
          submitted: false,
        }).length).toBeGreaterThan(0);
      }
    }
  });
});
