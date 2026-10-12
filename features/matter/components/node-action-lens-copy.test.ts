import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import { nodeActionLensCopy } from "./node-action-lens-copy";

describe("nodeActionLensCopy", () => {
  it("keeps every icon-only action named in every supported locale", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = nodeActionLensCopy(locale);
      expect(Object.values(copy).every((value) =>
        typeof value === "object"
          ? Object.values(value).every((entry) => entry.trim().length > 0)
          : (typeof value === "function" ? value("heard", "canonical") : value).trim().length > 0,
      )).toBe(true);
    }
  });

  it("uses the canvas language for the Point Talk entry", () => {
    expect(nodeActionLensCopy("en-US").actions).toBe("Material actions");
    expect(nodeActionLensCopy("zh-CN").rewrite).toBe("用 AI 改写这段材料");
    expect(nodeActionLensCopy("en-US").rewrite).toBe("Rewrite this material with AI");
  });

  it("names the Under mark, its cancel, and every reason it can be blocked in all five locales", () => {
    const reasons = ["held-aside", "deepest-level", "child-limit", "tree-full", "voice-unavailable", "busy"];
    const names = new Set<string>();
    for (const locale of MATTER_LOCALES) {
      const copy = nodeActionLensCopy(locale);
      expect(copy.under.trim().length).toBeGreaterThan(0);
      expect(copy.underCancel).not.toBe(copy.under);
      expect(Object.keys(copy.underBlocked).sort()).toEqual([...reasons].sort());
      // Each reason reads differently, so the mark never repeats itself in a locale.
      expect(new Set(Object.values(copy.underBlocked)).size).toBe(reasons.length);
      names.add(copy.under);
    }
    expect(names.size).toBe(MATTER_LOCALES.length);
    const english = nodeActionLensCopy("en-US");
    expect(english.under).toBe("Add below");
    expect(english.underBlocked["deepest-level"]).toBe("This passage is at the deepest level.");
    expect(nodeActionLensCopy("zh-CN").under).toBe("在下方添加");
    expect(nodeActionLensCopy("zh-TW").under).toBe("在下方新增");
    expect(nodeActionLensCopy("ja-JP").under).toBe("下に追加");
    expect(nodeActionLensCopy("de-DE").under).toBe("Darunter hinzufügen");
  });

  it("names both forms of a Wiki change in every locale", () => {
    for (const locale of MATTER_LOCALES) {
      const label = nodeActionLensCopy(locale).wikiReview("P to Q", "[p → q]");
      expect(label).toContain("P to Q");
      expect(label).toContain("[p → q]");
    }
  });
});
