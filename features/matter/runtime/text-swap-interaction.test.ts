import { describe, expect, it } from "vitest";
import {
  createTextSwapInteractionState,
  reduceTextSwapInteraction,
  type TextSwapBasis,
  type TextSwapInteractionEvent,
  type TextSwapInteractionState,
} from "./text-swap-interaction";

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
});

function enter(basis: TextSwapBasis = BASIS) {
  return reduceTextSwapInteraction(createTextSwapInteractionState(), {
    type: "enter",
    interactionId: "text_swap_interaction_1",
    basis,
  });
}

function permission(): TextSwapInteractionState {
  return reduceTextSwapInteraction(enter().state, { type: "start-recording" }).state;
}

function recording(): TextSwapInteractionState {
  return reduceTextSwapInteraction(permission(), {
    type: "permission-granted",
    interactionId: "text_swap_interaction_1",
    attempt: 1,
    startedAtMs: 20,
  }).state;
}

function transcribing(): TextSwapInteractionState {
  return reduceTextSwapInteraction(recording(), { type: "stop-recording" }).state;
}

function ready(direction = "Make it more tentative"): TextSwapInteractionState {
  return reduceTextSwapInteraction(enter().state, {
    type: "accept-direction",
    text: direction,
  }).state;
}

function pending(): TextSwapInteractionState {
  return reduceTextSwapInteraction(ready(), {
    type: "submit",
    requestId: "text_swap_request_1",
  }).state;
}

describe("text swap interaction reducer", () => {
  it("enters with an owned immutable source basis and no browser work", () => {
    const mutable = {
      ...BASIS,
      selection: { ...BASIS.selection },
    };
    const result = enter(mutable);
    mutable.selection.selectedText = "changed later";

    expect(result).toEqual({
      state: {
        phase: "eligible",
        interactionId: "text_swap_interaction_1",
        attempt: 0,
        basis: BASIS,
      },
      effects: [],
    });
    expect(result.state.phase === "eligible" && result.state.basis.sourceText).toBe("Rain is near");
    expect(result.state.phase === "eligible" && Object.isFrozen(result.state.basis.selection)).toBe(true);
  });

  it("rejects malformed identity and a basis whose source differs from selection", () => {
    const idle = createTextSwapInteractionState();
    for (const event of [
      { type: "enter", interactionId: "bad id", basis: BASIS },
      { type: "enter", interactionId: "valid", basis: { ...BASIS, sourceText: "other" } },
      { type: "enter", interactionId: "valid", basis: { ...BASIS, documentEpoch: -1 } },
    ] as const) {
      const result = reduceTextSwapInteraction(idle, event);
      expect(result.state).toBe(idle);
      expect(result.effects).toEqual([]);
    }
  });

  it("moves through permission, recording, and one recorder settlement", () => {
    expect(permission()).toEqual({
      phase: "permission",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
      basis: BASIS,
    });
    expect(recording()).toEqual({
      phase: "recording",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
      basis: BASIS,
      startedAtMs: 20,
    });

    const stopped = reduceTextSwapInteraction(recording(), { type: "stop-recording" });
    expect(stopped).toEqual({
      state: {
        phase: "transcribing",
        interactionId: "text_swap_interaction_1",
        attempt: 1,
        basis: BASIS,
        recorderSettled: false,
      },
      effects: [{
        type: "stop-recording",
        interactionId: "text_swap_interaction_1",
        attempt: 1,
      }],
    });
    const settled = reduceTextSwapInteraction(stopped.state, {
      type: "recorder-stopped",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
    });
    expect(settled.state).toMatchObject({ phase: "transcribing", recorderSettled: true });
    expect(settled.effects).toEqual([{
      type: "transcribe-recording",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
    }]);
    expect(reduceTextSwapInteraction(settled.state, {
      type: "recorder-stopped",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
    }).effects).toEqual([]);
  });

  it("keeps bounded partials local and resolves one carrier-neutral direction", () => {
    const partial = reduceTextSwapInteraction(recording(), {
      type: "partial-direction",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
      text: "  make it quieter  ",
    }).state;
    expect(partial).toMatchObject({ phase: "recording", partialDirection: "make it quieter" });

    const result = reduceTextSwapInteraction(transcribing(), {
      type: "direction-resolved",
      interactionId: "text_swap_interaction_1",
      attempt: 1,
      text: "  Make it quieter  ",
    });
    expect(result).toEqual({
      state: {
        phase: "ready",
        interactionId: "text_swap_interaction_1",
        attempt: 1,
        basis: BASIS,
        direction: "Make it quieter",
      },
      effects: [{
        type: "cleanup-voice",
        interactionId: "text_swap_interaction_1",
        attempt: 1,
        reason: "resolved",
      }],
    });
    expect(result.state.phase === "ready" && result.state.basis.sourceText).toBe("Rain is near");
  });

  it("feeds speech and a future typed fallback through the same final direction event", () => {
    const typed = reduceTextSwapInteraction(enter().state, {
      type: "accept-direction",
      text: "Make the rhythm sharper",
    });
    expect(typed.state).toMatchObject({
      phase: "ready",
      direction: "Make the rhythm sharper",
    });
    expect(typed.state).not.toHaveProperty("carrier");

    const invalid = reduceTextSwapInteraction(enter().state, {
      type: "accept-direction",
      text: "line one\nline two",
    });
    expect(invalid.state).toMatchObject({
      phase: "error",
      errorCode: "INVALID_DIRECTION",
      retryable: true,
    });
  });

  it("freezes one request id and ignores results from another request", () => {
    const result = reduceTextSwapInteraction(ready(), {
      type: "submit",
      requestId: "text_swap_request_1",
    });
    expect(result.state).toMatchObject({
      phase: "pending",
      requestId: "text_swap_request_1",
      direction: "Make it more tentative",
    });
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      type: "request-swap",
      requestId: "text_swap_request_1",
      basis: BASIS,
      direction: "Make it more tentative",
    });

    const late = reduceTextSwapInteraction(result.state, {
      type: "request-committed",
      interactionId: "text_swap_interaction_1",
      requestId: "text_swap_request_old",
    });
    expect(late.state).toBe(result.state);
    expect(late.effects).toEqual([]);
  });

  it("retains direction only for an explicit retryable request failure", () => {
    const failed = reduceTextSwapInteraction(pending(), {
      type: "request-failed",
      interactionId: "text_swap_interaction_1",
      requestId: "text_swap_request_1",
      errorCode: "REQUEST_FAILED",
      retryable: true,
    });
    expect(failed.state).toMatchObject({
      phase: "error",
      direction: "Make it more tentative",
      requestId: "text_swap_request_1",
      retryable: true,
    });

    const retried = reduceTextSwapInteraction(failed.state, {
      type: "retry-request",
      requestId: "text_swap_request_2",
    });
    expect(retried.state).toMatchObject({
      phase: "pending",
      requestId: "text_swap_request_2",
      direction: "Make it more tentative",
    });
    expect(retried.effects[0]).toMatchObject({ type: "request-swap", requestId: "text_swap_request_2" });

    const terminal = reduceTextSwapInteraction(pending(), {
      type: "request-failed",
      interactionId: "text_swap_interaction_1",
      requestId: "text_swap_request_1",
      errorCode: "INVALID_RESPONSE",
      retryable: false,
    }).state;
    expect(terminal).not.toHaveProperty("direction");
    expect(terminal).not.toHaveProperty("requestId");
  });

  it("makes success and stale terminal without retaining the human direction", () => {
    const success = reduceTextSwapInteraction(pending(), {
      type: "request-committed",
      interactionId: "text_swap_interaction_1",
      requestId: "text_swap_request_1",
    });
    expect(success.state).toEqual({
      phase: "success",
      interactionId: "text_swap_interaction_1",
      attempt: 0,
      basis: BASIS,
      requestId: "text_swap_request_1",
    });
    expect(success.state).not.toHaveProperty("direction");

    const stale = reduceTextSwapInteraction(pending(), {
      type: "scope-invalidated",
      reason: "selection-change",
    });
    expect(stale.state).toMatchObject({ phase: "stale", reason: "selection-change", basis: BASIS });
    expect(stale.state).not.toHaveProperty("direction");
    expect(stale.effects).toEqual([{
      type: "cancel-session",
      interactionId: "text_swap_interaction_1",
      reason: "scope-change",
    }]);
  });

  it("cancels every active phase once and makes all late events inert", () => {
    for (const state of [permission(), recording(), transcribing(), ready(), pending()]) {
      const cancelled = reduceTextSwapInteraction(state, { type: "cancel" });
      expect(cancelled).toEqual({
        state: { phase: "idle" },
        effects: [{
          type: "cancel-session",
          interactionId: "text_swap_interaction_1",
          reason: "person",
        }],
      });
      for (const event of [
        { type: "permission-granted", interactionId: "text_swap_interaction_1", attempt: 1, startedAtMs: 1 },
        { type: "direction-resolved", interactionId: "text_swap_interaction_1", attempt: 1, text: "late" },
        { type: "request-committed", interactionId: "text_swap_interaction_1", requestId: "text_swap_request_1" },
      ] satisfies TextSwapInteractionEvent[]) {
        expect(reduceTextSwapInteraction(cancelled.state, event).state).toBe(cancelled.state);
      }
    }
  });

  it("supersedes an old action and is serializable without browser resources", () => {
    const nextBasis = Object.freeze({
      ...BASIS,
      selection: Object.freeze({ ...BASIS.selection, nodeId: "thought_2" }),
    });
    const superseded = reduceTextSwapInteraction(pending(), {
      type: "enter",
      interactionId: "text_swap_interaction_2",
      basis: nextBasis,
    });
    expect(superseded.state).toMatchObject({
      phase: "eligible",
      interactionId: "text_swap_interaction_2",
      basis: nextBasis,
    });
    expect(superseded.effects).toEqual([{
      type: "cancel-session",
      interactionId: "text_swap_interaction_1",
      reason: "new-action",
    }]);

    for (const state of [enter().state, permission(), recording(), transcribing(), ready(), pending(), superseded.state]) {
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      expect(JSON.stringify(state)).not.toMatch(/blob|stream|abortcontroller/i);
    }
  });
});
