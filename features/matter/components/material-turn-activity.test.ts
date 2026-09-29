import { describe, expect, it } from "vitest";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import {
  materialTurnsHoldBasis,
  samePaperMaterialTurnPhases,
  SETTLED_PAPER_MATERIAL_TURNS,
} from "./material-turn-activity";

describe("material turn activity", () => {
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
      paper: { elastic: "requesting", textSwap: "idle" },
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
        paper: { elastic: "idle", textSwap },
      })).toBe(holds);
    },
  );

  it("compares reported phases by value", () => {
    expect(samePaperMaterialTurnPhases(
      { elastic: "idle", textSwap: "pending" },
      { elastic: "idle", textSwap: "pending" },
    )).toBe(true);
    expect(samePaperMaterialTurnPhases(
      SETTLED_PAPER_MATERIAL_TURNS,
      { elastic: "requesting", textSwap: "idle" },
    )).toBe(false);
  });
});
