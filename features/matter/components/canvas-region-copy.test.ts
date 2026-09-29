import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import { canvasRegionCopy } from "./canvas-region-copy";

describe("canvas region copy", () => {
  it("names the paper, its guidance, and a lost focus in every locale's own words", () => {
    const english = canvasRegionCopy("en-US");
    for (const locale of MATTER_LOCALES) {
      const copy = canvasRegionCopy(locale);
      expect(Object.values(copy).every((text) => text.trim().length > 0)).toBe(true);
      if (locale === "en-US") continue;
      expect(copy.material).not.toBe(english.material);
      expect(copy.focusUnavailable).not.toBe(english.focusUnavailable);
    }
  });
});
