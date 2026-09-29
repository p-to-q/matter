import type { WikiAdmissionTurn } from "../wiki/wiki-admission";

/**
 * Background FIFO for successful human turns awaiting Wiki learning.
 *
 * Learning is optional and material never waits for it, so this queue is
 * bounded by turn count and by retained text rather than by back-pressure.
 * When a new turn would exceed either bound, the oldest waiting turns are
 * dropped first: recent evidence is worth more than a stale backlog, and a
 * dropped turn only costs one logical learning tick. A single turn larger
 * than the text bound is dropped on arrival. The turn in progress is outside
 * the waiting bounds and is never interrupted. The receipt holds counts only.
 */

export const MAX_WIKI_ADMISSION_QUEUE_TURNS = 16;
/** UTF-16 code units of retained observed plus committed text. */
export const MAX_WIKI_ADMISSION_QUEUE_CODE_UNITS = 64 * 1_024;

export type WikiAdmissionQueueBounds = Readonly<{
  maxTurns: number;
  maxCodeUnits: number;
}>;

export type WikiAdmissionQueueReceipt = Readonly<{
  waitingTurns: number;
  waitingCodeUnits: number;
  completedTurns: number;
  droppedTurns: number;
}>;

export type WikiAdmissionLearner = (turn: WikiAdmissionTurn) => Promise<void>;

export type WikiAdmissionQueue = Readonly<{
  /** The learner travels with its turn so a refreshed module never runs a
   * stale learner captured by an older queue owner. */
  enqueue(turn: WikiAdmissionTurn, learn: WikiAdmissionLearner): void;
  readReceipt(): WikiAdmissionQueueReceipt;
  dispose(): void;
}>;

type WaitingTurn = Readonly<{
  turn: WikiAdmissionTurn;
  learn: WikiAdmissionLearner;
  codeUnits: number;
}>;

export const WIKI_ADMISSION_QUEUE_BOUNDS: WikiAdmissionQueueBounds = Object.freeze({
  maxTurns: MAX_WIKI_ADMISSION_QUEUE_TURNS,
  maxCodeUnits: MAX_WIKI_ADMISSION_QUEUE_CODE_UNITS,
});

export function createWikiAdmissionQueue(
  bounds: WikiAdmissionQueueBounds = WIKI_ADMISSION_QUEUE_BOUNDS,
): WikiAdmissionQueue {
  if (!Number.isSafeInteger(bounds.maxTurns) || bounds.maxTurns < 1 ||
      !Number.isSafeInteger(bounds.maxCodeUnits) || bounds.maxCodeUnits < 1) {
    throw new RangeError("Wiki admission queue bounds are invalid.");
  }
  const waiting: WaitingTurn[] = [];
  let waitingCodeUnits = 0;
  let completedTurns = 0;
  let droppedTurns = 0;
  let draining = false;
  let disposed = false;

  const drop = () => {
    droppedTurns = saturatingIncrement(droppedTurns);
  };

  const drain = async () => {
    draining = true;
    try {
      while (!disposed && waiting.length > 0) {
        const next = waiting.shift()!;
        waitingCodeUnits -= next.codeUnits;
        try {
          await next.learn(next.turn);
        } catch {
          // Automatic evidence is advisory; one failed turn cannot block later admissions.
        }
        completedTurns = saturatingIncrement(completedTurns);
      }
    } finally {
      draining = false;
    }
  };

  return Object.freeze({
    enqueue(turn, learn) {
      if (disposed) return;
      const codeUnits = turnCodeUnits(turn);
      if (codeUnits > bounds.maxCodeUnits) {
        drop();
        return;
      }
      while (waiting.length > 0 && (
        waiting.length >= bounds.maxTurns ||
        waitingCodeUnits + codeUnits > bounds.maxCodeUnits
      )) {
        waitingCodeUnits -= waiting.shift()!.codeUnits;
        drop();
      }
      waiting.push(Object.freeze({ turn, learn, codeUnits }));
      waitingCodeUnits += codeUnits;
      if (!draining) void drain();
    },
    readReceipt: () => Object.freeze({
      waitingTurns: waiting.length,
      waitingCodeUnits,
      completedTurns,
      droppedTurns,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      waiting.length = 0;
      waitingCodeUnits = 0;
    },
  });
}

function turnCodeUnits(turn: WikiAdmissionTurn): number {
  return turn.observed.text.length + turn.committed.text.length;
}

function saturatingIncrement(value: number): number {
  return value === Number.MAX_SAFE_INTEGER ? value : value + 1;
}
