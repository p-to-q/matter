"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  createBrowserVoicePort,
  VoiceError,
  type VoiceOperation,
  type VoicePort,
} from "../interaction/browser-voice";
import { useVoiceReadiness } from "../interaction/use-voice-readiness";
import {
  requestTranscriptRepair,
  transcriptRepairEnabled,
  type RepairRequestInput,
} from "../interaction/repair-client";
import {
  requestTranscription,
  TranscriptionClientError,
} from "../interaction/transcription-client";
import type { InquiryVoiceNotice } from "./inquiry-composer";
import { subscribePageSuspension } from "../interaction/page-suspension";
import { normalizeSpokenTranscript } from "../runtime/spoken-transcript";
import { MAX_INQUIRY_QUESTION_CODE_POINTS } from "../protocol/inquiry-contract";
import { hasPresentedEmoji } from "../protocol/transcription-contract";

export type InquiryDictation = Readonly<{
  supported: boolean | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}>;

export type InquiryDictationCallbacks = Readonly<{
  onHeard: (transcript: string) => void;
  onProcessing: () => void;
  onSettled: () => void;
  onFailed: (notice: InquiryVoiceNotice) => void;
}>;

/**
 * Unlike material admission, a dictated Inquiry question is not visible until
 * repair settles. Keep its interaction ceiling at the previously shipped
 * bound even though background material repair has a larger delivery window.
 */
export const INQUIRY_DICTATION_REPAIR_TIMEOUT_MS = 8_800;

export function withInquiryDictationRepairDeadline(
  input: Omit<RepairRequestInput, "timeoutMs">,
): RepairRequestInput {
  return Object.freeze({ ...input, timeoutMs: INQUIRY_DICTATION_REPAIR_TIMEOUT_MS });
}

type InquiryRepairRequest = (
  input: RepairRequestInput,
) => ReturnType<typeof requestTranscriptRepair>;

export function requestInquiryDictationRepair(
  input: Omit<RepairRequestInput, "timeoutMs">,
  request: InquiryRepairRequest = requestTranscriptRepair,
): ReturnType<typeof requestTranscriptRepair> {
  return request(withInquiryDictationRepairDeadline(input));
}

/** Dictation substitutes for the keyboard; it never admits or mutates material. */
export function useInquiryDictation(
  callbacks: InquiryDictationCallbacks,
  locale: string,
): InquiryDictation {
  const readiness = useVoiceReadiness();
  const supported = readiness.status === "checking" ? null : readiness.status === "ready";
  const portRef = useRef<VoicePort | null>(null);
  const transcriptionRef = useRef<AbortController | null>(null);
  const repairRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const activeOperationRef = useRef<VoiceOperation | null>(null);
  const stoppingRef = useRef(false);
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const cancelResources = useCallback((): boolean => {
    const wasActive = activeOperationRef.current !== null;
    transcriptionRef.current?.abort();
    transcriptionRef.current = null;
    repairRef.current?.abort();
    repairRef.current = null;
    const current = activeOperationRef.current;
    activeOperationRef.current = null;
    stoppingRef.current = false;
    if (current !== null) portRef.current?.cancel(current);
    return wasActive;
  }, []);

  const cancel = useCallback(() => {
    if (cancelResources()) callbacksRef.current.onSettled();
  }, [cancelResources]);

  // Unmount owns only resource release; there is no remaining composer state
  // to settle and notifying it during teardown would schedule a stale update.
  useEffect(() => () => {
    cancelResources();
  }, [cancelResources]);

  useEffect(() => subscribePageSuspension(() => {
    cancel();
  }), [cancel]);

  useEffect(() => {
    // Locale is part of both recognition and transcription scope. A turn that
    // began in the previous locale cannot continue under new presentation.
    cancel();
  }, [cancel, locale]);

  const finish = useCallback((
    current: VoiceOperation,
    outcome: "settled" | InquiryVoiceNotice,
  ) => {
    if (!ownsOperation(activeOperationRef.current, current)) return;
    transcriptionRef.current?.abort();
    transcriptionRef.current = null;
    repairRef.current?.abort();
    repairRef.current = null;
    activeOperationRef.current = null;
    stoppingRef.current = false;
    // A coordinated Voice lease deliberately outlives capture so another
    // lifecycle can also revoke in-flight transcription. Terminal settlement
    // releases that logical lease even though the raw recorder has stopped.
    portRef.current?.cancel(current);
    if (outcome === "settled") callbacksRef.current.onSettled();
    else callbacksRef.current.onFailed(outcome);
  }, []);

  /**
   * Hands the finished words to the question field, repaired when the pass is
   * available. A dictated question is a draft rather than material, so this is
   * allowed to fail even more freely than admission is: any outcome other than
   * a usable answer delivers exactly what was heard.
   */
  const deliver = useCallback(async (transcript: string, current: VoiceOperation) => {
    if (!ownsOperation(activeOperationRef.current, current)) return;
    const baseline = normalizeSpokenTranscript({
      text: transcript,
      locale,
      maxOutputCodePoints: MAX_INQUIRY_QUESTION_CODE_POINTS,
    });
    if (!transcriptRepairEnabled()) {
      callbacksRef.current.onHeard(baseline);
      finish(current, "settled");
      return;
    }
    callbacksRef.current.onProcessing();
    const controller = new AbortController();
    repairRef.current = controller;
    let settled = baseline;
    try {
      const result = await requestInquiryDictationRepair({
        operationId: current.interactionId,
        attempt: current.attempt,
        locale,
        text: baseline,
        signal: controller.signal,
      });
      settled = settleInquiryDictationRepair(baseline, result.text);
    } catch {
      // Cancellation is the one case with nobody left to deliver to; every
      // other failure means the person still gets their own words.
      if (controller.signal.aborted) return;
    } finally {
      if (repairRef.current === controller) repairRef.current = null;
    }
    if (!ownsOperation(activeOperationRef.current, current)) return;
    callbacksRef.current.onHeard(settled);
    finish(current, "settled");
  }, [finish, locale]);

  const stopOperation = useCallback((current: VoiceOperation) => {
    if (!ownsOperation(activeOperationRef.current, current) || stoppingRef.current) return;
    stoppingRef.current = true;
    void portRef.current?.stop(current).then(async (recording) => {
      if (!ownsOperation(activeOperationRef.current, current)) return;
      if (recording.transcript !== undefined) {
        await deliver(recording.transcript, current);
        return;
      }
      callbacksRef.current.onProcessing();
      const controller = new AbortController();
      transcriptionRef.current = controller;
      try {
        const result = await requestTranscription({
          interactionId: current.interactionId,
          attempt: current.attempt,
          purpose: "direction",
          locale,
          durationMs: recording.durationMs,
          audio: recording.audio,
          signal: controller.signal,
        });
        if (
          !ownsOperation(activeOperationRef.current, current) ||
          result.interactionId !== current.interactionId ||
          result.attempt !== current.attempt
        ) return;
        await deliver(result.transcript, current);
      } catch (error) {
        if (!controller.signal.aborted) {
          finish(current, noticeForTranscriptionError(error));
        }
      } finally {
        if (transcriptionRef.current === controller) transcriptionRef.current = null;
      }
    }).catch((error: unknown) => finish(current,
      error instanceof VoiceError && error.code === "RECORDING_EMPTY"
        ? "settled"
        : noticeForVoiceError(error),
    ));
  }, [deliver, finish, locale]);

  const start = useCallback(() => {
    if (activeOperationRef.current !== null) return;
    if (supported !== true) {
      callbacksRef.current.onFailed("voice-unsupported");
      return;
    }
    sessionRef.current += 1;
    const current: VoiceOperation = Object.freeze({
      interactionId: `inquiry_${sessionRef.current}`,
      attempt: 1,
    });
    try {
      portRef.current ??= createBrowserVoicePort();
    } catch (error) {
      callbacksRef.current.onFailed(noticeForVoiceError(error));
      return;
    }
    activeOperationRef.current = current;
    stoppingRef.current = false;
    void portRef.current.start(current, {
      locale,
      maxTranscriptCodePoints: MAX_INQUIRY_QUESTION_CODE_POINTS,
      onTranscript: (transcript) => {
        if (ownsOperation(activeOperationRef.current, current)) {
          callbacksRef.current.onHeard(transcript);
        }
      },
      onDurationLimit: () => {
        stopOperation(current);
      },
      onError: (error) => finish(current, noticeForVoiceError(error)),
      onOwnershipRevoked: (revoked) => {
        if (sameOperation(current, revoked)) finish(current, "settled");
      },
    }).catch((error: unknown) => finish(current, noticeForVoiceError(error)));
  }, [finish, locale, stopOperation, supported]);

  const stop = useCallback(() => {
    const current = activeOperationRef.current;
    if (current !== null) stopOperation(current);
  }, [stopOperation]);

  return { supported, start, stop, cancel };
}

/**
 * Optional model repair may improve a dictated draft, but it cannot spend the
 * question field's remaining capacity or acquire the admission-only expression
 * channel. An unusable proposal falls back whole to the already visible words.
 */
export function settleInquiryDictationRepair(
  baseline: string,
  candidate: string,
): string {
  return candidate.trim().length > 0 &&
    Array.from(candidate).length <= MAX_INQUIRY_QUESTION_CODE_POINTS &&
    !hasPresentedEmoji(candidate)
    ? candidate
    : baseline;
}

function ownsOperation(
  active: VoiceOperation | null,
  expected: VoiceOperation,
): boolean {
  return active !== null && sameOperation(active, expected);
}

function sameOperation(left: VoiceOperation, right: VoiceOperation): boolean {
  return left.interactionId === right.interactionId && left.attempt === right.attempt;
}

function noticeForVoiceError(error: unknown): InquiryVoiceNotice {
  if (!(error instanceof VoiceError)) return "voice-failed";
  if (error.code === "VOICE_UNSUPPORTED") return "voice-unsupported";
  if (error.code === "MICROPHONE_DENIED") return "voice-denied";
  return "voice-failed";
}

function noticeForTranscriptionError(error: unknown): InquiryVoiceNotice {
  if (!(error instanceof TranscriptionClientError)) return "voice-failed";
  return error.code === "TRANSCRIPTION_UNAVAILABLE"
    ? "voice-unsupported"
    : "voice-failed";
}
