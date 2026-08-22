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

/**
 * Arbitrates the one browser Voice lease shared by otherwise independent
 * Matter lifecycles. The lease remains authoritative through transcription;
 * the owning lifecycle releases it with `cancel` after its terminal effect.
 */
export class VoiceLeaseCoordinator {
  private active: Lease | null = null;

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
    if (this.active?.owner === owner) {
      return Promise.reject(new VoiceError("RECORDING_ACTIVE"));
    }
    const previous = this.active;
    const lease: Lease = Object.freeze({
      owner,
      port,
      operation: Object.freeze({ ...operation }),
      callbacks,
    });
    // Publish the successor before notifying the previous lifecycle. Even a
    // re-entrant callback then observes and participates in the same ordering.
    this.active = lease;
    if (previous !== null) this.revoke(previous);
    if (!this.owns(lease)) {
      return Promise.reject(new VoiceError("RECORDING_CANCELLED"));
    }

    let starting: Promise<void>;
    try {
      starting = port.start(lease.operation, this.guardCallbacks(lease));
    } catch (error) {
      this.release(lease);
      return Promise.reject(error);
    }
    return starting.then(
      () => {
        if (!this.owns(lease)) throw new VoiceError("RECORDING_CANCELLED");
      },
      (error: unknown) => {
        this.release(lease);
        throw error;
      },
    );
  }

  private stop(
    owner: symbol,
    port: VoicePort,
    operation: VoiceOperation,
  ): Promise<VoiceRecording> {
    const lease = this.active;
    if (
      lease === null ||
      lease.owner !== owner ||
      lease.port !== port ||
      !sameOperation(lease.operation, operation)
    ) {
      return Promise.reject(new VoiceError("RECORDING_NOT_ACTIVE"));
    }

    let stopping: Promise<VoiceRecording>;
    try {
      stopping = port.stop(lease.operation);
    } catch (error) {
      this.release(lease);
      return Promise.reject(error);
    }
    return stopping.then(
      (recording) => {
        if (!this.owns(lease)) throw new VoiceError("RECORDING_CANCELLED");
        if (!sameOperation(lease.operation, recording.operation)) {
          // A transport result is not authoritative merely because the lease
          // survived. Revoke the malformed result before any consumer can
          // treat its native transcript or audio as the current operation.
          this.release(lease);
          safelyCancel(lease);
          throw new VoiceError("RECORDING_FAILED");
        }
        return recording;
      },
      (error: unknown) => {
        this.release(lease);
        throw error;
      },
    );
  }

  private cancel(owner: symbol, port: VoicePort, operation: VoiceOperation): void {
    const lease = this.active;
    if (
      lease === null ||
      lease.owner !== owner ||
      lease.port !== port ||
      !sameOperation(lease.operation, operation)
    ) return;
    this.active = null;
    safelyCancel(lease);
  }

  private revoke(lease: Lease): void {
    // The successor is already authoritative: abort(), permission, recorder,
    // and transcript callbacks can all settle synchronously in browsers.
    safelyCancel(lease);
    safelyNotify(() => lease.callbacks.onOwnershipRevoked?.(lease.operation));
  }

  private guardCallbacks(lease: Lease): VoiceCallbacks {
    return Object.freeze({
      ...voiceCapture(lease.callbacks),
      onSample: (sample) => {
        if (this.owns(lease)) safelyNotify(() => lease.callbacks.onSample?.(sample));
      },
      onTranscript: (transcript) => {
        if (this.owns(lease)) safelyNotify(() => lease.callbacks.onTranscript?.(transcript));
      },
      onDurationLimit: (operation) => {
        if (this.owns(lease) && sameOperation(lease.operation, operation)) {
          safelyNotify(() => lease.callbacks.onDurationLimit?.(operation));
        }
      },
      onRecording: (recording) => {
        if (this.owns(lease) && sameOperation(lease.operation, recording.operation)) {
          safelyNotify(() => lease.callbacks.onRecording?.(recording));
        }
      },
      onError: (error) => {
        if (!this.owns(lease)) return;
        this.active = null;
        safelyNotify(() => lease.callbacks.onError?.(error));
      },
    });
  }

  private owns(lease: Lease): boolean {
    return this.active === lease;
  }

  private release(lease: Lease): void {
    if (this.owns(lease)) this.active = null;
  }
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
