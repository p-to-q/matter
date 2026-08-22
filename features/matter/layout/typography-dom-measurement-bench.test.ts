import { describe, expect, it } from "vitest";
import {
  createTypographyMeasurementKey,
  TypographyMeasurementLedger,
  type TypographyMeasurementInput,
} from "./typography-dom-measurement-bench";

const typography = Object.freeze({
  borderBlockEndWidth: "0px",
  borderBlockStartWidth: "0px",
  borderInlineEndWidth: "0px",
  borderInlineStartWidth: "0px",
  boxSizing: "border-box",
  direction: "ltr",
  fontFamily: 'Arial, sans-serif',
  fontFeatureSettings: "normal",
  fontKerning: "auto",
  fontOpticalSizing: "auto",
  fontSizeAdjust: "none",
  fontSize: "17px",
  fontStyle: "normal",
  fontStretch: "100%",
  fontSynthesis: "weight style small-caps",
  fontVariant: "normal",
  fontVariationSettings: "normal",
  fontWeight: "400",
  hyphenateCharacter: "auto",
  hyphenateLimitChars: "auto",
  hyphens: "manual",
  letterSpacing: "0px",
  lineBreak: "auto",
  lineHeight: "29.24px",
  overflowWrap: "anywhere",
  paddingBlockEnd: "0px",
  paddingBlockStart: "0px",
  paddingInlineEnd: "0px",
  paddingInlineStart: "0px",
  tabSize: "8",
  textAlign: "center",
  textAutospace: "normal",
  textIndent: "0px",
  textOrientation: "mixed",
  textRendering: "auto",
  textSpacingTrim: "normal",
  textTransform: "none",
  textWrap: "pretty",
  textWrapMode: "wrap",
  textWrapStyle: "pretty",
  whiteSpaceCollapse: "collapse",
  whiteSpace: "normal",
  width: "520px",
  wordSpacing: "0px",
  wordBreak: "normal",
  writingMode: "horizontal-tb",
});

const base: TypographyMeasurementInput = Object.freeze({
  columnWidthPx: 520,
  dir: "ltr",
  fontEpoch: "fonts:1",
  grammarVersion: "spatial-thought-v1",
  locale: "zh-CN",
  root: false,
  text: "仍然允许我们想象的其他生活。",
  typography,
});

describe("Phase B typography DOM measurement key", () => {
  it("deduplicates only a complete identical authority tuple", () => {
    expect(createTypographyMeasurementKey(base)).toBe(createTypographyMeasurementKey({ ...base }));
    const mutations: TypographyMeasurementInput[] = [
      { ...base, text: `${base.text}。` },
      { ...base, root: true },
      { ...base, columnWidthPx: 280 },
      { ...base, fontEpoch: "fonts:2" },
      { ...base, grammarVersion: "spatial-thought-v2" },
      { ...base, dir: "rtl", typography: { ...typography, direction: "rtl" } },
      { ...base, locale: "ar" },
      { ...base, typography: { ...typography, fontFamily: "serif" } },
      { ...base, typography: { ...typography, fontSize: "18px" } },
      { ...base, typography: { ...typography, fontWeight: "500" } },
      { ...base, typography: { ...typography, lineHeight: "30px" } },
      { ...base, typography: { ...typography, letterSpacing: "0.01px" } },
      { ...base, typography: { ...typography, whiteSpace: "pre-wrap" } },
      { ...base, typography: { ...typography, wordBreak: "break-all" } },
      { ...base, typography: { ...typography, overflowWrap: "normal" } },
      { ...base, typography: { ...typography, textWrap: "wrap" } },
      { ...base, typography: { ...typography, textWrapMode: "nowrap" } },
      { ...base, typography: { ...typography, textWrapStyle: "balance" } },
    ];
    for (const mutation of mutations) {
      expect(createTypographyMeasurementKey(mutation)).not.toBe(createTypographyMeasurementKey(base));
    }
  });

  it("rejects inputs that cannot name a stable browser authority", () => {
    expect(() => createTypographyMeasurementKey({ ...base, columnWidthPx: 0 })).toThrow(TypeError);
    expect(() => createTypographyMeasurementKey({ ...base, fontEpoch: "" })).toThrow(TypeError);
    expect(() => createTypographyMeasurementKey({ ...base, grammarVersion: "" })).toThrow(TypeError);
    expect(() => createTypographyMeasurementKey({ ...base, locale: "" })).toThrow(TypeError);
    expect(() => createTypographyMeasurementKey({
      ...base,
      dir: "rtl",
      typography,
    })).toThrow(TypeError);
  });
});

describe("Phase B typography measurement ledger", () => {
  it("stores scalar heights and records explicit invalidation ownership", () => {
    const ledger = new TypographyMeasurementLedger();
    const key = createTypographyMeasurementKey(base);
    ledger.set(key, 58);
    expect(ledger.get(key)).toBe(58);
    expect(ledger.size).toBe(1);
    expect(ledger.generation).toBe(0);

    ledger.invalidate("theme");
    expect(ledger.get(key)).toBeUndefined();
    expect(ledger.size).toBe(0);
    expect(ledger.generation).toBe(1);
    expect(ledger.invalidations).toEqual(["theme"]);
  });

  it("refuses non-scalar or negative values", () => {
    const ledger = new TypographyMeasurementLedger();
    expect(() => ledger.set("negative", -1)).toThrow(TypeError);
    expect(() => ledger.set("nan", Number.NaN)).toThrow(TypeError);
  });
});
