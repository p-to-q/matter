import { describe, expect, it } from "vitest";
import {
  LAUNCH_MATERIAL_COPY,
  LAUNCH_POINT_TALK_FIXTURE,
} from "../../../e2e/matter-launch.fixture";
import { validateTextSwapCandidate } from "./text-swap-policy";

describe("launch film material copy", () => {
  it("keeps four distinct material roles and never repeats the canvas title", () => {
    const passages = [
      LAUNCH_MATERIAL_COPY.voice,
      LAUNCH_POINT_TALK_FIXTURE.text,
      LAUNCH_MATERIAL_COPY.thirdBranch,
      LAUNCH_MATERIAL_COPY.nestedBranch,
    ];

    expect(new Set(passages).size).toBe(passages.length);
    expect(passages).not.toContain("被允许想象的其他生活。");
  });

  it("keeps the filmed Point Talk rewrite inside the product policy", () => {
    const result = validateTextSwapCandidate({
      sourceText: LAUNCH_POINT_TALK_FIXTURE.passage,
      candidateText: LAUNCH_POINT_TALK_FIXTURE.text,
      beforeText: "",
      afterText: "",
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.ok).toBe(true);
  });
});
