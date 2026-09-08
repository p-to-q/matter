import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import { nodeActionLensCopy } from "./node-action-lens-copy";

describe("nodeActionLensCopy", () => {
  it("keeps every icon-only action named in every supported locale", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = nodeActionLensCopy(locale);
      expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("uses the canvas language for the Point Talk entry", () => {
    expect(nodeActionLensCopy("en-US").actions).toBe("Material actions");
    expect(nodeActionLensCopy("zh-CN").rewrite).toBe("用 AI 改写这段材料");
    expect(nodeActionLensCopy("en-US").rewrite).toBe("Rewrite this material with AI");
  });
});
