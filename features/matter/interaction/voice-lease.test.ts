import { describe, expect, it, vi } from "vitest";
import {
  VoiceError,
  type VoiceCallbacks,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
} from "./voice-port";
import { VoiceLeaseCoordinator } from "./voice-lease";

const FIRST = Object.freeze({ interactionId: "admission_1", attempt: 1 });
const SECOND = Object.freeze({ interactionId: "text_swap_1", attempt: 1 });
const THIRD = Object.freeze({ interactionId: "inquiry_1", attempt: 1 });

class ControlledVoice implements VoicePort {
  callbacks: VoiceCallbacks = {};
  operation: VoiceOperation | null = null;
  private startResolution: (() => void) | null = null;
  private startRejection: ((error: VoiceError) => void) | null = null;
  private stopResolution: ((recording: VoiceRecording) => void) | null = null;
  private stopRejection: ((error: VoiceError) => void) | null = null;
  readonly cancel = vi.fn((operation: VoiceOperation) => {
    if (
      this.operation?.interactionId === operation.interactionId &&
      this.operation.attempt === operation.attempt
    ) {
      this.startRejection?.(new VoiceError("RECORDING_CANCELLED"));
      this.stopRejection?.(new VoiceError("RECORDING_CANCELLED"));
    }
  });

  start(operation: VoiceOperation, callbacks: VoiceCallbacks = {}): Promise<void> {
    this.operation = operation;
    this.callbacks = callbacks;
    return new Promise((resolve, reject) => {
      this.startResolution = resolve;
      this.startRejection = reject;
    });
  }

  stop(): Promise<VoiceRecording> {
    return new Promise((resolve, reject) => {
      this.stopResolution = resolve;
      this.stopRejection = reject;
    });
  }

  grant(): void {
    this.startResolution?.();
  }

  finish(operation = this.operation): void {
    if (operation === null) throw new Error("missing operation");
    this.stopResolution?.(Object.freeze({
      operation,
      audio: new Blob(["voice"], { type: "audio/webm" }),
      durationMs: 400,
    }));
  }

  failStop(error = new VoiceError("RECORDING_NOT_ACTIVE")): void {
    this.stopRejection?.(error);
  }

  failStartTwice(error: VoiceError): void {
    this.callbacks.onError?.(error);
    this.startRejection?.(error);
  }
}

describe("VoiceLeaseCoordinator", () => {
  it("atomically revokes the previous lifecycle and gates its late callbacks", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);
    const revoked = vi.fn();
    const oldTranscript = vi.fn();

    const firstStarted = first.start(FIRST, {
      onOwnershipRevoked: revoked,
      onTranscript: oldTranscript,
    });
    const secondStarted = second.start(SECOND);

    expect(firstRaw.cancel).toHaveBeenCalledWith(FIRST);
    expect(revoked).toHaveBeenCalledWith(FIRST);
    firstRaw.callbacks.onTranscript?.("late permission transcript");
    expect(oldTranscript).not.toHaveBeenCalled();

    firstRaw.grant();
    secondRaw.grant();
    await expect(firstStarted).rejects.toMatchObject({
      code: "RECORDING_CANCELLED",
    });
    await expect(secondStarted).resolves.toBeUndefined();
    second.cancel(SECOND);
  });

  it("preserves a consumer's narrower transcript capacity across coordination", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const raw = new ControlledVoice();
    const port = coordinator.coordinate(raw);
    const starting = port.start(FIRST, {
      locale: "zh-TW",
      maxTranscriptCodePoints: 240,
    });

    expect(raw.callbacks.locale).toBe("zh-TW");
    expect(raw.callbacks.maxTranscriptCodePoints).toBe(240);
    raw.grant();
    await starting;
    port.cancel(FIRST);
  });

  it("preserves one typed start failure when an adapter also invokes onError", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const raw = new ControlledVoice();
    const port = coordinator.coordinate(raw);
    const onError = vi.fn();
    const starting = port.start(FIRST, { onError });

    raw.failStartTwice(new VoiceError("MICROPHONE_DENIED"));

    await expect(starting).rejects.toMatchObject({ code: "MICROPHONE_DENIED" });
    expect(onError).not.toHaveBeenCalled();
    expect(raw.cancel).toHaveBeenCalledWith(FIRST);
  });

  it("releases a finalized recording before another owner begins capture", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);
    const revoked = vi.fn();

    const starting = first.start(FIRST, { onOwnershipRevoked: revoked });
    firstRaw.grant();
    await starting;
    const stopping = first.stop(FIRST);
    firstRaw.finish();
    await expect(stopping).resolves.toMatchObject({ operation: FIRST });

    const secondStarting = second.start(SECOND);
    expect(revoked).not.toHaveBeenCalled();
    expect(firstRaw.cancel).not.toHaveBeenCalled();
    secondRaw.grant();
    await secondStarting;
    second.cancel(SECOND);
  });

  it("queues a successor behind final recorder settlement without cancelling submitted audio", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);

    const firstStarting = first.start(FIRST);
    firstRaw.grant();
    await firstStarting;
    const stopping = first.stop(FIRST);
    const secondStarting = second.start(SECOND);

    expect(secondRaw.operation).toBeNull();
    expect(firstRaw.cancel).not.toHaveBeenCalled();
    firstRaw.finish();
    await expect(stopping).resolves.toMatchObject({ operation: FIRST });
    expect(secondRaw.operation).toEqual(SECOND);
    secondRaw.grant();
    await expect(secondStarting).resolves.toBeUndefined();
    second.cancel(SECOND);
  });

  it("cancels a permission-pending transport before promoting after Stop fails", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);

    const firstStarting = first.start(FIRST);
    const firstStartOutcome = expect(firstStarting).rejects.toMatchObject({
      code: "RECORDING_CANCELLED",
    });
    const stopping = first.stop(FIRST);
    const stopOutcome = expect(stopping).rejects.toMatchObject({
      code: "RECORDING_NOT_ACTIVE",
    });
    const secondStarting = second.start(SECOND);
    firstRaw.failStop();

    await Promise.all([firstStartOutcome, stopOutcome]);
    expect(firstRaw.cancel).toHaveBeenCalledWith(FIRST);
    expect(secondRaw.operation).toEqual(SECOND);
    secondRaw.grant();
    await expect(secondStarting).resolves.toBeUndefined();
    second.cancel(SECOND);
  });

  it("keeps only the newest deferred voice intent while a submitted stop settles", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const thirdRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);
    const third = coordinator.coordinate(thirdRaw);
    const secondRevoked = vi.fn();

    const firstStarting = first.start(FIRST);
    firstRaw.grant();
    await firstStarting;
    const stopping = first.stop(FIRST);
    const secondStarting = second.start(SECOND, { onOwnershipRevoked: secondRevoked });
    const secondOutcome = expect(secondStarting).rejects.toMatchObject({
      code: "RECORDING_CANCELLED",
    });
    const thirdStarting = third.start(THIRD);

    await secondOutcome;
    expect(secondRevoked).toHaveBeenCalledWith(SECOND);
    expect(secondRaw.operation).toBeNull();
    firstRaw.finish();
    await stopping;
    expect(thirdRaw.operation).toEqual(THIRD);
    thirdRaw.grant();
    await thirdStarting;
    third.cancel(THIRD);
  });

  it("can cancel a queued intent without disturbing the submitted owner", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);

    const firstStarting = first.start(FIRST);
    firstRaw.grant();
    await firstStarting;
    const stopping = first.stop(FIRST);
    const secondStarting = second.start(SECOND);
    const secondOutcome = expect(secondStarting).rejects.toMatchObject({
      code: "RECORDING_CANCELLED",
    });
    second.cancel(SECOND);

    await secondOutcome;
    expect(firstRaw.cancel).not.toHaveBeenCalled();
    firstRaw.finish();
    await stopping;
    expect(secondRaw.operation).toBeNull();
  });

  it("holds the native stop barrier after cancellation before promoting a queued owner", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);

    const firstStarting = first.start(FIRST);
    firstRaw.grant();
    await firstStarting;
    const stopping = first.stop(FIRST);
    const stopOutcome = expect(stopping).rejects.toMatchObject({
      code: "RECORDING_CANCELLED",
    });
    const secondStarting = second.start(SECOND);
    first.cancel(FIRST);

    expect(firstRaw.cancel).toHaveBeenCalledWith(FIRST);
    expect(secondRaw.operation).toBeNull();
    await stopOutcome;
    await Promise.resolve();
    expect(secondRaw.operation).toEqual(SECOND);
    secondRaw.grant();
    await secondStarting;
    second.cancel(SECOND);
  });

  it("rejects a stopped recording whose transport identity does not own the lease", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const raw = new ControlledVoice();
    const port = coordinator.coordinate(raw);
    const starting = port.start(FIRST);
    raw.grant();
    await starting;

    const stopping = port.stop(FIRST);
    raw.finish(SECOND);
    await expect(stopping).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    expect(raw.cancel).toHaveBeenCalledWith(FIRST);

    const restarted = port.start(FIRST);
    raw.grant();
    await expect(restarted).resolves.toBeUndefined();
    port.cancel(FIRST);
  });

  it("releases an explicit cancellation without reporting an ownership loss", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);
    const revoked = vi.fn();

    const starting = first.start(FIRST, { onOwnershipRevoked: revoked });
    firstRaw.grant();
    await starting;
    first.cancel(FIRST);
    expect(revoked).not.toHaveBeenCalled();

    const secondStarting = second.start(SECOND);
    secondRaw.grant();
    await expect(secondStarting).resolves.toBeUndefined();
    second.cancel(SECOND);
  });

  it("rejects duplicate use by one owner without disturbing its active lease", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const raw = new ControlledVoice();
    const port = coordinator.coordinate(raw);
    const starting = port.start(FIRST);
    raw.grant();
    await starting;

    await expect(port.start(SECOND)).rejects.toEqual(
      new VoiceError("RECORDING_ACTIVE"),
    );
    expect(raw.cancel).not.toHaveBeenCalled();
    port.cancel(FIRST);
  });

  it("does not let an invalid contender revoke a valid active owner", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);
    const starting = first.start(FIRST);
    firstRaw.grant();
    await starting;

    await expect(second.start({ interactionId: "", attempt: 0 })).rejects.toMatchObject({
      code: "RECORDING_FAILED",
    });
    expect(firstRaw.cancel).not.toHaveBeenCalled();
    first.cancel(FIRST);
  });

  it("keeps successor ordering atomic through a re-entrant revocation callback", async () => {
    const coordinator = new VoiceLeaseCoordinator();
    const firstRaw = new ControlledVoice();
    const secondRaw = new ControlledVoice();
    const thirdRaw = new ControlledVoice();
    const first = coordinator.coordinate(firstRaw);
    const second = coordinator.coordinate(secondRaw);
    const third = coordinator.coordinate(thirdRaw);
    let thirdStarting: Promise<void> | undefined;

    const firstStarting = first.start(FIRST, {
      onOwnershipRevoked: () => {
        thirdStarting = third.start(THIRD);
      },
    });
    firstRaw.grant();
    await firstStarting;

    await expect(second.start(SECOND)).rejects.toMatchObject({
      code: "RECORDING_CANCELLED",
    });
    expect(secondRaw.operation).toBeNull();
    thirdRaw.grant();
    await expect(thirdStarting).resolves.toBeUndefined();
    third.cancel(THIRD);
  });
});
