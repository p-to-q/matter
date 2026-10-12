import type { ImageSurfaceAvailability } from "../interaction/image-surface-availability";
import type { PictureAcceptFailure, PictureDriverState } from "../interaction/picture-driver";
import { canDrawFromPassage } from "../protocol/image-contract";
import {
  failureBeforeSending,
  type GeneratedPicture,
  type PictureFailureReason,
  type PictureTurnPhase,
} from "../runtime/picture-turn";
import type { PictureControlCopy } from "./picture-control-copy";
import type { PointTalkCloseReason } from "./point-talk-close";

/**
 * The pure rules of the 绘图 control: when it exists, what the bubble says for
 * each state of the picture turn, and how the turn's transitions reach the
 * announcement region, the outcome line, and the bubble's close. The driver
 * and its reducer own the lifecycle; nothing here stores state.
 */

/**
 * `disabled` waits on another interaction; `full` says the document cannot
 * keep another picture, and the control then names that reason.
 */
export type PictureControlPresentation = "absent" | "enabled" | "disabled" | "full";

/**
 * The control exists only when the health read said `available`, this browser
 * can finish a picture it has paid for, and the passage can be drawn from. It
 * stays, `aria-disabled`, while another interaction is pending or the document
 * is full, so focus survives. The image contract decides what a drawable
 * passage is.
 */
export function pictureControlPresentation(input: Readonly<{
  availability: ImageSurfaceAvailability;
  environmentSupported: boolean;
  /** Whether the document has room for a picture on this passage. */
  documentHasRoom: boolean;
  passageText: string | null;
  interactionPending: boolean;
}>): PictureControlPresentation {
  if (
    input.availability !== "available" ||
    !input.environmentSupported ||
    !canDrawFromPassage(input.passageText)
  ) return "absent";
  if (input.interactionPending) return "disabled";
  return input.documentHasRoom ? "enabled" : "full";
}

export type PictureNotice = "not-drawn" | "not-drawn-used" | "another-in-flight" | "document-full";

/** What the bubble shows in place of the form row; null means the form row itself. */
export type PictureBubbleView =
  | Readonly<{ step: "arm"; billed: boolean }>
  | Readonly<{ step: "drawing" }>
  | Readonly<{ step: "failed"; notice: PictureNotice; retryable: boolean }>
  | Readonly<{
      step: "preview";
      picture: GeneratedPicture;
      failure: PictureAcceptFailure | null;
    }>;

export type PictureStep = PictureBubbleView["step"];

export function projectPictureBubble(state: PictureDriverState): PictureBubbleView | null {
  switch (state.phase) {
    case "arming":
      return Object.freeze({ step: "arm", billed: state.priorAttemptMayHaveBeenBilled });
    case "drawing":
      return Object.freeze({ step: "drawing" });
    case "arrived":
      return Object.freeze({
        step: "preview",
        picture: state.picture,
        failure: state.lastAcceptFailure ?? null,
      });
    case "failed-retryable":
      return Object.freeze({
        step: "failed",
        notice: failureNotice(state.reason, true),
        retryable: true,
      });
    case "failed-final":
      return Object.freeze({
        step: "failed",
        notice: failureNotice(state.reason, false),
        retryable: false,
      });
    case "idle":
    case "accepted":
    case "discarded":
    case "stale":
    case "cancelled":
      return null;
  }
}

/** A failure that left before sending cost nothing, so it never says the attempt was used. */
function failureNotice(reason: PictureFailureReason, retryable: boolean): PictureNotice {
  if (reason === "another-picture-in-flight") return "another-in-flight";
  if (reason === "picture-limit") return "document-full";
  if (failureBeforeSending(reason)) return "not-drawn";
  return retryable ? "not-drawn" : "not-drawn-used";
}

/**
 * How much the picture turn holds. `paid` work is a request that may already
 * have been billed, or a picture waiting for a decision: a press elsewhere does
 * not end it. `engaged` replaces the form row but has cost nothing.
 */
export type PictureHold = "free" | "engaged" | "paid";

export function pictureHold(phase: PictureTurnPhase): PictureHold {
  switch (phase) {
    case "drawing":
    case "arrived":
      return "paid";
    case "arming":
    case "failed-retryable":
    case "failed-final":
      return "engaged";
    case "idle":
    case "accepted":
    case "discarded":
    case "stale":
    case "cancelled":
      return "free";
  }
}

export function pictureNoticeText(copy: PictureControlCopy, notice: PictureNotice): string {
  switch (notice) {
    case "not-drawn": return copy.notDrawn;
    case "not-drawn-used": return copy.notDrawnUsed;
    case "another-in-flight": return copy.anotherInFlight;
    case "document-full": return copy.documentFull;
  }
}

/** The arm step's words: a warning of its own once an attempt may have been billed, then the statement. */
export function pictureArmText(
  copy: PictureControlCopy,
  billed: boolean,
): Readonly<{ warning: string | null; statement: string }> {
  return Object.freeze({
    warning: billed ? copy.armWarningBilled : null,
    statement: copy.armStatement,
  });
}

/** The inline line under a preview whose Keep did not take; null when Keep has not failed. */
export function pictureKeepFailureText(
  copy: PictureControlCopy,
  failure: PictureAcceptFailure | null,
): string | null {
  switch (failure) {
    case null: return null;
    case "not-saved": return copy.keepNotSaved;
    case "refused": return copy.keepRefused;
  }
}

/** A refused picture would be refused again, so only Discard is offered. */
export function pictureKeepOffered(failure: PictureAcceptFailure | null): boolean {
  return failure !== "refused";
}

export type PictureOutcomeReason = "stale" | "stopped";

// A table, not a chain: a new phase must say what it leaves behind to compile.
const OUTCOME_ON_ENTERING = {
  idle: null,
  arming: null,
  drawing: null,
  arrived: null,
  accepted: null,
  discarded: null,
  "failed-retryable": null,
  "failed-final": null,
  stale: "stale",
  cancelled: "stopped",
} as const satisfies Readonly<Record<PictureTurnPhase, PictureOutcomeReason | null>>;

/** The one outcome-line entry a transition leaves behind; failures are the bubble's own words. */
export function pictureOutcomeOnTransition(
  previous: PictureTurnPhase,
  next: PictureTurnPhase,
): PictureOutcomeReason | null {
  return previous === next ? null : OUTCOME_ON_ENTERING[next];
}

export type PictureAnnouncement =
  | "drawing"
  | "arrived"
  | "failed"
  | "kept"
  | "keep-not-saved"
  | "keep-refused";

const ANNOUNCEMENT_ON_ENTERING = {
  idle: null,
  arming: null,
  drawing: "drawing",
  arrived: "arrived",
  accepted: "kept",
  discarded: null,
  "failed-retryable": "failed",
  "failed-final": "failed",
  // A stale or stopped turn is said once by the outcome line, never twice.
  stale: null,
  cancelled: null,
} as const satisfies Readonly<Record<PictureTurnPhase, PictureAnnouncement | null>>;

/** What the existing polite region says once for a transition. */
export function pictureAnnouncementOnTransition(
  previous: PictureTurnPhase,
  next: PictureTurnPhase,
): PictureAnnouncement | null {
  return previous === next ? null : ANNOUNCEMENT_ON_ENTERING[next];
}

const KEEP_FAILURE_ANNOUNCEMENT = {
  "not-saved": "keep-not-saved",
  refused: "keep-refused",
} as const satisfies Readonly<Record<PictureAcceptFailure, PictureAnnouncement>>;

/** A Keep that failed is said when it fails, and again only if it fails differently. */
export function pictureKeepFailureAnnouncement(
  previous: PictureAcceptFailure | null,
  next: PictureAcceptFailure | null,
): PictureAnnouncement | null {
  if (next === null || next === previous) return null;
  return KEEP_FAILURE_ANNOUNCEMENT[next];
}

/**
 * `notice` is the failed step's own line, so a failure is announced in the
 * words the bubble shows; it matters only for `failed`.
 */
export function pictureAnnouncementText(
  copy: PictureControlCopy,
  announcement: PictureAnnouncement,
  notice: PictureNotice | null = null,
): string {
  switch (announcement) {
    case "drawing": return copy.announceDrawing;
    case "arrived": return copy.announceArrived;
    case "failed": return pictureNoticeText(copy, notice ?? "not-drawn");
    case "kept": return copy.announceKept;
    case "keep-not-saved": return copy.keepNotSaved;
    case "keep-refused": return copy.keepRefused;
  }
}

const CLOSE_ON_ENTERING = {
  idle: null,
  arming: null,
  drawing: null,
  arrived: null,
  accepted: "result",
  discarded: "person",
  "failed-retryable": null,
  "failed-final": null,
  stale: "target-changed",
  cancelled: null,
} as const satisfies Readonly<Record<PictureTurnPhase, PointTalkCloseReason | null>>;

/** How a terminal turn takes its bubble away; null while the turn goes on. */
export function pictureCloseOnTransition(phase: PictureTurnPhase): PointTalkCloseReason | null {
  return CLOSE_ON_ENTERING[phase];
}

/**
 * Escape's meaning at each step; the form row keeps the field's own cancel. A
 * preview is a paid picture waiting for a decision, and an outside press
 * already cannot end it, so the most incidental key cannot either: Escape only
 * brings focus to the Keep and Discard group, and Discard stays an explicit control.
 */
export type PictureEscape = "cancel-field" | "back" | "stop-waiting" | "focus-preview";

export function pictureEscapeAction(step: PictureStep | null): PictureEscape {
  switch (step) {
    case "arm": return "back";
    case "drawing": return "stop-waiting";
    case "preview": return "focus-preview";
    case "failed":
    case null:
      return "cancel-field";
  }
}
