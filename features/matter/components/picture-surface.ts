import type { MatterLocale } from "../config/locales";
import type { ImageAvailability } from "../interaction/image-availability-read";
import type { PictureAcceptFailure, PictureDriverState } from "../interaction/picture-driver";
import { IMAGE_REQUEST_VERSION, parseImageRequestEnvelope } from "../protocol/image-contract";
import type { GeneratedPicture, PictureTurnPhase } from "../runtime/picture-turn";
import { PROTOCOL_VERSION } from "../tree/model";
import type { PictureControlCopy } from "./picture-control-copy";
import type { PointTalkCloseReason } from "./point-talk-close";

/**
 * The pure rules of the 生图 control: when it exists, what the bubble says for
 * each state of the picture turn, and how the turn's transitions reach the
 * announcement region, the outcome line, and the bubble's close. The driver
 * and its reducer own the lifecycle; nothing here stores state.
 */

export type PictureControlPresentation = "absent" | "enabled" | "disabled";

/**
 * The control exists only when the health read said `available` and the
 * passage can be sent as one image request. It stays, `aria-disabled`, while
 * another interaction is pending, so focus survives. The image contract's own
 * parser decides what a sendable passage is.
 */
export function pictureControlPresentation(input: Readonly<{
  availability: ImageAvailability;
  nodeId: string;
  passageText: string | null;
  interactionPending: boolean;
}>): PictureControlPresentation {
  if (input.availability !== "available" || input.passageText === null) return "absent";
  const sendable = parseImageRequestEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: IMAGE_REQUEST_VERSION,
    id: "picture_request_probe",
    locale: "en-US" satisfies MatterLocale,
    passage: { nodeId: input.nodeId, text: input.passageText },
  }).ok;
  if (!sendable) return "absent";
  return input.interactionPending ? "disabled" : "enabled";
}

export type PictureNotice = "not-drawn" | "not-drawn-used" | "another-in-flight";

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
        notice: state.reason === "another-picture-in-flight" ? "another-in-flight" : "not-drawn",
        retryable: true,
      });
    case "failed-final":
      return Object.freeze({ step: "failed", notice: "not-drawn-used", retryable: false });
    case "idle":
    case "accepted":
    case "discarded":
    case "stale":
    case "cancelled":
      return null;
  }
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
  }
}

export function pictureArmStatement(copy: PictureControlCopy, billed: boolean): string {
  return billed ? copy.armStatementBilled : copy.armStatement;
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

/** The one outcome-line entry a transition leaves behind; failures are the bubble's own words. */
export function pictureOutcomeOnTransition(
  previous: PictureTurnPhase,
  next: PictureTurnPhase,
): PictureOutcomeReason | null {
  if (previous === next) return null;
  if (next === "stale") return "stale";
  return next === "cancelled" ? "stopped" : null;
}

export type PictureAnnouncement = "drawing" | "kept" | "keep-not-saved" | "keep-refused";

/** What the existing polite region says once for a transition. */
export function pictureAnnouncementOnTransition(
  previous: PictureTurnPhase,
  next: PictureTurnPhase,
): PictureAnnouncement | null {
  if (previous === next) return null;
  if (next === "drawing") return "drawing";
  return next === "accepted" ? "kept" : null;
}

/** A Keep that failed is said when it fails, and again only if it fails differently. */
export function pictureKeepFailureAnnouncement(
  previous: PictureAcceptFailure | null,
  next: PictureAcceptFailure | null,
): PictureAnnouncement | null {
  if (next === null || next === previous) return null;
  return next === "not-saved" ? "keep-not-saved" : "keep-refused";
}

export function pictureAnnouncementText(
  copy: PictureControlCopy,
  announcement: PictureAnnouncement,
): string {
  switch (announcement) {
    case "drawing": return copy.announceDrawing;
    case "kept": return copy.announceKept;
    case "keep-not-saved": return copy.keepNotSaved;
    case "keep-refused": return copy.keepRefused;
  }
}

/** How a terminal turn takes its bubble away; null while the turn goes on. */
export function pictureCloseOnTransition(phase: PictureTurnPhase): PointTalkCloseReason | null {
  switch (phase) {
    case "accepted": return "result";
    case "discarded": return "person";
    case "stale": return "target-changed";
    default: return null;
  }
}

/** Escape's meaning at each step; the form row keeps the field's own cancel. */
export type PictureEscape = "cancel-field" | "back" | "stop-waiting" | "discard";

export function pictureEscapeAction(step: PictureStep | null): PictureEscape {
  switch (step) {
    case "arm": return "back";
    case "drawing": return "stop-waiting";
    case "preview": return "discard";
    case "failed":
    case null:
      return "cancel-field";
  }
}
