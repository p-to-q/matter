import { describe, expect, it } from "vitest";
import {
  audioFileExtension,
  audioUploadName,
  baseAudioMimeType,
  isSupportedAudioType,
  microphoneStartError,
} from "./audio-policy";

describe("audio policy", () => {
  it("normalizes codec parameters and preserves the matching file extension", () => {
    expect(baseAudioMimeType("Audio/MP4; codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(audioFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioUploadName("audio/mp4;codecs=mp4a.40.2")).toBe(
      "matter-voice.mp4",
    );
  });

  it("rejects formats outside the transcription boundary", () => {
    expect(isSupportedAudioType("video/webm")).toBe(false);
    expect(isSupportedAudioType("")).toBe(false);
    expect(() => audioUploadName("video/webm")).toThrow("unsupported");
  });

  it("keeps permission and device failures actionable", () => {
    if (typeof DOMException === "undefined") return;
    expect(
      microphoneStartError(new DOMException("denied", "NotAllowedError")),
    ).toContain("Allow it");
    expect(
      microphoneStartError(new DOMException("missing", "NotFoundError")),
    ).toContain("No microphone");
  });
});
