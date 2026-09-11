import { describe, expect, it } from "vitest";
import { MAX_TEXT_SWAP_DIRECTION_CODE_POINTS } from "../protocol/text-swap-policy";
import { constrainPointTalkDirectionInput } from "./point-talk-direction-input";

describe("Point Talk direction input", () => {
  it("accepts the exact protocol boundary for BMP and astral text", () => {
    for (const unit of ["a", "😀"]) {
      const exact = unit.repeat(MAX_TEXT_SWAP_DIRECTION_CODE_POINTS);
      expect(constrainPointTalkDirectionInput(exact)).toBe(exact);
    }
  });

  it("truncates at complete Unicode code points rather than UTF-16 halves", () => {
    const exact = "😀".repeat(MAX_TEXT_SWAP_DIRECTION_CODE_POINTS);
    expect(constrainPointTalkDirectionInput(`${exact}😀tail`)).toBe(exact);
    expect(Array.from(constrainPointTalkDirectionInput(`${exact}😀`))).toHaveLength(
      MAX_TEXT_SWAP_DIRECTION_CODE_POINTS,
    );
  });
});
