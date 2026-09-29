import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import { wikiTakeoverCopy } from "./wiki-takeover-copy";

describe("Wiki takeover copy", () => {
  it("names the change and every action in all five locales", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = wikiTakeoverCopy(locale);
      for (const value of [copy.keep, copy.wiki, copy.passageChanged]) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
      const changed = copy.changed("P to Q", "[p → q]");
      expect(changed).toContain("P to Q");
      expect(changed).toContain("[p → q]");
      expect(changed.indexOf("P to Q")).toBeLessThan(changed.indexOf("[p → q]"));
      expect(copy.keepLabel("[p → q]")).toContain("[p → q]");
      expect(copy.restoreLabel("P to Q")).toContain("P to Q");
      expect(copy.wikiLabel("[p → q]")).toContain("[p → q]");
    }
    expect(wikiTakeoverCopy("en-US").changed("P to Q", "[p → q]"))
      .toBe("Wiki changed ‘P to Q’ to ‘[p → q]’");
  });

  it("keeps each locale distinct rather than inheriting another", () => {
    const keeps = new Set(MATTER_LOCALES.map((locale) => wikiTakeoverCopy(locale).passageChanged));
    expect(keeps.size).toBe(MATTER_LOCALES.length);
  });
});
