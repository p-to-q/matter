import { describe, expect, it } from "vitest";
import {
  audioFileExtension,
  audioUploadName,
  baseAudioMimeType,
  isAcceptedAudioType,
  maxTranscriptionOutputCodePoints,
} from "./transcription-contract";

describe("audio type acceptance", () => {
  it("normalizes accepted containers and derives upload names", () => {
    expect(baseAudioMimeType(" Audio/WebM; codecs=opus ")).toBe("audio/webm");
    expect(isAcceptedAudioType("audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(isAcceptedAudioType("audio/ogg")).toBe(false);
    expect(audioFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioUploadName("audio/mp4")).toBe("matter-voice.mp4");
  });

  it("refuses inherited object members as media types", () => {
    // This gate stands at the HTTP boundary of the one route that accepts a
    // binary body. Its browser twin in interaction/audio-policy already proves
    // the same three names; the wire contract must not be the looser copy.
    for (const inherited of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
      expect(isAcceptedAudioType(inherited)).toBe(false);
      expect(audioFileExtension(inherited)).toBeNull();
    }
  });

  it("keeps final punctuation inside each spoken consumer's capacity", () => {
    expect(maxTranscriptionOutputCodePoints("admission")).toBeUndefined();
    expect(maxTranscriptionOutputCodePoints("direction")).toBe(500);
    expect(maxTranscriptionOutputCodePoints("swap-direction")).toBe(240);
  });
});
