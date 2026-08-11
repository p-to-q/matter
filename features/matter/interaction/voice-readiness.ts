"use client";

import {
  browserVoiceTransport,
  type BrowserVoiceTransport,
} from "./browser-voice";
import { prepareBrowserSpeechRecognition } from "./browser-speech-voice";
import { localTranscriptionIsEnabled } from "./transcription-client";

export type VoiceReadiness = Readonly<{
  status: "ready" | "unavailable";
  transport: BrowserVoiceTransport;
}>;

/**
 * Prepares the code path a first voice turn needs without requesting
 * microphone permission. Native speech gets one unstarted recognition lease;
 * the recorded-audio fallback waits for its worker module graph, while model
 * initialization and any person-provided audio remain deferred to an actual
 * turn.
 */
export async function prepareVoiceReadiness(): Promise<VoiceReadiness> {
  const transport = browserVoiceTransport();
  if (transport === "unavailable") return unavailable(transport);
  if (transport === "speech") {
    try {
      prepareBrowserSpeechRecognition();
      return ready(transport);
    } catch {
      return unavailable(transport);
    }
  }
  if (transport !== "audio" || !localTranscriptionIsEnabled()) {
    return ready(transport);
  }

  try {
    const local = await import("./local-transcription-client");
    await local.prepareLocalTranscription();
    return ready(transport);
  } catch {
    return unavailable(transport);
  }
}

function ready(transport: Exclude<BrowserVoiceTransport, "unavailable">): VoiceReadiness {
  return Object.freeze({ status: "ready", transport });
}

function unavailable(transport: BrowserVoiceTransport): VoiceReadiness {
  return Object.freeze({ status: "unavailable", transport });
}
