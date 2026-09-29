import { describe, expect, it } from "vitest";
import { wikiOccurrenceDescription } from "./wiki-occurrence-description-copy";

describe("wikiOccurrenceDescription", () => {
  it("follows each locale's plural rules", () => {
    expect(wikiOccurrenceDescription("en-US", 1))
      .toBe("Wiki changed 1 word. Review it in this passage's actions.");
    expect(wikiOccurrenceDescription("en-US", 2))
      .toBe("Wiki changed 2 words. Review them in this passage's actions.");
    expect(wikiOccurrenceDescription("de-DE", 1)).toContain("1 Wort ");
    expect(wikiOccurrenceDescription("de-DE", 3)).toContain("3 Wörter ");
  });

  it("states the count in every locale", () => {
    for (const locale of ["en-US", "zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      expect(wikiOccurrenceDescription(locale, 3)).toContain("3");
    }
  });
});
