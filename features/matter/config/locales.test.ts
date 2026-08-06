import { describe, expect, it } from "vitest";
import { isMatterLocale, MATTER_LOCALES } from "./locales";

describe("Matter locale contract", () => {
  it("accepts only the product-supported locales", () => {
    expect(MATTER_LOCALES).toEqual(["zh-CN", "zh-TW", "ja-JP", "de-DE", "en-US"]);
    expect(MATTER_LOCALES.every(isMatterLocale)).toBe(true);
    expect(isMatterLocale("fr-FR")).toBe(false);
    expect(isMatterLocale("en")).toBe(false);
  });
});
