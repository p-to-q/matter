"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatterLocale } from "../config/locales";
import { pictureCopy } from "./picture-copy";
import type { PictureBytesSource } from "../interaction/picture-bytes-source";
import type { GeneratedPicture } from "../runtime/picture-turn";
import type { PictureControlCopy } from "./picture-control-copy";
import {
  pictureArmText,
  pictureKeepFailureText,
  pictureKeepOffered,
  pictureNoticeText,
  type PictureBubbleView,
} from "./picture-surface";
import { startPictureLoad, type PictureLoadState } from "./passage-picture-load";
import { BROWSER_OBJECT_URLS, PictureFrame, pictureView } from "./PassagePicture";
import type { PointTalkPictureActions } from "./use-picture-session";

/**
 * What the Point and Talk bubble shows in place of its form row while a picture
 * is being armed, drawn, previewed, or has failed. Markup only: the driver owns
 * every state. `actions` is null for the frozen copy that fades after its owner
 * left, which must not act, hold focus, or load the picture again.
 */
export function PointTalkPicturePanel({
  actions,
  copy,
  keeping,
  locale,
  view,
}: Readonly<{
  actions: PointTalkPictureActions | null;
  copy: PictureControlCopy;
  keeping: boolean;
  locale: MatterLocale;
  view: PictureBubbleView;
}>) {
  const live = actions !== null;
  const anchorFocus = live ? -1 : undefined;
  switch (view.step) {
    case "arm": {
      const { warning, statement } = pictureArmText(copy, view.billed);
      return (
        <div className="point-talk__picture" data-picture-step="arm">
          <div className="point-talk__arm-text" data-picture-anchor dir="auto" tabIndex={anchorFocus}>
            {warning === null ? null : <p className="point-talk__warning">{warning}</p>}
            <p className="point-talk__statement">{statement}</p>
          </div>
          <div className="point-talk__picture-actions">
            <button className="point-talk__text-button" data-primary onClick={actions?.confirm} type="button">
              {copy.draw}
            </button>
            <button className="point-talk__text-button" onClick={actions?.back} type="button">
              {copy.back}
            </button>
          </div>
        </div>
      );
    }
    case "drawing":
      return (
        <div className="point-talk__picture" data-picture-step="drawing">
          <p className="point-talk__statement" dir="auto">{copy.drawing}</p>
          <div className="point-talk__picture-actions">
            <button
              className="point-talk__text-button"
              data-picture-anchor
              onClick={actions?.stopWaiting}
              type="button"
            >
              {copy.stopWaiting}
            </button>
          </div>
        </div>
      );
    case "failed":
      return (
        <div className="point-talk__picture" data-picture-step="failed">
          <p className="point-talk__statement" data-picture-anchor dir="auto" tabIndex={anchorFocus}>
            {pictureNoticeText(copy, view.notice)}
          </p>
          <div className="point-talk__picture-actions">
            {view.retryable ? (
              <button className="point-talk__text-button" data-primary onClick={actions?.tryAgain} type="button">
                {copy.tryAgain}
              </button>
            ) : (
              <button className="point-talk__text-button" onClick={actions?.dismissFailure} type="button">
                {copy.back}
              </button>
            )}
          </div>
        </div>
      );
    case "preview": {
      const line = pictureKeepFailureText(copy, view.failure);
      return (
        <div
          className="point-talk__picture"
          data-picture-step="preview"
          {...(live
            ? {
                "aria-label": pictureCopy(locale).alt,
                "data-picture-anchor": "",
                role: "group",
                tabIndex: -1,
              }
            : {})}
        >
          <PreviewPicture live={live} locale={locale} picture={view.picture} />
          {line === null ? null : <p className="point-talk__statement" dir="auto">{line}</p>}
          <div className="point-talk__picture-actions">
            {pictureKeepOffered(view.failure) ? (
              <button
                aria-disabled={keeping || undefined}
                className="point-talk__text-button"
                data-primary
                onClick={keeping ? undefined : actions?.keep}
                type="button"
              >
                {copy.keep}
              </button>
            ) : null}
            <button
              aria-disabled={keeping || undefined}
              className="point-talk__text-button"
              onClick={keeping ? undefined : actions?.discard}
              type="button"
            >
              {copy.discard}
            </button>
          </div>
        </div>
      );
    }
  }
}

/**
 * The arrived picture, read through the passage picture's own loader so its
 * object URL is created in one place and revoked when the preview closes. The
 * bytes are held in the turn, not in any store, until Keep.
 */
function PreviewPicture({
  live,
  locale,
  picture,
}: Readonly<{ live: boolean; locale: MatterLocale; picture: GeneratedPicture }>) {
  const { bytes, pointer } = picture;
  const source = useMemo<PictureBytesSource>(() => Object.freeze({
    read: () => Promise.resolve(Object.freeze({ status: "resident" as const, bytes })),
  }), [bytes]);
  const [loaded, setLoaded] = useState<PictureLoadState | null>(null);
  const [undecodableUrl, setUndecodableUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!live) return undefined;
    return startPictureLoad({ pointer, source, urls: BROWSER_OBJECT_URLS, onChange: setLoaded });
  }, [live, pointer, source]);
  const view = pictureView(live ? loaded : null, undecodableUrl);
  return (
    <PictureFrame
      locale={locale}
      onUndecodable={view.kind === "resident" ? () => setUndecodableUrl(view.url) : undefined}
      pointer={pointer}
      view={view}
    />
  );
}
