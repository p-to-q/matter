import type { AdmissionAnchor as RuntimeAdmissionAnchor } from "../runtime/admission";
import {
  createAdmissionInteractionState,
  reduceAdmissionInteraction,
  type AdmissionAnchor,
  type AdmissionErrorCode,
  type AdmissionInteractionEffect,
  type AdmissionInteractionEvent,
  type AdmissionInteractionState,
} from "../runtime/admission-interaction";
import type { MatterStoreReceipt } from "../store/matter-store";
import {
  VoiceError,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
} from "./browser-voice";
import type { requestTranscriptRepair } from "./repair-client";
import {
  TranscriptionClientError,
  type requestTranscription,
} from "./transcription-client";

export type AdmissionScope = Readonly<{
  treeId: string;
  revision: number;
  documentEpoch?: number;
}>;

type Transcribe = typeof requestTranscription;

export type AdmissionDriverDependencies = Readonly<{
  commit: (
    anchor: RuntimeAdmissionAnchor,
    values: {
      interactionId: string;
      commandId: string;
      nodeId: string;
      createdAt: string;
      transcript: string;
    },
  ) => MatterStoreReceipt;
  createVoice: () => VoicePort;
  transcribe: Transcribe;
  /**
   * Optional by design. A deployment, a test, or a browser without the route
   * simply admits what was heard; repair is an improvement to an utterance that
   * already exists, never a step admission depends on.
   */
  repair?: typeof requestTranscriptRepair;
  createInteractionId: () => string;
  createMaterialId: () => string;
  canonicalNow: () => string;
  monotonicNow: () => number;
  locale: string;
}>;

type OwnedResources = {
  readonly operation: VoiceOperation;
  recording?: VoiceRecording;
  transcription?: AbortController;
  repair?: AbortController;
};

/**
 * Serializes admission events and owns their ephemeral effects. React may
 * recreate this driver, but no browser resource may survive dispose or scope
 * invalidation.
 */
export class AdmissionDriver {
  private state: AdmissionInteractionState = createAdmissionInteractionState();
  private scope: AdmissionScope | null = null;
  private readonly dependencies: AdmissionDriverDependencies;
  private readonly listeners = new Set<(state: AdmissionInteractionState) => void>();
  private readonly resources = new Map<string, OwnedResources>();
  private readonly events: AdmissionInteractionEvent[] = [];
  private voice: VoicePort | null = null;
  /**
   * Terms from the person's material, pushed in like the scope rather than read
   * at construction: the tree they come from has usually grown since this
   * driver was made. Empty is always a valid answer.
   */
  private vocabulary: readonly string[] = Object.freeze([]);
  private processing = false;
  private disposed = false;
  private leases = 0;
  private leaseGeneration = 0;

  constructor(dependencies: AdmissionDriverDependencies) {
    this.dependencies = dependencies;
  }

  getState(): AdmissionInteractionState {
    return this.state;
  }

  subscribe(listener: (state: AdmissionInteractionState) => void): () => void {
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
    // Strict Mode reconnects effects in the same task. Deferring final disposal
    // lets that replay retain the same driver without leaking on a real unmount.
    queueMicrotask(() => {
      if (!this.disposed && this.leases === 0 && this.leaseGeneration === generation) {
        this.dispose();
      }
    });
  }

  start(anchor: AdmissionAnchor): void {
    this.send({
      type: "start",
      token: this.dependencies.createInteractionId(),
      anchor,
    });
  }

  stop(): void {
    this.send({ type: "stop" });
  }

  cancel(): void {
    this.send({ type: "cancel" });
  }

  retry(): void {
    this.send({ type: "retry" });
  }

  dismiss(): void {
    this.send({ type: "dismiss" });
  }

  updateVocabulary(terms: readonly string[]): void {
    if (this.disposed) return;
    this.vocabulary = terms;
  }

  updateScope(scope: AdmissionScope): void {
    if (this.disposed || (this.scope !== null && sameScope(this.scope, scope))) return;
    const invalidatesOperation = this.scope !== null;
    this.scope = ownScope(scope);
    if (invalidatesOperation) this.send({ type: "scope-invalidated" });
  }

  dispose(): void {
    if (this.disposed) return;
    this.send({ type: "unmount" });
    this.disposed = true;
    for (const resources of [...this.resources.values()]) {
      this.cleanup(resources.operation);
    }
    this.events.length = 0;
    this.listeners.clear();
  }

  private send(event: AdmissionInteractionEvent): void {
    if (this.disposed) return;
    this.events.push(event);
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.events.length > 0 && !this.disposed) {
        const nextEvent = this.events.shift();
        if (nextEvent === undefined) break;
        const result = reduceAdmissionInteraction(this.state, nextEvent);
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

  private runEffect(effect: AdmissionInteractionEffect): void {
    const operation = operationFrom(effect);
    const key = operationKey(operation);
    switch (effect.type) {
      case "request-microphone": {
        let voice: VoicePort;
        try {
          voice = this.voice ?? this.dependencies.createVoice();
          this.voice = voice;
        } catch (error) {
          this.send(failureEvent("permission-failed", effect, mapVoiceError(error)));
          return;
        }
        this.resources.set(key, { operation });
        void voice.start(operation, {
          locale: this.dependencies.locale,
          onTranscript: (transcript) => this.send({
            type: "transcript-updated",
            token: operation.interactionId,
            attempt: operation.attempt,
            transcript,
          }),
          onDurationLimit: (limited) => this.send({
            type: "duration-limit",
            token: limited.interactionId,
            attempt: limited.attempt,
          }),
          onError: (error) => this.send(
            failureEvent("recording-failed", effect, mapVoiceError(error)),
          ),
        }).then(
          () => this.send({
            type: "permission-granted",
            token: effect.token,
            attempt: effect.attempt,
            startedAtMs: this.dependencies.monotonicNow(),
          }),
          (error) => this.send(
            failureEvent("permission-failed", effect, mapVoiceError(error)),
          ),
        );
        return;
      }
      case "stop-recording":
        void this.voice?.stop(operation).then(
          (recording) => {
            const owned = this.resources.get(key);
            if (owned === undefined) return;
            owned.recording = recording;
            this.send({
              type: "recorder-stopped",
              token: effect.token,
              attempt: effect.attempt,
            });
          },
          (error) => this.send(
            failureEvent("recording-failed", effect, mapVoiceError(error)),
          ),
        );
        return;
      case "transcribe-recording": {
        const owned = this.resources.get(key);
        if (owned?.recording === undefined) {
          this.send(failureEvent("transcription-failed", effect, "INTERNAL_FAILURE"));
          return;
        }
        if (owned.recording.transcript !== undefined) {
          const transcript = owned.recording.transcript.trim();
          if (transcript.length === 0) {
            this.send(failureEvent("transcription-failed", effect, "NO_AUDIO"));
            return;
          }
          this.send({ type: "transcription-succeeded", token: effect.token, attempt: effect.attempt, transcript });
          return;
        }
        const controller = new AbortController();
        owned.transcription = controller;
        void this.dependencies.transcribe({
          interactionId: effect.token,
          attempt: effect.attempt,
          purpose: "admission",
          locale: this.dependencies.locale,
          durationMs: owned.recording.durationMs,
          audio: owned.recording.audio,
          signal: controller.signal,
        }).then(
          (result) => this.send({
            type: "transcription-succeeded",
            token: result.interactionId,
            attempt: result.attempt,
            transcript: result.transcript,
          }),
          (error) => {
            if (controller.signal.aborted) return;
            this.send(failureEvent(
              "transcription-failed",
              effect,
              mapTranscriptionError(error),
            ));
          },
        );
        return;
      }
      case "repair-transcript": {
        const repair = this.dependencies.repair;
        const owned = this.resources.get(key);
        if (repair === undefined || owned === undefined) {
          this.send(settledEvent(effect, effect.transcript));
          return;
        }
        const controller = new AbortController();
        owned.repair = controller;
        // Every outcome is the same event with different words in it, so this
        // boundary has no failure branch and cannot strand the utterance.
        void repair({
          operationId: effect.token,
          attempt: effect.attempt,
          locale: this.dependencies.locale,
          text: effect.transcript,
          vocabulary: this.vocabulary,
          signal: controller.signal,
        }).then(
          (result) => this.send(settledEvent(effect, result.text)),
          () => {
            if (controller.signal.aborted) return;
            this.send(settledEvent(effect, effect.transcript));
          },
        );
        return;
      }
      case "commit-admission": {
        let receipt: MatterStoreReceipt;
        try {
          receipt = this.dependencies.commit(toRuntimeAnchor(effect.anchor), {
            interactionId: effect.token,
            commandId: `human_admission_${effect.token}_${effect.attempt}`,
            nodeId: this.dependencies.createMaterialId(),
            createdAt: this.dependencies.canonicalNow(),
            transcript: effect.transcript,
          });
        } catch {
          this.send(failureEvent("commit-failed", effect, "INTERNAL_FAILURE"));
          return;
        }
        this.send(
          receipt.status === "committed"
            ? { type: "commit-succeeded", token: effect.token, attempt: effect.attempt }
            : failureEvent(
                "commit-failed",
                effect,
                mapCommitError("errorCode" in receipt ? receipt.errorCode : "INVALID_INTERACTION"),
              ),
        );
        return;
      }
      case "cancel-operation":
      case "cleanup-operation":
        this.cleanup(operation);
        return;
      default:
        return assertNever(effect);
    }
  }

  private cleanup(operation: VoiceOperation): void {
    const key = operationKey(operation);
    const resources = this.resources.get(key);
    resources?.transcription?.abort();
    resources?.repair?.abort();
    this.voice?.cancel(operation);
    this.resources.delete(key);
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

function ownScope(scope: AdmissionScope): AdmissionScope {
  return Object.freeze({ ...scope });
}

function sameScope(left: AdmissionScope, right: AdmissionScope): boolean {
  return left.treeId === right.treeId && left.revision === right.revision && (left.documentEpoch ?? 0) === (right.documentEpoch ?? 0);
}

function operationKey(operation: VoiceOperation): string {
  return `${operation.interactionId}:${operation.attempt}`;
}

function operationFrom(effect: AdmissionInteractionEffect): VoiceOperation {
  return { interactionId: effect.token, attempt: effect.attempt };
}

function settledEvent(
  effect: { readonly token: string; readonly attempt: number },
  transcript: string,
): AdmissionInteractionEvent {
  return { type: "repair-settled", token: effect.token, attempt: effect.attempt, transcript };
}

function failureEvent(
  type: "permission-failed" | "recording-failed" | "transcription-failed" | "commit-failed",
  effect: { readonly token: string; readonly attempt: number },
  errorCode: AdmissionErrorCode,
): AdmissionInteractionEvent {
  return { type, token: effect.token, attempt: effect.attempt, errorCode };
}

function toRuntimeAnchor(anchor: AdmissionAnchor): RuntimeAdmissionAnchor {
  return anchor.kind === "root"
    ? { target: "root", treeId: anchor.treeId, baseRevision: anchor.baseRevision }
    : {
        target: "child",
        treeId: anchor.treeId,
        baseRevision: anchor.baseRevision,
        parentNodeId: anchor.parentNodeId,
      };
}

function mapVoiceError(error: unknown): AdmissionErrorCode {
  if (!(error instanceof VoiceError)) return "RECORDING_FAILED";
  switch (error.code) {
    case "MICROPHONE_DENIED": return "MICROPHONE_DENIED";
    case "MICROPHONE_NOT_FOUND":
    case "MICROPHONE_UNAVAILABLE": return "MICROPHONE_UNAVAILABLE";
    case "VOICE_UNSUPPORTED": return "RECORDING_UNSUPPORTED";
    case "RECORDING_EMPTY": return "NO_AUDIO";
    default: return "RECORDING_FAILED";
  }
}

function mapTranscriptionError(error: unknown): AdmissionErrorCode {
  if (error instanceof TranscriptionClientError) {
    if (error.code === "TRANSCRIPTION_TIMEOUT") return "TRANSCRIPTION_TIMEOUT";
    if (error.code === "AUDIO_EMPTY" || error.code === "NO_SPEECH") return "NO_AUDIO";
  }
  return "TRANSCRIPTION_FAILED";
}

function mapCommitError(code: string): AdmissionErrorCode {
  return code === "REVISION_CONFLICT" || code === "INVALID_INTERACTION"
    ? "STALE_TARGET"
    : "COMMIT_REJECTED";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled admission effect: ${String(value)}`);
}
