import { describe, expect, it } from "vitest";
import { MAX_INQUIRY_QUESTION_CODE_POINTS } from "../protocol/inquiry-contract";
import { settleInquiryDictationRepair } from "./use-inquiry-dictation";

describe("settleInquiryDictationRepair", () => {
  it("keeps one usable repaired draft", () => {
    expect(settleInquiryDictationRepair(
      "Why is this still not ready?",
      "Why is this still not ready yet?",
    )).toBe("Why is this still not ready yet?");
  });

  it("falls back whole instead of truncating an over-capacity repair", () => {
    const baseline = "a".repeat(MAX_INQUIRY_QUESTION_CODE_POINTS);
    expect(settleInquiryDictationRepair(baseline, `${baseline}.`)).toBe(baseline);
  });

  it.each([
    "We finally did it 🎉.",
    "Take the flight ✈️.",
    "Use keycap 1️⃣.",
    "Flag 🇨🇳.",
  ])("keeps expression out of an inquiry draft: %s", (candidate) => {
    expect(settleInquiryDictationRepair("We finally did it.", candidate))
      .toBe("We finally did it.");
  });
});
