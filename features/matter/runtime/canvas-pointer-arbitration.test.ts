import { describe, expect, it } from "vitest";
import {
  createCanvasPointerArbiter,
  PEN_PALM_GRACE_MS,
  PEN_TAKEOVER_WINDOW_MS,
  REJECTED_CLICK_TTL_MS,
  TOUCH_COMMIT_SLOP_PX,
  touchCommitment,
  type ArbitratedPointer,
  type CanvasPointerArbiter,
} from "./canvas-pointer-arbitration";

const PEN = 1;
const PALM = 2;
const SECOND_PALM = 3;
const FINGER = 4;
const MOUSE = 5;

/** A pointer event; by default something is pressed, as in a contact. */
function pointer(
  pointerId: number,
  pointerType: string,
  timeStamp: number,
  buttons = 1,
): ArbitratedPointer {
  return { pointerId, pointerType, buttons, timeStamp };
}

/** A move with nothing pressed: a hovering pen or a mouse with no button held. */
function hover(pointerId: number, pointerType: string, timeStamp: number): ArbitratedPointer {
  return pointer(pointerId, pointerType, timeStamp, 0);
}

/** The browser order: window capture notes the down, then the canvas claims it. */
function down(arbiter: CanvasPointerArbiter, event: ArbitratedPointer) {
  arbiter.notePointerDown(event);
  return arbiter.claim(event);
}

describe("canvas pointer arbitration", () => {
  it("names its thresholds", () => {
    expect(PEN_PALM_GRACE_MS).toBe(400);
    expect(PEN_TAKEOVER_WINDOW_MS).toBe(300);
    expect(REJECTED_CLICK_TTL_MS).toBe(1_000);
  });

  it("rejects a palm while the pen writes, and every later event of it", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(PEN, "pen", 0))).toEqual({ kind: "accept", founder: true });
    expect(down(arbiter, pointer(PALM, "touch", 50))).toEqual({ kind: "reject" });
    expect(down(arbiter, pointer(SECOND_PALM, "touch", 60))).toEqual({ kind: "reject" });
    expect(arbiter.isRejected(PALM)).toBe(true);
    expect(arbiter.isRejected(SECOND_PALM)).toBe(true);
    expect(arbiter.ignoresCancel(pointer(PALM, "touch", 70))).toBe(true);
    // Its tap's click is suppressed once.
    expect(arbiter.consumeRejectedClick(PALM, 90)).toBe(true);
    expect(arbiter.consumeRejectedClick(PALM, 91)).toBe(false);

    // The capture-phase end runs before the canvas's own pointer-up handler,
    // so the palm stays rejected until another contact begins.
    arbiter.notePointerEnd(pointer(PALM, "touch", 100));
    expect(arbiter.isRejected(PALM)).toBe(true);
    expect(arbiter.isRejected(PEN)).toBe(false);
    arbiter.notePointerDown(pointer(FINGER, "touch", 120));
    expect(arbiter.isRejected(PALM)).toBe(false);
  });

  it("still lets an owned pinch contact end after its capture-phase end", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(FINGER, "touch", 0));
    down(arbiter, pointer(PALM, "touch", 5));
    arbiter.notePointerDown(pointer(PEN, "pen", 8));
    arbiter.notePointerEnd(pointer(PALM, "touch", 9));
    expect(arbiter.ignoresCancel(pointer(PALM, "touch", 9))).toBe(false);
  });

  it("keeps rejecting palms for the grace period after the pen lifts", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    arbiter.notePointerMove(pointer(PEN, "pen", 200));
    arbiter.notePointerEnd(pointer(PEN, "pen", 300));
    expect(down(arbiter, pointer(PALM, "touch", 300 + PEN_PALM_GRACE_MS - 1))).toEqual({ kind: "reject" });
    arbiter.notePointerEnd(pointer(PALM, "touch", 800));
    expect(down(arbiter, pointer(FINGER, "touch", 300 + PEN_PALM_GRACE_MS))).toEqual({
      kind: "accept",
      founder: true,
    });
  });

  it("does not treat pen hover as activity", () => {
    const arbiter = createCanvasPointerArbiter();
    arbiter.notePointerMove(hover(PEN, "pen", 0));
    expect(arbiter.penActive(10)).toBe(false);
    expect(down(arbiter, pointer(FINGER, "touch", 10))).toEqual({ kind: "accept", founder: true });
  });

  it("lets a pen take over a single-finger touch that began just before it", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(PALM, "touch", 0))).toEqual({ kind: "accept", founder: true });
    // The pen revokes the palm wherever it lands, even inside a local field
    // the canvas never claims; on the paper it then founds its own gesture.
    expect(arbiter.notePointerDown(pointer(PEN, "pen", PEN_TAKEOVER_WINDOW_MS))).toEqual([PALM]);
    expect(arbiter.claim(pointer(PEN, "pen", PEN_TAKEOVER_WINDOW_MS))).toEqual({ kind: "accept", founder: true });
    // The cancelled palm's later move, cancel, and click all belong to no one.
    expect(arbiter.isRejected(PALM)).toBe(true);
    expect(arbiter.ignoresCancel(pointer(PALM, "touch", 350))).toBe(true);
    expect(arbiter.consumeRejectedClick(PALM, 400)).toBe(true);
    arbiter.notePointerEnd(pointer(PALM, "touch", 400));
    // The pen still owns the canvas after the palm lifts.
    expect(down(arbiter, pointer(MOUSE, "mouse", 410))).toEqual({ kind: "reject" });
  });

  it("leaves an older touch gesture with its owner instead of taking it over", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(FINGER, "touch", 0));
    expect(arbiter.notePointerDown(pointer(PEN, "pen", PEN_TAKEOVER_WINDOW_MS + 1))).toEqual([]);
    expect(arbiter.claim(pointer(PEN, "pen", PEN_TAKEOVER_WINDOW_MS + 1))).toEqual({ kind: "reject" });
  });

  it("never lets a pen take over a pinch", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(FINGER, "touch", 0));
    expect(down(arbiter, pointer(PALM, "touch", 10))).toEqual({ kind: "accept", founder: false });
    arbiter.notePointerEnd(pointer(PALM, "touch", 20));
    expect(arbiter.notePointerDown(pointer(PEN, "pen", 30))).toEqual([]);
    expect(arbiter.claim(pointer(PEN, "pen", 30))).toEqual({ kind: "reject" });
  });

  it("allows a two-finger pinch when no pen is in contact", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(FINGER, "touch", 0))).toEqual({ kind: "accept", founder: true });
    expect(down(arbiter, pointer(PALM, "touch", 5))).toEqual({ kind: "accept", founder: false });
    // An owned pinch contact may always end, even if a pen arrives meanwhile.
    arbiter.notePointerDown(pointer(PEN, "pen", 8));
    expect(arbiter.ignoresCancel(pointer(PALM, "touch", 9))).toBe(false);
  });

  it("ignores an unknown touch cancel while the pen is active", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    expect(arbiter.ignoresCancel(pointer(PALM, "touch", 10))).toBe(true);
    arbiter.notePointerEnd(pointer(PEN, "pen", 20));
    expect(arbiter.ignoresCancel(pointer(PALM, "touch", 20 + PEN_PALM_GRACE_MS))).toBe(false);
  });

  it("gives one owner at a time across pointer types and keeps mouse unchanged alone", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(MOUSE, "mouse", 0))).toEqual({ kind: "accept", founder: true });
    expect(down(arbiter, pointer(FINGER, "touch", 5))).toEqual({ kind: "reject" });
    expect(down(arbiter, pointer(PEN, "pen", 6))).toEqual({ kind: "reject" });
    arbiter.notePointerEnd(pointer(MOUSE, "mouse", 10));
    arbiter.notePointerEnd(pointer(PEN, "pen", 10));
    expect(down(arbiter, pointer(MOUSE, "mouse", 20))).toEqual({ kind: "accept", founder: true });
  });

  it("rejects a second pen while one owns the canvas", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    expect(down(arbiter, pointer(9, "pen", 5))).toEqual({ kind: "reject" });
  });

  it("never lets a reused pointer id swallow the next accepted click", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(FINGER, "touch", 0));
    // A mouse press while a touch owns the canvas is rejected, and its click
    // never arrives because the mouse dragged away.
    expect(down(arbiter, pointer(MOUSE, "mouse", 10))).toEqual({ kind: "reject" });
    arbiter.notePointerEnd(pointer(MOUSE, "mouse", 20));
    arbiter.notePointerEnd(pointer(FINGER, "touch", 30));
    expect(down(arbiter, pointer(MOUSE, "mouse", 40))).toEqual({ kind: "accept", founder: true });
    expect(arbiter.consumeRejectedClick(MOUSE, 60)).toBe(false);
  });

  it("lets a contact that reuses an owned id found its own gesture after a lost end", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(FINGER, "touch", 0))).toEqual({ kind: "accept", founder: true });
    // The finger's end never reached the page. An id is unique among active
    // pointers, so its reuse proves that contact is over: a pan, not a pinch.
    expect(down(arbiter, pointer(FINGER, "touch", 500))).toEqual({ kind: "accept", founder: true });
  });

  it("keeps a pinch's other contact when one lost end is settled by id reuse", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(FINGER, "touch", 0));
    down(arbiter, pointer(PALM, "touch", 5));
    // The pinch partner is still down, so the returning id joins it.
    expect(down(arbiter, pointer(FINGER, "touch", 400))).toEqual({ kind: "accept", founder: false });
    expect(down(arbiter, pointer(MOUSE, "mouse", 410))).toEqual({ kind: "reject" });
  });

  it("does not carry a rejection whose end was lost into a new contact with its id", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    expect(down(arbiter, pointer(PALM, "touch", 10))).toEqual({ kind: "reject" });
    arbiter.notePointerEnd(pointer(PEN, "pen", 20));
    expect(down(arbiter, pointer(PALM, "touch", 20 + PEN_PALM_GRACE_MS))).toEqual({
      kind: "accept",
      founder: true,
    });
    expect(arbiter.isRejected(PALM)).toBe(false);
  });

  it("settles a pen whose release the page never saw at its next hover", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(PEN, "pen", 0))).toEqual({ kind: "accept", founder: true });
    arbiter.notePointerMove(pointer(PEN, "pen", 100));
    // The pen lifted outside the page; its pointer-up never arrived. Hovering
    // proves the lift, so a finger is no longer a palm and may own the canvas.
    arbiter.notePointerMove(hover(PEN, "pen", 1_000));
    expect(arbiter.penActive(1_000)).toBe(false);
    expect(down(arbiter, pointer(FINGER, "touch", 1_001))).toEqual({ kind: "accept", founder: true });
  });

  it("never lets hover refresh a lifted pen's grace", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    arbiter.notePointerMove(pointer(PEN, "pen", 100));
    // Grace belongs to the last real contact, not to the hover that proved it.
    arbiter.notePointerMove(hover(PEN, "pen", 200));
    arbiter.notePointerMove(hover(PEN, "pen", 450));
    expect(arbiter.penActive(100 + PEN_PALM_GRACE_MS - 1)).toBe(true);
    expect(arbiter.penActive(100 + PEN_PALM_GRACE_MS)).toBe(false);
  });

  it("settles a lost pen contact when the stylus returns under a new id", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    const returning = 9;
    // Out of range and back again: the same stylus hovers under a fresh id.
    arbiter.notePointerMove(hover(returning, "pen", 1_000));
    expect(arbiter.penActive(1_000)).toBe(false);
    expect(down(arbiter, pointer(returning, "pen", 1_100))).toEqual({ kind: "accept", founder: true });
    arbiter.notePointerEnd(pointer(returning, "pen", 1_200, 0));
    expect(arbiter.penActive(1_200 + PEN_PALM_GRACE_MS)).toBe(false);
  });

  it("settles a mouse owner whose button-up was lost at its next buttonless move", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(MOUSE, "mouse", 0))).toEqual({ kind: "accept", founder: true });
    arbiter.notePointerMove(pointer(MOUSE, "mouse", 20));
    expect(down(arbiter, pointer(FINGER, "touch", 30))).toEqual({ kind: "reject" });
    arbiter.notePointerEnd(pointer(FINGER, "touch", 40, 0));
    arbiter.notePointerMove(hover(MOUSE, "mouse", 50));
    expect(down(arbiter, pointer(FINGER, "touch", 60))).toEqual({ kind: "accept", founder: true });
  });

  it("does not count a barrel press while the pen hovers as contact", () => {
    const arbiter = createCanvasPointerArbiter();
    arbiter.notePointerDown(pointer(PEN, "pen", 0, 2));
    expect(arbiter.penActive(10)).toBe(false);
    expect(down(arbiter, pointer(FINGER, "touch", 10))).toEqual({ kind: "accept", founder: true });
    // The eraser, like the tip, touches the surface.
    const erasing = createCanvasPointerArbiter();
    erasing.notePointerDown(pointer(PEN, "pen", 0, 32));
    expect(erasing.penActive(10)).toBe(true);
  });

  it("forgets a rejected click after its time bound", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    down(arbiter, pointer(PALM, "touch", 10));
    expect(arbiter.consumeRejectedClick(PALM, 10 + REJECTED_CLICK_TTL_MS + 1)).toBe(false);
  });

  it("drops every owner and rejection on lifecycle loss", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(PEN, "pen", 0));
    down(arbiter, pointer(PALM, "touch", 10));
    arbiter.reset();
    expect(arbiter.isRejected(PALM)).toBe(false);
    expect(arbiter.penActive(11)).toBe(false);
    expect(down(arbiter, pointer(FINGER, "touch", 12))).toEqual({ kind: "accept", founder: true });
  });
});

describe("touch commitment", () => {
  const origin = { pointerId: FINGER, clientX: 100, clientY: 100 };

  it("waits while the touch rests within the slop", () => {
    expect(TOUCH_COMMIT_SLOP_PX).toBe(8);
    expect(touchCommitment(origin, { type: "move", pointerId: FINGER, clientX: 104, clientY: 104 })).toBe("wait");
  });

  it("commits when the touch travels, ends as a tap, or outlives the takeover window", () => {
    expect(touchCommitment(origin, { type: "move", pointerId: FINGER, clientX: 108, clientY: 100 })).toBe("commit");
    expect(touchCommitment(origin, { type: "end", pointerId: FINGER, cancelled: false })).toBe("commit");
    expect(touchCommitment(origin, { type: "window-elapsed" })).toBe("commit");
  });

  it("discards when a pen lands first or the browser cancels the touch", () => {
    expect(touchCommitment(origin, { type: "pen-down" })).toBe("discard");
    expect(touchCommitment(origin, { type: "end", pointerId: FINGER, cancelled: true })).toBe("discard");
  });

  it("ignores every other pointer", () => {
    expect(touchCommitment(origin, { type: "move", pointerId: PALM, clientX: 400, clientY: 400 })).toBe("wait");
    expect(touchCommitment(origin, { type: "end", pointerId: PALM, cancelled: false })).toBe("wait");
  });
});
