import { describe, expect, it } from "vitest";
import { deriveAcousticPauseEvidence } from "./speech-pause-evidence";

const SAMPLE_RATE = 1_000;

describe("speech pause evidence", () => {
  it("requires a segment-timestamp gap to be present in the waveform", () => {
    const audio = new Float32Array(1_200);
    audio.fill(.1, 0, 300);
    audio.fill(.1, 900);
    expect(deriveAcousticPauseEvidence({
      transcript: "we continue",
      chunks: [
        { text: "we", timestamp: [0, .3] },
        { text: " continue", timestamp: [.9, 1.2] },
      ],
      audio,
      sampleRate: SAMPLE_RATE,
    })).toEqual([{
      afterCodeUnit: 2,
      durationMs: 600,
      source: "segment-timestamp",
    }]);
  });

  it("rejects an alignment gap filled with speech energy", () => {
    const audio = new Float32Array(1_200).fill(.1);
    expect(deriveAcousticPauseEvidence({
      transcript: "we continue",
      chunks: [
        { text: "we", timestamp: [0, .3] },
        { text: " continue", timestamp: [.9, 1.2] },
      ],
      audio,
      sampleRate: SAMPLE_RATE,
    })).toEqual([]);
  });

  it.each([.03, .01, .005])(
    "rejects a uniformly quiet waveform at %s instead of calling it silence",
    (level) => {
      expect(deriveAcousticPauseEvidence({
        transcript: "we continue",
        chunks: [
          { text: "we", timestamp: [0, .3] },
          { text: " continue", timestamp: [.9, 1.2] },
        ],
        audio: new Float32Array(1_200).fill(level),
        sampleRate: SAMPLE_RATE,
      })).toEqual([]);
    },
  );

  it("still corroborates real silence between quiet voiced regions", () => {
    const audio = new Float32Array(1_200);
    audio.fill(.01, 0, 300);
    audio.fill(.01, 900);
    expect(deriveAcousticPauseEvidence({
      transcript: "we continue",
      chunks: [
        { text: "we", timestamp: [0, .3] },
        { text: " continue", timestamp: [.9, 1.2] },
      ],
      audio,
      sampleRate: SAMPLE_RATE,
    })).toEqual([{
      afterCodeUnit: 2,
      durationMs: 600,
      source: "segment-timestamp",
    }]);
  });

  it("degrades atomically when provider words do not reconstruct the transcript", () => {
    expect(deriveAcousticPauseEvidence({
      transcript: "different",
      chunks: [
        { text: "other", timestamp: [0, .2] },
        { text: " words", timestamp: [.8, 1] },
      ],
      audio: new Float32Array(1_000),
      sampleRate: SAMPLE_RATE,
    })).toEqual([]);
  });

  it.each([
    [null, { text: " continue", timestamp: [.9, 1.2] }],
    [{ text: "we", timestamp: null }, { text: " continue", timestamp: [.9, 1.2] }],
    [{ text: 42, timestamp: [0, .3] }, { text: " continue", timestamp: [.9, 1.2] }],
    [{ text: "", timestamp: [0, .3] }, { text: "we continue", timestamp: [.9, 1.2] }],
    [{ text: "we", timestamp: [0, .3] }, { text: " continue", timestamp: [0, 1.2] }],
  ])("degrades malformed provider chunk shapes to semantic-only evidence", (...chunks) => {
    expect(deriveAcousticPauseEvidence({
      transcript: "we continue",
      chunks,
      audio: new Float32Array(1_200),
      sampleRate: SAMPLE_RATE,
    })).toEqual([]);
  });
});
