"use client";

import {
  browserVoiceTransport,
  isBrowserRecordedAudioCaptureAvailable,
  type BrowserVoiceTransport,
} from "./browser-voice";
import { prepareBrowserSpeechRecognition } from "./browser-speech-voice";

export type VoiceReadiness = Readonly<{
  status: "ready" | "unavailable";
  transport: BrowserVoiceTransport;
}>;

/**
 * Checks the code path a first voice turn needs without requesting microphone
 * permission. Native speech gets one unstarted recognition lease. Recorded
 * audio is already a usable capture path; its optional local worker graph is
 * warmed only when a person starts that path, never during page hydration.
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
  if (!isBrowserRecordedAudioCaptureAvailable()) return unavailable(transport);
  return ready(transport);
}

function ready(transport: Exclude<BrowserVoiceTransport, "unavailable">): VoiceReadiness {
  return Object.freeze({ status: "ready", transport });
}

function unavailable(transport: BrowserVoiceTransport): VoiceReadiness {
  return Object.freeze({ status: "unavailable", transport });
}
