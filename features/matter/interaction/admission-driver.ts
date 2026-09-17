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

export type AdmissionSettlement = Readonly<{
  anchor: AdmissionAnchor;
  attempt: number;
  documentEpoch: number;
  outcome: "committed" | "released";
  token: string;
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
  readonly locale: MatterLocale;
  recording?: VoiceRecording;
  transcription?: AbortController;
};

type PendingAdmissionCommit = Extract<
  AdmissionInteractionEffect,
  { readonly type: "commit-admission" }
>;

type LateRepairBasis = Readonly<{
  operation: VoiceOperation;
  repairLeaseId: string;
  nodeId: string;
  baseline: string;
  admittedAtMs: number;
  locale: MatterLocale;
}>;

type LateRepairResources = {
  basis: LateRepairBasis;
  controller: AbortController;
  repairLeaseId: string;
  timeout?: ReturnType<typeof setTimeout>;
  cancelVisibilityGate?: () => void;
  baselineVisible: boolean;
  candidate?: TranscriptRepairResult;
};

const NO_REPAIR_VOCABULARY: readonly string[] = Object.freeze([]);

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
  private readonly pendingLocales = new Map<string, MatterLocale>();
  private readonly events: AdmissionInteractionEvent[] = [];
  private voice: VoicePort | null = null;
  private processing = false;
  private disposed = false;
  private leases = 0;
  private leaseGeneration = 0;
  private activeSettlementOrigin: Omit<AdmissionSettlement, "outcome"> | null = null;
  private settlement: AdmissionSettlement | null = null;
  private pendingCommit: PendingAdmissionCommit | null = null;
  private deliveryWindowOpen = true;
  private deliveryTargetVisible = true;
  private deliveryVisibleNodeIds = new Set<string>();

  constructor(dependencies: AdmissionDriverDependencies) {
    this.dependencies = dependencies;
  }

  getState(): AdmissionInteractionState {
    return this.state;
  }

  getSettlement(): AdmissionSettlement | null {
    return this.settlement;
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

  start(anchor: AdmissionAnchor, locale = this.dependencies.locale): void {
    if (this.disposed || this.state.phase !== "idle") return;
    const token = this.dependencies.createInteractionId();
    this.pendingLocales.set(operationKey({ interactionId: token, attempt: 1 }), locale);
    this.send({
      type: "start",
      token,
      anchor,
    });
    if (!stateOwnsOperation(this.state, { interactionId: token, attempt: 1 })) {
      this.pendingLocales.delete(operationKey({ interactionId: token, attempt: 1 }));
    }
  }

  stop(): void {
    this.send({ type: "stop" });
  }

  cancel(): void {
    this.send({ type: "cancel" });
  }

  /** Cancels only microphone work that the person has not submitted yet. */
  cancelRawCapture(): void {
    if (admissionRawCaptureOwnsOperation(this.state)) this.send({ type: "cancel" });
  }

  retry(locale = this.dependencies.locale): void {
    if (this.state.phase !== "error") return;
    const operation = {
      interactionId: this.state.token,
      attempt: this.state.attempt + 1,
    };
    this.pendingLocales.set(operationKey(operation), locale);
    this.send({ type: "retry" });
    if (!stateOwnsOperation(this.state, operation)) {
      this.pendingLocales.delete(operationKey(operation));
    }
  }

  dismiss(): void {
    this.send({ type: "dismiss" });
  }

  suspendCapture(): void {
    this.setDeliveryWindowOpen(false);
    if (admissionRawCaptureOwnsOperation(this.state)) {
      this.cancelRawCapture();
      return;
    }
    // Permission and live-capture errors precede submission, so their surface
    // can leave with the hidden capture UI. A failure after Stop still belongs
    // to an accepted user action; keep its recovery state for the next visible
    // delivery window instead of making event timing decide whether it exists.
    if (this.state.phase === "error" && !this.state.submitted) {
      this.send({ type: "dismiss" });
    }
  }

  resumeDelivery(): void {
    this.setDeliveryWindowOpen(true);
  }

  setDeliveryWindowOpen(open: boolean): void {
    this.deliveryWindowOpen = open;
    if (open) {
      this.deliverPendingCommitIfReady();
      this.deliverLateRepairsIfReady();
    }
  }

  setDeliveryTargetVisible(visible: boolean): void {
    this.deliveryTargetVisible = visible;
    if (visible) this.deliverPendingCommitIfReady();
  }

  setDeliveryVisibleNodeIds(nodeIds: ReadonlySet<string>): void {
    this.deliveryVisibleNodeIds = new Set(nodeIds);
    this.deliverLateRepairsIfReady();
  }

  exit(): void {
    this.send({ type: "unmount" });
    this.pendingLocales.clear();
    this.pendingCommit = null;
    this.cancelLateRepairs();
  }

  updateScope(scope: AdmissionScope): void {
    if (this.disposed || (this.scope !== null && sameScope(this.scope, scope))) return;
    const previous = this.scope;
    this.scope = ownScope(scope);
    if (
      previous !== null &&
      (previous.treeId !== scope.treeId ||
        (previous.documentEpoch ?? 0) !== (scope.documentEpoch ?? 0))
    ) {
      this.cancelLateRepairs();
      this.send({ type: "scope-invalidated" });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.send({ type: "unmount" });
    this.disposed = true;
    for (const resources of [...this.resources.values()]) {
      this.cleanup(resources.operation);
    }
    this.cancelLateRepairs();
    this.pendingLocales.clear();
    this.pendingCommit = null;
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
        const previousState = this.state;
        const result = reduceAdmissionInteraction(previousState, nextEvent);
        if (result.state !== previousState) {
          if (result.state.phase !== "idle" && (
            previousState.phase === "idle" ||
            previousState.attempt !== result.state.attempt
          )) {
            this.activeSettlementOrigin = Object.freeze({
              anchor: result.state.anchor,
              attempt: result.state.attempt,
              documentEpoch: this.scope?.documentEpoch ?? 0,
              token: result.state.token,
            });
            this.settlement = null;
          } else if (result.state.phase === "idle" && previousState.phase !== "idle") {
            const origin = this.activeSettlementOrigin;
            this.settlement = origin === null ? null : Object.freeze({
              ...origin,
              outcome: nextEvent.type === "commit-succeeded" ? "committed" : "released",
            });
            this.activeSettlementOrigin = null;
          }
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
          locale: this.pendingLocales.get(key) ?? this.dependencies.locale,
        });
        this.pendingLocales.delete(key);
        const owned = this.resources.get(key);
        if (owned === undefined) return;
        void voice.start(operation, {
          locale: owned.locale,
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
          onOwnershipRevoked: (revoked) => {
            if (
              sameVoiceOperation(operation, revoked) &&
              admissionRawCaptureOwnsOperation(this.state, operation)
            ) this.send({ type: "cancel" });
          },
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
          locale: owned.locale,
          durationMs: owned.recording.durationMs,
          audio: owned.recording.audio,
          signal: controller.signal,
        }).then(
          (result) => {
            if (
              result.interactionId !== effect.token ||
              result.attempt !== effect.attempt
            ) {
              this.send(failureEvent(
                "transcription-failed",
                effect,
                "TRANSCRIPTION_FAILED",
              ));
              return;
            }
            this.send({
              type: "transcription-succeeded",
              token: effect.token,
              attempt: effect.attempt,
              transcript: result.transcript,
            });
          },
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
        if (!this.deliveryWindowOpen || !this.deliveryTargetVisible) {
          this.pendingCommit = effect;
          return;
        }
        this.pendingCommit = null;
        let receipt: AdmissionStoreReceipt;
        const owned = this.resources.get(key);
        if (owned === undefined) {
          this.send(failureEvent("commit-failed", effect, "INTERNAL_FAILURE"));
          return;
        }
        const nodeId = this.dependencies.createMaterialId();
        const admittedAt = this.dependencies.canonicalNow();
        const admittedAtMs = this.dependencies.monotonicNow();
        const baseline = normalizeAdmittedTranscript(effect.transcript, owned.locale);
        try {
          receipt = this.dependencies.commit(toRuntimeAnchor(effect.anchor), {
            interactionId: effect.token,
            commandId: `human_admission_${effect.token}_${effect.attempt}`,
            nodeId,
            createdAt: admittedAt,
            transcript: baseline,
            admittedAtMs,
            repairLocale: owned.locale,
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
              nodeId,
              baseline,
              admittedAtMs,
              locale: owned.locale,
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
    this.pendingLocales.delete(key);
    if (
      this.pendingCommit?.token === operation.interactionId &&
      this.pendingCommit.attempt === operation.attempt
    ) this.pendingCommit = null;
  }

  private startLateRepair(input: LateRepairBasis): void {
    if (this.disposed) return;
    const key = input.repairLeaseId;
    const controller = new AbortController();
    const resources: LateRepairResources = {
      basis: input,
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
          this.commitLateRepairIfReady(key);
        },
      );
    } catch {
      this.discardLateRepair(key, "Transcript repair presentation gate failed.");
      return;
    }
    this.runLateRepair(key);
  }

  private runLateRepair(key: string): void {
    const resources = this.lateRepairs.get(key);
    if (resources === undefined || resources.controller.signal.aborted) return;
    const input = resources.basis;
    // Starting through a resolved promise contains a port that throws before
    // returning its promise just as strictly as an asynchronous rejection.
    void Promise.resolve()
      .then(() => this.dependencies.repair.repair({
        operationId: input.operation.interactionId,
        attempt: input.operation.attempt,
        text: input.baseline,
        locale: input.locale,
        // Admission does not own the active working-context projection. Empty
        // is the only safe hint until that owner can be captured synchronously.
        vocabulary: NO_REPAIR_VOCABULARY,
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
        this.commitLateRepairIfReady(key);
      })
      .catch(() => {
        this.discardLateRepair(key, "Transcript repair adapter failed.");
      });
  }

  private commitLateRepairIfReady(key: string): void {
    const resources = this.lateRepairs.get(key);
    if (
      resources === undefined ||
      resources.controller.signal.aborted ||
      !resources.baselineVisible ||
      resources.candidate === undefined ||
      !this.deliveryWindowOpen ||
      !this.deliveryVisibleNodeIds.has(resources.basis.nodeId)
    ) return;
    const input = resources.basis;
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

  private deliverPendingCommitIfReady(): void {
    const pending = this.pendingCommit;
    if (pending === null || !this.deliveryWindowOpen || !this.deliveryTargetVisible) return;
    this.runEffect(pending);
  }

  private deliverLateRepairsIfReady(): void {
    if (!this.deliveryWindowOpen) return;
    for (const key of [...this.lateRepairs.keys()]) {
      this.commitLateRepairIfReady(key);
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

function sameVoiceOperation(left: VoiceOperation, right: VoiceOperation): boolean {
  return left.interactionId === right.interactionId && left.attempt === right.attempt;
}

function stateOwnsOperation(
  state: AdmissionInteractionState,
  operation: VoiceOperation,
): boolean {
  return state.phase !== "idle" &&
    state.token === operation.interactionId &&
    state.attempt === operation.attempt;
}

function admissionRawCaptureOwnsOperation(
  state: AdmissionInteractionState,
  operation?: VoiceOperation,
): boolean {
  // Stop is the submission boundary. The recorder may still be flushing final
  // chunks in `stopping`, but visibility, modal acquisition, or a late device
  // revocation must not reinterpret that accepted action as raw capture.
  if (state.phase !== "requesting" && state.phase !== "recording") return false;
  return operation === undefined || (
    state.token === operation.interactionId && state.attempt === operation.attempt
  );
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
