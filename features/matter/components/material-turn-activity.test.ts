import { describe, expect, it } from "vitest";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import {
  materialIsIdle,
  materialTurnsHoldBasis,
  samePaperActivity,
  IDLE_PAPER_ACTIVITY,
} from "./material-turn-activity";

describe("material turn activity", () => {
  it("keeps a document replacement waiting for every turn, Ask Matter, and an open name editor", () => {
    expect(materialIsIdle({ admission: "idle", paper: IDLE_PAPER_ACTIVITY })).toBe(true);
    expect(materialIsIdle({ admission: "recording", paper: IDLE_PAPER_ACTIVITY })).toBe(false);
    for (const paper of [
      { ...IDLE_PAPER_ACTIVITY, textSwap: "pending" as const },
      { ...IDLE_PAPER_ACTIVITY, textSwap: "ready" as const },
      { ...IDLE_PAPER_ACTIVITY, elastic: "requesting" as const },
      { ...IDLE_PAPER_ACTIVITY, inquiryHeld: true },
      { ...IDLE_PAPER_ACTIVITY, editingHeld: true },
    ]) {
      expect(materialIsIdle({ admission: "idle", paper })).toBe(false);
    }
    // Ask Matter and name editors do not hold seed copy, so relocalization proceeds.
    expect(materialTurnsHoldBasis({
      admission: "idle",
      paper: { ...IDLE_PAPER_ACTIVITY, inquiryHeld: true, editingHeld: true },
    })).toBe(false);
  });

  it("lets seed relocalization run only when every material turn has settled", () => {
    expect(materialTurnsHoldBasis({
      admission: "idle",
      paper: IDLE_PAPER_ACTIVITY,
    })).toBe(false);
  });

  it.each(["requesting", "recording", "stopping", "transcribing", "committing", "error"] as const)(
    "holds relocalization while Voice admission is %s",
    (admission) => {
      expect(materialTurnsHoldBasis({ admission, paper: IDLE_PAPER_ACTIVITY })).toBe(true);
    },
  );

  it("holds relocalization while an Elastic request or parked result is outstanding", () => {
    expect(materialTurnsHoldBasis({
      admission: "idle",
      paper: { ...IDLE_PAPER_ACTIVITY, elastic: "requesting" },
    })).toBe(true);
  });

  it.each([
    ["eligible", true],
    ["permission", true],
    ["recording", true],
    ["transcribing", true],
    ["ready", true],
    ["pending", true],
    ["error", true],
    ["success", false],
    ["stale", false],
    ["idle", false],
  ] satisfies readonly [TextSwapInteractionState["phase"], boolean][])(
    "treats a Point-and-Talk turn in %s as holding its basis: %s",
    (textSwap, holds) => {
      expect(materialTurnsHoldBasis({
        admission: "idle",
        paper: { ...IDLE_PAPER_ACTIVITY, textSwap },
      })).toBe(holds);
    },
  );

  it("compares every reported field by value", () => {
    expect(samePaperActivity(
      { ...IDLE_PAPER_ACTIVITY, textSwap: "pending" },
      { ...IDLE_PAPER_ACTIVITY, textSwap: "pending" },
    )).toBe(true);
    for (const changed of [
      { elastic: "requesting" as const },
      { textSwap: "pending" as const },
      { inquiryHeld: true },
      { editingHeld: true },
    ]) {
      expect(samePaperActivity(IDLE_PAPER_ACTIVITY, { ...IDLE_PAPER_ACTIVITY, ...changed })).toBe(false);
    }
  });
});
