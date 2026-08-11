import type { AdmissionAnchor as RuntimeAdmissionAnchor } from "../runtime/admission";
import type { MatterLocale } from "../config/locales";
import { ADMISSION_REPAIR_WINDOW_MS } from "../runtime/admission-repair";
import {
  createAdmissionInteractionState,
  reduceAdmissionInteraction,
  type AdmissionAnchor,
  type AdmissionErrorCode,
  type AdmissionInteractionEffect,
  type AdmissionInteractionEvent,
  type AdmissionInteractionState,
} from "../runtime/admission-interaction";
import type {
  AdmissionRepairStoreReceipt,
  AdmissionRepairCommittedChange,
  AdmissionRepairSettlement,
  AdmissionStoreReceipt,
  MatterAdmissionValues,
} from "../store/matter-store";
import { normalizeAdmittedTranscript } from "../runtime/transcript-punctuation";
import {
  VoiceError,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
} from "./browser-voice";
import type {
  TranscriptRepairPort,
  TranscriptRepairResult,
} from "./transcript-repair-port";
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
    values: MatterAdmissionValues,
  ) => AdmissionStoreReceipt;
  settleRepair: (settlement: AdmissionRepairSettlement) => AdmissionRepairStoreReceipt;
  onRepairCommitted: (change: AdmissionRepairCommittedChange) => void;
  createVoice: () => VoicePort;
  transcribe: Transcribe;
  repair: TranscriptRepairPort;
  afterBaselineVisible: (callback: () => void) => () => void;
  createInteractionId: () => string;
  createMaterialId: () => string;
  canonicalNow: () => string;
  monotonicNow: () => number;
  locale: MatterLocale;
}>;

type OwnedResources = {
  readonly operation: VoiceOperation;
  readonly documentEpoch: number;
  recording?: VoiceRecording;
  transcription?: AbortController;
};

type LateRepairResources = {
  controller: AbortController;
  repairLeaseId: string;
  timeout?: ReturnType<typeof setTimeout>;
  cancelVisibilityGate?: () => void;
  baselineVisible: boolean;
  candidate?: TranscriptRepairResult;
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
  private readonly lateRepairs = new Map<string, LateRepairResources>();
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
    // A new utterance is a fresh material decision. An older optional repair
    // must not land after this pointer action, advance the tree revision, and
    // invalidate the microphone operation that the person just started.
    this.cancelLateRepairs();
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

  /** Precise material gestures take precedence over an optional late repair. */
  discardPendingRepairs(): void {
    this.cancelLateRepairs();
  }

  updateVocabulary(terms: readonly string[]): void {
    if (this.disposed) return;
    this.vocabulary = terms;
  }

  updateScope(scope: AdmissionScope): void {
    if (this.disposed || (this.scope !== null && sameScope(this.scope, scope))) return;
    const invalidatesOperation = this.scope !== null;
    const previous = this.scope;
    this.scope = ownScope(scope);
    if (
      previous !== null &&
      (previous.treeId !== scope.treeId ||
        (previous.documentEpoch ?? 0) !== (scope.documentEpoch ?? 0))
    ) {
      this.cancelLateRepairs();
    }
    if (invalidatesOperation) this.send({ type: "scope-invalidated" });
  }

  dispose(): void {
    if (this.disposed) return;
    this.send({ type: "unmount" });
    this.disposed = true;
    for (const resources of [...this.resources.values()]) {
      this.cleanup(resources.operation);
    }
    this.cancelLateRepairs();
    this.dependencies.repair.dispose();
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
        const scope = this.scope;
        if (
          scope === null ||
          scope.treeId !== effect.anchor.treeId ||
          scope.revision !== effect.anchor.baseRevision
        ) {
          this.send({ type: "scope-invalidated" });
          return;
        }
        let voice: VoicePort;
        try {
          voice = this.voice ?? this.dependencies.createVoice();
          this.voice = voice;
        } catch (error) {
          this.send(failureEvent("permission-failed", effect, mapVoiceError(error)));
          return;
        }
        this.resources.set(key, {
          operation,
          documentEpoch: scope.documentEpoch ?? 0,
        });
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
      case "commit-admission": {
        let receipt: AdmissionStoreReceipt;
        const owned = this.resources.get(key);
        if (owned === undefined) {
          this.send(failureEvent("commit-failed", effect, "INTERNAL_FAILURE"));
          return;
        }
        const nodeId = this.dependencies.createMaterialId();
        const admittedAt = this.dependencies.canonicalNow();
        const admittedAtMs = this.dependencies.monotonicNow();
        const baseline = normalizeAdmittedTranscript(effect.transcript);
        try {
          receipt = this.dependencies.commit(toRuntimeAnchor(effect.anchor), {
            interactionId: effect.token,
            commandId: `human_admission_${effect.token}_${effect.attempt}`,
            nodeId,
            createdAt: admittedAt,
            transcript: baseline,
            admittedAtMs,
            repairLocale: this.dependencies.locale,
            expectedDocumentEpoch: owned.documentEpoch,
          });
        } catch {
          this.send(failureEvent("commit-failed", effect, "INTERNAL_FAILURE"));
          return;
        }
        if (receipt.status === "committed") {
          this.send({ type: "commit-succeeded", token: effect.token, attempt: effect.attempt });
          if ("repairLeaseId" in receipt) {
            this.startLateRepair({
              operation,
              repairLeaseId: receipt.repairLeaseId,
              baseline,
              admittedAtMs,
            });
          }
        } else {
          this.send(failureEvent(
                "commit-failed",
                effect,
                mapCommitError("errorCode" in receipt ? receipt.errorCode : "INVALID_INTERACTION"),
          ));
        }
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
    this.voice?.cancel(operation);
    this.resources.delete(key);
  }

  private startLateRepair(input: Readonly<{
    operation: VoiceOperation;
    repairLeaseId: string;
    baseline: string;
    admittedAtMs: number;
  }>): void {
    if (this.disposed) return;
    const key = operationKey(input.operation);
    const controller = new AbortController();
    const resources: LateRepairResources = {
      controller,
      repairLeaseId: input.repairLeaseId,
      baselineVisible: false,
    };
    this.lateRepairs.set(key, resources);
    resources.timeout = setTimeout(
      () => this.discardLateRepair(key, "Transcript repair lease expired."),
      ADMISSION_REPAIR_WINDOW_MS,
    );
    try {
      resources.cancelVisibilityGate = this.dependencies.afterBaselineVisible(
        () => {
          const active = this.lateRepairs.get(key);
          if (active === undefined || active.controller.signal.aborted) return;
          active.cancelVisibilityGate = undefined;
          active.baselineVisible = true;
          this.commitLateRepairIfReady(key, input);
        },
      );
    } catch {
      this.discardLateRepair(key, "Transcript repair presentation gate failed.");
      return;
    }
    this.runLateRepair(key, input);
  }

  private runLateRepair(
    key: string,
    input: Readonly<{
      operation: VoiceOperation;
      repairLeaseId: string;
      baseline: string;
      admittedAtMs: number;
    }>,
  ): void {
    const resources = this.lateRepairs.get(key);
    if (resources === undefined || resources.controller.signal.aborted) return;
    // Starting through a resolved promise contains a port that throws before
    // returning its promise just as strictly as an asynchronous rejection.
    void Promise.resolve()
      .then(() => this.dependencies.repair.repair({
        operationId: input.operation.interactionId,
        attempt: input.operation.attempt,
        text: input.baseline,
        locale: this.dependencies.locale,
        vocabulary: this.vocabulary,
        signal: resources.controller.signal,
      }))
      .then((result) => {
        if (
          resources.controller.signal.aborted ||
          result.text === input.baseline
        ) {
          this.discardLateRepair(key, "Transcript repair produced no admissible change.");
          return;
        }
        resources.candidate = result;
        this.commitLateRepairIfReady(key, input);
      })
      .catch(() => {
        this.discardLateRepair(key, "Transcript repair adapter failed.");
      });
  }

  private commitLateRepairIfReady(
    key: string,
    input: Readonly<{
      operation: VoiceOperation;
      repairLeaseId: string;
      baseline: string;
      admittedAtMs: number;
    }>,
  ): void {
    const resources = this.lateRepairs.get(key);
    if (
      resources === undefined ||
      resources.controller.signal.aborted ||
      !resources.baselineVisible ||
      resources.candidate === undefined
    ) return;
    if (this.dependencies.monotonicNow() - input.admittedAtMs > ADMISSION_REPAIR_WINDOW_MS) {
      this.discardLateRepair(key, "Transcript repair lease expired.");
      return;
    }
    this.settleLateRepair(key, {
      repairLeaseId: input.repairLeaseId,
      outcome: "candidate",
      text: resources.candidate.text,
      source: resources.candidate.source,
      createdAt: this.dependencies.canonicalNow(),
    });
  }

  private settleLateRepair(key: string, settlement: AdmissionRepairSettlement): void {
    const repair = this.lateRepairs.get(key);
    if (repair === undefined) return;
    this.lateRepairs.delete(key);
    if (repair.timeout !== undefined) clearTimeout(repair.timeout);
    repair.cancelVisibilityGate?.();
    try {
      const receipt = this.dependencies.settleRepair(settlement);
      if (
        settlement.outcome === "candidate" &&
        receipt.status === "committed" &&
        "repairChange" in receipt
      ) {
        try {
          this.dependencies.onRepairCommitted(receipt.repairChange);
        } catch {
          // Presentation is a transient observer of an already durable commit.
        }
      }
    } catch {
      // Repair is optional and the baseline is already durable. The capability
      // is terminal locally even when the store rejects or throws.
    }
  }

  private discardLateRepair(key: string, reason: string): void {
    const repair = this.lateRepairs.get(key);
    if (repair === undefined) return;
    if (!repair.controller.signal.aborted) {
      repair.controller.abort(new DOMException(reason, "AbortError"));
    }
    this.settleLateRepair(key, {
      repairLeaseId: repair.repairLeaseId,
      outcome: "discarded",
    });
  }

  private cancelLateRepairs(): void {
    for (const key of [...this.lateRepairs.keys()]) {
      this.discardLateRepair(key, "Transcript repair was invalidated.");
    }
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
