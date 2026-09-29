import { describe, expect, it } from "vitest";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import {
  materialIsIdle,
  materialTurnsHoldBasis,
  samePaperMaterialTurnPhases,
  SETTLED_PAPER_MATERIAL_TURNS,
} from "./material-turn-activity";

describe("material turn activity", () => {
  it("keeps a document replacement waiting for every turn, Ask Matter, and an open name editor", () => {
    expect(materialIsIdle({ admission: "idle", paper: SETTLED_PAPER_MATERIAL_TURNS })).toBe(true);
    expect(materialIsIdle({ admission: "recording", paper: SETTLED_PAPER_MATERIAL_TURNS })).toBe(false);
    for (const paper of [
      { ...SETTLED_PAPER_MATERIAL_TURNS, textSwap: "pending" as const },
      { ...SETTLED_PAPER_MATERIAL_TURNS, textSwap: "ready" as const },
      { ...SETTLED_PAPER_MATERIAL_TURNS, elastic: "requesting" as const },
      { ...SETTLED_PAPER_MATERIAL_TURNS, inquiryHeld: true },
      { ...SETTLED_PAPER_MATERIAL_TURNS, editingHeld: true },
    ]) {
      expect(materialIsIdle({ admission: "idle", paper })).toBe(false);
    }
    // Ask Matter and name editors do not hold seed copy, so relocalization proceeds.
    expect(materialTurnsHoldBasis({
      admission: "idle",
      paper: { ...SETTLED_PAPER_MATERIAL_TURNS, inquiryHeld: true, editingHeld: true },
    })).toBe(false);
  });

  it("lets seed relocalization run only when every material turn has settled", () => {
    expect(materialTurnsHoldBasis({
      admission: "idle",
      paper: SETTLED_PAPER_MATERIAL_TURNS,
    })).toBe(false);
  });

  it.each(["requesting", "recording", "stopping", "transcribing", "committing", "error"] as const)(
    "holds relocalization while Voice admission is %s",
    (admission) => {
      expect(materialTurnsHoldBasis({ admission, paper: SETTLED_PAPER_MATERIAL_TURNS })).toBe(true);
    },
  );

  it("holds relocalization while an Elastic request or parked result is outstanding", () => {
    expect(materialTurnsHoldBasis({
      admission: "idle",
      paper: { ...SETTLED_PAPER_MATERIAL_TURNS, elastic: "requesting" },
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
        paper: { ...SETTLED_PAPER_MATERIAL_TURNS, textSwap },
      })).toBe(holds);
    },
  );

  it("compares reported phases by value", () => {
    expect(samePaperMaterialTurnPhases(
      { ...SETTLED_PAPER_MATERIAL_TURNS, textSwap: "pending" },
      { ...SETTLED_PAPER_MATERIAL_TURNS, textSwap: "pending" },
    )).toBe(true);
    expect(samePaperMaterialTurnPhases(
      SETTLED_PAPER_MATERIAL_TURNS,
      { ...SETTLED_PAPER_MATERIAL_TURNS, elastic: "requesting" },
    )).toBe(false);
    expect(samePaperMaterialTurnPhases(
      SETTLED_PAPER_MATERIAL_TURNS,
      { ...SETTLED_PAPER_MATERIAL_TURNS, editingHeld: true },
    )).toBe(false);
  });
});
