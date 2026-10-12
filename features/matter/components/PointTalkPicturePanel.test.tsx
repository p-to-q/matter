import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MATTER_LOCALES, type MatterLocale } from "../config/locales";
import type { GeneratedPicture } from "../runtime/picture-turn";
import { PointTalkPicturePanel } from "./PointTalkPicturePanel";
import { pictureControlCopy } from "./picture-control-copy";
import { pictureCopy } from "./picture-copy";
import type { PictureBubbleView } from "./picture-surface";
import type { PointTalkPictureActions } from "./use-picture-session";

const PICTURE: GeneratedPicture = Object.freeze({
  bytes: new Uint8Array(3),
  pointer: Object.freeze({
    mediaType: "image/png" as const,
    byteLength: 3,
    width: 640,
    height: 480,
    contentHash: "c".repeat(64),
  }),
});

const ACTIONS: PointTalkPictureActions = Object.freeze({
  arm: vi.fn(),
  confirm: vi.fn(),
  back: vi.fn(),
  stopWaiting: vi.fn(),
  keep: vi.fn(),
  discard: vi.fn(),
  tryAgain: vi.fn(),
  dismissFailure: vi.fn(),
});

function render(
  view: PictureBubbleView,
  options: Readonly<{ locale?: MatterLocale; frozen?: boolean; keeping?: boolean }> = {},
): string {
  const locale = options.locale ?? "en-US";
  return renderToStaticMarkup(createElement(PointTalkPicturePanel, {
    actions: options.frozen === true ? null : ACTIONS,
    copy: pictureControlCopy(locale),
    keeping: options.keeping ?? false,
    locale,
    view,
  }));
}

function buttons(markup: string): string[] {
  return Array.from(markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g), (match) => match[1]!);
}

describe("the picture panel", () => {
  it("arms with the statement and exactly Draw and Back, in that order", () => {
    const markup = render({ step: "arm", billed: false });
    expect(markup).toContain(pictureControlCopy("en-US").armStatement);
    expect(buttons(markup)).toEqual(["Draw", "Back"]);
    expect(render({ step: "arm", billed: true })).toContain("The last attempt may already have been used.");
  });

  it("puts the billed warning on a line of its own above the statement, inside the one focus target", () => {
    const plain = render({ step: "arm", billed: false });
    expect(plain).not.toContain("point-talk__warning");
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      const markup = render({ step: "arm", billed: true }, { locale });
      expect(markup, locale).toContain(`<p class="point-talk__warning">${copy.armWarningBilled}</p>`);
      expect(markup.indexOf("point-talk__warning")).toBeLessThan(markup.indexOf("point-talk__statement"));
      expect(markup.match(/data-picture-anchor/g)).toHaveLength(1);
    }
  });

  it("draws with one button that never says Cancel, and no spinner or progress", () => {
    const markup = render({ step: "drawing" });
    expect(buttons(markup)).toEqual(["Stop waiting"]);
    expect(markup).toContain("Drawing…");
    expect(markup).not.toMatch(/cancel|spinner|progress|%|svg/i);
  });

  it("says how long the wait may be once, in one quiet line under the step's own words", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      const markup = render({ step: "drawing" }, { locale });
      const quiet = markup.match(/<p class="point-talk__quiet"[^>]*>([^<]*)<\/p>/u);
      expect(quiet?.[1], locale).toBe(copy.drawingExpectation);
      expect(markup.split(copy.drawingExpectation), locale).toHaveLength(2);
      // Under "Drawing…", never beside it and never before it.
      expect(markup.indexOf(copy.drawing), locale).toBeLessThan(markup.indexOf(copy.drawingExpectation));
      expect(markup, locale).toMatch(/point-talk__statement[^>]*>[^<]*<\/p><p class="point-talk__quiet"/u);
      // It is a line of text, not another control or a second announcement.
      expect(buttons(markup), locale).toEqual([copy.stopWaiting]);
      expect(markup).not.toContain("aria-live");
    }
    expect(render({ step: "drawing" })).toContain("Up to a minute.");
  });

  it("gives no other step the expectation line", () => {
    for (const view of [
      { step: "arm", billed: false },
      { step: "failed", notice: "not-drawn", retryable: true },
      { step: "preview", picture: PICTURE, failure: null },
    ] as const) {
      expect(render(view)).not.toContain("point-talk__quiet");
    }
  });

  it("offers Try again only for a failure that may be retried", () => {
    const retryable = render({ step: "failed", notice: "not-drawn", retryable: true });
    expect(buttons(retryable)).toEqual(["Try again"]);
    expect(retryable).toContain("Not drawn.");
    const final = render({ step: "failed", notice: "not-drawn-used", retryable: false });
    expect(buttons(final)).toEqual(["Back"]);
    expect(final).toContain("That attempt may already have been used.");
    expect(render({ step: "failed", notice: "another-in-flight", retryable: true }))
      .toContain("Another picture is being drawn.");
  });

  it("previews with Keep and Discard, a neutral name, and no image before its bytes are read", () => {
    const markup = render({ step: "preview", picture: PICTURE, failure: null });
    expect(buttons(markup)).toEqual(["Keep", "Discard"]);
    expect(markup).toContain("aspect-ratio:640 / 480");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("blob:");
  });

  it("names the preview group in every locale, so a screen reader that lands on it knows what it holds", () => {
    for (const locale of MATTER_LOCALES) {
      const markup = render({ step: "preview", picture: PICTURE, failure: null }, { locale });
      const group = /<div[^>]*role="group"[^>]*>/u.exec(markup)?.[0] ?? "";
      expect(group, locale).toContain(`aria-label="${pictureCopy(locale).alt}"`);
      expect(pictureCopy(locale).alt.trim()).not.toBe("");
    }
  });

  it("gives the frozen copy no group role and no name to announce twice", () => {
    const markup = render({ step: "preview", picture: PICTURE, failure: null }, { frozen: true });
    expect(markup).not.toContain('role="group"');
    expect(markup).not.toContain("aria-label");
  });

  it("says an unsaved Keep inline and keeps Keep, and offers only Discard once refused", () => {
    const unsaved = render({ step: "preview", picture: PICTURE, failure: "not-saved" });
    expect(unsaved).toContain("Couldn’t save on this device.");
    expect(buttons(unsaved)).toEqual(["Keep", "Discard"]);
    const refused = render({ step: "preview", picture: PICTURE, failure: "refused" });
    expect(refused).toContain("This picture can’t be kept here.");
    expect(buttons(refused)).toEqual(["Discard"]);
  });

  it("marks both preview buttons aria-disabled, not disabled, while Keep settles", () => {
    const markup = render({ step: "preview", picture: PICTURE, failure: null }, { keeping: true });
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("paints a frozen copy that cannot take focus, and never loads the picture", () => {
    for (const view of [
      { step: "arm", billed: false },
      { step: "drawing" },
      { step: "failed", notice: "not-drawn", retryable: true },
      { step: "preview", picture: PICTURE, failure: null },
    ] as const) {
      const markup = render(view, { frozen: true });
      expect(markup).not.toContain("tabindex");
      expect(markup).not.toContain("<img");
    }
  });

  it("names every button in every locale's own words", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = pictureControlCopy(locale);
      expect(buttons(render({ step: "arm", billed: false }, { locale }))).toEqual([copy.draw, copy.back]);
      expect(buttons(render({ step: "drawing" }, { locale }))).toEqual([copy.stopWaiting]);
      expect(buttons(render({ step: "preview", picture: PICTURE, failure: null }, { locale })))
        .toEqual([copy.keep, copy.discard]);
    }
  });
});
