import { describe, expect, it, vi } from "vitest";
import type { WikiAdmissionTurn } from "../wiki/wiki-admission";
import {
  MAX_WIKI_ADMISSION_QUEUE_CODE_UNITS,
  MAX_WIKI_ADMISSION_QUEUE_TURNS,
  createWikiAdmissionQueue,
} from "./wiki-admission-queue";

describe("Wiki admission queue", () => {
  it("keeps learning in FIFO order without ever waiting on the caller", async () => {
    const queue = createWikiAdmissionQueue();
    const learned: string[] = [];
    const learn = vi.fn(async (value: WikiAdmissionTurn) => {
      learned.push(value.committed.text);
    });

    queue.enqueue(turn("first"), learn);
    queue.enqueue(turn("second"), learn);
    queue.enqueue(turn("third"), learn);

    await vi.waitFor(() => expect(queue.readReceipt().completedTurns).toBe(3));
    expect(learned).toEqual(["first", "second", "third"]);
    expect(queue.readReceipt()).toEqual({
      waitingTurns: 0,
      waitingCodeUnits: 0,
      completedTurns: 3,
      droppedTurns: 0,
    });
  });

  it("bounds waiting turns under pressure and drops the oldest first", async () => {
    const queue = createWikiAdmissionQueue();
    const gate = deferred();
    const learned: string[] = [];
    const learn = async (value: WikiAdmissionTurn) => {
      await gate.promise;
      learned.push(value.committed.text);
    };

    for (let index = 0; index < 1_000; index += 1) {
      queue.enqueue(turn(`t${index}`), learn);
      expect(queue.readReceipt().waitingTurns)
        .toBeLessThanOrEqual(MAX_WIKI_ADMISSION_QUEUE_TURNS);
    }
    expect(queue.readReceipt()).toMatchObject({
      waitingTurns: MAX_WIKI_ADMISSION_QUEUE_TURNS,
      droppedTurns: 1_000 - 1 - MAX_WIKI_ADMISSION_QUEUE_TURNS,
    });

    gate.resolve();
    await vi.waitFor(() => expect(queue.readReceipt().waitingTurns).toBe(0));
    await vi.waitFor(() => expect(learned).toHaveLength(1 + MAX_WIKI_ADMISSION_QUEUE_TURNS));
    expect(learned[0]).toBe("t0");
    expect(learned.slice(1)).toEqual(Array.from(
      { length: MAX_WIKI_ADMISSION_QUEUE_TURNS },
      (_, index) => `t${1_000 - MAX_WIKI_ADMISSION_QUEUE_TURNS + index}`,
    ));
  });

  it("bounds retained text and drops a turn larger than the whole budget", async () => {
    const queue = createWikiAdmissionQueue({ maxTurns: 8, maxCodeUnits: 20 });
    const gate = deferred();
    const learned: string[] = [];
    const learn = async (value: WikiAdmissionTurn) => {
      await gate.promise;
      learned.push(value.committed.text);
    };

    queue.enqueue(turn("run"), learn);
    queue.enqueue(turn("aaaa"), learn);
    queue.enqueue(turn("bbbb"), learn);
    expect(queue.readReceipt()).toMatchObject({ waitingTurns: 2, waitingCodeUnits: 16 });
    queue.enqueue(turn("cccc"), learn);
    expect(queue.readReceipt()).toMatchObject({
      waitingTurns: 2,
      waitingCodeUnits: 16,
      droppedTurns: 1,
    });
    queue.enqueue(turn("x".repeat(11)), learn);
    expect(queue.readReceipt()).toMatchObject({ waitingTurns: 2, droppedTurns: 2 });

    gate.resolve();
    await vi.waitFor(() => expect(learned).toEqual(["run", "bbbb", "cccc"]));
    expect(MAX_WIKI_ADMISSION_QUEUE_CODE_UNITS).toBeGreaterThan(
      MAX_WIKI_ADMISSION_QUEUE_TURNS * 2 * 2_000,
    );
  });

  it("isolates one failed turn and releases every waiting turn on dispose", async () => {
    const queue = createWikiAdmissionQueue();
    const gate = deferred();
    const learned: string[] = [];
    queue.enqueue(turn("fails"), async () => {
      throw new Error("advisory");
    });
    queue.enqueue(turn("after"), async (value) => {
      learned.push(value.committed.text);
    });
    await vi.waitFor(() => expect(learned).toEqual(["after"]));

    queue.enqueue(turn("blocked"), async () => gate.promise);
    queue.enqueue(turn("waiting"), async (value) => {
      learned.push(value.committed.text);
    });
    queue.dispose();
    expect(queue.readReceipt()).toMatchObject({ waitingTurns: 0, waitingCodeUnits: 0 });
    queue.enqueue(turn("late"), async (value) => {
      learned.push(value.committed.text);
    });
    gate.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(learned).toEqual(["after"]);
  });

  it("rejects invalid bounds at construction", () => {
    expect(() => createWikiAdmissionQueue({ maxTurns: 0, maxCodeUnits: 1 }))
      .toThrow(RangeError);
    expect(() => createWikiAdmissionQueue({ maxTurns: 1, maxCodeUnits: 0.5 }))
      .toThrow(RangeError);
  });
});

function turn(text: string): WikiAdmissionTurn {
  const observation = Object.freeze({ locale: "en-US" as const, channel: "spoken" as const, text });
  return Object.freeze({ observed: observation, committed: observation });
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
