import { MAX_IMAGE_ID_LENGTH } from "../protocol/image-contract";
import { isMaterialId } from "../tree/invariants";
import type { ImagePointer } from "../tree/image-pointer";

/**
 * Owns one passage's picture turn. The request promise, the abort controller,
 * and the byte transport stay in the effect driver; this state keeps only the
 * authority to act on one request and what the person has been told.
 *
 * A picture is paid for by the relay before anyone can look at it, and a client
 * cannot cancel a generation. So every exit from `drawing` other than an answer
 * leaves `priorAttemptMayHaveBeenBilled` set for the rest of the turn, and the
 * next arm shows it.
 */

/** Bytes exactly as received, with the pointer that names them. */
export type GeneratedPicture = Readonly<{
  bytes: Uint8Array;
  pointer: ImagePointer;
}>;

/** The codes the image route's error envelope can carry. */
export const PICTURE_SERVER_ERROR_CODES = Object.freeze([
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "IMAGE_REJECTED",
  "IMAGE_UNAVAILABLE",
  "IMAGE_FAILED",
] as const);
export type PictureServerErrorCode = (typeof PICTURE_SERVER_ERROR_CODES)[number];

export type PictureFailureReason =
  | "aborted"
  | "timeout"
  | "network"
  | "invalid-response"
  | `server-error:${PictureServerErrorCode}`;

type Billing = Readonly<{ priorAttemptMayHaveBeenBilled: boolean }>;

export type PictureTurnState =
  | (Billing & Readonly<{ phase: "idle" }>)
  | (Billing & Readonly<{ phase: "arming" }>)
  | (Billing & Readonly<{ phase: "drawing"; requestId: string }>)
  | (Billing & Readonly<{ phase: "arrived"; picture: GeneratedPicture }>)
  | (Billing & Readonly<{ phase: "accepted" }>)
  | (Billing & Readonly<{ phase: "discarded" }>)
  | (Billing & Readonly<{ phase: "failed-retryable"; reason: PictureFailureReason }>)
  | (Billing & Readonly<{ phase: "failed-final"; reason: PictureFailureReason }>)
  | (Billing & Readonly<{ phase: "stale" }>)
  | (Billing & Readonly<{ phase: "cancelled" }>);

export type PictureTurnPhase = PictureTurnState["phase"];

export type PictureTurnEvent =
  | Readonly<{ type: "arm" }>
  | Readonly<{ type: "back" }>
  | Readonly<{ type: "confirm"; requestId: string }>
  | Readonly<{ type: "arrived"; requestId: string; picture: GeneratedPicture }>
  | Readonly<{
      type: "failed";
      requestId: string;
      reason: PictureFailureReason;
      retryable: boolean;
    }>
  | Readonly<{ type: "accept" }>
  | Readonly<{ type: "discard" }>
  | Readonly<{ type: "stale" }>
  | Readonly<{ type: "stop-waiting" }>;

export type PictureTurnEffect =
  | Readonly<{ type: "request-picture"; requestId: string }>
  | Readonly<{ type: "abort-request"; requestId: string }>;

export type PictureTurnResult = Readonly<{
  state: PictureTurnState;
  effects: readonly PictureTurnEffect[];
}>;

const NO_EFFECTS: readonly PictureTurnEffect[] = Object.freeze([]);
const INITIAL: PictureTurnState = Object.freeze({
  phase: "idle",
  priorAttemptMayHaveBeenBilled: false,
});

export function createPictureTurnState(): PictureTurnState {
  return INITIAL;
}

/** Whether a settlement belongs to the request this turn is waiting for. */
export function ownsPictureRequest(state: PictureTurnState, requestId: string): boolean {
  return state.phase === "drawing" && state.requestId === requestId;
}

export function reducePictureTurn(
  state: PictureTurnState,
  event: PictureTurnEvent,
): PictureTurnResult {
  const billed = state.priorAttemptMayHaveBeenBilled;
  switch (event.type) {
    case "arm":
      return canArm(state)
        ? changed({ phase: "arming", priorAttemptMayHaveBeenBilled: billed })
        : unchanged(state);
    case "back":
      return state.phase === "arming"
        ? changed({ phase: "idle", priorAttemptMayHaveBeenBilled: billed })
        : unchanged(state);
    case "confirm":
      if (state.phase !== "arming" || !isRequestId(event.requestId)) return unchanged(state);
      return changed(
        { phase: "drawing", requestId: event.requestId, priorAttemptMayHaveBeenBilled: billed },
        [{ type: "request-picture", requestId: event.requestId }],
      );
    case "arrived":
      if (!ownsPictureRequest(state, event.requestId)) return unchanged(state);
      return changed({ phase: "arrived", picture: event.picture, priorAttemptMayHaveBeenBilled: billed });
    case "failed":
      if (!ownsPictureRequest(state, event.requestId)) return unchanged(state);
      return event.retryable
        ? changed({ phase: "failed-retryable", reason: event.reason, priorAttemptMayHaveBeenBilled: billed })
        : changed({ phase: "failed-final", reason: event.reason, priorAttemptMayHaveBeenBilled: true });
    case "accept":
      return state.phase === "arrived"
        ? changed({ phase: "accepted", priorAttemptMayHaveBeenBilled: billed })
        : unchanged(state);
    case "discard":
      return state.phase === "arrived"
        ? changed({ phase: "discarded", priorAttemptMayHaveBeenBilled: billed })
        : unchanged(state);
    case "stale":
      if (state.phase === "drawing") {
        return changed(
          { phase: "stale", priorAttemptMayHaveBeenBilled: true },
          [{ type: "abort-request", requestId: state.requestId }],
        );
      }
      return state.phase === "arming" || state.phase === "arrived"
        ? changed({ phase: "stale", priorAttemptMayHaveBeenBilled: billed })
        : unchanged(state);
    case "stop-waiting":
      return state.phase === "drawing"
        ? changed(
            { phase: "cancelled", priorAttemptMayHaveBeenBilled: true },
            [{ type: "abort-request", requestId: state.requestId }],
          )
        : unchanged(state);
    default:
      return assertNever(event);
  }
}

// Accepted is terminal: a second picture for the same passage is a new turn.
function canArm(state: PictureTurnState): boolean {
  switch (state.phase) {
    case "idle":
    case "discarded":
    case "failed-retryable":
    case "failed-final":
    case "stale":
    case "cancelled":
      return true;
    case "arming":
    case "drawing":
    case "arrived":
    case "accepted":
      return false;
  }
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_IMAGE_ID_LENGTH && isMaterialId(value);
}

function changed(
  state: PictureTurnState,
  effects: readonly PictureTurnEffect[] = NO_EFFECTS,
): PictureTurnResult {
  return Object.freeze({
    // Only the wrapper is frozen: the picture's bytes belong to the caller and
    // freezing a non-empty typed array throws.
    state: Object.freeze(state),
    effects: effects.length === 0
      ? NO_EFFECTS
      : Object.freeze(effects.map((effect) => Object.freeze(effect))),
  });
}

function unchanged(state: PictureTurnState): PictureTurnResult {
  return Object.freeze({ state, effects: NO_EFFECTS });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled picture turn event: ${String(value)}`);
}
