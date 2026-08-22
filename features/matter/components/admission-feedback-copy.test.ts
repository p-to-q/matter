import { describe, expect, it } from "vitest";
import type { AdmissionErrorCode } from "../runtime/admission-interaction";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import {
  admissionFeedbackActions,
  admissionFeedbackMessage,
} from "./admission-feedback-copy";

describe("admission feedback copy", () => {
  it("uses the selected canvas language for the first-recording recovery path", () => {
    expect(admissionFeedbackMessage("zh-CN", {
      phase: "error",
      token: "voice_1",
      attempt: 1,
      anchor: { kind: "root", treeId: "tree_1", baseRevision: 0 },
      errorCode: "MICROPHONE_DENIED",
    })).toBe("麦克风权限已被阻止。");
    expect(admissionFeedbackActions("zh-CN")).toEqual({
      stop: "停止录音",
      retry: "重新录音",
      dismiss: "关闭",
      cancel: "取消录音",
      cancelTranscription: "取消转写",
    });
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
          anchor: { kind: "root", treeId: "tree_1", baseRevision: 0 },
          errorCode,
        }).length).toBeGreaterThan(0);
      }
    }
  });
});
