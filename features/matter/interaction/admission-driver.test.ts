import { describe, expect, it, vi } from "vitest";
import type { AdmissionAnchor } from "../runtime/admission-interaction";
import type { MatterStoreReceipt } from "../store/matter-store";
import type {
  VoiceCallbacks,
  VoiceOperation,
  VoicePort,
  VoiceRecording,
} from "./browser-voice";
import {
  AdmissionDriver,
  type AdmissionDriverDependencies,
  type AdmissionScope,
} from "./admission-driver";

const SCOPE: AdmissionScope = Object.freeze({ treeId: "tree_1", revision: 4 });
const ANCHOR: AdmissionAnchor = Object.freeze({
  kind: "child",
  treeId: "tree_1",
  baseRevision: 4,
  parentNodeId: "parent_1",
});

class ControlledVoice implements VoicePort {
  readonly starts: Array<{ operation: VoiceOperation; callbacks: VoiceCallbacks }> = [];
  readonly cancel = vi.fn<(operation: VoiceOperation) => void>();
  private grant: (() => void) | null = null;
  private stopRecording: ((recording: VoiceRecording) => void) | null = null;

  start(operation: VoiceOperation, callbacks: VoiceCallbacks = {}): Promise<void> {
    this.starts.push({ operation, callbacks });
    return new Promise((resolve) => {
      this.grant = resolve;
    });
  }

  stop(): Promise<VoiceRecording> {
    return new Promise((resolve) => {
      this.stopRecording = resolve;
    });
  }

  grantPermission(): void {
    this.grant?.();
  }

  finish(operation: VoiceOperation): void {
    this.stopRecording?.({
      operation,
      audio: new Blob(["voice"], { type: "audio/webm" }),
      durationMs: 800,
    });
  }
}

function harness(options: {
  commit?: AdmissionDriverDependencies["commit"];
  transcribe?: AdmissionDriverDependencies["transcribe"];
} = {}) {
  const voice = new ControlledVoice();
  const commit = options.commit ?? vi.fn((): MatterStoreReceipt => ({
    operation: "commit",
    status: "committed",
    revision: 5,
    affectedNodeIds: ["thought_1"],
  }));
  const transcribe = options.transcribe ?? vi.fn(async (input) => ({
    protocolVersion: "0.2" as const,
    interactionId: input.interactionId,
    attempt: input.attempt,
    transcript: "保留这句话。",
  }));
  const driver = new AdmissionDriver({
    commit,
    createVoice: () => voice,
    transcribe,
    createInteractionId: () => "voice_1",
    createMaterialId: () => "thought_1",
    canonicalNow: () => "2026-08-03T10:00:00.000Z",
    monotonicNow: () => 12,
    locale: "zh-CN",
  });
  driver.updateScope(SCOPE);
  return { commit, driver, transcribe, voice };
}

async function reachRecording(driver: AdmissionDriver, voice: ControlledVoice): Promise<void> {
  driver.start(ANCHOR);
  voice.grantPermission();
  await Promise.resolve();
  expect(driver.getState().phase).toBe("recording");
}

describe("AdmissionDriver", () => {
  it("serializes synchronous commit feedback and cleans the completed operation", async () => {
    const h = harness();
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.commit).toHaveBeenCalledWith(
      {
        target: "child",
        treeId: "tree_1",
        baseRevision: 4,
        parentNodeId: "parent_1",
      },
      expect.objectContaining({
        interactionId: "voice_1",
        commandId: "human_admission_voice_1_1",
        nodeId: "thought_1",
        transcript: "保留这句话。",
      }),
    );
    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(h.voice.cancel).toHaveBeenCalledTimes(1);
  });

  it("invalidates capture immediately when the document scope changes", async () => {
    const h = harness();
    await reachRecording(h.driver, h.voice);

    h.driver.updateScope({ treeId: "tree_2", revision: 0 });

    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(h.voice.cancel).toHaveBeenCalledWith({
      interactionId: "voice_1",
      attempt: 1,
    });
    h.voice.starts[0]?.callbacks.onDurationLimit?.({
      interactionId: "voice_1",
      attempt: 1,
    });
    expect(h.driver.getState()).toEqual({ phase: "idle" });
  });

  it("aborts transcription on scope invalidation and ignores its late result", async () => {
    let resolveTranscript!: (value: {
      protocolVersion: "0.2";
      interactionId: string;
      attempt: number;
      transcript: string;
    }) => void;
    let observedSignal: AbortSignal | undefined;
    const transcribe: AdmissionDriverDependencies["transcribe"] = (input) => {
      observedSignal = input.signal;
      return new Promise((resolve) => {
        resolveTranscript = resolve;
      });
    };
    const h = harness({ transcribe });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await Promise.resolve();
    expect(h.driver.getState().phase).toBe("transcribing");

    h.driver.updateScope({ treeId: "tree_1", revision: 5 });
    expect(observedSignal?.aborted).toBe(true);
    resolveTranscript({
      protocolVersion: "0.2",
      interactionId: "voice_1",
      attempt: 1,
      transcript: "late",
    });
    await Promise.resolve();

    expect(h.commit).not.toHaveBeenCalled();
    expect(h.driver.getState()).toEqual({ phase: "idle" });
  });

  it("disposes idempotently and makes queued browser callbacks inert", async () => {
    const h = harness();
    await reachRecording(h.driver, h.voice);
    const listener = vi.fn();
    h.driver.subscribe(listener);

    h.driver.dispose();
    h.driver.dispose();
    h.voice.starts[0]?.callbacks.onError?.(new Error("late") as never);
    h.driver.start(ANCHOR);

    expect(h.voice.cancel).toHaveBeenCalledTimes(1);
    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives a Strict Mode lease replay but disposes after the final release", async () => {
    const h = harness();
    h.driver.retain();
    h.driver.release();
    h.driver.retain();
    await Promise.resolve();

    h.driver.start(ANCHOR);
    expect(h.voice.starts).toHaveLength(1);

    h.driver.release();
    await Promise.resolve();
    expect(h.voice.cancel).toHaveBeenCalledTimes(1);
    h.driver.start(ANCHOR);
    expect(h.voice.starts).toHaveLength(1);
  });

  it("contains observer failures so cleanup and later observers still run", async () => {
    const h = harness();
    const later = vi.fn();
    h.driver.subscribe(() => {
      throw new Error("observer failed");
    });
    h.driver.subscribe(later);

    await reachRecording(h.driver, h.voice);
    h.driver.cancel();

    expect(later).toHaveBeenCalled();
    expect(h.voice.cancel).toHaveBeenCalledTimes(1);
    expect(h.driver.getState()).toEqual({ phase: "idle" });
  });
});
