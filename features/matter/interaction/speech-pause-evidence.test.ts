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

  it("keeps pauses from valid gaps when only the final chunk has a null end timestamp", () => {
    // transformers.js emits null end timestamps for final segments. Only the
    // gap whose current.timestamp[1] is null is skipped; earlier gaps survive.
    const audio = new Float32Array(2_000);
    audio.fill(.1, 0, 500);   // voiced [0ms, 500ms]
    audio.fill(.1, 900);      // voiced [900ms, 2000ms]
    // The gap [500ms, 900ms] = 400ms of silence should yield a pause at code unit 5.
    expect(deriveAcousticPauseEvidence({
      transcript: "Hello world done",
      chunks: [
        { text: "Hello", timestamp: [0, .5] },
        { text: " world", timestamp: [.9, 1.5] },
        { text: " done", timestamp: [1.8, null] }, // null end — transformers.js final segment
      ],
      audio,
      sampleRate: SAMPLE_RATE,
    })).toEqual([{
      afterCodeUnit: 5,
      durationMs: expect.any(Number),
      source: "segment-timestamp",
    }]);
  });

  it("drops only the gap adjacent to a middle chunk with a null end, keeps other valid gaps", () => {
    // Chunk 1 has a null end timestamp. The gap between chunk 0 and chunk 1 is
    // unaffected (uses chunk 0's end and chunk 1's start). The gap between
    // chunk 1 and chunk 2 is skipped (would need chunk 1's end = null).
    const audio = new Float32Array(3_000);
    audio.fill(.1, 0, 300);   // voiced [0ms, 300ms]
    audio.fill(.1, 700, 900); // voiced [700ms, 900ms]
    audio.fill(.1, 1_500);    // voiced [1500ms, 3000ms]
    expect(deriveAcousticPauseEvidence({
      transcript: "A B C",
      chunks: [
        { text: "A", timestamp: [0, .3] },
        { text: " B", timestamp: [.7, null] },  // null end in the middle
        { text: " C", timestamp: [1.5, 2.0] },
      ],
      audio,
      sampleRate: SAMPLE_RATE,
    })).toEqual([{
      afterCodeUnit: 1,
      durationMs: expect.any(Number),
      source: "segment-timestamp",
    }]);
  });
});
