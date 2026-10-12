import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import { pictureControlCopy } from "./picture-control-copy";

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
      expect(copy.controlName).toContain(copy.control);
      expect([copy.keep, copy.discard]).toEqual(KEEP_AND_DISCARD[locale]);
    }
    expect(pictureControlCopy("en-US").controlName).toBe("Draw a picture from this passage");
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
      "Couldn't save on this device. Kept for this session — try Keep again.",
    );
    expect(english.keepRefused).toBe("This picture can't be kept here.");
    expect(english.announceDrawing).toBe("Drawing");
    expect(english.announceArrived).toBe("Picture ready.");
    expect(english.announceKept).toBe("Kept. Undo is available.");
  });
});
