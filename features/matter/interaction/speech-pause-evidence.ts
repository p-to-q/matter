import type { TranscriptPauseEvidence } from "../runtime/spoken-transcript";

const ANALYSIS_FRAME_MS = 20;
const MIN_CORROBORATED_SILENCE_MS = 120;
const MAX_TIMED_CHUNKS = 1_024;

type TimedTranscriptChunk = Readonly<{
  text: string;
  timestamp: readonly [number, number];
}>;

/**
 * Corroborates ASR segment gaps against the decoded waveform. Segment timestamps
 * locate a textual seam; Matter's own energy detector decides whether that
 * interval actually contains sustained silence. Network or callback timing is
 * never accepted here.
 */
export function deriveAcousticPauseEvidence(input: Readonly<{
  transcript: string;
  chunks: readonly unknown[] | undefined;
  audio: Float32Array;
  sampleRate: number;
}>): readonly TranscriptPauseEvidence[] {
  if (
    input.chunks === undefined ||
    input.chunks.length < 2 ||
    input.chunks.length > MAX_TIMED_CHUNKS ||
    !input.chunks.every(isTimedTranscriptChunk) ||
    !hasStrictChunkTimeline(input.chunks) ||
    input.chunks.map((chunk) => chunk.text).join("") !== input.transcript ||
    input.audio.length === 0 ||
    !Number.isFinite(input.sampleRate) ||
    input.sampleRate <= 0
  ) return Object.freeze([]);

  const frameSize = Math.max(1, Math.round(input.sampleRate * ANALYSIS_FRAME_MS / 1_000));
  const energies = frameEnergies(input.audio, frameSize);
  if (energies.length === 0 || energies.some((value) => !Number.isFinite(value))) {
    return Object.freeze([]);
  }
  // A percentile noise estimate and two thresholds form a small hysteresis
  // band. It follows the current utterance instead of assuming a quiet room.
  const noiseFloor = percentile(energies, .2);
  const speechReference = percentile(energies, .9);
  // Absolute energy cannot distinguish quiet speech from silence. Without a
  // voiced-to-quiet range in this utterance, timing evidence must degrade
  // instead of blessing a uniformly quiet waveform as one long pause.
  if (
    speechReference - noiseFloor < Math.max(.002, speechReference * .25)
  ) return Object.freeze([]);
  const enterSilence = clamp(noiseFloor * 1.8 + .0015, .004, .035);
  const leaveSilence = clamp(noiseFloor * 2.8 + .0025, .006, .05);
  const pauses: TranscriptPauseEvidence[] = [];
  let offset = 0;

  for (let index = 0; index < input.chunks.length; index += 1) {
    const current = input.chunks[index]!;
    offset += current.text.length;
    const next = input.chunks[index + 1];
    if (next === undefined) break;
    const estimatedGapMs = Math.round((next.timestamp[0] - current.timestamp[1]) * 1_000);
    if (estimatedGapMs < MIN_CORROBORATED_SILENCE_MS || estimatedGapMs > 65_000) continue;
    const startFrame = clamp(
      Math.floor(current.timestamp[1] * input.sampleRate / frameSize),
      0,
      energies.length,
    );
    const endFrame = clamp(
      Math.ceil(next.timestamp[0] * input.sampleRate / frameSize),
      startFrame,
      energies.length,
    );
    const silenceMs = longestSilenceMs(
      energies.slice(startFrame, endFrame),
      enterSilence,
      leaveSilence,
      frameSize * 1_000 / input.sampleRate,
    );
    // Timestamp alignment is approximate. Requiring at least half of the gap
    // to be acoustically quiet rejects word-alignment artifacts while allowing
    // the short edge padding used by Whisper.
    if (
      silenceMs >= MIN_CORROBORATED_SILENCE_MS &&
      silenceMs >= Math.min(estimatedGapMs * .5, estimatedGapMs - ANALYSIS_FRAME_MS)
    ) {
      pauses.push(Object.freeze({
        afterCodeUnit: offset,
        durationMs: Math.min(estimatedGapMs, silenceMs),
        source: "segment-timestamp" as const,
      }));
    }
  }
  return Object.freeze(pauses);
}

function frameEnergies(audio: Float32Array, frameSize: number): number[] {
  const energies: number[] = [];
  for (let start = 0; start < audio.length; start += frameSize) {
    const end = Math.min(audio.length, start + frameSize);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const sample = audio[index]!;
      sum += sample * sample;
    }
    energies.push(Math.sqrt(sum / (end - start)));
  }
  return energies;
}

function longestSilenceMs(
  energies: readonly number[],
  enterThreshold: number,
  leaveThreshold: number,
  frameDurationMs: number,
): number {
  let silent = false;
  let currentFrames = 0;
  let longestFrames = 0;
  for (const energy of energies) {
    if (silent ? energy >= leaveThreshold : energy <= enterThreshold) {
      silent = !silent;
    }
    if (silent) {
      currentFrames += 1;
      longestFrames = Math.max(longestFrames, currentFrames);
    } else {
      currentFrames = 0;
    }
  }
  return longestFrames * frameDurationMs;
}

/** Reject the whole timing set before scanning PCM. Equal or reversed starts
 * cannot identify a unique text seam, even when each tuple is valid alone. */
function hasStrictChunkTimeline(chunks: readonly TimedTranscriptChunk[]): boolean {
  for (let index = 1; index < chunks.length; index += 1) {
    if (chunks[index]!.timestamp[0] <= chunks[index - 1]!.timestamp[0]) return false;
  }
  return true;
}

function isTimedTranscriptChunk(value: unknown): value is TimedTranscriptChunk {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { text?: unknown; timestamp?: unknown };
  return typeof candidate.text === "string" && candidate.text.length > 0 &&
    isTimestamp(candidate.timestamp);
}

function isTimestamp(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
    value[0] >= 0 && value[1] >= value[0];
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
