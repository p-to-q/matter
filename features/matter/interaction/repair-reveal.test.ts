import { describe, expect, it } from "vitest";
import {
  planRepairReveal,
  REPAIR_REVEAL_MAX_TOTAL_MS,
} from "./repair-reveal";

function changedText(before: string, after: string): string {
  return planRepairReveal(before, after)?.parts
    .filter(({ revealIndex }) => revealIndex !== null)
    .map(({ text }) => text)
    .join("") ?? "";
}

describe("repair reveal planning", () => {
  it("animates inserted punctuation while leaving surrounding language stable", () => {
    const plan = planRepairReveal(
      "这个功能可以但是还需要测试",
      "这个功能可以，但是还需要测试。",
    );

    expect(plan).not.toBeNull();
    expect(plan!.parts.map(({ text }) => text).join("")).toBe("这个功能可以，但是还需要测试。");
    expect(changedText("这个功能可以但是还需要测试", "这个功能可以，但是还需要测试。"))
      .toBe("，。");
    expect(plan!.parts.some(({ text, revealIndex }) =>
      text.includes("功能可以") && revealIndex === null,
    )).toBe(true);
  });

  it("reveals separate replacements without animating the language between them", () => {
    const plan = planRepairReveal(
      "它的实现事件很常但可以发布",
      "它的实现时间很长，但可以发布",
    );

    expect(plan).not.toBeNull();
    expect(plan!.parts.map(({ text }) => text).join("")).toBe("它的实现时间很长，但可以发布");
    expect(changedText("它的实现事件很常但可以发布", "它的实现时间很长，但可以发布"))
      .toBe("时间长，");
    expect(plan!.parts.some(({ text, revealIndex }) =>
      text.includes("很") && revealIndex === null,
    )).toBe(true);
  });

  it("never splits emoji or combining graphemes into separate reveal units", () => {
    const plan = planRepairReveal("用👩‍💻开发é工具", "用👨‍💻开发é工具");
    const changed = plan!.parts.filter(({ revealIndex }) => revealIndex !== null);

    expect(plan!.parts.map(({ text }) => text).join("")).toBe("用👨‍💻开发é工具");
    expect(changed.map(({ text }) => text)).toEqual(["👨‍💻", "é"]);
  });

  it("gives a deletion-only repair one adjacent visible seam cue", () => {
    const plan = planRepairReveal("呃，我觉得可以", "我觉得可以");

    expect(plan).not.toBeNull();
    expect(plan!.parts.map(({ text }) => text).join("")).toBe("我觉得可以");
    expect(changedText("呃，我觉得可以", "我觉得可以")).toBe("我");
  });

  it("makes a whitespace-only seam perceivable without moving the rest", () => {
    expect(changedText("OpenAIAPI", "OpenAI API")).toBe(" A");
  });

  it("keeps the reaction beat and bounds a long repair animation", () => {
    const plan = planRepairReveal("甲".repeat(90), "乙".repeat(90));

    expect(plan).not.toBeNull();
    expect(plan!.holdMs).toBe(160);
    expect(plan!.revealUnitCount).toBe(64);
    expect(plan!.totalMs).toBeLessThanOrEqual(REPAIR_REVEAL_MAX_TOTAL_MS);
    expect(plan!.parts.map(({ text }) => text).join("")).toBe("乙".repeat(90));
  });

  it("does nothing when no visible change exists", () => {
    expect(planRepairReveal("已经正确。", "已经正确。")).toBeNull();
  });

  it.each([
    ["", "开头"],
    ["开头", "从开头"],
    ["结尾", "结尾。"],
    ["删除开头", "开头"],
    ["删除结尾", "删除"],
    ["我觉得我觉得可以", "我觉得可以"],
    ["a b a b", "a c a b"],
    ["甲乙丙丁", "甲丙戊丁"],
  ])("keeps the final string whole across %s → %s", (before, after) => {
    const plan = planRepairReveal(before, after);
    expect(plan).not.toBeNull();
    expect(plan!.parts.map(({ text }) => text).join("")).toBe(after);
    expect(plan!.revealUnitCount).toBeGreaterThan(0);
    expect(plan!.totalMs).toBeLessThanOrEqual(REPAIR_REVEAL_MAX_TOTAL_MS);
  });
});
