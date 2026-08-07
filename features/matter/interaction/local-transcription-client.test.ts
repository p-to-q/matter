import { describe, expect, it } from "vitest";
import { LocalTranscriptionError, resampleChannels } from "./local-transcription-client";

describe("local transcription audio projection", () => {
  it("downmixes channels and resamples without changing duration", () => {
    const result = resampleChannels([
      new Float32Array([0, 1, 0, -1]),
      new Float32Array([0, 0, 0, 0]),
    ], 4, 2);
    expect([...result]).toEqual([0, 0]);
  });

  it("rejects empty or inconsistent channel data", () => {
    expect(() => resampleChannels([], 48_000, 16_000))
      .toThrowError(new LocalTranscriptionError("no-speech"));
    expect(() => resampleChannels([
      new Float32Array([0]),
      new Float32Array([0, 1]),
    ], 48_000, 16_000)).toThrowError(LocalTranscriptionError);
  });
});
