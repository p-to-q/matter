import type { MatterLocale } from "../config/locales";
import type { SegmentSelection } from "../material/text-segments";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import {
  createTextSwapInteractionState,
  reduceTextSwapInteraction,
  type TextSwapBasis,
  type TextSwapErrorCode,
  type TextSwapInteractionEffect,
  type TextSwapInteractionEvent,
  type TextSwapInteractionState,
} from "../runtime/text-swap-interaction";
import {
  VoiceError,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
} from "./voice-port";
import { TextSwapClientError } from "./text-swap-client";
import { TranscriptionClientError, type requestTranscription } from "./transcription-client";
import { normalizeSpokenTranscript } from "../runtime/spoken-transcript";
import { MAX_TEXT_SWAP_DIRECTION_CODE_POINTS } from "../protocol/text-swap-policy";
import { hasPresentedEmoji } from "../protocol/transcription-contract";

export type TextSwapScope = Readonly<{
  treeId: string;
  revision: number;
  documentEpoch: number;
  selection: SegmentSelection | null;
  enabled: boolean;
  interactionScopeKey: string;
}>;

export type TextSwapCommitResult<TCommitted> =
  | Readonly<{ status: "committed"; change: TCommitted }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "rejected" }>;

type Transcribe = typeof requestTranscription;

export type TextSwapDriverDependencies<TCommitted> = Readonly<{
  createVoice: () => VoicePort;
  transcribe: Transcribe;
  buildEnvelope: (
    basis: TextSwapBasis,
    direction: string,
    requestId: string,
  ) => TextSwapEnvelope | null;
  request: (envelope: TextSwapEnvelope, signal: AbortSignal) => Promise<TextSwapPlan>;
  commit: (
    envelope: TextSwapEnvelope,
    plan: TextSwapPlan,
    basis: TextSwapBasis,
  ) => TextSwapCommitResult<TCommitted>;
  onCommitted: (change: TCommitted) => void;
  createInteractionId: () => string;
  createRequestId: () => string;
  monotonicNow: () => number;
  locale: MatterLocale;
}>;

type VoiceResources = {
  operation: VoiceOperation;
  generation: number;
  recording?: VoiceRecording;
  transcription?: AbortController;
};

type RequestResources = {
  interactionId: string;
  requestId: string;
  generation: number;
  controller: AbortController;
  envelope: TextSwapEnvelope;
  basis: TextSwapBasis;
};

/**
 * Executes Text Swap effects while the reducer remains the sole lifecycle
 * authority. Every callback checks both immutable identity and the driver's
 * abort generation before it may report a result or ask the commit boundary.
 */
export class TextSwapDriver<TCommitted> {
  private state: TextSwapInteractionState = createTextSwapInteractionState();
  private scope: TextSwapScope | null = null;
  private readonly dependencies: TextSwapDriverDependencies<TCommitted>;
  private readonly listeners = new Set<(state: TextSwapInteractionState) => void>();
  private readonly events: TextSwapInteractionEvent[] = [];
  private voice: VoicePort | null = null;
  private voiceResources: VoiceResources | null = null;
  private requestResources: RequestResources | null = null;
  private abortGeneration = 0;
  private processing = false;
  private disposed = false;
  private leases = 0;
  private leaseGeneration = 0;

  constructor(dependencies: TextSwapDriverDependencies<TCommitted>) {
    this.dependencies = dependencies;
  }

  getState(): TextSwapInteractionState {
    return this.state;
  }

  subscribe(listener: (state: TextSwapInteractionState) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  retain(): void {
    if (this.disposed) return;
    this.leases += 1;
    this.leaseGeneration += 1;
  }

  release(): void {
    if (this.disposed || this.leases === 0) return;
    this.leases -= 1;
    const generation = ++this.leaseGeneration;
    if (this.leases !== 0) return;
    queueMicrotask(() => {
      if (!this.disposed && this.leases === 0 && this.leaseGeneration === generation) {
        this.dispose();
      }
    });
  }

  updateScope(scope: TextSwapScope): void {
    if (this.disposed || (this.scope !== null && sameScope(this.scope, scope))) return;
    const previous = this.scope;
    this.scope = ownScope(scope);
    if (previous === null || this.state.phase === "idle") return;
    const reason = sameDocumentScope(previous, scope) ? "selection-change" : "scope-change";
    this.send({ type: "scope-invalidated", reason });
  }

  enter(basis: TextSwapBasis): boolean {
    if (this.disposed) return false;
    this.send({
      type: "enter",
      interactionId: this.dependencies.createInteractionId(),
      basis,
    });
    if (!this.scopeMatches(basis)) {
      this.send({ type: "scope-invalidated", reason: "scope-change" });
      return false;
    }
    return this.state.phase === "eligible";
  }

  startRecording(): boolean {
    const before = this.state;
    this.send({ type: "start-recording" });
    return before !== this.state && this.state.phase === "permission";
  }

  stopRecording(): void {
    this.send({ type: "stop-recording" });
  }

  acceptDirection(text: string): boolean {
    this.send({ type: "accept-direction", text });
    return this.state.phase === "ready";
  }

  submit(): boolean {
    const requestId = this.dependencies.createRequestId();
    this.send({ type: "submit", requestId });
    return this.state.phase === "pending" && this.state.requestId === requestId;
  }

  retry(): boolean {
    if (this.state.phase !== "error" || !this.state.retryable || this.state.direction === undefined) {
      return false;
    }
    const requestId = this.dependencies.createRequestId();
    this.send({ type: "retry-request", requestId });
    return isPendingRequest(this.getState(), requestId);
  }

  dismiss(): void {
    this.send({ type: "dismiss" });
  }

  cancel(): void {
    this.send({ type: "cancel" });
  }

  dispose(): void {
    if (this.disposed) return;
    this.send({ type: "unmount" });
    this.disposed = true;
    this.abortAll();
    this.events.length = 0;
    this.listeners.clear();
  }

  private send(event: TextSwapInteractionEvent): void {
    if (this.disposed) return;
    this.events.push(event);
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.events.length > 0 && !this.disposed) {
        const nextEvent = this.events.shift();
        if (nextEvent === undefined) break;
        const result = reduceTextSwapInteraction(this.state, nextEvent);
        if (result.state !== this.state) {
          this.state = result.state;
          this.notify();
        }
        for (const effect of result.effects) this.runEffect(effect);
      }
    } finally {
      this.processing = false;
    }
  }

  private runEffect(effect: TextSwapInteractionEffect): void {
    switch (effect.type) {
      case "request-permission":
        this.requestPermission(effect);
        return;
      case "stop-recording":
        this.stopVoice(effect);
        return;
      case "transcribe-recording":
        this.transcribeRecording(effect);
        return;
      case "request-swap":
        this.requestSwap(effect);
        return;
      case "cleanup-voice":
        this.cleanupVoice(effect);
        return;
      case "cleanup-request":
        this.cleanupRequest(effect.interactionId, effect.requestId);
        return;
      case "cancel-session":
        this.cancelSession(effect.interactionId);
        return;
      default:
        return assertNever(effect);
    }
  }

  private requestPermission(
    effect: Extract<TextSwapInteractionEffect, { type: "request-permission" }>,
  ): void {
    if (!this.scopeMatches(effect.basis)) {
      this.send({ type: "scope-invalidated", reason: "scope-change" });
      return;
    }
    let voice: VoicePort;
    try {
      voice = this.voice ?? this.dependencies.createVoice();
      this.voice = voice;
    } catch (error) {
      this.send(voiceFailure("permission-failed", effect, error));
      return;
    }
    const operation = Object.freeze({
      interactionId: effect.interactionId,
      attempt: effect.attempt,
    });
    const generation = ++this.abortGeneration;
    this.voiceResources = { operation, generation };
    void voice.start(operation, {
      locale: this.dependencies.locale,
      maxTranscriptCodePoints: MAX_TEXT_SWAP_DIRECTION_CODE_POINTS,
      onTranscript: (text) => {
        if (!this.ownsVoice(operation, generation)) return;
        this.send({ type: "partial-direction", ...operation, text });
      },
      onDurationLimit: (limited) => {
        if (!this.ownsVoice(operation, generation) || !sameOperation(operation, limited)) return;
        this.send({ type: "duration-limit", ...operation });
      },
      onError: (error) => {
        if (!this.ownsVoice(operation, generation)) return;
        this.send(voiceFailure("recording-failed", operation, error));
      },
      onOwnershipRevoked: (revoked) => {
        if (!sameOperation(operation, revoked) || !this.ownsVoice(operation, generation)) return;
        this.send({ type: "cancel" });
      },
    }).then(
      () => {
        if (!this.ownsVoice(operation, generation)) return;
        this.send({
          type: "permission-granted",
          ...operation,
          startedAtMs: this.dependencies.monotonicNow(),
        });
      },
      (error) => {
        if (!this.ownsVoice(operation, generation)) return;
        this.send(voiceFailure("permission-failed", operation, error));
      },
    );
  }

  private stopVoice(effect: VoiceOperation): void {
    const operation = voiceOperation(effect);
    const resources = this.voiceResources;
    if (resources === null || !sameOperation(resources.operation, operation)) {
      this.send({
        type: "recording-failed",
        ...operation,
        errorCode: "RECORDING_FAILED",
        retryable: true,
      });
      return;
    }
    void this.voice?.stop(resources.operation).then(
      (recording) => {
        if (!this.ownsVoice(resources.operation, resources.generation)) return;
        resources.recording = recording;
        this.send({ type: "recorder-stopped", ...resources.operation });
      },
      (error) => {
        if (!this.ownsVoice(resources.operation, resources.generation)) return;
        this.send(voiceFailure("recording-failed", resources.operation, error));
      },
    );
  }

  private transcribeRecording(effect: VoiceOperation): void {
    const operation = voiceOperation(effect);
    const resources = this.voiceResources;
    if (
      resources === null ||
      !sameOperation(resources.operation, operation) ||
      resources.recording === undefined
    ) {
      this.send({
        type: "transcription-failed",
        ...operation,
        errorCode: "TRANSCRIPTION_FAILED",
        retryable: true,
      });
      return;
    }
    const nativeTranscript = resources.recording.transcript;
    if (nativeTranscript !== undefined) {
      this.completeVoiceDirection(operation, nativeTranscript);
      return;
    }
    const controller = new AbortController();
    resources.transcription = controller;
    void this.dependencies.transcribe({
      interactionId: effect.interactionId,
      attempt: effect.attempt,
      purpose: "swap-direction",
      locale: this.dependencies.locale,
      durationMs: resources.recording.durationMs,
      audio: resources.recording.audio,
      signal: controller.signal,
    }).then(
      (result) => {
        if (!this.ownsVoice(resources.operation, resources.generation) || controller.signal.aborted) return;
        if (
          result.interactionId !== operation.interactionId ||
          result.attempt !== operation.attempt
        ) {
          this.send({
            type: "transcription-failed",
            ...operation,
            errorCode: "TRANSCRIPTION_FAILED",
            retryable: true,
          });
          return;
        }
        this.completeVoiceDirection(operation, result.transcript);
      },
      (error) => {
        if (
          !this.ownsVoice(resources.operation, resources.generation) ||
          controller.signal.aborted
        ) return;
        this.send(transcriptionFailure(operation, error));
      },
    );
  }

  private completeVoiceDirection(operation: VoiceOperation, text: string): void {
    const direction = normalizeSpokenTranscript({
      text,
      locale: this.dependencies.locale,
      maxOutputCodePoints: MAX_TEXT_SWAP_DIRECTION_CODE_POINTS,
    });
    if (
      direction.length === 0 ||
      Array.from(direction).length > MAX_TEXT_SWAP_DIRECTION_CODE_POINTS ||
      hasPresentedEmoji(direction)
    ) {
      this.send({
        type: "transcription-failed",
        ...operation,
        errorCode: "TRANSCRIPTION_FAILED",
        retryable: true,
      });
      return;
    }
    const requestId = this.dependencies.createRequestId();
    this.send({
      type: "direction-resolved",
      ...operation,
      text: direction,
    });
    // Stopping Voice is the person's submit. Queueing these events together is
    // intentional: a native transcript may resolve while an earlier reducer
    // effect is still draining. An invalid or stale direction makes `submit`
    // inert, while a valid one creates exactly one immutable request.
    this.send({ type: "submit", requestId });
  }

  private requestSwap(
    effect: Extract<TextSwapInteractionEffect, { type: "request-swap" }>,
  ): void {
    if (!this.scopeMatches(effect.basis)) {
      this.send({
        type: "request-stale",
        interactionId: effect.interactionId,
        requestId: effect.requestId,
      });
      return;
    }
    let envelope: TextSwapEnvelope | null;
    try {
      envelope = this.dependencies.buildEnvelope(effect.basis, effect.direction, effect.requestId);
    } catch {
      envelope = null;
    }
    if (envelope === null || envelope.id !== effect.requestId) {
      this.send({
        type: "request-failed",
        interactionId: effect.interactionId,
        requestId: effect.requestId,
        errorCode: "INVALID_RESPONSE",
        retryable: false,
      });
      return;
    }
    const controller = new AbortController();
    const resources: RequestResources = {
      interactionId: effect.interactionId,
      requestId: effect.requestId,
      generation: ++this.abortGeneration,
      controller,
      envelope,
      basis: effect.basis,
    };
    this.requestResources = resources;
    void this.dependencies.request(envelope, controller.signal).then(
      (plan) => this.commitPlan(resources, plan),
      (error) => {
        if (!this.ownsRequest(resources)) return;
        this.send(requestFailure(resources, error));
      },
    );
  }

  private commitPlan(resources: RequestResources, plan: TextSwapPlan): void {
    if (!this.ownsRequest(resources) || !this.scopeMatches(resources.basis)) {
      this.send({
        type: "request-stale",
        interactionId: resources.interactionId,
        requestId: resources.requestId,
      });
      return;
    }
    let result: TextSwapCommitResult<TCommitted>;
    try {
      result = this.dependencies.commit(resources.envelope, plan, resources.basis);
    } catch {
      result = { status: "rejected" };
    }
    if (!this.ownsRequest(resources)) return;
    if (result.status === "stale") {
      this.send({
        type: "request-stale",
        interactionId: resources.interactionId,
        requestId: resources.requestId,
      });
      return;
    }
    if (result.status === "rejected") {
      this.send({
        type: "request-failed",
        interactionId: resources.interactionId,
        requestId: resources.requestId,
        errorCode: "COMMIT_REJECTED",
        retryable: false,
      });
      return;
    }
    try {
      this.dependencies.onCommitted(result.change);
    } catch {
      // Presentation observes a durable commit; it cannot roll that commit back.
    }
    this.send({
      type: "request-committed",
      interactionId: resources.interactionId,
      requestId: resources.requestId,
    });
  }

  private cleanupVoice(identity: VoiceOperation): void {
    const resources = this.voiceResources;
    if (resources === null || !sameOperation(resources.operation, identity)) return;
    this.abortGeneration += 1;
    resources.transcription?.abort(new DOMException("Aborted", "AbortError"));
    this.voice?.cancel(resources.operation);
    this.voiceResources = null;
  }

  private cleanupRequest(interactionId: string, requestId: string): void {
    const resources = this.requestResources;
    if (
      resources === null ||
      resources.interactionId !== interactionId ||
      resources.requestId !== requestId
    ) return;
    this.abortGeneration += 1;
    resources.controller.abort(new DOMException("Settled", "AbortError"));
    this.requestResources = null;
  }

  private cancelSession(interactionId: string): void {
    this.abortGeneration += 1;
    const voice = this.voiceResources;
    if (voice?.operation.interactionId === interactionId) {
      voice.transcription?.abort(new DOMException("Aborted", "AbortError"));
      this.voice?.cancel(voice.operation);
      this.voiceResources = null;
    }
    const request = this.requestResources;
    if (request?.interactionId === interactionId) {
      request.controller.abort(new DOMException("Aborted", "AbortError"));
      this.requestResources = null;
    }
  }

  private abortAll(): void {
    this.abortGeneration += 1;
    const voice = this.voiceResources;
    voice?.transcription?.abort(new DOMException("Aborted", "AbortError"));
    if (voice !== null) this.voice?.cancel(voice.operation);
    this.voiceResources = null;
    this.requestResources?.controller.abort(new DOMException("Aborted", "AbortError"));
    this.requestResources = null;
  }

  private ownsVoice(operation: VoiceOperation, generation: number): boolean {
    return !this.disposed && this.leases > 0 &&
      generation === this.abortGeneration &&
      this.voiceResources?.generation === generation &&
      sameOperation(this.voiceResources.operation, operation);
  }

  private ownsRequest(resources: RequestResources): boolean {
    return !this.disposed && this.leases > 0 &&
      !resources.controller.signal.aborted &&
      resources.generation === this.abortGeneration &&
      this.requestResources === resources;
  }

  private scopeMatches(basis: TextSwapBasis): boolean {
    const scope = this.scope;
    return scope !== null && scope.enabled &&
      scope.treeId === basis.treeId &&
      scope.revision === basis.baseRevision &&
      scope.documentEpoch === basis.documentEpoch &&
      sameSelection(scope.selection, basis.selection) &&
      basis.sourceText === basis.selection.selectedText;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(this.state);
      } catch {
        // Observation cannot interrupt lifecycle cleanup or event ordering.
      }
    }
  }
}

function ownScope(scope: TextSwapScope): TextSwapScope {
  return Object.freeze({
    ...scope,
    selection: scope.selection === null ? null : Object.freeze({ ...scope.selection }),
  });
}

function sameScope(left: TextSwapScope, right: TextSwapScope): boolean {
  return sameDocumentScope(left, right) &&
    left.enabled === right.enabled &&
    left.interactionScopeKey === right.interactionScopeKey &&
    sameSelection(left.selection, right.selection);
}

function sameDocumentScope(left: TextSwapScope, right: TextSwapScope): boolean {
  return left.treeId === right.treeId &&
    left.revision === right.revision &&
    left.documentEpoch === right.documentEpoch &&
    left.enabled === right.enabled &&
    left.interactionScopeKey === right.interactionScopeKey;
}

function sameSelection(
  left: SegmentSelection | null,
  right: SegmentSelection | null,
): boolean {
  return left === right || (left !== null && right !== null &&
    left.type === right.type &&
    left.nodeId === right.nodeId &&
    left.start === right.start &&
    left.end === right.end &&
    left.selectedText === right.selectedText);
}

function sameOperation(left: VoiceOperation, right: VoiceOperation): boolean {
  return left.interactionId === right.interactionId && left.attempt === right.attempt;
}

function isPendingRequest(state: TextSwapInteractionState, requestId: string): boolean {
  return state.phase === "pending" && state.requestId === requestId;
}

function mapVoiceError(error: unknown): Readonly<{
  errorCode: TextSwapErrorCode;
  retryable: boolean;
}> {
  if (!(error instanceof VoiceError)) return { errorCode: "RECORDING_FAILED", retryable: true };
  switch (error.code) {
    case "MICROPHONE_DENIED": return { errorCode: "MICROPHONE_DENIED", retryable: false };
    case "MICROPHONE_NOT_FOUND":
    case "MICROPHONE_UNAVAILABLE": return { errorCode: "MICROPHONE_UNAVAILABLE", retryable: true };
    case "VOICE_UNSUPPORTED": return { errorCode: "RECORDING_UNSUPPORTED", retryable: false };
    case "RECORDING_EMPTY": return { errorCode: "NO_AUDIO", retryable: true };
    default: return { errorCode: "RECORDING_FAILED", retryable: true };
  }
}

function voiceFailure(
  type: "permission-failed" | "recording-failed",
  identity: VoiceOperation,
  error: unknown,
): TextSwapInteractionEvent {
  return { type, ...voiceOperation(identity), ...mapVoiceError(error) };
}

function transcriptionFailure(
  identity: VoiceOperation,
  error: unknown,
): TextSwapInteractionEvent {
  const timeout = error instanceof TranscriptionClientError &&
    error.code === "TRANSCRIPTION_TIMEOUT";
  const noAudio = error instanceof TranscriptionClientError &&
    (error.code === "AUDIO_EMPTY" || error.code === "NO_SPEECH");
  return {
    type: "transcription-failed",
    ...voiceOperation(identity),
    errorCode: timeout ? "TRANSCRIPTION_TIMEOUT" : noAudio ? "NO_AUDIO" : "TRANSCRIPTION_FAILED",
    retryable: !(error instanceof TranscriptionClientError) || error.retryable,
  };
}

function voiceOperation(value: VoiceOperation): VoiceOperation {
  return {
    interactionId: value.interactionId,
    attempt: value.attempt,
  };
}

function requestFailure(
  resources: RequestResources,
  error: unknown,
): TextSwapInteractionEvent {
  return {
    type: "request-failed",
    interactionId: resources.interactionId,
    requestId: resources.requestId,
    errorCode: error instanceof TextSwapClientError && error.kind === "request-failed"
      ? "REQUEST_FAILED"
      : "INVALID_RESPONSE",
    retryable: error instanceof TextSwapClientError && error.retryable,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled text swap effect: ${String(value)}`);
}
