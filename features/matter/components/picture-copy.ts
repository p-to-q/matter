import type { MatterLocale } from "../config/locales";

export type PictureCopy = Readonly<{
  /** Neutral, truthful name of a shown picture; never a model-authored brief. */
  alt: string;
  /** Placeholder label: no bytes for the pointer on this device. */
  absent: string;
  /** Placeholder label: bytes exist but cannot be trusted or decoded. */
  damaged: string;
  /** Placeholder label: the store could not be consulted. */
  unavailable: string;
}>;

// A complete table: every locale names every state, and a missing key is a type
// error rather than an English fallback inside another language.
const PICTURE_COPY: Readonly<Record<MatterLocale, PictureCopy>> = Object.freeze({
  "en-US": Object.freeze({
    alt: "AI-drawn picture for this passage",
    absent: "Picture not on this device",
    damaged: "Picture damaged",
    unavailable: "Picture unavailable",
  }),
  "zh-CN": Object.freeze({
    alt: "为这段文字绘制的 AI 图片",
    absent: "此设备上没有这张图片",
    damaged: "图片已损坏",
    unavailable: "图片暂时无法读取",
  }),
  "zh-TW": Object.freeze({
    alt: "為這段文字繪製的 AI 圖片",
    absent: "此裝置上沒有這張圖片",
    damaged: "圖片已損毀",
    unavailable: "圖片暫時無法讀取",
  }),
  "ja-JP": Object.freeze({
    alt: "この段落のために描かれた AI の絵",
    absent: "この端末に絵がありません",
    damaged: "絵が壊れています",
    unavailable: "絵を読み込めません",
  }),
  "de-DE": Object.freeze({
    alt: "KI-Bild zu diesem Absatz",
    absent: "Bild nicht auf diesem Gerät",
    damaged: "Bild beschädigt",
    unavailable: "Bild nicht lesbar",
  }),
});

export function pictureCopy(locale: MatterLocale): PictureCopy {
  return PICTURE_COPY[locale];
}
