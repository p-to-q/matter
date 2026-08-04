import { describe, expect, it, vi } from "vitest";
import {
  audioUploadName,
  baseAudioMimeType,
  chooseRecordingMimeType,
  isAcceptedAudioMimeType,
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_REQUEST_BYTES,
  RECORDING_LIMIT_MS,
  RECORDING_MIME_CANDIDATES,
} from "./audio-policy";

describe("audio policy", () => {
  it("keeps recording and transport bounds explicit", () => {
    expect(RECORDING_LIMIT_MS).toBe(60_000);
    expect(MAX_ACCEPTED_RECORDING_MS).toBe(65_000);
    expect(MAX_AUDIO_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_AUDIO_REQUEST_BYTES).toBe(MAX_AUDIO_BYTES + 128 * 1024);
  });

  it("prefers Opus then AAC before base container fallbacks", () => {
    expect(RECORDING_MIME_CANDIDATES).toEqual([
      "audio/webm;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/webm",
      "audio/mp4",
    ]);
    const support = vi.fn((type: string) => type === "audio/mp4;codecs=mp4a.40.2");
    expect(chooseRecordingMimeType(support)).toBe(
      "audio/mp4;codecs=mp4a.40.2",
    );
    expect(support.mock.calls.map(([type]) => type)).toEqual([
      "audio/webm;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
    ]);
  });

  it("continues after a broken capability probe and returns null without support", () => {
    expect(
      chooseRecordingMimeType((type) => {
        if (type.includes("opus")) throw new Error("browser bug");
        return type === "audio/webm";
      }),
    ).toBe("audio/webm");
    expect(chooseRecordingMimeType(() => false)).toBeNull();
  });

  it("normalizes accepted containers and derives safe upload names", () => {
    expect(baseAudioMimeType(" Audio/WebM; codecs=opus ")).toBe("audio/webm");
    expect(isAcceptedAudioMimeType("audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(isAcceptedAudioMimeType("audio/ogg")).toBe(false);
    expect(isAcceptedAudioMimeType("constructor")).toBe(false);
    expect(isAcceptedAudioMimeType("toString")).toBe(false);
    expect(isAcceptedAudioMimeType("__proto__")).toBe(false);
    expect(audioUploadName("audio/webm;codecs=opus")).toBe("matter-voice.webm");
    expect(audioUploadName("audio/mp4")).toBe("matter-voice.mp4");
    expect(audioUploadName("text/plain")).toBeNull();
  });
});
