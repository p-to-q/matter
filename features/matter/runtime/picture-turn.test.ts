import { describe, expect, it } from "vitest";
import type { ImagePointer } from "../tree/image-pointer";
import {
  createPictureTurnState,
  failureBeforeSending,
  ownsPictureRequest,
  reducePictureTurn,
  type GeneratedPicture,
  type PictureTurnEvent,
  type PictureTurnPhase,
  type PictureTurnState,
} from "./picture-turn";

const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: 4,
  width: 512,
  height: 512,
  contentHash: "a".repeat(64),
};
const PICTURE: GeneratedPicture = { bytes: new Uint8Array([1, 2, 3, 4]), pointer: POINTER };
const REQUEST = "req-1";

const PHASES: readonly PictureTurnPhase[] = [
  "idle", "arming", "drawing", "arrived", "accepted", "discarded",
  "failed-retryable", "failed-final", "stale", "cancelled",
];

function stateIn(phase: PictureTurnPhase, billed = false): PictureTurnState {
  const base = { priorAttemptMayHaveBeenBilled: billed };
  switch (phase) {
    case "drawing": return { ...base, phase, requestId: REQUEST };
    case "arrived": return { ...base, phase, picture: PICTURE };
    case "failed-retryable": return { ...base, phase, reason: "server-error:RATE_LIMITED" };
    case "failed-final": return { ...base, phase, reason: "network" };
    default: return { ...base, phase };
  }
}

const EVENTS: Readonly<Record<string, PictureTurnEvent>> = {
  arm: { type: "arm" },
  back: { type: "back" },
  confirm: { type: "confirm", requestId: "req-2" },
  "confirm-invalid-id": { type: "confirm", requestId: "has space" },
  "arrived-current": { type: "arrived", requestId: REQUEST, picture: PICTURE },
  "arrived-other": { type: "arrived", requestId: "req-other", picture: PICTURE },
  "failed-current-retryable": { type: "failed", requestId: REQUEST, reason: "server-error:RATE_LIMITED", retryable: true },
  "failed-current-final": { type: "failed", requestId: REQUEST, reason: "timeout", retryable: false },
  "failed-other": { type: "failed", requestId: "req-other", reason: "timeout", retryable: false },
  accept: { type: "accept" },
  discard: { type: "discard" },
  stale: { type: "stale" },
  "stop-waiting": { type: "stop-waiting" },
};

// Every phase against every event. "same" means the identical state object.
const S = "same";
const TABLE: Readonly<Record<PictureTurnPhase, Readonly<Record<string, PictureTurnPhase | typeof S>>>> = {
  idle: {
    arm: "arming", back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
  arming: {
    arm: S, back: "idle", confirm: "drawing", "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: "stale", "stop-waiting": S,
  },
  drawing: {
    arm: S, back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": "arrived", "arrived-other": S,
    "failed-current-retryable": "failed-retryable", "failed-current-final": "failed-final", "failed-other": S,
    accept: S, discard: S, stale: "stale", "stop-waiting": "cancelled",
  },
  arrived: {
    arm: S, back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: "accepted", discard: "discarded", stale: "stale", "stop-waiting": S,
  },
  accepted: {
    arm: S, back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
  discarded: {
    arm: "arming", back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
  "failed-retryable": {
    arm: "arming", back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
  "failed-final": {
    arm: "arming", back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
  stale: {
    arm: "arming", back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
  cancelled: {
    arm: "arming", back: S, confirm: S, "confirm-invalid-id": S, "arrived-current": S, "arrived-other": S,
    "failed-current-retryable": S, "failed-current-final": S, "failed-other": S,
    accept: S, discard: S, stale: S, "stop-waiting": S,
  },
};

describe("picture turn reducer", () => {
  it("covers every phase and every event in the table", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...PHASES].sort());
    for (const phase of PHASES) {
      expect(Object.keys(TABLE[phase]).sort()).toEqual(Object.keys(EVENTS).sort());
    }
  });

  describe.each(PHASES)("from %s", (phase) => {
    it.each(Object.keys(EVENTS))("%s", (eventName) => {
      const state = stateIn(phase);
      const result = reducePictureTurn(state, EVENTS[eventName]!);
      const expected = TABLE[phase][eventName]!;
      if (expected === S) {
        expect(result.state).toBe(state);
        expect(result.effects).toEqual([]);
      } else {
        expect(result.state.phase).toBe(expected);
        expect(result.state).not.toBe(state);
      }
    });
  });

  describe("laws", () => {
    it("starts idle, unbilled", () => {
      expect(createPictureTurnState()).toEqual({ phase: "idle", priorAttemptMayHaveBeenBilled: false });
    });

    it("sends nothing on arm: the cost statement is shown before any request exists", () => {
      const result = reducePictureTurn(createPictureTurnState(), { type: "arm" });
      expect(result.state.phase).toBe("arming");
      expect(result.effects).toEqual([]);
    });

    it("sends exactly one request on confirm and none on a second confirm", () => {
      const armed = reducePictureTurn(createPictureTurnState(), { type: "arm" }).state;
      const first = reducePictureTurn(armed, { type: "confirm", requestId: REQUEST });
      expect(first.state).toEqual({ phase: "drawing", requestId: REQUEST, priorAttemptMayHaveBeenBilled: false });
      expect(first.effects).toEqual([{ type: "request-picture", requestId: REQUEST }]);

      const second = reducePictureTurn(first.state, { type: "confirm", requestId: "req-2" });
      expect(second.state).toBe(first.state);
      expect(second.effects).toEqual([]);
      expect((second.state as { requestId: string }).requestId).toBe(REQUEST);
    });

    it("accepts only a picture that has arrived", () => {
      for (const phase of PHASES.filter((candidate) => candidate !== "arrived")) {
        const state = stateIn(phase);
        expect(reducePictureTurn(state, { type: "accept" }).state).toBe(state);
      }
      const arrived = stateIn("arrived");
      expect(reducePictureTurn(arrived, { type: "accept" }).state.phase).toBe("accepted");
    });

    it("ignores a settlement for a request it does not own", () => {
      const drawing = stateIn("drawing");
      expect(ownsPictureRequest(drawing, REQUEST)).toBe(true);
      expect(ownsPictureRequest(drawing, "req-other")).toBe(false);
      expect(ownsPictureRequest(stateIn("arming"), REQUEST)).toBe(false);
      expect(reducePictureTurn(drawing, EVENTS["arrived-other"]!).state).toBe(drawing);
      expect(reducePictureTurn(drawing, EVENTS["failed-other"]!).state).toBe(drawing);
    });

    it("ignores a late answer after the person stopped waiting", () => {
      const cancelled = reducePictureTurn(stateIn("drawing"), { type: "stop-waiting" }).state;
      expect(reducePictureTurn(cancelled, EVENTS["arrived-current"]!).state).toBe(cancelled);
      expect(reducePictureTurn(cancelled, EVENTS["failed-current-final"]!).state).toBe(cancelled);
    });

    it("ignores a late answer after the turn went stale", () => {
      const stale = reducePictureTurn(stateIn("drawing"), { type: "stale" }).state;
      expect(reducePictureTurn(stale, EVENTS["arrived-current"]!).state).toBe(stale);
    });

    it("keeps the picture in the arrived state and the reason in a failed state", () => {
      const arrived = reducePictureTurn(stateIn("drawing"), EVENTS["arrived-current"]!).state;
      expect(arrived).toMatchObject({ phase: "arrived", picture: PICTURE });
      const failed = reducePictureTurn(stateIn("drawing"), EVENTS["failed-current-final"]!).state;
      expect(failed).toMatchObject({ phase: "failed-final", reason: "timeout" });
      const retryable = reducePictureTurn(stateIn("drawing"), EVENTS["failed-current-retryable"]!).state;
      expect(retryable).toMatchObject({ phase: "failed-retryable", reason: "server-error:RATE_LIMITED" });
    });

    it("asks the driver to abort when waiting ends, and only then", () => {
      const stop = reducePictureTurn(stateIn("drawing"), { type: "stop-waiting" });
      expect(stop.effects).toEqual([{ type: "abort-request", requestId: REQUEST }]);
      const stale = reducePictureTurn(stateIn("drawing"), { type: "stale" });
      expect(stale.effects).toEqual([{ type: "abort-request", requestId: REQUEST }]);
      for (const phase of ["arming", "arrived"] as const) {
        expect(reducePictureTurn(stateIn(phase), { type: "stale" }).effects).toEqual([]);
      }
      expect(reducePictureTurn(stateIn("drawing"), EVENTS["arrived-current"]!).effects).toEqual([]);
      expect(reducePictureTurn(stateIn("drawing"), EVENTS["failed-current-final"]!).effects).toEqual([]);
    });

    it("freezes state and effects but never the caller's bytes", () => {
      const result = reducePictureTurn(stateIn("drawing"), EVENTS["arrived-current"]!);
      expect(Object.isFrozen(result.state)).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(PICTURE.bytes)).toBe(false);
      const confirm = reducePictureTurn(stateIn("arming"), { type: "confirm", requestId: REQUEST });
      expect(Object.isFrozen(confirm.effects)).toBe(true);
      expect(Object.isFrozen(confirm.effects[0])).toBe(true);
    });

    it("does not mutate the state it was given", () => {
      const state = stateIn("drawing");
      const snapshot = JSON.stringify(state);
      reducePictureTurn(state, { type: "stop-waiting" });
      reducePictureTurn(state, EVENTS["failed-current-final"]!);
      expect(JSON.stringify(state)).toBe(snapshot);
    });
  });

  describe("the billed flag", () => {
    const run = (events: readonly PictureTurnEvent[]) =>
      events.reduce((state, event) => reducePictureTurn(state, event).state, createPictureTurnState());
    const toDrawing: PictureTurnEvent[] = [{ type: "arm" }, { type: "confirm", requestId: REQUEST }];

    it("is false for a clean first attempt", () => {
      expect(run([...toDrawing, EVENTS["arrived-current"]!]).priorAttemptMayHaveBeenBilled).toBe(false);
    });

    it("is set by a non-retryable failure and recorded on the next arm", () => {
      const failed = run([...toDrawing, EVENTS["failed-current-final"]!]);
      expect(failed.phase).toBe("failed-final");
      expect(failed.priorAttemptMayHaveBeenBilled).toBe(true);
      const rearmed = reducePictureTurn(failed, { type: "arm" }).state;
      expect(rearmed).toMatchObject({ phase: "arming", priorAttemptMayHaveBeenBilled: true });
    });

    it("is set by stop-waiting while drawing and recorded on the next arm", () => {
      const cancelled = run([...toDrawing, { type: "stop-waiting" }]);
      expect(cancelled.phase).toBe("cancelled");
      expect(cancelled.priorAttemptMayHaveBeenBilled).toBe(true);
      expect(reducePictureTurn(cancelled, { type: "arm" }).state)
        .toMatchObject({ phase: "arming", priorAttemptMayHaveBeenBilled: true });
    });

    it("is set when the turn goes stale mid-request, because the relay is still running", () => {
      const stale = run([...toDrawing, { type: "stale" }]);
      expect(stale.priorAttemptMayHaveBeenBilled).toBe(true);
    });

    it("is not set by a retryable failure: nothing was billed", () => {
      const failed = run([...toDrawing, EVENTS["failed-current-retryable"]!]);
      expect(failed.phase).toBe("failed-retryable");
      expect(failed.priorAttemptMayHaveBeenBilled).toBe(false);
      expect(reducePictureTurn(failed, { type: "arm" }).state.priorAttemptMayHaveBeenBilled).toBe(false);
    });

    it("is not set by a refusal to send because another picture is in flight: nothing was sent", () => {
      const refused = run([
        ...toDrawing,
        { type: "failed", requestId: REQUEST, reason: "another-picture-in-flight", retryable: true },
      ]);
      expect(refused).toMatchObject({
        phase: "failed-retryable",
        reason: "another-picture-in-flight",
        priorAttemptMayHaveBeenBilled: false,
      });
      expect(reducePictureTurn(refused, { type: "arm" }).state)
        .toMatchObject({ phase: "arming", priorAttemptMayHaveBeenBilled: false });
    });

    it.each(["picture-limit", "picture-unsupported"] as const)(
      "is not set by a final refusal to send (%s): nothing was sent",
      (reason) => {
        const refused = run([
          ...toDrawing,
          { type: "failed", requestId: REQUEST, reason, retryable: false },
        ]);
        expect(refused).toMatchObject({ phase: "failed-final", reason, priorAttemptMayHaveBeenBilled: false });
        expect(reducePictureTurn(refused, { type: "arm" }).state)
          .toMatchObject({ phase: "arming", priorAttemptMayHaveBeenBilled: false });
      },
    );

    it("keeps a warning already earned through a later final refusal", () => {
      const state = run([
        ...toDrawing, EVENTS["failed-current-final"]!,
        { type: "arm" },
        { type: "confirm", requestId: REQUEST },
        { type: "failed", requestId: REQUEST, reason: "picture-limit", retryable: false },
      ]);
      expect(state).toMatchObject({ phase: "failed-final", priorAttemptMayHaveBeenBilled: true });
    });

    it("names exactly the failures that leave before sending", () => {
      expect(["another-picture-in-flight", "picture-limit", "picture-unsupported"]
        .every((reason) => failureBeforeSending(reason as never))).toBe(true);
      for (const reason of ["aborted", "timeout", "network", "invalid-response", "server-error:IMAGE_FAILED"] as const) {
        expect(failureBeforeSending(reason), reason).toBe(false);
      }
    });

    it.each(["picture-limit", "picture-unsupported"] as const)(
      "is not set by a final refusal to send (%s): nothing was sent",
      (reason) => {
        const refused = run([
          ...toDrawing,
          { type: "failed", requestId: REQUEST, reason, retryable: false },
        ]);
        expect(refused).toMatchObject({ phase: "failed-final", reason, priorAttemptMayHaveBeenBilled: false });
        expect(reducePictureTurn(refused, { type: "arm" }).state)
          .toMatchObject({ phase: "arming", priorAttemptMayHaveBeenBilled: false });
      },
    );

    it("keeps a warning already earned through a later final refusal", () => {
      const state = run([
        ...toDrawing, EVENTS["failed-current-final"]!,
        { type: "arm" },
        { type: "confirm", requestId: REQUEST },
        { type: "failed", requestId: REQUEST, reason: "picture-limit", retryable: false },
      ]);
      expect(state).toMatchObject({ phase: "failed-final", priorAttemptMayHaveBeenBilled: true });
    });

    it("names exactly the failures that leave before sending", () => {
      for (const reason of ["another-picture-in-flight", "picture-limit", "picture-unsupported"] as const) {
        expect(failureBeforeSending(reason), reason).toBe(true);
      }
      for (const reason of ["aborted", "timeout", "network", "invalid-response", "server-error:IMAGE_FAILED"] as const) {
        expect(failureBeforeSending(reason), reason).toBe(false);
      }
    });

    it("is not set by leaving the arm step, a stale arm, or discarding", () => {
      expect(run([{ type: "arm" }, { type: "back" }]).priorAttemptMayHaveBeenBilled).toBe(false);
      expect(run([{ type: "arm" }, { type: "stale" }]).priorAttemptMayHaveBeenBilled).toBe(false);
      expect(run([...toDrawing, EVENTS["arrived-current"]!, { type: "discard" }]).priorAttemptMayHaveBeenBilled).toBe(false);
    });

    it("survives going back, confirming again, and receiving a picture", () => {
      const state = run([
        ...toDrawing, EVENTS["failed-current-final"]!,
        { type: "arm" }, { type: "back" },
      ]);
      expect(state).toMatchObject({ phase: "idle", priorAttemptMayHaveBeenBilled: true });
      const settled = run([
        ...toDrawing, EVENTS["failed-current-final"]!,
        { type: "arm" }, { type: "confirm", requestId: "req-2" },
        { type: "arrived", requestId: "req-2", picture: PICTURE },
      ]);
      expect(settled).toMatchObject({ phase: "arrived", priorAttemptMayHaveBeenBilled: true });
      expect(run([
        ...toDrawing, EVENTS["failed-current-final"]!,
        { type: "arm" }, { type: "confirm", requestId: "req-2" },
      ])).toMatchObject({ phase: "drawing", priorAttemptMayHaveBeenBilled: true });
    });

    it("keeps the flag when a later attempt is also ignored", () => {
      const failed = run([...toDrawing, EVENTS["failed-current-final"]!]);
      expect(reducePictureTurn(failed, EVENTS["accept"]!).state).toBe(failed);
    });
  });
});
