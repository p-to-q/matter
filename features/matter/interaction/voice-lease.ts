import {
  VoiceError,
  voiceCapture,
  type VoiceCallbacks,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
} from "./voice-port";

type Lease = {
  readonly owner: symbol;
  readonly port: VoicePort;
  readonly operation: VoiceOperation;
  readonly callbacks: VoiceCallbacks;
};

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}>;

type CurrentLease = {
  readonly lease: Lease;
  phase: "active" | "stopping";
  starting: boolean;
  startFailure: VoiceError | null;
  stop: Deferred<VoiceRecording> | null;
  cancelled: boolean;
};

type QueuedLease = Readonly<{
  lease: Lease;
  start: Deferred<void>;
}>;

/**
 * Arbitrates the one browser Voice lease shared by otherwise independent
 * Matter lifecycles. The lease owns only live capture; a finalized immutable
 * recording no longer needs the microphone and cannot be revoked by its next
 * owner while transcription is running.
 */
export class VoiceLeaseCoordinator {
  private current: CurrentLease | null = null;
  private queued: QueuedLease | null = null;

  coordinate(port: VoicePort): VoicePort {
    const owner = Symbol("matter-voice-owner");
    return Object.freeze({
      start: (operation: VoiceOperation, callbacks?: VoiceCallbacks) =>
        this.start(owner, port, operation, callbacks ?? {}),
      stop: (operation: VoiceOperation) => this.stop(owner, port, operation),
      cancel: (operation: VoiceOperation) => this.cancel(owner, port, operation),
    });
  }

  private start(
    owner: symbol,
    port: VoicePort,
    operation: VoiceOperation,
    callbacks: VoiceCallbacks,
  ): Promise<void> {
    if (!validOperation(operation)) {
      return Promise.reject(new VoiceError("RECORDING_FAILED"));
    }
    if (
      this.current?.lease.owner === owner ||
      this.queued?.lease.owner === owner
    ) {
      return Promise.reject(new VoiceError("RECORDING_ACTIVE"));
    }
    const lease: Lease = Object.freeze({
      owner,
      port,
      operation: Object.freeze({ ...operation }),
      callbacks,
    });
    if (this.current?.phase === "stopping") return this.enqueue(lease);
    return this.begin(lease);
  }

  private begin(lease: Lease): Promise<void> {
    const previous = this.current?.lease ?? null;
    // Publish the successor before notifying the previous lifecycle. Even a
    // re-entrant callback then observes and participates in the same ordering.
    this.current = {
      lease,
      phase: "active",
      starting: true,
      startFailure: null,
      stop: null,
      cancelled: false,
    };
    if (previous !== null) this.revoke(previous);
    if (!this.owns(lease)) {
      return Promise.reject(new VoiceError("RECORDING_CANCELLED"));
    }

    let starting: Promise<void>;
    try {
      starting = lease.port.start(lease.operation, this.guardCallbacks(lease));
    } catch (error) {
      safelyCancel(lease);
      this.releaseAndPromote(lease);
      return Promise.reject(error);
    }
    return starting.then(
      () => {
        if (!this.owns(lease)) {
          safelyCancel(lease);
          throw new VoiceError("RECORDING_CANCELLED");
        }
        const current = this.current!;
        if (current.startFailure !== null) {
          const failure = current.startFailure;
          safelyCancel(lease);
          this.releaseAndPromote(lease);
          throw failure;
        }
        current.starting = false;
      },
      (error: unknown) => {
        if (!this.owns(lease)) {
          safelyCancel(lease);
          throw new VoiceError("RECORDING_CANCELLED");
        }
        // A rejected start is not proof that the transport released a pending
        // permission request or native singleton. Revoke it before forgetting
        // the only operation identity that can perform that cleanup.
        safelyCancel(lease);
        this.releaseAndPromote(lease);
        throw error;
      },
    );
  }

  private enqueue(lease: Lease): Promise<void> {
    const contender: QueuedLease = Object.freeze({
      lease,
      start: deferred<void>(),
    });
    const previous = this.queued;
    // Only one deferred microphone intent remains meaningful. Publish the
    // latest before notifying the superseded contender so re-entrant starts
    // observe one deterministic owner.
    this.queued = contender;
    if (previous !== null) this.revokeQueued(previous);
    return contender.start.promise;
  }

  private stop(
    owner: symbol,
    port: VoicePort,
    operation: VoiceOperation,
  ): Promise<VoiceRecording> {
    const current = this.current;
    if (
      current === null ||
      current.lease.owner !== owner ||
      current.lease.port !== port ||
      !sameOperation(current.lease.operation, operation)
    ) {
      return Promise.reject(new VoiceError("RECORDING_NOT_ACTIVE"));
    }
    const lease = current.lease;
    if (current.phase === "stopping") return current.stop!.promise;

    current.phase = "stopping";
    current.stop = deferred<VoiceRecording>();
    let stopping: Promise<VoiceRecording>;
    try {
      stopping = port.stop(lease.operation);
    } catch (error) {
      current.stop.reject(error);
      safelyCancel(lease);
      this.releaseAndPromote(lease);
      return current.stop.promise;
    }
    void stopping.then(
      (recording) => {
        if (!this.owns(lease)) {
          current.stop?.reject(new VoiceError("RECORDING_CANCELLED"));
          return;
        }
        if (current.cancelled) {
          current.stop?.reject(new VoiceError("RECORDING_CANCELLED"));
          this.releaseAndPromote(lease);
          return;
        }
        if (!sameOperation(lease.operation, recording.operation)) {
          // A transport result is not authoritative merely because the lease
          // survived. Revoke the malformed result before any consumer can
          // treat its native transcript or audio as the current operation.
          safelyCancel(lease);
          current.stop?.reject(new VoiceError("RECORDING_FAILED"));
          this.releaseAndPromote(lease);
          return;
        }
        current.stop?.resolve(recording);
        this.releaseAndPromote(lease);
      },
      (error: unknown) => {
        current.stop?.reject(error);
        // In particular, Stop can race a still-pending permission request.
        // A NOT_ACTIVE result must cancel that raw request before a successor
        // is promoted or a late grant can start an orphaned recorder.
        safelyCancel(lease);
        this.releaseAndPromote(lease);
      },
    );
    return current.stop.promise;
  }

  private cancel(owner: symbol, port: VoicePort, operation: VoiceOperation): void {
    const queued = this.queued;
    if (
      queued !== null &&
      queued.lease.owner === owner &&
      queued.lease.port === port &&
      sameOperation(queued.lease.operation, operation)
    ) {
      this.queued = null;
      queued.start.reject(new VoiceError("RECORDING_CANCELLED"));
      return;
    }
    const current = this.current;
    const lease = current?.lease ?? null;
    if (
      lease === null ||
      lease.owner !== owner ||
      lease.port !== port ||
      !sameOperation(lease.operation, operation)
    ) return;
    if (current?.phase === "stopping") {
      // Keep the native session as the resource barrier until its stop promise
      // settles. Starting a successor immediately after abort() is not safe on
      // browser-speech implementations that still own the UA singleton.
      current.cancelled = true;
      current.stop?.reject(new VoiceError("RECORDING_CANCELLED"));
      safelyCancel(lease);
      return;
    }
    this.current = null;
    safelyCancel(lease);
    this.promoteQueued();
  }

  private revoke(lease: Lease): void {
    // The successor is already authoritative: abort(), permission, recorder,
    // and transcript callbacks can all settle synchronously in browsers.
    safelyCancel(lease);
    safelyNotify(() => lease.callbacks.onOwnershipRevoked?.(lease.operation));
  }

  private revokeQueued(contender: QueuedLease): void {
    contender.start.reject(new VoiceError("RECORDING_CANCELLED"));
    safelyNotify(() => contender.lease.callbacks.onOwnershipRevoked?.(
      contender.lease.operation,
    ));
  }

  private guardCallbacks(lease: Lease): VoiceCallbacks {
    return Object.freeze({
      ...voiceCapture(lease.callbacks),
      onSample: (sample) => {
        if (this.acceptsCallbacks(lease)) safelyNotify(() => lease.callbacks.onSample?.(sample));
      },
      onTranscript: (transcript) => {
        if (this.acceptsCallbacks(lease)) safelyNotify(() => lease.callbacks.onTranscript?.(transcript));
      },
      onDurationLimit: (operation) => {
        if (this.acceptsCallbacks(lease) && sameOperation(lease.operation, operation)) {
          safelyNotify(() => lease.callbacks.onDurationLimit?.(operation));
        }
      },
      onRecording: (recording) => {
        if (this.acceptsCallbacks(lease) && sameOperation(lease.operation, recording.operation)) {
          safelyNotify(() => lease.callbacks.onRecording?.(recording));
        }
      },
      onError: (error) => {
        if (!this.acceptsCallbacks(lease)) return;
        const current = this.current!;
        if (current.starting) {
          // Some native adapters report acquisition failure both through the
          // callback and the start promise. The promise owns that boundary;
          // remembering the callback also contains an adapter that resolves
          // after reporting failure instead of leaking a false grant.
          current.startFailure ??= error;
          return;
        }
        this.current?.stop?.reject(error);
        this.releaseAndPromote(lease);
        safelyNotify(() => lease.callbacks.onError?.(error));
      },
    });
  }

  private owns(lease: Lease): boolean {
    return this.current?.lease === lease;
  }

  private acceptsCallbacks(lease: Lease): boolean {
    return this.current?.lease === lease && !this.current.cancelled;
  }

  private releaseAndPromote(lease: Lease): void {
    if (!this.owns(lease)) return;
    this.current = null;
    this.promoteQueued();
  }

  private promoteQueued(): void {
    if (this.current !== null || this.queued === null) return;
    const contender = this.queued;
    this.queued = null;
    void this.begin(contender.lease).then(
      contender.start.resolve,
      contender.start.reject,
    );
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return Object.freeze({ promise, resolve, reject });
}

function safelyCancel(lease: Lease): void {
  try {
    lease.port.cancel(lease.operation);
  } catch {
    // Ownership is already revoked; a broken transport cannot reclaim it.
  }
}

function safelyNotify(callback: () => void): void {
  try {
    callback();
  } catch {
    // Lifecycle observation cannot retain or steal the shared Voice lease.
  }
}

function sameOperation(left: VoiceOperation, right: VoiceOperation): boolean {
  return left.interactionId === right.interactionId && left.attempt === right.attempt;
}

function validOperation(operation: VoiceOperation): boolean {
  return operation.interactionId.length > 0 &&
    Number.isSafeInteger(operation.attempt) &&
    operation.attempt > 0;
}
