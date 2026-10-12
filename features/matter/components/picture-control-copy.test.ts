import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import { pictureControlCopy } from "./picture-control-copy";
import { pictureCopy } from "./picture-copy";

const VISIBLE_LABELS = {
  "zh-CN": "绘图",
  "zh-TW": "繪圖",
  "ja-JP": "描く",
  "en-US": "Draw",
  "de-DE": "Zeichnen",
} as const;
const KEEP_AND_DISCARD = {
  "zh-CN": ["保留", "丢弃"],
  "zh-TW": ["保留", "捨棄"],
  "ja-JP": ["残す", "捨てる"],
  "en-US": ["Keep", "Discard"],
  "de-DE": ["Behalten", "Verwerfen"],
} as const;

describe("picture control copy", () => {
  it("says every string in every locale, and never leaves one empty", () => {
    const english = Object.keys(pictureControlCopy("en-US")).sort();
    expect(MATTER_LOCALES).toHaveLength(5);
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      expect(Object.keys(copy).sort()).toEqual(english);
      for (const [key, text] of Object.entries(copy)) {
        expect(text.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("carries the five labels, and an accessible name that contains the visible text", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      expect(copy.control).toBe(VISIBLE_LABELS[locale]);
      // The accessible name contains the visible label, as a person says it
      // inside a sentence: the comparison ignores case ("Bild … zeichnen").
      expect(copy.controlName.toLocaleLowerCase(locale)).toContain(copy.control.toLocaleLowerCase(locale));
      expect([copy.keep, copy.discard]).toEqual(KEEP_AND_DISCARD[locale]);
    }
    expect(pictureControlCopy("en-US").controlName).toBe("Draw a picture from this passage");
    expect(pictureControlCopy("de-DE").controlName).toBe("Bild zu diesem Absatz zeichnen");
  });

  it("never calls the wait a cancellation, because the relay is not cancelled", () => {
    for (const locale of MATTER_LOCALES) {
      expect(pictureControlCopy(locale).stopWaiting).not.toMatch(/cancel|取消|キャンセル|abbrechen/i);
    }
    expect(pictureControlCopy("en-US").stopWaiting).toBe("Stop waiting");
  });

  it("states the cost plainly, and gives the billed warning a line of its own", () => {
    const english = pictureControlCopy("en-US");
    expect(english.armStatement).toBe(
      "Draws one picture. Your passage goes to a text model; only a short line goes to an image service. Takes up to a minute. Leaving loses it.",
    );
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      expect(copy.armWarningBilled.trim(), locale).not.toBe("");
      // One short line, never folded into the statement it warns about.
      expect(copy.armWarningBilled.includes(copy.armStatement), locale).toBe(false);
      expect(copy.armWarningBilled).not.toContain("\n");
    }
    expect(english.armWarningBilled).toBe("The last attempt may already have been used.");
    expect(pictureControlCopy("zh-CN").armWarningBilled).toBe("上一次可能已产生用量。");
  });

  it("keeps the English words the owner specified", () => {
    const english = pictureControlCopy("en-US");
    expect(english.drawing).toBe("Drawing…");
    expect(english.notDrawn).toBe("Not drawn.");
    expect(english.notDrawnUsed).toBe("Not drawn. That attempt may already have been used.");
    expect(english.anotherInFlight).toBe("Another picture is being drawn.");
    expect(english.documentFull).toBe("This document already holds as many pictures as it can.");
    expect(english.tryAgain).toBe("Try again");
    expect(english.keepNotSaved).toBe(
      "Couldn’t save on this device. Kept for this session — try Keep again.",
    );
    expect(english.keepRefused).toBe("This picture can’t be kept here.");
    expect(english.announceDrawing).toBe("Drawing");
    expect(english.announceArrived).toBe("Picture ready.");
    expect(english.announceKept).toBe("Kept. Undo is available.");
  });

  it("says how long the wait may be, in the arm statement's own words", () => {
    expect(pictureControlCopy("en-US").drawingExpectation).toBe("Up to a minute.");
    expect(pictureControlCopy("zh-CN").drawingExpectation).toBe("最多需要一分钟。");
    expect(pictureControlCopy("zh-TW").drawingExpectation).toBe("最多需要一分鐘。");
    expect(pictureControlCopy("ja-JP").drawingExpectation).toBe("最長で1分ほどかかります。");
    expect(pictureControlCopy("de-DE").drawingExpectation).toBe("Dauert bis zu einer Minute.");
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      // One line, and a different thing from the step it sits under.
      expect(copy.drawingExpectation).not.toContain("\n");
      expect(copy.drawingExpectation).not.toBe(copy.drawing);
    }
  });

  describe("de-DE", () => {
    const german = () => Object.values(pictureControlCopy("de-DE")).join("\n");

    it("addresses the person formally, like the rest of the product chrome", () => {
      expect(german()).not.toMatch(/\b(?:du|dein\w*|dir|dich|deine\w*)\b/iu);
      expect(german()).not.toMatch(/\b(?:versuche|geh|gehst|klicke|tippe|wähle)\b/iu);
      expect(pictureControlCopy("de-DE").armStatement).toContain("Ihr Absatz");
      expect(pictureControlCopy("de-DE").keepNotSaved).toContain("versuchen Sie");
    });

    it("says Bild for the thing and keeps Zeichnen for the control", () => {
      expect(german()).not.toMatch(/Zeichnung/u);
      expect(pictureControlCopy("de-DE").control).toBe("Zeichnen");
      expect(pictureControlCopy("de-DE").draw).toBe("Zeichnen");
      expect(pictureControlCopy("de-DE").controlName).toBe("Bild zu diesem Absatz zeichnen");
      expect(pictureCopy("de-DE").alt).toContain("Bild");
      expect(Object.values(pictureCopy("de-DE")).join(" ")).not.toMatch(/Zeichnung/u);
    });
  });

  describe("zh-CN and zh-TW", () => {
    it.each([["zh-CN", /生成/u, /绘/u], ["zh-TW", /生成/u, /繪/u]] as const)(
      "%s keeps to the control's own word and never says 生成 for the same act",
      (locale, forbidden, expected) => {
        const copy = pictureControlCopy(locale);
        for (const [key, text] of Object.entries(copy)) {
          expect(text, `${locale}.${key}`).not.toMatch(forbidden);
        }
        expect(copy.notDrawn).toMatch(expected);
        expect(copy.anotherInFlight).toMatch(expected);
        expect(copy.armStatement).toMatch(expected);
        expect(pictureCopy(locale).alt).toMatch(expected);
      },
    );
  });

  it("writes English with the typographic apostrophe, like the rest of the app", () => {
    for (const text of [...Object.values(pictureControlCopy("en-US")), ...Object.values(pictureCopy("en-US"))]) {
      expect(text).not.toContain("'");
    }
    expect(pictureControlCopy("en-US").keepNotSaved).toContain("Couldn’t");
    expect(pictureControlCopy("en-US").keepRefused).toContain("can’t");
  });
});
