import type { MatterLocale } from "../config/locales";

export type CanvasRegionCopy = Readonly<{
  /** Accessible name of the paper region that holds the material. */
  material: string;
  /** Accessible name of the lower-left guidance line. */
  guidance: string;
  /** Shown when a focused branch no longer exists. */
  focusUnavailable: string;
}>;

// A complete table: every locale names every region, and a missing key is a
// type error rather than an English fallback inside another language.
const CANVAS_REGION_COPY: Readonly<Record<MatterLocale, CanvasRegionCopy>> = Object.freeze({
  "en-US": Object.freeze({
    material: "Thought material",
    guidance: "Matter guidance",
    focusUnavailable: "This focus is no longer available.",
  }),
  "zh-CN": Object.freeze({
    material: "思想材料",
    guidance: "Matter 提示",
    focusUnavailable: "这个聚焦已经不存在了。",
  }),
  "zh-TW": Object.freeze({
    material: "思想材料",
    guidance: "Matter 提示",
    focusUnavailable: "這個聚焦已經不存在了。",
  }),
  "ja-JP": Object.freeze({
    material: "思考の素材",
    guidance: "Matter のガイド",
    focusUnavailable: "このフォーカスはもう存在しません。",
  }),
  "de-DE": Object.freeze({
    material: "Gedankenmaterial",
    guidance: "Matter-Hinweise",
    focusUnavailable: "Dieser Fokus ist nicht mehr verfügbar.",
  }),
});

export function canvasRegionCopy(locale: MatterLocale): CanvasRegionCopy {
  return CANVAS_REGION_COPY[locale];
}
