import { describe, expect, it } from "vitest";
import {
  foldWikiFullWidthLatin,
  hasWikiFullWidthLatin,
  isWikiCjkLetter,
  isWikiLatinWord,
  isWikiRoutableGrapheme,
  isWikiRoutedOpportunity,
  routeWikiWord,
  wikiLatinLedgerLocale,
  wikiLatinRouteLocale,
} from "./wiki-script-routing";

describe("Wiki script routing", () => {
  it("routes Latin only out of Chinese and Japanese turns, and only to en-US", () => {
    expect(wikiLatinRouteLocale("zh-CN")).toBe("en-US");
    expect(wikiLatinRouteLocale("zh-TW")).toBe("en-US");
    expect(wikiLatinRouteLocale("ja-JP")).toBe("en-US");
    expect(wikiLatinRouteLocale("en-US")).toBeNull();
    expect(wikiLatinRouteLocale("de-DE")).toBeNull();
    expect(wikiLatinLedgerLocale("zh-CN")).toBe("en-US");
    expect(wikiLatinLedgerLocale("en-US")).toBe("en-US");
    expect(wikiLatinLedgerLocale("de-DE")).toBe("de-DE");
  });

  it("identifies a Latin word by the script of every letter", () => {
    for (const word of ["Englebart", "Ｅｎｇｌｅｂａｒｔ", "café", "GPT4", "don't"]) {
      expect(isWikiLatinWord(word)).toBe(true);
    }
    // No letter, a CJK letter, a Common-script prolonged-sound mark, or a
    // letter of another script keeps the word out of the Latin ledger.
    for (const word of ["", "2026", "材料", "カタカナ", "Aー", "A股", "αβγ", "😀"]) {
      expect(isWikiLatinWord(word)).toBe(false);
    }
  });

  it("routes a word by its own script and never routes a CJK word", () => {
    expect(routeWikiWord("zh-CN", "Englebart")).toEqual({
      locale: "en-US", form: "Englebart", routed: true, widthFolded: false,
    });
    expect(routeWikiWord("ja-JP", "Ｅｎｇｌｅｂａｒｔ")).toEqual({
      locale: "en-US", form: "Englebart", routed: true, widthFolded: true,
    });
    expect(routeWikiWord("zh-TW", "材料")).toEqual({
      locale: "zh-TW", form: "材料", routed: false, widthFolded: false,
    });
    expect(routeWikiWord("ja-JP", "カタカナ")).toMatchObject({ locale: "ja-JP", routed: false });
    // English and German turns keep every word in their own ledger, and a
    // full-width surface there is not folded.
    expect(routeWikiWord("en-US", "Ｅｎｇｌｅｂａｒｔ")).toEqual({
      locale: "en-US", form: "Ｅｎｇｌｅｂａｒｔ", routed: false, widthFolded: false,
    });
    expect(routeWikiWord("de-DE", "Englebart")).toMatchObject({ locale: "de-DE", routed: false });
  });

  it("folds full-width letters and digits for matching without moving any index", () => {
    const text = "ＡＢＣ１２３ａｂｃ，＠材料";
    const folded = foldWikiFullWidthLatin(text);

    expect(folded).toBe("ABC123abc，＠材料");
    expect(folded).toHaveLength(text.length);
    expect(hasWikiFullWidthLatin(text)).toBe(true);
    expect(hasWikiFullWidthLatin("ABC，材料")).toBe(false);
    expect(foldWikiFullWidthLatin("ABC")).toBe("ABC");
  });

  it("lets a routed match cover Latin, digits, spacing, and symbols but no CJK letter", () => {
    for (const grapheme of ["E", "Ｅ", "é", " ", "1", "，", "😀", "'"]) {
      expect(isWikiRoutableGrapheme(grapheme)).toBe(true);
    }
    for (const grapheme of ["的", "カ", "ｶ", "ー", "한", "α"]) {
      expect(isWikiRoutableGrapheme(grapheme)).toBe(false);
    }
  });

  it("treats CJK letters as the end of a routed Latin word", () => {
    for (const grapheme of ["的", "カ", "の", "ｶ", "ー", "ｰ", "々", "한", "ㄅ"]) {
      expect(isWikiCjkLetter(grapheme)).toBe(true);
    }
    for (const grapheme of ["E", "Ｅ", "1", "，", "😀", "α"]) {
      expect(isWikiCjkLetter(grapheme)).toBe(false);
    }
  });

  it("accepts a routed opportunity only for the ledger the turn routes to", () => {
    const zh = { locale: "zh-CN", channel: "spoken", scripts: ["latin", "han"] } as const;
    const latin = { locale: "en-US", channel: "spoken", scripts: ["latin"] } as const;

    expect(isWikiRoutedOpportunity(zh, latin)).toBe(true);
    expect(isWikiRoutedOpportunity({ ...zh, locale: "de-DE" }, latin)).toBe(false);
    expect(isWikiRoutedOpportunity({ ...zh, locale: "en-US" }, latin)).toBe(false);
    expect(isWikiRoutedOpportunity(zh, { ...latin, locale: "zh-TW" })).toBe(false);
    expect(isWikiRoutedOpportunity(zh, { ...latin, channel: "written" })).toBe(false);
    expect(isWikiRoutedOpportunity(zh, { ...latin, scripts: ["han"] })).toBe(false);
    expect(isWikiRoutedOpportunity(zh, { ...latin, scripts: [] })).toBe(false);
  });
});
