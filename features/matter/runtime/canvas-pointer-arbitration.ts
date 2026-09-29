/**
 * One gesture owner for the canvas, and palm rejection while a pen writes.
 *
 * Pointer Events define `isPrimary` per pointer type, so a palm that lands
 * during a pen stroke is itself primary and used to fall through into node
 * drag, pan, or a pinch, stealing capture and stale-epoching the stroke. There
 * is no hidden persistent "pen mode": rejection lasts exactly while a pen is in
 * contact and for a short grace after its last contact event.
 *
 * Rules, all driven by values the caller passes (event time included):
 * - a touch pointer-down while a pen is in contact, or within
 *   `PEN_PALM_GRACE_MS` of its last contact event, is rejected;
 * - a pen that lands anywhere within `PEN_TAKEOVER_WINDOW_MS` of a
 *   single-finger touch takes the canvas over, even inside a local field: the
 *   caller cancels that touch and restores what it had changed;
 * - otherwise the first pointer owns the gesture. Only another touch may join
 *   a touch owner (a pinch); any other pointer-down is rejected until the owner
 *   ends;
 * - every later event of a rejected pointer is ignored, and so is an unknown
 *   touch's cancel while a pen is active, which would otherwise clear state the
 *   pen owns;
 * - a pointer-down that reuses an id still held as owned or rejected settles
 *   that earlier contact first. Pointer Events keep an id unique among active
 *   pointers, so the reuse proves the earlier end was never delivered here;
 * - a move with nothing pressed proves the same for its own pointer, and a
 *   hovering pen proves it for every pen contact still recorded, whatever its
 *   id: a stylus gets a fresh id when it returns into range, and one touch
 *   screen carries one stylus. A settled contact keeps the grace of its last
 *   real contact event; hover never refreshes it.
 *
 * Pen hover does not count as activity: a person may pan with a finger while
 * holding a pencil above the glass.
 *
 * The browser edge notes every down, move, and end in the window capture
 * phase, so a control that stops propagation cannot strand a pen "in contact"
 * or an owner forever. Because that runs before the canvas's own handlers, an
 * ended pointer keeps its disposition until the next pointer-down anywhere.
 */
export const PEN_PALM_GRACE_MS = 400;
export const PEN_TAKEOVER_WINDOW_MS = 300;
/** A rejected tap's click follows its pointer-up; older records are dropped. */
export const REJECTED_CLICK_TTL_MS = 1_000;

export type ArbitratedPointer = Readonly<{
  pointerId: number;
  pointerType: string;
  /** `PointerEvent.buttons`: what the pointer presses, a pen tip or eraser included. */
  buttons: number;
  /** `Event.timeStamp`: monotonic milliseconds shared by one document. */
  timeStamp: number;
}>;

/** A pen touches the surface with its tip (1) or its eraser (32), never its barrel. */
const PEN_CONTACT_BUTTONS = 1 | 32;

export type CanvasPointerClaim =
  | Readonly<{ kind: "reject" }>
  /** `founder` is false for a touch joining an existing touch owner. */
  | Readonly<{ kind: "accept"; founder: boolean }>;

type OwnerType = "mouse" | "pen" | "touch";

type Owner = {
  readonly type: OwnerType;
  readonly pointerIds: Set<number>;
  readonly startedAt: number;
  /** Every contact that ever joined; a lifted finger still made it a pinch. */
  contactsSeen: number;
};

export type CanvasPointerArbiter = Readonly<{
  /**
   * Window capture phase, for every pointer-down anywhere. Returns the touches
   * a pen revoked by landing just after them; the caller cancels them.
   */
  notePointerDown: (pointer: ArbitratedPointer) => readonly number[];
  /**
   * Window capture phase, for every pointer-move anywhere, hover included. A
   * move with nothing pressed settles a release the page never saw.
   */
  notePointerMove: (pointer: ArbitratedPointer) => void;
  /** Window capture phase, for every pointer-up and pointer-cancel anywhere. */
  notePointerEnd: (pointer: ArbitratedPointer) => void;
  /** The canvas's ownership decision for a pointer-down it would handle. */
  claim: (pointer: ArbitratedPointer) => CanvasPointerClaim;
  isRejected: (pointerId: number) => boolean;
  ignoresCancel: (pointer: ArbitratedPointer) => boolean;
  /** True once for the click that follows a rejected tap. */
  consumeRejectedClick: (pointerId: number, timeStamp: number) => boolean;
  penActive: (timeStamp: number) => boolean;
  reset: () => void;
}>;

export function createCanvasPointerArbiter(): CanvasPointerArbiter {
  const pensInContact = new Set<number>();
  let lastPenContactAt: number | null = null;
  let owner: Owner | null = null;
  const rejected = new Set<number>();
  const endedRejected = new Set<number>();
  const endedOwned = new Set<number>();
  const rejectedClicks = new Map<number, number>();

  const penActive = (timeStamp: number) =>
    pensInContact.size > 0 ||
    (lastPenContactAt !== null && timeStamp - lastPenContactAt < PEN_PALM_GRACE_MS);

  const rejectAt = (pointerId: number, timeStamp: number) => {
    rejected.add(pointerId);
    rejectedClicks.set(pointerId, timeStamp);
  };

  /** Ends one contact; a pen's grace stays with its last real contact event. */
  const settleEnd = (pointerId: number) => {
    pensInContact.delete(pointerId);
    if (rejected.delete(pointerId)) endedRejected.add(pointerId);
    if (owner !== null && owner.pointerIds.delete(pointerId)) {
      endedOwned.add(pointerId);
      if (owner.pointerIds.size === 0) owner = null;
    }
  };

  const found = (type: OwnerType, pointer: ArbitratedPointer) => {
    owner = {
      type,
      pointerIds: new Set([pointer.pointerId]),
      startedAt: pointer.timeStamp,
      contactsSeen: 1,
    };
  };

  return Object.freeze({
    notePointerDown(pointer: ArbitratedPointer) {
      // Every event of an earlier contact has been dispatched by now.
      endedRejected.clear();
      endedOwned.clear();
      // A lost end would otherwise strand the owner, and every later touch
      // would join a pinch that no longer exists.
      rejected.delete(pointer.pointerId);
      if (owner !== null && owner.pointerIds.delete(pointer.pointerId) && owner.pointerIds.size === 0) {
        owner = null;
      }
      for (const [pointerId, rejectedAt] of rejectedClicks) {
        if (pointer.timeStamp - rejectedAt > REJECTED_CLICK_TTL_MS) rejectedClicks.delete(pointerId);
      }
      // A new contact with a reused id (a mouse is always 1) owns its own
      // click; only a claim that rejects it may suppress that click again.
      rejectedClicks.delete(pointer.pointerId);
      // A barrel press while the pen hovers touches nothing.
      if (pointer.pointerType !== "pen" || !pressesSurface(pointer)) return NONE;
      pensInContact.add(pointer.pointerId);
      lastPenContactAt = pointer.timeStamp;
      if (
        owner?.type !== "touch" ||
        owner.contactsSeen !== 1 ||
        pointer.timeStamp - owner.startedAt > PEN_TAKEOVER_WINDOW_MS
      ) return NONE;
      const revoked = Object.freeze(Array.from(owner.pointerIds));
      for (const pointerId of revoked) rejectAt(pointerId, pointer.timeStamp);
      owner = null;
      return revoked;
    },
    notePointerMove(pointer: ArbitratedPointer) {
      if (pressesSurface(pointer)) {
        if (pointer.pointerType === "pen" && pensInContact.has(pointer.pointerId)) {
          lastPenContactAt = pointer.timeStamp;
        }
        return;
      }
      // Nothing is pressed, so a contact still recorded ended where this page
      // could not see it. A hovering stylus ends every recorded pen contact.
      if (pointer.pointerType === "pen") {
        for (const pointerId of Array.from(pensInContact)) settleEnd(pointerId);
      }
      if (
        rejected.has(pointer.pointerId) ||
        owner?.pointerIds.has(pointer.pointerId) === true
      ) settleEnd(pointer.pointerId);
    },
    notePointerEnd(pointer: ArbitratedPointer) {
      if (pointer.pointerType === "pen" && pensInContact.has(pointer.pointerId)) {
        lastPenContactAt = pointer.timeStamp;
      }
      settleEnd(pointer.pointerId);
    },
    claim(pointer: ArbitratedPointer): CanvasPointerClaim {
      const type = ownerType(pointer.pointerType);
      if (type === "touch") {
        if (penActive(pointer.timeStamp)) {
          rejectAt(pointer.pointerId, pointer.timeStamp);
          return REJECT;
        }
        if (owner === null) {
          found("touch", pointer);
          return FOUNDER;
        }
        if (owner.type !== "touch") {
          rejectAt(pointer.pointerId, pointer.timeStamp);
          return REJECT;
        }
        owner.pointerIds.add(pointer.pointerId);
        owner.contactsSeen += 1;
        return JOINED;
      }
      if (owner !== null) {
        rejectAt(pointer.pointerId, pointer.timeStamp);
        return REJECT;
      }
      found(type, pointer);
      return FOUNDER;
    },
    isRejected: (pointerId: number) => rejected.has(pointerId) || endedRejected.has(pointerId),
    ignoresCancel(pointer: ArbitratedPointer) {
      if (rejected.has(pointer.pointerId) || endedRejected.has(pointer.pointerId)) return true;
      // A touch the canvas owns must always be able to end, or a pinch could
      // stay stuck; only a touch it never owned is ignored beside a pen.
      const owned = owner?.pointerIds.has(pointer.pointerId) === true ||
        endedOwned.has(pointer.pointerId);
      return pointer.pointerType === "touch" && !owned && penActive(pointer.timeStamp);
    },
    consumeRejectedClick(pointerId: number, timeStamp: number) {
      const rejectedAt = rejectedClicks.get(pointerId);
      if (rejectedAt === undefined) return false;
      rejectedClicks.delete(pointerId);
      return timeStamp - rejectedAt <= REJECTED_CLICK_TTL_MS;
    },
    penActive,
    reset() {
      pensInContact.clear();
      lastPenContactAt = null;
      owner = null;
      rejected.clear();
      endedRejected.clear();
      endedOwned.clear();
      rejectedClicks.clear();
    },
  });
}

/** Travel after which a touch is a real gesture rather than a resting palm. */
export const TOUCH_COMMIT_SLOP_PX = 8;

export type TouchCommitmentOrigin = Readonly<{ pointerId: number; clientX: number; clientY: number }>;

export type TouchCommitmentSignal =
  | Readonly<{ type: "move"; pointerId: number; clientX: number; clientY: number }>
  | Readonly<{ type: "end"; pointerId: number; cancelled: boolean }>
  | Readonly<{ type: "pen-down" }>
  | Readonly<{ type: "window-elapsed" }>;

/**
 * A touch that founds a canvas gesture may be a palm that a pen is about to
 * follow. Effects that dismiss a person's work (a Point and Talk draft, a
 * committed Elastic degree, a repair presentation) wait until that touch
 * commits: it travels beyond the slop, ends as a tap, or outlives the pen
 * takeover window. A pen landing first, or the browser cancelling the touch,
 * discards them. Only that touch's own events count.
 */
export function touchCommitment(
  origin: TouchCommitmentOrigin,
  signal: TouchCommitmentSignal,
): "commit" | "discard" | "wait" {
  switch (signal.type) {
    case "pen-down":
      return "discard";
    case "window-elapsed":
      return "commit";
    case "end":
      if (signal.pointerId !== origin.pointerId) return "wait";
      return signal.cancelled ? "discard" : "commit";
    case "move":
      if (signal.pointerId !== origin.pointerId) return "wait";
      return Math.hypot(signal.clientX - origin.clientX, signal.clientY - origin.clientY) >=
          TOUCH_COMMIT_SLOP_PX
        ? "commit"
        : "wait";
  }
}

const NONE: readonly number[] = Object.freeze([]);
const REJECT: CanvasPointerClaim = Object.freeze({ kind: "reject" });
const FOUNDER: CanvasPointerClaim = Object.freeze({ kind: "accept", founder: true });
const JOINED: CanvasPointerClaim = Object.freeze({ kind: "accept", founder: false });

function pressesSurface(pointer: ArbitratedPointer): boolean {
  return pointer.pointerType === "pen"
    ? (pointer.buttons & PEN_CONTACT_BUTTONS) !== 0
    : pointer.buttons !== 0;
}

function ownerType(pointerType: string): OwnerType {
  return pointerType === "pen" || pointerType === "touch" ? pointerType : "mouse";
}
