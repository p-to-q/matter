"use client";

import { memo, useContext, useEffect, useState } from "react";
import type { MatterLocale } from "../config/locales";
import type { PictureBytesSource } from "../interaction/picture-bytes-source";
import type { ImagePointer } from "../tree/image-pointer";
import { PictureBytesContext } from "./picture-bytes-context";
import { pictureCopy } from "./picture-copy";
import { PicturePlaceholder } from "./PicturePlaceholder";
import { pictureBoxStyle, pictureLayoutKey } from "./passage-picture-box";
import { startPictureLoad, type ObjectUrls, type PictureLoadState } from "./passage-picture-load";

/** The browser's object URLs: the one implementation of `ObjectUrls`, at the render edge. */
export const BROWSER_OBJECT_URLS: ObjectUrls = Object.freeze({
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
});

type Settled = Readonly<{ key: string; source: PictureBytesSource; state: PictureLoadState }>;

export type PictureView =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "resident"; url: string }>
  | Readonly<{ kind: "missing"; reason: "absent" | "damaged" | "unavailable" }>;

/**
 * The picture a passage carries, or an honest plate of the same size. The box
 * comes from the pointer alone, so nothing moves when bytes arrive, and the
 * state is read on every mount rather than stored anywhere.
 */
export const PassagePicture = memo(function PassagePicture({
  locale,
  pointer,
}: Readonly<{ locale: MatterLocale; pointer: ImagePointer }>) {
  const source = useContext(PictureBytesContext);
  const { byteLength, contentHash, height, mediaType, width } = pointer;
  const key = pictureLayoutKey(pointer);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [undecodableUrl, setUndecodableUrl] = useState<string | null>(null);

  useEffect(() => {
    const held: ImagePointer = { byteLength, contentHash, height, mediaType, width };
    const heldKey = pictureLayoutKey(held);
    if (heldKey === null) return undefined;
    return startPictureLoad({
      pointer: held,
      source,
      urls: BROWSER_OBJECT_URLS,
      onChange: (state) => setSettled({ key: heldKey, source, state }),
    });
  }, [byteLength, contentHash, height, mediaType, source, width]);

  const state = settled !== null && settled.key === key && settled.source === source
    ? settled.state
    : null;
  const view = pictureView(state, undecodableUrl);
  return (
    <PictureFrame
      locale={locale}
      onUndecodable={view.kind === "resident" ? () => setUndecodableUrl(view.url) : undefined}
      pointer={pointer}
      view={view}
    />
  );
});

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
