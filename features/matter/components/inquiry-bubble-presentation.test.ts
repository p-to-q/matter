import { describe, expect, it } from "vitest";
import { inquiryPresentationText, revealSteps } from "./inquiry-bubble-presentation";

describe("inquiry bubble presentation", () => {
  it("withholds a terminal full stop until a Chinese answer settles", () => {
    expect(inquiryPresentationText("它仍在等待一个答案。")).toEqual({
      typed: "它仍在等待一个答案",
      terminal: "它仍在等待一个答案。",
    });
  });

  it("lends the appropriate terminal full stop without changing source text", () => {
    expect(inquiryPresentationText("It is still becoming")).toEqual({
      typed: "It is still becoming",
      terminal: "It is still becoming.",
    });
    expect(inquiryPresentationText("它还在形成")).toEqual({
      typed: "它还在形成",
      terminal: "它还在形成。",
    });
  });

  it("does not disturb other terminal punctuation", () => {
    expect(inquiryPresentationText("真的吗？")).toEqual({
      typed: "真的吗？",
      terminal: "真的吗？",
    });
  });

  it("reveals by grapheme without making a long answer an unbounded animation", () => {
    const family = revealSteps("a👨‍👩‍👧‍👦b");
    expect(family.at(-1)).toBe("a👨‍👩‍👧‍👦b");
    expect(family).not.toContain("a👨");
    expect(revealSteps("字".repeat(3_200)).length).toBeLessThanOrEqual(42);
  });
});
