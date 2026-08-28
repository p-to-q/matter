import { describe, expect, it } from "vitest";
import { MAX_INQUIRY_QUESTION_CODE_POINTS } from "../protocol/inquiry-contract";
import { REPAIR_CLIENT_TIMEOUT_MS } from "../protocol/repair-contract";
import {
  INQUIRY_DICTATION_REPAIR_TIMEOUT_MS,
  requestInquiryDictationRepair,
  settleInquiryDictationRepair,
  withInquiryDictationRepairDeadline,
} from "./use-inquiry-dictation";

describe("Inquiry dictation repair deadline", () => {
  it("keeps the visible draft wait below background material repair", () => {
    const controller = new AbortController();
    const request = withInquiryDictationRepairDeadline({
      operationId: "dictation-1",
      attempt: 1,
      locale: "zh-CN",
      text: "这份材料在说什么",
      signal: controller.signal,
    });

    expect(request.timeoutMs).toBe(INQUIRY_DICTATION_REPAIR_TIMEOUT_MS);
    expect(request.timeoutMs).toBe(8_800);
    expect(request.timeoutMs).toBeLessThan(REPAIR_CLIENT_TIMEOUT_MS);
    expect(request.signal).toBe(controller.signal);
  });

  it("passes that bound to the repair request rather than only declaring it", async () => {
    let received: ReturnType<typeof withInquiryDictationRepairDeadline> | undefined;
    await expect(requestInquiryDictationRepair({
      operationId: "dictation-2",
      attempt: 1,
      locale: "zh-CN",
      text: "这份材料在说什么",
      signal: new AbortController().signal,
    }, async (input) => {
      received = input;
      throw new Error("proof stop");
    })).rejects.toThrow("proof stop");

    expect(received?.timeoutMs).toBe(INQUIRY_DICTATION_REPAIR_TIMEOUT_MS);
  });
});

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

  it("accepts a repaired draft at the exact question capacity", () => {
    const candidate = "a".repeat(MAX_INQUIRY_QUESTION_CODE_POINTS);
    expect(settleInquiryDictationRepair("baseline", candidate)).toBe(candidate);
  });

  it.each(["", "   ", "\n\t"])(
    "falls back whole from an empty repaired draft: %j",
    (candidate) => {
      expect(settleInquiryDictationRepair("baseline", candidate)).toBe("baseline");
    },
  );

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
