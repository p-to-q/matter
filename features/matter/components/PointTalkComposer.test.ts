import { describe, expect, it } from "vitest";
import type {
  TextSwapErrorCode,
  TextSwapInteractionState,
} from "../runtime/text-swap-interaction";
import { pointTalkRecoveryAction } from "./PointTalkComposer";

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
  options: Readonly<{ direction?: string; retryable?: boolean }> = {},
): Extract<TextSwapInteractionState, { phase: "error" }> {
  return Object.freeze({
    phase: "error",
    interactionId: "point_talk_1",
    attempt: 1,
    basis: BASIS,
    errorCode,
    retryable: options.retryable ?? true,
    ...(options.direction === undefined ? {} : { direction: options.direction }),
  });
}

describe("Point Talk recovery", () => {
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
});
