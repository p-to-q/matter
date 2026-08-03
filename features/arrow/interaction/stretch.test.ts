import { describe, expect, it } from "vitest";
import { stretchAmountFromDrag, targetCharacterRange } from "./stretch";

describe("stretch mapping", () => {
  it("maps both handles to the same expand/compress meaning", () => {
    expect(stretchAmountFromDrag(0, 60, "bottom")).toBe(0.5);
    expect(stretchAmountFromDrag(0, -60, "top")).toBe(0.5);
    expect(stretchAmountFromDrag(0, -60, "bottom")).toBe(-0.5);
  });

  it("clamps degree and returns bounded writing targets", () => {
    expect(stretchAmountFromDrag(0, 999, "bottom")).toBe(1);
    expect(targetCharacterRange(20, 1)).toEqual({ min: 71, max: 97 });
    expect(targetCharacterRange(20, -1)).toEqual({ min: 2, max: 9 });
  });
});
