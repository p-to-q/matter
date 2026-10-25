import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import type { ImagePointer } from "../tree/image-pointer";
import { BROWSER_OBJECT_URLS, PictureFrame, pictureView, type PictureView } from "./PassagePicture";
import {
  BROWSER_OBJECT_URLS as sharedObjectUrls,
  PictureFrame as SharedPictureFrame,
  pictureView as sharedPictureView,
} from "./PictureFrame";
import { pictureBoxStyle, pictureLayoutKey } from "./passage-picture-box";
import { pictureCopy } from "./picture-copy";

const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: 2048,
  width: 1024,
  height: 768,
  contentHash: "e".repeat(64),
};

const render = (view: PictureView, pointer = POINTER, locale: (typeof MATTER_LOCALES)[number] = "en-US") =>
  renderToStaticMarkup(createElement(PictureFrame, { locale, pointer, view }));

it("keeps the existing exports bound to the same shared render-edge owners", () => {
  expect(BROWSER_OBJECT_URLS).toBe(sharedObjectUrls);
  expect(PictureFrame).toBe(SharedPictureFrame);
  expect(pictureView).toBe(sharedPictureView);
  expect(Object.isFrozen(BROWSER_OBJECT_URLS)).toBe(true);
});

describe("picture copy", () => {
  it("names every state in every locale, in that locale's own words", () => {
    const english = pictureCopy("en-US");
    expect(english).toEqual({
      alt: "AI-drawn picture for this passage",
      absent: "Picture not on this device",
      damaged: "Picture damaged",
      unavailable: "Picture unavailable",
    });
    expect(MATTER_LOCALES).toHaveLength(5);
    for (const locale of MATTER_LOCALES) {
      const copy = pictureCopy(locale);
      expect(Object.keys(copy).sort()).toEqual(["absent", "alt", "damaged", "unavailable"]);
      expect(Object.values(copy).every((text) => text.trim().length > 0)).toBe(true);
      expect(new Set(Object.values(copy)).size).toBe(4);
      if (locale === "en-US") continue;
      for (const key of Object.keys(copy) as Array<keyof typeof copy>) {
        expect(copy[key]).not.toBe(english[key]);
      }
    }
  });

  it("is a complete table whose missing locale is a type error, not a spread", () => {
    const source = readFileSync(new URL("./picture-copy.ts", import.meta.url), "utf8");
    expect(source).toContain("Record<MatterLocale, PictureCopy>");
    expect(source).not.toMatch(/\.\.\.[A-Z_]+/u);
  });
});

describe("passage picture box", () => {
  it("is the pointer's ratio and nothing else", () => {
    expect(pictureBoxStyle(POINTER)).toEqual({
      aspectRatio: "1024 / 768",
      "--picture-w": 1024,
      "--picture-h": 768,
    });
    expect(pictureBoxStyle({ width: 512, height: 2048 })).toEqual({
      aspectRatio: "512 / 2048",
      "--picture-w": 512,
      "--picture-h": 2048,
    });
  });

  it("is derived from the pointer alone: the same pointer, the same box, whatever else changes", () => {
    expect(pictureBoxStyle({ width: 640, height: 480 })).toEqual(pictureBoxStyle({ ...POINTER, width: 640, height: 480 }));
    expect(pictureBoxStyle({ width: 1, height: 3 })).not.toEqual(pictureBoxStyle({ width: 3, height: 1 }));
  });

  it("keys layout by the hash and the box, and by nothing when there is no picture", () => {
    expect(pictureLayoutKey(undefined)).toBeNull();
    const key = pictureLayoutKey(POINTER);
    expect(key).not.toBeNull();
    const sameBoxOtherSize: ImagePointer = { ...POINTER, byteLength: 1 };
    expect(pictureLayoutKey(sameBoxOtherSize)).toBe(key);
    expect(pictureLayoutKey({ ...POINTER, contentHash: "f".repeat(64) })).not.toBe(key);
    expect(pictureLayoutKey({ ...POINTER, height: 1024 })).not.toBe(key);
  });
});

describe("passage picture frame", () => {
  it("gives every view the same box, derived from the pointer alone", () => {
    const views: PictureView[] = [
      { kind: "loading" },
      { kind: "resident", url: "blob:x" },
      { kind: "missing", reason: "absent" },
      { kind: "missing", reason: "damaged" },
      { kind: "missing", reason: "unavailable" },
    ];
    for (const view of views) {
      expect(render(view)).toContain('style="aspect-ratio:1024 / 768;--picture-w:1024;--picture-h:768"');
      expect(render(view, { ...POINTER, width: 300, height: 900 }))
        .toContain('style="aspect-ratio:300 / 900;--picture-w:300;--picture-h:900"');
    }
  });

  it("shows a resident picture with the neutral per-locale alt and lazy async decoding", () => {
    for (const locale of MATTER_LOCALES) {
      const markup = render({ kind: "resident", url: "blob:resident" }, POINTER, locale);
      expect(markup).toContain('data-picture-state="resident"');
      expect(markup).toContain(`alt="${pictureCopy(locale).alt}"`);
      expect(markup).toContain('src="blob:resident"');
      expect(markup).toContain('decoding="async"');
      expect(markup).toContain('loading="lazy"');
      expect(markup).not.toContain('role="img"');
    }
  });

  it("labels each missing state with its own copy as an image with an accessible name", () => {
    for (const locale of MATTER_LOCALES) {
      for (const reason of ["absent", "damaged", "unavailable"] as const) {
        const label = pictureCopy(locale)[reason];
        const markup = render({ kind: "missing", reason }, POINTER, locale);
        expect(markup).toContain(`data-picture-state="${reason}"`);
        expect(markup).toContain('role="img"');
        expect(markup).toContain(`aria-label="${label}"`);
        expect(markup).toContain(`>${label}</span>`);
        expect(markup).not.toContain("<img");
        expect(markup).not.toContain("blob:");
      }
    }
  });

  it("shows loading as the empty box: no label, no image, hidden from assistive technology", () => {
    const markup = render({ kind: "loading" });
    expect(markup).toContain('data-picture-state="loading"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<span");
    expect(markup).not.toContain("svg");
  });
});

describe("passage picture view", () => {
  it("is loading until a state arrives, then follows it", () => {
    expect(pictureView(null, null)).toEqual({ kind: "loading" });
    expect(pictureView({ phase: "resident", url: "blob:a" }, null)).toEqual({ kind: "resident", url: "blob:a" });
    expect(pictureView({ phase: "missing", reason: "absent" }, null)).toEqual({ kind: "missing", reason: "absent" });
    expect(pictureView({ phase: "missing", reason: "unavailable" }, "blob:a"))
      .toEqual({ kind: "missing", reason: "unavailable" });
  });

  it("calls bytes the decoder refused damaged, but only for the URL that failed", () => {
    expect(pictureView({ phase: "resident", url: "blob:a" }, "blob:a")).toEqual({ kind: "missing", reason: "damaged" });
    expect(pictureView({ phase: "resident", url: "blob:b" }, "blob:a")).toEqual({ kind: "resident", url: "blob:b" });
  });
});

describe("passage picture styling", () => {
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  const rules = css.split("\n").filter((line) => line.includes(".passage-picture"));

  it("fixes the spacing in the stylesheet and never animates", () => {
    expect(css).toMatch(/\.passage-picture \{[^}]*margin: 10px auto 0/u);
    expect(rules.join("\n")).not.toMatch(/animation|transition|@keyframes/u);
  });

  it("caps the box at the smaller of 320px and 60vh, and narrows it to keep the pointer's ratio", () => {
    const rule = css.match(/\.passage-picture \{[^}]*\}/u)?.[0] ?? "";
    expect(rule).toContain("--picture-cap: min(320px, 60vh)");
    // The width is bounded by the column, by the cap, and by the cap carried through the ratio.
    expect(rule).toContain(
      "width: min(100%, var(--picture-cap), calc(var(--picture-cap) * var(--picture-w, 4) / var(--picture-h, 3)))",
    );
    // Nothing is cropped: the picture is contained in a box that already has its ratio.
    expect(css).toMatch(/\.passage-picture__image \{[^}]*object-fit: contain/u);
    expect(css).not.toMatch(/\.passage-picture__image \{[^}]*object-fit: cover/u);
  });

  it("paints a missing plate opaque, so the paper's ruling never shows through it", () => {
    const plate = css.match(
      /\.passage-picture\[data-picture-state="absent"\],\s*\.passage-picture\[data-picture-state="damaged"\],\s*\.passage-picture\[data-picture-state="unavailable"\] \{[^}]*\}/u,
    )?.[0] ?? "";
    expect(plate).toContain("var(--plate-base)");
    expect(plate).not.toMatch(/transparent/u);
    expect(css).toMatch(/\.passage-picture \{[^}]*--plate-base: var\(--paper\)/u);
    // Inside the field the plate sits on the field's own paper tokens.
    expect(css).toContain(".point-talk .passage-picture { --plate-base: var(--paper-solid); }");
  });

  it("keeps the missing plate and its label visible under forced colors with system colors", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.passage-picture\[data-picture-state="absent"\][^}]*outline: 1px solid GrayText/u);
    expect(forced).toMatch(/\.passage-picture__label \{ color: CanvasText; \}/u);
  });
});
