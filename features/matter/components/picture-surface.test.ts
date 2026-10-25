import { describe, expect, it } from "vitest";
import {
  createPictureTurnState,
  reducePictureTurn,
  type GeneratedPicture,
  type PictureTurnEvent,
  type PictureTurnPhase,
} from "../runtime/picture-turn";
import type { PictureDriverState } from "../interaction/picture-driver";
import { pictureControlCopy } from "./picture-control-copy";
import {
  pictureAnnouncementOnTransition,
  pictureAnnouncementText,
  pictureArmText,
  pictureCloseOnTransition,
  pictureControlPresentation,
  pictureEscapeAction,
  pictureHold,
  pictureKeepFailureAnnouncement,
  pictureKeepFailureText,
  pictureKeepOffered,
  pictureNoticeText,
  pictureOutcomeOnTransition,
  projectPictureBubble,
} from "./picture-surface";

const PICTURE: GeneratedPicture = Object.freeze({
  bytes: new Uint8Array([1, 2, 3]),
  pointer: Object.freeze({
    mediaType: "image/png" as const,
    byteLength: 3,
    width: 512,
    height: 512,
    contentHash: "a".repeat(64),
  }),
});
const REQUEST = "picture_request_one";
const copy = pictureControlCopy("en-US");

function turn(...events: PictureTurnEvent[]): PictureDriverState {
  return events.reduce((state, event) => reducePictureTurn(state, event).state, createPictureTurnState());
}

const ARM = { type: "arm" } as const;
const CONFIRM = { type: "confirm", requestId: REQUEST } as const;
const failed = (retryable: boolean, reason: "network" | "another-picture-in-flight" | "server-error:IMAGE_UNAVAILABLE" = "network") =>
  ({ type: "failed", requestId: REQUEST, reason, retryable }) as const;

describe("the picture control's presence", () => {
  const base = {
    availability: "available",
    environmentSupported: true,
    documentHasRoom: true,
    passageText: "A passage.",
    interactionPending: false,
    storeFailed: false,
  } as const;

  it("separates a visible entry from permission to arm a paid driver", () => {
    expect(pictureControlPresentation(base)).toBe("enabled");
    expect(pictureControlPresentation({ ...base, availability: "unavailable" })).toBe("unavailable");
  });

  it("is absent for an empty passage and for one over the image contract's bound", () => {
    expect(pictureControlPresentation({ ...base, passageText: null })).toBe("absent");
    expect(pictureControlPresentation({ ...base, passageText: "" })).toBe("absent");
    expect(pictureControlPresentation({ ...base, passageText: "a".repeat(2_000) })).toBe("enabled");
    expect(pictureControlPresentation({ ...base, passageText: "a".repeat(2_001) })).toBe("absent");
    // The bound is in code points, not code units.
    expect(pictureControlPresentation({ ...base, passageText: "𝒳".repeat(2_000) })).toBe("enabled");
    expect(pictureControlPresentation({ ...base, passageText: "𝒳".repeat(2_001) })).toBe("absent");
  });

  it("stays, aria-disabled and unable to start, when the picture store could not be opened", () => {
    // The row was decided when the field opened; a store that failed afterwards
    // must not take the control away from under the person's hand.
    expect(pictureControlPresentation({ ...base, storeFailed: true })).toBe("unavailable");
    expect(pictureControlPresentation({ ...base, storeFailed: true, availability: "unavailable" }))
      .toBe("unavailable");
    expect(pictureControlPresentation({ ...base, storeFailed: true, passageText: null }))
      .toBe("absent");
  });

  it("stays, aria-disabled, while another interaction is pending", () => {
    expect(pictureControlPresentation({ ...base, interactionPending: true })).toBe("disabled");
    expect(pictureControlPresentation({
      ...base,
      availability: "unavailable",
      interactionPending: true,
    })).toBe("unavailable");
  });
});

describe("the picture control's reasons to be missing or inert", () => {
  const base = {
    availability: "available",
    environmentSupported: true,
    documentHasRoom: true,
    nodeId: "thought_1",
    passageText: "A passage.",
    interactionPending: false,
    storeFailed: false,
  } as const;

  it("is visible but unavailable where this browser could not finish a paid picture", () => {
    expect(pictureControlPresentation({ ...base, environmentSupported: false })).toBe("unavailable");
    expect(pictureControlPresentation({
      ...base,
      environmentSupported: false,
      interactionPending: true,
    })).toBe("unavailable");
  });

  it("stays, aria-disabled and saying why, when the document has no room for a picture", () => {
    expect(pictureControlPresentation({ ...base, documentHasRoom: false })).toBe("full");
    expect(pictureControlPresentation({ ...base, documentHasRoom: false, availability: "unavailable" }))
      .toBe("unavailable");
    expect(pictureControlPresentation({ ...base, documentHasRoom: false, passageText: null }))
      .toBe("absent");
    // Another interaction in progress is the more immediate reason.
    expect(pictureControlPresentation({ ...base, documentHasRoom: false, interactionPending: true }))
      .toBe("disabled");
  });
});

describe("the arm step", () => {
  it("is shown for every new turn, and Back returns to the form row", () => {
    expect(projectPictureBubble(turn())).toBeNull();
    expect(projectPictureBubble(turn(ARM))).toEqual({ step: "arm", billed: false });
    expect(projectPictureBubble(turn(ARM, { type: "back" }))).toBeNull();
  });

  it("states the cost, and leads with the warning once an attempt may have been billed", () => {
    const stopped = turn(ARM, CONFIRM, { type: "stop-waiting" });
    expect(projectPictureBubble(stopped)).toBeNull();
    const again = turn(ARM, CONFIRM, { type: "stop-waiting" }, ARM);
    const view = projectPictureBubble(again);
    expect(view).toEqual({ step: "arm", billed: true });
    expect(pictureArmText(copy, false)).toEqual({ warning: null, statement: copy.armStatement });
    expect(pictureArmText(copy, true)).toEqual({ warning: copy.armWarningBilled, statement: copy.armStatement });
  });

  it("does not warn after a failure that cost nothing, and warns after one that may have", () => {
    const shed = turn(ARM, CONFIRM, failed(true), ARM);
    expect(projectPictureBubble(shed)).toEqual({ step: "arm", billed: false });
    const lost = turn(ARM, CONFIRM, failed(false), ARM);
    expect(projectPictureBubble(lost)).toEqual({ step: "arm", billed: true });
    const staled = turn(ARM, CONFIRM, { type: "stale" }, ARM);
    expect(projectPictureBubble(staled)).toEqual({ step: "arm", billed: true });
  });

  it("stays billed for the rest of the turn", () => {
    const state = turn(ARM, CONFIRM, failed(false), ARM, { type: "back" }, ARM);
    expect(projectPictureBubble(state)).toEqual({ step: "arm", billed: true });
  });
});

describe("the bubble for each state", () => {
  it("drawing offers only Stop waiting", () => {
    expect(projectPictureBubble(turn(ARM, CONFIRM))).toEqual({ step: "drawing" });
  });

  it("selects the line by failure reason and retryability", () => {
    const retryable = projectPictureBubble(turn(ARM, CONFIRM, failed(true, "server-error:IMAGE_UNAVAILABLE")));
    expect(retryable).toEqual({ step: "failed", notice: "not-drawn", retryable: true });
    const used = projectPictureBubble(turn(ARM, CONFIRM, failed(false, "network")));
    expect(used).toEqual({ step: "failed", notice: "not-drawn-used", retryable: false });
    const busy = projectPictureBubble(turn(ARM, CONFIRM, failed(true, "another-picture-in-flight")));
    expect(busy).toEqual({ step: "failed", notice: "another-in-flight", retryable: true });
    expect(pictureNoticeText(copy, "not-drawn")).toBe("Not drawn.");
    expect(pictureNoticeText(copy, "not-drawn-used")).toBe("Not drawn. That attempt may already have been used.");
    expect(pictureNoticeText(copy, "another-in-flight")).toBe("Another picture is being drawn.");
    expect(pictureNoticeText(copy, "document-full"))
      .toBe("This document already holds as many pictures as it can.");
  });

  it("says a refusal that left before sending without claiming the attempt was used", () => {
    const full = projectPictureBubble(turn(ARM, CONFIRM, {
      type: "failed", requestId: REQUEST, reason: "picture-limit", retryable: false,
    }));
    expect(full).toEqual({ step: "failed", notice: "document-full", retryable: false });
    const unsupported = projectPictureBubble(turn(ARM, CONFIRM, {
      type: "failed", requestId: REQUEST, reason: "picture-unsupported", retryable: false,
    }));
    expect(unsupported).toEqual({ step: "failed", notice: "not-drawn", retryable: false });
  });

  it("previews an arrived picture and carries the Keep failure the driver reports", () => {
    const arrived = turn(ARM, CONFIRM, { type: "arrived", requestId: REQUEST, picture: PICTURE });
    expect(projectPictureBubble(arrived)).toEqual({ step: "preview", picture: PICTURE, failure: null });
    const refused: PictureDriverState = { ...arrived, lastAcceptFailure: "refused" };
    expect(projectPictureBubble(refused)).toMatchObject({ step: "preview", failure: "refused" });
  });

  it("shows no step once the turn is over", () => {
    const arrived = turn(ARM, CONFIRM, { type: "arrived", requestId: REQUEST, picture: PICTURE });
    for (const event of [{ type: "accept" }, { type: "discard" }, { type: "stale" }] as const) {
      expect(projectPictureBubble(turn(ARM, CONFIRM, { type: "arrived", requestId: REQUEST, picture: PICTURE }, event)))
        .toBeNull();
    }
    expect(arrived.phase).toBe("arrived");
  });

  it("names the Keep failure inline, and offers Keep again only when it could work", () => {
    expect(pictureKeepFailureText(copy, null)).toBeNull();
    expect(pictureKeepFailureText(copy, "not-saved"))
      .toBe("Couldn’t save on this device. Kept for this session — try Keep again.");
    expect(pictureKeepFailureText(copy, "refused")).toBe("This picture can’t be kept here.");
    expect(pictureKeepOffered(null)).toBe(true);
    expect(pictureKeepOffered("not-saved")).toBe(true);
    expect(pictureKeepOffered("refused")).toBe(false);
  });
});

describe("what a press elsewhere may end", () => {
  const phases: Record<PictureTurnPhase, ReturnType<typeof pictureHold>> = {
    idle: "free",
    arming: "engaged",
    drawing: "paid",
    arrived: "paid",
    accepted: "free",
    discarded: "free",
    "failed-retryable": "engaged",
    "failed-final": "engaged",
    stale: "free",
    cancelled: "free",
  };
  it("holds paid work only while a request or a picture is open", () => {
    for (const [phase, hold] of Object.entries(phases)) {
      expect(pictureHold(phase as PictureTurnPhase), phase).toBe(hold);
    }
  });
});

describe("transitions", () => {
  it("says a stopped wait and a stale picture on the outcome line, once, and nothing else", () => {
    expect(pictureOutcomeOnTransition("drawing", "cancelled")).toBe("stopped");
    expect(pictureOutcomeOnTransition("drawing", "stale")).toBe("stale");
    expect(pictureOutcomeOnTransition("arrived", "stale")).toBe("stale");
    expect(pictureOutcomeOnTransition("stale", "stale")).toBeNull();
    for (const next of ["arming", "drawing", "arrived", "accepted", "discarded", "failed-final", "failed-retryable"] as const) {
      expect(pictureOutcomeOnTransition("idle", next), next).toBeNull();
    }
  });

  it("announces Drawing once and Kept once, through the region", () => {
    expect(pictureAnnouncementOnTransition("arming", "drawing")).toBe("drawing");
    expect(pictureAnnouncementOnTransition("drawing", "drawing")).toBeNull();
    expect(pictureAnnouncementOnTransition("arrived", "accepted")).toBe("kept");
    expect(pictureAnnouncementOnTransition("arrived", "discarded")).toBeNull();
    expect(pictureAnnouncementText(copy, "drawing")).toBe("Drawing");
    expect(pictureAnnouncementText(copy, "kept")).toBe("Kept. Undo is available.");
    expect(pictureAnnouncementText(copy, "keep-not-saved")).toBe(copy.keepNotSaved);
    expect(pictureAnnouncementText(copy, "keep-refused")).toBe(copy.keepRefused);
  });

  it("announces the arrival and a failure, which a person whose focus left the bubble would never learn", () => {
    expect(pictureAnnouncementOnTransition("drawing", "arrived")).toBe("arrived");
    expect(pictureAnnouncementOnTransition("drawing", "failed-retryable")).toBe("failed");
    expect(pictureAnnouncementOnTransition("drawing", "failed-final")).toBe("failed");
    expect(pictureAnnouncementOnTransition("arming", "failed-retryable")).toBe("failed");
    expect(pictureAnnouncementText(copy, "arrived")).toBe("Picture ready.");
    // A failure is said in the bubble's own words.
    expect(pictureAnnouncementText(copy, "failed", "not-drawn-used"))
      .toBe("Not drawn. That attempt may already have been used.");
    expect(pictureAnnouncementText(copy, "failed", "document-full"))
      .toBe("This document already holds as many pictures as it can.");
    expect(pictureAnnouncementText(copy, "failed")).toBe("Not drawn.");
    // A stale or stopped turn is said once, by the outcome line.
    expect(pictureAnnouncementOnTransition("drawing", "stale")).toBeNull();
    expect(pictureAnnouncementOnTransition("drawing", "cancelled")).toBeNull();
  });

  it("selects exactly one announcement per entered phase", () => {
    const entered: Record<PictureTurnPhase, ReturnType<typeof pictureAnnouncementOnTransition>> = {
      idle: null,
      arming: null,
      drawing: "drawing",
      arrived: "arrived",
      accepted: "kept",
      discarded: null,
      "failed-retryable": "failed",
      "failed-final": "failed",
      stale: null,
      cancelled: null,
    };
    for (const [phase, announcement] of Object.entries(entered)) {
      const previous: PictureTurnPhase = phase === "idle" ? "arming" : "idle";
      expect(pictureAnnouncementOnTransition(previous, phase as PictureTurnPhase), phase).toBe(announcement);
    }
  });

  it("announces a Keep failure when it appears or changes, not while it holds", () => {
    expect(pictureKeepFailureAnnouncement(null, "not-saved")).toBe("keep-not-saved");
    expect(pictureKeepFailureAnnouncement("not-saved", "not-saved")).toBeNull();
    expect(pictureKeepFailureAnnouncement("not-saved", "refused")).toBe("keep-refused");
    expect(pictureKeepFailureAnnouncement("refused", null)).toBeNull();
  });

  it("leaves the bubble the way the turn ended", () => {
    expect(pictureCloseOnTransition("accepted")).toBe("result");
    expect(pictureCloseOnTransition("discarded")).toBe("person");
    expect(pictureCloseOnTransition("stale")).toBe("target-changed");
    for (const phase of ["idle", "arming", "drawing", "arrived", "failed-final", "failed-retryable", "cancelled"] as const) {
      expect(pictureCloseOnTransition(phase), phase).toBeNull();
    }
  });

  it("gives Escape the meaning of the step it is pressed in", () => {
    expect(pictureEscapeAction(null)).toBe("cancel-field");
    expect(pictureEscapeAction("arm")).toBe("back");
    expect(pictureEscapeAction("drawing")).toBe("stop-waiting");
    // A paid picture is never discarded by the most incidental key.
    expect(pictureEscapeAction("preview")).toBe("focus-preview");
    expect(pictureEscapeAction("failed")).toBe("cancel-field");
  });
});
