import { describe, expect, it } from "vitest";
import {
  acknowledgeOutcome,
  currentOutcome,
  EMPTY_OUTCOME_LINE,
  reportOutcome,
  type MaterialOutcome,
  type OutcomeLine,
} from "./outcome-line";

const EXPANSION: MaterialOutcome = { owner: "expansion", reason: "unavailable" };
const REWRITE: MaterialOutcome = { owner: "rewrite", reason: "stale" };
const WIKI: MaterialOutcome = { owner: "wiki", reason: "unsaved" };

function report(...outcomes: MaterialOutcome[]): OutcomeLine {
  return outcomes.reduce(reportOutcome, EMPTY_OUTCOME_LINE);
}

describe("outcome line", () => {
  it("shows outcomes that end together one at a time, oldest first", () => {
    const line = report(EXPANSION, REWRITE, WIKI);
    expect(currentOutcome(line)).toMatchObject(EXPANSION);
    const afterFirst = acknowledgeOutcome(line, currentOutcome(line)!.id);
    expect(currentOutcome(afterFirst)).toMatchObject(REWRITE);
    const afterSecond = acknowledgeOutcome(afterFirst, currentOutcome(afterFirst)!.id);
    expect(currentOutcome(afterSecond)).toMatchObject(WIKI);
    expect(currentOutcome(acknowledgeOutcome(afterSecond, currentOutcome(afterSecond)!.id)))
      .toBeNull();
  });

  it("holds at most one outcome per owner, the newest in its owner's place", () => {
    const line = report(EXPANSION, REWRITE, { owner: "expansion", reason: "stale" }, REWRITE);
    expect(line.entries.map(({ owner, reason }) => `${owner}:${reason}`)).toEqual([
      "expansion:stale",
      "rewrite:stale",
    ]);
    // Every report is a fresh announcement.
    const ids = line.entries.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBe(line.lastId);
  });

  it("stays bounded by its owners however many reports arrive", () => {
    let line = EMPTY_OUTCOME_LINE;
    for (let index = 0; index < 50; index += 1) {
      line = reportOutcome(line, [EXPANSION, REWRITE, WIKI][index % 3]!);
    }
    expect(line.entries).toHaveLength(3);
  });

  it("acknowledges only the outcome that was shown", () => {
    const line = report(EXPANSION, REWRITE);
    const queued = line.entries[1]!;
    // An action taken while a queued outcome was never shown does not retire it.
    expect(acknowledgeOutcome(line, queued.id)).toBe(line);
    // A replaced entry's old id no longer names anything.
    const replaced = reportOutcome(line, { owner: "expansion", reason: "stale" });
    expect(acknowledgeOutcome(replaced, line.entries[0]!.id)).toBe(replaced);
    expect(acknowledgeOutcome(EMPTY_OUTCOME_LINE, 1)).toBe(EMPTY_OUTCOME_LINE);
  });

  it("keeps each line immutable", () => {
    const line = report(EXPANSION);
    expect(Object.isFrozen(line)).toBe(true);
    expect(Object.isFrozen(line.entries)).toBe(true);
    expect(Object.isFrozen(line.entries[0])).toBe(true);
  });
});
