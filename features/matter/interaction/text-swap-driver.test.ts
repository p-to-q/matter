import { describe, expect, it, vi } from "vitest";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import type { TextSwapBasis } from "../runtime/text-swap-interaction";
import type {
  VoiceCallbacks,
  VoiceOperation,
  VoicePort,
  VoiceRecording,
} from "./voice-port";
import { TextSwapClientError } from "./text-swap-client";
import {
  TextSwapDriver,
  type TextSwapDriverDependencies,
  type TextSwapScope,
} from "./text-swap-driver";

const BASIS: TextSwapBasis = Object.freeze({
  treeId: "tree_1",
  baseRevision: 4,
  documentEpoch: 2,
  selection: Object.freeze({
    type: "segment-range",
    nodeId: "thought_1",
    start: 0,
    end: 12,
    selectedText: "Rain is near",
  }),
  sourceText: "Rain is near",
  locale: "en-US",
  lineage: Object.freeze([Object.freeze({
    id: "thought_1",
    text: "Rain is near. Next",
    parentId: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  })]),
});

const SCOPE: TextSwapScope = Object.freeze({
  treeId: "tree_1",
  revision: 4,
  documentEpoch: 2,
  selection: BASIS.selection,
  lineage: BASIS.lineage,
  enabled: true,
  interactionScopeKey: "focus:thought_1",
});

class ControlledVoice implements VoicePort {
  readonly starts: Array<{ operation: VoiceOperation; callbacks: VoiceCallbacks }> = [];
  readonly cancel = vi.fn<(operation: VoiceOperation) => void>();
  private grant: (() => void) | null = null;
  private finishStop: ((recording: VoiceRecording) => void) | null = null;

  start(operation: VoiceOperation, callbacks: VoiceCallbacks = {}): Promise<void> {
    this.starts.push({ operation, callbacks });
    return new Promise((resolve) => {
      this.grant = resolve;
    });
  }

  stop(): Promise<VoiceRecording> {
    return new Promise((resolve) => {
      this.finishStop = resolve;
    });
  }

  grantPermission(): void {
    this.grant?.();
  }

  finish(operation: VoiceOperation, transcript?: string): void {
    this.finishStop?.(Object.freeze({
      operation,
      audio: new Blob(["voice"], { type: "audio/webm" }),
      durationMs: 800,
      ...(transcript === undefined ? {} : { transcript }),
    }));
  }
}

function harness(options: Partial<{
  transcribe: TextSwapDriverDependencies<string>["transcribe"];
  request: TextSwapDriverDependencies<string>["request"];
  commit: TextSwapDriverDependencies<string>["commit"];
}> = {}) {
  const voice = new ControlledVoice();
  let requestSequence = 0;
  const buildEnvelope = vi.fn((basis: TextSwapBasis, direction: string, id: string) => ({
    protocolVersion: "0.2",
    requestVersion: "text-swap/2",
    id,
    treeId: basis.treeId,
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: basis.baseRevision,
    selection: basis.selection,
    direction: { text: direction },
    locale: basis.locale,
    context: { lineage: basis.lineage },
  }) as TextSwapEnvelope);
  const transcribe = options.transcribe ?? vi.fn(async (input) => ({
    protocolVersion: "0.2" as const,
    interactionId: input.interactionId,
    attempt: input.attempt,
    transcript: "Make it more tentative",
  }));
  const request = options.request ?? vi.fn(async (envelope) => plan(envelope));
  const commit = options.commit ?? vi.fn(() => ({ status: "committed", change: "change_1" }) as const);
  const onCommitted = vi.fn();
  const driver = new TextSwapDriver<string>({
    createVoice: () => voice,
    transcribe,
    buildEnvelope,
    request,
    commit,
    onCommitted,
    createInteractionId: () => "text_swap_interaction_1",
    createRequestId: () => `text_swap_request_${++requestSequence}`,
    monotonicNow: () => 20,
  });
  driver.updateScope(SCOPE);
  driver.retain();
  return { buildEnvelope, commit, driver, onCommitted, request, transcribe, voice };
}

async function settle(times = 8): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

async function reachRecording(h: ReturnType<typeof harness>): Promise<VoiceOperation> {
  expect(h.driver.enter(BASIS)).toBe(true);
  expect(h.driver.startRecording()).toBe(true);
  const operation = h.voice.starts[0]!.operation;
  h.voice.grantPermission();
  await settle(2);
  expect(h.driver.getState().phase).toBe("recording");
  return operation;
}

async function completeVoice(
  h: ReturnType<typeof harness>,
  nativeTranscript?: string,
): Promise<VoiceOperation> {
  const operation = await reachRecording(h);
  h.driver.stopRecording();
  h.voice.finish(operation, nativeTranscript);
  await settle(30);
  expect(h.driver.getState()).toMatchObject({
    phase: "success",
    requestId: "text_swap_request_1",
    basis: { sourceText: "Rain is near" },
  });
  return operation;
}

describe("TextSwapDriver", () => {
  it("freezes Voice and transcription locale in the entered basis", async () => {
    const h = harness();
    const basis = Object.freeze({ ...BASIS, locale: "zh-CN" as const });
    h.driver.updateScope({ ...SCOPE, lineage: basis.lineage, selection: basis.selection });
    expect(h.driver.enter(basis)).toBe(true);
    expect(h.driver.startRecording()).toBe(true);
    expect(h.voice.starts[0]?.callbacks.locale).toBe("zh-CN");
    const operation = h.voice.starts[0]!.operation;
    h.voice.grantPermission();
    await settle(2);
    h.driver.stopRecording();
    h.voice.finish(operation);
    await settle(30);

    expect(h.transcribe).toHaveBeenCalledWith(expect.objectContaining({ locale: "zh-CN" }));
    expect(h.request).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "zh-CN" }),
      expect.any(AbortSignal),
    );
  });

  it("uses the latest committed React bindings without replacing the driver", async () => {
    const h = harness();
    const buildEnvelope = vi.fn((basis: TextSwapBasis, direction: string, id: string) => ({
      ...envelope(id),
      treeId: basis.treeId,
      selection: basis.selection,
      direction: { text: direction },
      locale: basis.locale,
      context: { lineage: basis.lineage },
    }));
    const commit = vi.fn(() => ({ status: "committed", change: "change_2" }) as const);
    const onCommitted = vi.fn();
    h.driver.updateBindings({ buildEnvelope, commit, onCommitted });

    expect(h.driver.enter(BASIS)).toBe(true);
    expect(h.driver.acceptDirection("Use a calmer rhythm")).toBe(true);
    expect(h.driver.submit()).toBe(true);
    await settle();

    expect(h.buildEnvelope).not.toHaveBeenCalled();
    expect(buildEnvelope).toHaveBeenCalledTimes(1);
    expect(h.commit).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(h.onCommitted).not.toHaveBeenCalled();
    expect(onCommitted).toHaveBeenCalledWith("change_2");
  });

  it("uses swap-direction transcription and commits one immutable request", async () => {
    const h = harness();
    const operation = await completeVoice(h);
    h.voice.finish(operation);
    await settle();

    expect(h.transcribe).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "swap-direction",
      locale: "en-US",
    }));

    expect(h.buildEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: "Rain is near" }),
      "Make it more tentative.",
      "text_swap_request_1",
    );
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.onCommitted).toHaveBeenCalledWith("change_1");
    expect(h.driver.getState()).toMatchObject({
      phase: "success",
      requestId: "text_swap_request_1",
      basis: { sourceText: "Rain is near" },
    });
    expect(h.driver.getState()).not.toHaveProperty("direction");
  });

  it("uses a browser-native final transcript without uploading audio", async () => {
    const h = harness();
    await completeVoice(h, "Use a calmer rhythm");

    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.buildEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ sourceText: "Rain is near" }),
      "Use a calmer rhythm.",
      "text_swap_request_1",
    );
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("does not let provider expression become a dormant transform direction", async () => {
    const h = harness();
    const operation = await reachRecording(h);
    h.driver.stopRecording();
    h.voice.finish(operation, "Use a calmer rhythm 🎉");
    await settle();

    expect(h.driver.getState()).toMatchObject({
      phase: "error",
      errorCode: "TRANSCRIPTION_FAILED",
    });
    expect(h.buildEnvelope).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });

  it("accepts a future typed carrier through the same bounded direction state", () => {
    const h = harness();
    expect(h.driver.enter(BASIS)).toBe(true);
    expect(h.driver.acceptDirection("  Use shorter phrasing  ")).toBe(true);

    expect(h.driver.getState()).toMatchObject({
      phase: "ready",
      direction: "Use shorter phrasing",
      basis: { sourceText: "Rain is near" },
    });
    expect(h.driver.getState()).not.toHaveProperty("carrier");
  });

  it("keeps an unrelated revision but aborts when the addressed lineage changes", async () => {
    let resolveTranscript!: (value: {
      protocolVersion: "0.2";
      interactionId: string;
      attempt: number;
      transcript: string;
    }) => void;
    const observedSignal: { current?: AbortSignal } = {};
    const h = harness({
      transcribe: (input) => {
        observedSignal.current = input.signal;
        return new Promise((resolve) => {
          resolveTranscript = resolve;
        });
      },
    });
    const operation = await reachRecording(h);
    h.driver.stopRecording();
    h.voice.finish(operation);
    await settle(3);
    expect(h.driver.getState().phase).toBe("transcribing");

    h.driver.updateScope({ ...SCOPE, revision: 5 });
    expect(h.driver.getState().phase).toBe("transcribing");
    expect(observedSignal.current?.aborted).toBe(false);
    h.driver.updateScope({
      ...SCOPE,
      revision: 6,
      lineage: Object.freeze([{ ...BASIS.lineage[0]!, text: "Rain was near. Next" }]),
    });
    expect(h.driver.getState()).toMatchObject({ phase: "stale", reason: "selection-change" });
    expect(observedSignal.current?.aborted).toBe(true);
    resolveTranscript({
      protocolVersion: "0.2",
      interactionId: operation.interactionId,
      attempt: operation.attempt,
      transcript: "late direction",
    });
    await settle();

    expect(h.driver.getState().phase).toBe("stale");
    expect(h.request).not.toHaveBeenCalled();
  });

  it("releases a revoked shared Voice lease and makes its transcription inert", async () => {
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
    const operation = await reachRecording(h);
    h.driver.stopRecording();
    h.voice.finish(operation);
    await settle(3);
    expect(h.driver.getState().phase).toBe("transcribing");

    h.voice.starts[0]?.callbacks.onOwnershipRevoked?.(operation);
    expect(h.driver.getState()).toEqual({ phase: "idle" });
    expect(observedSignal?.aborted).toBe(true);
    resolveTranscript({
      protocolVersion: "0.2",
      interactionId: operation.interactionId,
      attempt: operation.attempt,
      transcript: "late direction",
    });
    await settle();

    expect(h.request).not.toHaveBeenCalled();
  });

  it("aborts a pending request on selection loss and gives its late plan no commit authority", async () => {
    let resolveRequest!: (plan: TextSwapPlan) => void;
    const observedSignal: { current?: AbortSignal } = {};
    const h = harness({
      request: (envelope, signal) => {
        observedSignal.current = signal;
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      },
    });
    expect(h.driver.enter(BASIS)).toBe(true);
    expect(h.driver.acceptDirection("Use a calmer rhythm")).toBe(true);
    expect(h.driver.submit()).toBe(true);
    expect(h.driver.getState().phase).toBe("pending");

    h.driver.updateScope({ ...SCOPE, selection: null });
    expect(h.driver.getState()).toMatchObject({ phase: "stale", reason: "selection-change" });
    expect(observedSignal.current?.aborted).toBe(true);
    resolveRequest(plan(envelope("text_swap_request_1")));
    await settle();

    expect(h.commit).not.toHaveBeenCalled();
    expect(h.driver.getState().phase).toBe("stale");
  });

  it("retains a current direction only for an explicit retryable request retry", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new TextSwapClientError(true, "try again"))
      .mockImplementationOnce(async (value: TextSwapEnvelope) => plan(value));
    const h = harness({ request });
    expect(h.driver.enter(BASIS)).toBe(true);
    expect(h.driver.acceptDirection("Use a calmer rhythm")).toBe(true);
    expect(h.driver.submit()).toBe(true);
    await settle();

    expect(h.driver.getState()).toMatchObject({
      phase: "error",
      retryable: true,
      direction: "Use a calmer rhythm",
      requestId: "text_swap_request_1",
    });
    expect(h.driver.retry()).toBe(true);
    await settle();

    expect(request).toHaveBeenCalledTimes(2);
    expect(h.buildEnvelope.mock.calls[1]?.[2]).toBe("text_swap_request_2");
    expect(h.driver.getState()).toMatchObject({
      phase: "success",
      requestId: "text_swap_request_2",
    });
  });

  it("turns a stale commit receipt into stale rather than success", async () => {
    const h = harness({ commit: vi.fn(() => ({ status: "stale" } as const)) });
    expect(h.driver.enter(BASIS)).toBe(true);
    expect(h.driver.acceptDirection("Use a calmer rhythm")).toBe(true);
    expect(h.driver.submit()).toBe(true);
    await settle();

    expect(h.driver.getState()).toMatchObject({ phase: "stale", reason: "commit-stale" });
    expect(h.onCommitted).not.toHaveBeenCalled();
  });

  it("a new action aborts the old request and revokes its late plan", async () => {
    let resolveRequest!: (plan: TextSwapPlan) => void;
    const observedSignal: { current?: AbortSignal } = {};
    const h = harness({
      request: (value, signal) => {
        observedSignal.current = signal;
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      },
    });
    expect(h.driver.enter(BASIS)).toBe(true);
    h.driver.acceptDirection("Use a calmer rhythm");
    h.driver.submit();

    expect(h.driver.enter(BASIS)).toBe(true);
    expect(observedSignal.current?.aborted).toBe(true);
    resolveRequest(plan(envelope("text_swap_request_1")));
    await settle();

    expect(h.driver.getState().phase).toBe("eligible");
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("survives Strict Mode retain replay and disposes every owned resource once", async () => {
    const h = harness();
    h.driver.release();
    h.driver.retain();
    await settle(2);
    await reachRecording(h);

    h.driver.release();
    await settle(2);
    expect(h.voice.cancel).toHaveBeenCalledTimes(1);
    expect(h.driver.getState().phase).toBe("idle");
    expect(h.driver.enter(BASIS)).toBe(false);
  });

  it("revokes commit authority as soon as the final lease is released", async () => {
    let resolveRequest!: (plan: TextSwapPlan) => void;
    const observedSignal: { current?: AbortSignal } = {};
    const h = harness({
      request: (value, signal) => {
        observedSignal.current = signal;
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      },
    });
    expect(h.driver.enter(BASIS)).toBe(true);
    expect(h.driver.acceptDirection("Use a calmer rhythm")).toBe(true);
    expect(h.driver.submit()).toBe(true);

    h.driver.release();
    resolveRequest(plan(envelope("text_swap_request_1")));
    await settle(3);

    expect(observedSignal.current?.aborted).toBe(true);
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.onCommitted).not.toHaveBeenCalled();
    expect(h.driver.getState().phase).toBe("idle");
  });
});

function envelope(id: string): TextSwapEnvelope {
  return {
    protocolVersion: "0.2",
    requestVersion: "text-swap/2",
    id,
    treeId: "tree_1",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: 4,
    selection: BASIS.selection,
    direction: { text: "Use a calmer rhythm" },
    locale: "en-US",
    context: { lineage: BASIS.lineage },
  };
}

function plan(value: TextSwapEnvelope): TextSwapPlan {
  return {
    protocolVersion: "0.2",
    requestVersion: "text-swap/2",
    id: value.id,
    treeId: value.treeId,
    treeRevision: value.treeRevision,
    action: {
      id: value.id,
      type: "replace-text-range",
      nodeId: value.selection.nodeId,
      start: value.selection.start,
      end: value.selection.end,
      text: "Rain may be near",
      intent: "paraphrase",
    },
    presentation: { motionHint: "settle" },
  };
}
