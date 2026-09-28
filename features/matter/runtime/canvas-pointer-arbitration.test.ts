import { describe, expect, it } from "vitest";
import {
  createCanvasPointerArbiter,
  PEN_PALM_GRACE_MS,
  PEN_TAKEOVER_WINDOW_MS,
  REJECTED_CLICK_TTL_MS,
  type ArbitratedPointer,
  type CanvasPointerArbiter,
} from "./canvas-pointer-arbitration";

const PEN = 1;
const PALM = 2;
const SECOND_PALM = 3;
const FINGER = 4;
const MOUSE = 5;

function pointer(pointerId: number, pointerType: string, timeStamp: number): ArbitratedPointer {
  return { pointerId, pointerType, timeStamp };
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
    arbiter.notePointerMove(pointer(PEN, "pen", 0));
    expect(arbiter.penActive(10)).toBe(false);
    expect(down(arbiter, pointer(FINGER, "touch", 10))).toEqual({ kind: "accept", founder: true });
  });

  it("lets a pen take over a single-finger touch that began just before it", () => {
    const arbiter = createCanvasPointerArbiter();
    expect(down(arbiter, pointer(PALM, "touch", 0))).toEqual({ kind: "accept", founder: true });
    expect(down(arbiter, pointer(PEN, "pen", PEN_TAKEOVER_WINDOW_MS))).toEqual({
      kind: "takeover",
      cancelledTouchIds: [PALM],
    });
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
    expect(down(arbiter, pointer(PEN, "pen", PEN_TAKEOVER_WINDOW_MS + 1))).toEqual({ kind: "reject" });
  });

  it("never lets a pen take over a pinch", () => {
    const arbiter = createCanvasPointerArbiter();
    down(arbiter, pointer(FINGER, "touch", 0));
    expect(down(arbiter, pointer(PALM, "touch", 10))).toEqual({ kind: "accept", founder: false });
    arbiter.notePointerEnd(pointer(PALM, "touch", 20));
    expect(down(arbiter, pointer(PEN, "pen", 30))).toEqual({ kind: "reject" });
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
