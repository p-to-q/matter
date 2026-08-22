import { describe, expect, it, vi } from "vitest";
import type { AdmissionAnchor } from "../runtime/admission-interaction";
import type {
  AdmissionRepairStoreReceipt,
  AdmissionStoreReceipt,
} from "../store/matter-store";
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
  settleRepair?: AdmissionDriverDependencies["settleRepair"];
  transcribe?: AdmissionDriverDependencies["transcribe"];
  repair?: AdmissionDriverDependencies["repair"]["repair"];
  afterBaselineVisible?: AdmissionDriverDependencies["afterBaselineVisible"];
  onRepairCommitted?: AdmissionDriverDependencies["onRepairCommitted"];
} = {}) {
  const voice = new ControlledVoice();
  const commit = options.commit ?? vi.fn((): AdmissionStoreReceipt => ({
    operation: "commit",
    status: "committed",
    revision: 5,
    affectedNodeIds: ["thought_1"],
    repairLeaseId: "repair_lease_voice_1",
  }));
  const transcribe = options.transcribe ?? vi.fn(async (input) => ({
    protocolVersion: "0.2" as const,
    interactionId: input.interactionId,
    attempt: input.attempt,
    transcript: "保留这句话。",
  }));
  const settleRepair = options.settleRepair ?? vi.fn((): AdmissionRepairStoreReceipt => ({
    operation: "commit",
    status: "committed",
    revision: 6,
    affectedNodeIds: ["thought_1"],
  }));
  const repair = options.repair ?? vi.fn(async (input) => ({
    text: input.text,
    source: "rules" as const,
  }));
  const disposeRepair = vi.fn();
  const onRepairCommitted = options.onRepairCommitted ?? vi.fn();
  const driver = new AdmissionDriver({
    commit,
    settleRepair,
    onRepairCommitted,
    createVoice: () => voice,
    transcribe,
    repair: { repair, dispose: disposeRepair },
    afterBaselineVisible: options.afterBaselineVisible ?? ((callback) => {
      queueMicrotask(callback);
      return () => undefined;
    }),
    createInteractionId: () => "voice_1",
    createMaterialId: () => "thought_1",
    canonicalNow: () => "2026-08-03T10:00:00.000Z",
    monotonicNow: () => 12,
    locale: "zh-CN",
  });
  driver.updateScope(SCOPE);
  return { commit, disposeRepair, driver, onRepairCommitted, repair, settleRepair, transcribe, voice };
}

/** Runs the microtasks between a finished recording and a settled commit. */
async function settle(times = 10): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
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

  it("admits immediately, then applies an in-window repair as a second command", async () => {
    const repair: AdmissionDriverDependencies["repair"]["repair"] = vi.fn(async () => ({
      text: "保留这句话，先别删。",
      source: "model" as const,
    }));
    const h = harness({ repair });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle();

    expect(repair).toHaveBeenCalledWith(expect.objectContaining({
      locale: "zh-CN",
      text: "保留这句话。",
    }));
    expect(h.commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ transcript: "保留这句话。" }),
    );
    expect(h.settleRepair).toHaveBeenCalledWith(
      {
        repairLeaseId: "repair_lease_voice_1",
        outcome: "candidate",
        text: "保留这句话，先别删。",
        source: "model",
        createdAt: "2026-08-03T10:00:00.000Z",
      },
    );
    expect(h.driver.getState()).toEqual({ phase: "idle" });
  });

  it("computes repair beside the paint gate but cannot commit before baseline paint", async () => {
    let releasePaint!: () => void;
    const h = harness({
      repair: vi.fn(async () => ({ text: "修好了。", source: "rules" as const })),
      afterBaselineVisible: (callback) => {
        releasePaint = callback;
        return () => undefined;
      },
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle();

    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.repair).toHaveBeenCalledTimes(1);
    expect(h.settleRepair).not.toHaveBeenCalled();

    releasePaint();
    await settle();
    expect(h.settleRepair).toHaveBeenCalledWith(expect.objectContaining({ outcome: "candidate" }));
  });

  it("publishes presentation only from a successfully committed repair receipt", async () => {
    const repairChange = {
      id: "repair_command_1",
      treeId: "tree_1",
      documentEpoch: 0,
      nodeId: "thought_1",
      committedRevision: 6,
      before: { text: "保留这句话。", updatedAt: "2026-08-03T10:00:00.000Z" },
      after: { text: "修好了。", updatedAt: "2026-08-03T10:00:00.100Z" },
    } as const;
    const h = harness({
      repair: vi.fn(async () => ({ text: "修好了。", source: "rules" as const })),
      settleRepair: vi.fn((): AdmissionRepairStoreReceipt => ({
        operation: "commit",
        status: "committed",
        revision: 6,
        affectedNodeIds: ["thought_1"],
        repairChange,
      })),
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle();

    expect(h.onRepairCommitted).toHaveBeenCalledWith(repairChange);
  });

  it("admits what was heard when repair fails", async () => {
    const repair = vi.fn(async () => {
      throw new Error("unavailable");
    });
    const h = harness({ repair });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle();

    expect(h.commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ transcript: "保留这句话。" }),
    );
    expect(h.settleRepair).toHaveBeenCalledWith({
      repairLeaseId: "repair_lease_voice_1",
      outcome: "discarded",
    });
    expect(h.driver.getState()).toEqual({ phase: "idle" });
  });

  it("aborts late repair on document replacement and ignores its answer", async () => {
    let releaseRepair!: () => void;
    const h = harness({
      repair: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releaseRepair = resolve;
        });
        return {
          text: "太晚了。",
          source: "model" as const,
        };
      }),
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle(4);
    expect(h.driver.getState().phase).toBe("idle");

    h.driver.updateScope({ treeId: "tree_2", revision: 0, documentEpoch: 1 });
    expect(h.driver.getState()).toEqual({ phase: "idle" });

    releaseRepair();
    await settle();
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.settleRepair).toHaveBeenCalledWith({
      repairLeaseId: "repair_lease_voice_1",
      outcome: "discarded",
    });
    expect(h.driver.getState()).toEqual({ phase: "idle" });
  });

  it("lets a precise material gesture discard an optional pending repair", async () => {
    let releaseRepair!: () => void;
    const h = harness({
      repair: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releaseRepair = resolve;
        });
        return { text: "太晚了。", source: "model" as const };
      }),
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle(4);

    h.driver.discardPendingRepairs();
    releaseRepair();
    await settle();

    expect(h.settleRepair).toHaveBeenCalledWith({
      repairLeaseId: "repair_lease_voice_1",
      outcome: "discarded",
    });
    expect(h.settleRepair).toHaveBeenCalledTimes(1);
  });

  it("discards an older pending repair before a new microphone operation starts", async () => {
    let releaseRepair!: () => void;
    const h = harness({
      repair: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          releaseRepair = resolve;
        });
        return { text: "旧的修复不应落下。", source: "model" as const };
      }),
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle(4);
    expect(h.driver.getState()).toEqual({ phase: "idle" });

    h.driver.start(ANCHOR);
    expect(h.settleRepair).toHaveBeenCalledWith({
      repairLeaseId: "repair_lease_voice_1",
      outcome: "discarded",
    });
    h.voice.grantPermission();
    await settle();
    expect(h.driver.getState().phase).toBe("recording");

    releaseRepair();
    await settle();
    expect(h.settleRepair).toHaveBeenCalledTimes(1);
    expect(h.driver.getState().phase).toBe("recording");
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

  it("invalidates capture when only the document session epoch changes", async () => {
    const h = harness();
    await reachRecording(h.driver, h.voice);

    h.driver.updateScope({ ...SCOPE, documentEpoch: 1 });

    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(h.voice.cancel).toHaveBeenCalledWith({ interactionId: "voice_1", attempt: 1 });
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

  it("settles a mismatched transcription receipt instead of waiting forever", async () => {
    const h = harness({
      transcribe: vi.fn(async () => ({
        protocolVersion: "0.2" as const,
        interactionId: "another_operation",
        attempt: 1,
        transcript: "must not be admitted",
      })),
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle();

    expect(h.driver.getState()).toMatchObject({
      phase: "error",
      errorCode: "TRANSCRIPTION_FAILED",
    });
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.voice.cancel).toHaveBeenCalledWith({
      interactionId: "voice_1",
      attempt: 1,
    });
  });

  it("cancels a revoked shared Voice lease and ignores its late transcription", async () => {
    let resolveTranscript!: (value: {
      protocolVersion: "0.2";
      interactionId: string;
      attempt: number;
      transcript: string;
    }) => void;
    let observedSignal: AbortSignal | undefined;
    const h = harness({
      transcribe: (input) => {
        observedSignal = input.signal;
        return new Promise((resolve) => {
          resolveTranscript = resolve;
        });
      },
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    const operation = { interactionId: "voice_1", attempt: 1 } as const;
    h.voice.finish(operation);
    await Promise.resolve();
    expect(h.driver.getState().phase).toBe("transcribing");

    h.voice.starts[0]?.callbacks.onOwnershipRevoked?.(operation);
    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(observedSignal?.aborted).toBe(true);
    resolveTranscript({
      protocolVersion: "0.2",
      interactionId: operation.interactionId,
      attempt: operation.attempt,
      transcript: "late admission",
    });
    await Promise.resolve();

    expect(h.commit).not.toHaveBeenCalled();
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
    expect(h.disposeRepair).toHaveBeenCalledTimes(1);
    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("contains a synchronous local-repair throw and consumes the lease", async () => {
    const h = harness({
      repair: vi.fn(() => {
        throw new Error("synchronous adapter failure");
      }),
    });
    await reachRecording(h.driver, h.voice);
    h.driver.stop();
    h.voice.finish({ interactionId: "voice_1", attempt: 1 });
    await settle();

    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.settleRepair).toHaveBeenCalledWith({
      repairLeaseId: "repair_lease_voice_1",
      outcome: "discarded",
    });
    expect(h.driver.getState()).toEqual({ phase: "idle" });
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
