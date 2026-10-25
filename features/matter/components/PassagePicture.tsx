"use client";

import { memo, useContext, useEffect, useState } from "react";
import type { MatterLocale } from "../config/locales";
import type { PictureBytesSource } from "../interaction/picture-bytes-source";
import type { ImagePointer } from "../tree/image-pointer";
import { PictureBytesContext } from "./picture-bytes-context";
import { pictureLayoutKey } from "./passage-picture-box";
import { startPictureLoad, type PictureLoadState } from "./passage-picture-load";
import { BROWSER_OBJECT_URLS, PictureFrame, pictureView } from "./PictureFrame";
export { BROWSER_OBJECT_URLS, PictureFrame, pictureView, type PictureView } from "./PictureFrame";

type Settled = Readonly<{ key: string; source: PictureBytesSource; state: PictureLoadState }>;

/**
 * The picture a passage carries, or an honest plate of the same size. The box
 * comes from the pointer alone, so nothing moves when bytes arrive, and the
 * state is read on every mount rather than stored anywhere.
 * Diagnostic metadata touches only this fresh callable; frame-only consumers
 * may discard the complete component expression without module side effects.
 */
export const PassagePicture = /* @__PURE__ */ memo(/* @__PURE__ */ Object.defineProperty(function PassagePicture({
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
}, "matterCapability", { value: "matter-capability:passage-picture" }));
