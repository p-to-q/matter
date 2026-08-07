"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  createBrowserVoicePort,
  isBrowserVoiceTransportAvailable,
  VoiceError,
  type VoiceOperation,
  type VoicePort,
} from "../interaction/browser-voice";
import {
  requestTranscriptRepair,
  transcriptRepairEnabled,
} from "../interaction/repair-client";
import {
  requestTranscription,
  TranscriptionClientError,
} from "../interaction/transcription-client";
import type { InquiryVoiceNotice } from "./inquiry-composer";

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

/** Dictation substitutes for the keyboard; it never admits or mutates material. */
export function useInquiryDictation(
  callbacks: InquiryDictationCallbacks,
  locale: string,
): InquiryDictation {
  const supported = useSyncExternalStore(
    subscribeToNothing,
    inquirySpeechIsAvailable,
    readUnknownOnServer,
  );
  const portRef = useRef<VoicePort | null>(null);
  const transcriptionRef = useRef<AbortController | null>(null);
  const repairRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const stoppingRef = useRef(false);
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const operation = useCallback((): VoiceOperation => ({
    interactionId: `inquiry_${sessionRef.current}`,
    attempt: 1,
  }), []);

  const cancel = useCallback(() => {
    transcriptionRef.current?.abort();
    transcriptionRef.current = null;
    repairRef.current?.abort();
    repairRef.current = null;
    if (!activeRef.current) return;
    activeRef.current = false;
    stoppingRef.current = false;
    portRef.current?.cancel(operation());
  }, [operation]);

  useEffect(() => cancel, [cancel]);

  const finish = useCallback((outcome: "settled" | InquiryVoiceNotice) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    stoppingRef.current = false;
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
    if (!transcriptRepairEnabled()) {
      callbacksRef.current.onHeard(transcript);
      finish("settled");
      return;
    }
    callbacksRef.current.onProcessing();
    const controller = new AbortController();
    repairRef.current = controller;
    let settled = transcript;
    try {
      const result = await requestTranscriptRepair({
        operationId: current.interactionId,
        attempt: current.attempt,
        locale,
        text: transcript,
        signal: controller.signal,
      });
      settled = result.text;
    } catch {
      // Cancellation is the one case with nobody left to deliver to; every
      // other failure means the person still gets their own words.
      if (controller.signal.aborted) return;
    } finally {
      if (repairRef.current === controller) repairRef.current = null;
    }
    if (!activeRef.current) return;
    callbacksRef.current.onHeard(settled);
    finish("settled");
  }, [finish, locale]);

  const stopOperation = useCallback((current: VoiceOperation) => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    void portRef.current?.stop(current).then(async (recording) => {
      if (!activeRef.current) return;
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
        if (!activeRef.current) return;
        await deliver(result.transcript, current);
      } catch (error) {
        if (!controller.signal.aborted) finish(noticeForTranscriptionError(error));
      } finally {
        if (transcriptionRef.current === controller) transcriptionRef.current = null;
      }
    }).catch((error: unknown) => finish(
      error instanceof VoiceError && error.code === "RECORDING_EMPTY"
        ? "settled"
        : noticeForVoiceError(error),
    ));
  }, [deliver, finish, locale]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    if (!isBrowserVoiceTransportAvailable()) {
      callbacksRef.current.onFailed("voice-unsupported");
      return;
    }
    sessionRef.current += 1;
    const current = operation();
    try {
      portRef.current ??= createBrowserVoicePort();
    } catch (error) {
      callbacksRef.current.onFailed(noticeForVoiceError(error));
      return;
    }
    activeRef.current = true;
    stoppingRef.current = false;
    void portRef.current.start(current, {
      locale,
      onTranscript: (transcript) => {
        if (activeRef.current) callbacksRef.current.onHeard(transcript);
      },
      onDurationLimit: () => {
        stopOperation(current);
      },
      onError: (error) => finish(noticeForVoiceError(error)),
    }).catch((error: unknown) => finish(noticeForVoiceError(error)));
  }, [finish, locale, operation, stopOperation]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    stopOperation(operation());
  }, [operation, stopOperation]);

  return { supported, start, stop, cancel };
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function readUnknownOnServer(): null {
  return null;
}

function inquirySpeechIsAvailable(): boolean {
  return isBrowserVoiceTransportAvailable();
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
