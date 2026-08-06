"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  createBrowserSpeechVoicePort,
  isBrowserSpeechRecognitionAvailable,
} from "../interaction/browser-speech-voice";
import { VoiceError } from "../interaction/browser-voice";
import type { InquiryVoiceNotice } from "./inquiry-composer";

export type InquiryDictation = Readonly<{
  /** Unknown until the client has mounted, so the button never renders wrongly on the server. */
  supported: boolean | null;
  start: () => void;
  stop: () => void;
}>;

export type InquiryDictationCallbacks = Readonly<{
  onHeard: (transcript: string) => void;
  onSettled: () => void;
  onFailed: (notice: InquiryVoiceNotice) => void;
}>;

/**
 * Browser-native dictation for the inquiry field. It shares the admission
 * port's recogniser but not its meaning: nothing here is admitted as material,
 * so no interaction id, attempt or tree revision is involved. This is only a
 * keyboard substitute.
 */
export function useInquiryDictation(
  callbacks: InquiryDictationCallbacks,
  locale: string,
): InquiryDictation {
  // Read as an external capability rather than synchronised into state: it
  // cannot change at runtime, and the server has no answer for it at all.
  const supported = useSyncExternalStore(
    subscribeToNothing,
    isBrowserSpeechRecognitionAvailable,
    readUnknownOnServer,
  );
  const portRef = useRef<ReturnType<typeof createBrowserSpeechVoicePort> | null>(null);
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // A recogniser left running past unmount keeps the microphone indicator lit.
  useEffect(() => () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    portRef.current?.cancel({ interactionId: `inquiry_${sessionRef.current}`, attempt: 1 });
  }, []);

  const finish = useCallback((outcome: "settled" | InquiryVoiceNotice) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (outcome === "settled") callbacksRef.current.onSettled();
    else callbacksRef.current.onFailed(outcome);
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    if (!isBrowserSpeechRecognitionAvailable()) {
      callbacksRef.current.onFailed("voice-unsupported");
      return;
    }
    sessionRef.current += 1;
    const operation = { interactionId: `inquiry_${sessionRef.current}`, attempt: 1 } as const;
    portRef.current ??= createBrowserSpeechVoicePort();
    activeRef.current = true;
    void portRef.current
      .start(operation, {
        locale,
        onTranscript: (transcript) => {
          if (activeRef.current) callbacksRef.current.onHeard(transcript);
        },
        // The limit belongs to the shared audio policy; ending on it is a
        // settled dictation, not a failure.
        onDurationLimit: () => {
          void portRef.current?.stop(operation).then(() => finish("settled")).catch(() => finish("voice-failed"));
        },
        onError: (error) => finish(noticeForVoiceError(error)),
      })
      .catch((error: unknown) => finish(noticeForVoiceError(error)));
  }, [finish, locale]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    const operation = { interactionId: `inquiry_${sessionRef.current}`, attempt: 1 } as const;
    void portRef.current
      ?.stop(operation)
      .then(() => finish("settled"))
      // "Nothing was said" is an ordinary outcome of stopping, not a fault
      // worth putting a warning in front of somebody for.
      .catch((error: unknown) => finish(
        error instanceof VoiceError && error.code === "RECORDING_EMPTY"
          ? "settled"
          : noticeForVoiceError(error),
      ));
  }, [finish]);

  return { supported, start, stop };
}

/** Recogniser support is fixed for the life of the document. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

function readUnknownOnServer(): null {
  return null;
}

function noticeForVoiceError(error: unknown): InquiryVoiceNotice {
  if (!(error instanceof VoiceError)) return "voice-failed";
  if (error.code === "VOICE_UNSUPPORTED") return "voice-unsupported";
  if (error.code === "MICROPHONE_DENIED") return "voice-denied";
  return "voice-failed";
}
