"use client";

import type { MatterLocale } from "../config/locales";
import type { ImagePointer } from "../tree/image-pointer";
import { pictureCopy } from "./picture-copy";
import { PicturePlaceholder } from "./PicturePlaceholder";
import { pictureBoxStyle } from "./passage-picture-box";
import type { ObjectUrls, PictureLoadState } from "./passage-picture-load";

/** The browser's object URLs: the one implementation of `ObjectUrls`, at the render edge. */
export const BROWSER_OBJECT_URLS: ObjectUrls = Object.freeze({
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
});

export type PictureView =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "resident"; url: string }>
  | Readonly<{ kind: "missing"; reason: "absent" | "damaged" | "unavailable" }>;

/** A decoder that rejects bytes the store trusted makes them damaged, never a broken image. */
export function pictureView(state: PictureLoadState | null, undecodableUrl: string | null): PictureView {
  if (state === null) return { kind: "loading" };
  if (state.phase === "missing") return { kind: "missing", reason: state.reason };
  return undecodableUrl === state.url
    ? { kind: "missing", reason: "damaged" }
    : { kind: "resident", url: state.url };
}

/** Markup only: every view shares the pointer's box, so none of them moves layout. */
export function PictureFrame({
  locale,
  onUndecodable,
  pointer,
  view,
}: Readonly<{
  locale: MatterLocale;
  onUndecodable?: () => void;
  pointer: ImagePointer;
  view: PictureView;
}>) {
  const copy = pictureCopy(locale);
  const style = pictureBoxStyle(pointer);
  if (view.kind === "loading") {
    return <PicturePlaceholder pointer={pointer} />;
  }
  if (view.kind === "resident") {
    return (
      <div className="passage-picture" data-picture-state="resident" style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL cannot go through the image optimizer */}
        <img
          alt={copy.alt}
          className="passage-picture__image"
          decoding="async"
          draggable={false}
          loading="lazy"
          onError={onUndecodable}
          src={view.url}
        />
      </div>
    );
  }
  const label = copy[view.reason];
  return (
    <div
      aria-label={label}
      className="passage-picture"
      data-picture-state={view.reason}
      role="img"
      style={style}
    >
      <span className="passage-picture__label">{label}</span>
    </div>
  );
}
