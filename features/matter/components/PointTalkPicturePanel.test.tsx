import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MATTER_LOCALES, type MatterLocale } from "../config/locales";
import type { GeneratedPicture } from "../runtime/picture-turn";
import { PointTalkPicturePanel } from "./PointTalkPicturePanel";
import { pictureControlCopy } from "./picture-control-copy";
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

  it("draws with one button that never says Cancel, and no spinner or progress", () => {
    const markup = render({ step: "drawing" });
    expect(buttons(markup)).toEqual(["Stop waiting"]);
    expect(markup).toContain("Drawing…");
    expect(markup).not.toMatch(/cancel|spinner|progress|%|svg/i);
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

  it("says an unsaved Keep inline and keeps Keep, and offers only Discard once refused", () => {
    const unsaved = render({ step: "preview", picture: PICTURE, failure: "not-saved" });
    expect(unsaved).toContain("Couldn&#x27;t save on this device.");
    expect(buttons(unsaved)).toEqual(["Keep", "Discard"]);
    const refused = render({ step: "preview", picture: PICTURE, failure: "refused" });
    expect(refused).toContain("This picture can&#x27;t be kept here.");
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
