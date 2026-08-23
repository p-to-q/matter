"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "./AmbientWorkbench.module.css";
import { projectCoverSourceRect } from "./ambient-source-projection";

type VideoFrameCallbackVideo = HTMLVideoElement & {
  cancelVideoFrameCallback?: (handle: number) => void;
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
};

function clearCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (context === null) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

/**
 * Routes the paper's one ambient frame above its internal chrome. The rounded
 * paper remains the stacking boundary, so application rails and overlays
 * cannot enter this media lifecycle.
 */
export function AmbientForegroundPass({
  motionReady,
  poster,
  videoRef,
}: Readonly<{
  motionReady: boolean;
  poster: HTMLImageElement | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const paper = canvas.closest<HTMLElement>(".matter-document");
    if (paper === null) {
      canvas.dataset.active = "false";
      clearCanvas(canvas);
      return;
    }

    let animationFrame = 0;
    let videoFrame: number | null = null;
    let disposed = false;
    let foregroundOwnsMedia = false;
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const forcedColorsQuery = window.matchMedia("(forced-colors: active)");
    const baseMedia = Array.from(paper.querySelectorAll<HTMLElement>(
      '[data-matter-ambient="leaf-shadows"] .matter-ambient__poster, '
      + '[data-matter-ambient="leaf-shadows"] .matter-ambient__video',
    ));
    const originalOpacity = baseMedia.map((element) => ({
      element,
      opacity: element.style.opacity,
    }));

    const restoreBaseMedia = () => {
      if (!foregroundOwnsMedia) return;
      originalOpacity.forEach(({ element, opacity }) => {
        element.style.opacity = opacity;
      });
      foregroundOwnsMedia = false;
    };

    const claimBaseMedia = () => {
      if (foregroundOwnsMedia) return;
      baseMedia.forEach((element) => {
        element.style.opacity = "0";
      });
      foregroundOwnsMedia = true;
    };

    const draw = () => {
      animationFrame = 0;
      if (disposed) return;
      const chrome = paper.querySelector<HTMLElement>("[data-canvas-chrome]");
      const isOverlayOpen = chrome?.dataset.overlay !== "none"
        || paper.dataset.canvasModalOpen === "true";
      if (!desktopQuery.matches || forcedColorsQuery.matches || isOverlayOpen) {
        canvas.dataset.active = "false";
        clearCanvas(canvas);
        restoreBaseMedia();
        return;
      }

      const video = videoRef.current;
      const source = video !== null
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && video.videoWidth > 0
        && video.videoHeight > 0
        ? video
        : poster !== null && poster.complete && poster.naturalWidth > 0 && poster.naturalHeight > 0
          ? poster
          : null;
      const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source?.naturalWidth;
      const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source?.naturalHeight;
      const bounds = canvas.getBoundingClientRect();
      const sourceRect = source === null || sourceWidth === undefined || sourceHeight === undefined
        ? null
        : projectCoverSourceRect(
          { height: sourceHeight, width: sourceWidth },
          { height: bounds.height, width: bounds.width },
        );
      const context = canvas.getContext("2d");
      if (source === null || sourceRect === null || context === null) {
        canvas.dataset.active = "false";
        clearCanvas(canvas);
        restoreBaseMedia();
        return;
      }

      // The source is deliberately soft; pixels above 2x add upload cost
      // without adding visible leaf detail on high-density displays.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(bounds.width * pixelRatio);
      const pixelHeight = Math.round(bounds.height * pixelRatio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.drawImage(
        source,
        sourceRect.left,
        sourceRect.top,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
      claimBaseMedia();
      canvas.dataset.active = "true";
    };

    const scheduleDraw = () => {
      if (animationFrame === 0) animationFrame = window.requestAnimationFrame(draw);
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleDraw);
    resizeObserver?.observe(canvas);
    const mutationObserver = new MutationObserver(scheduleDraw);
    mutationObserver.observe(paper, { attributes: true, attributeFilter: ["data-canvas-modal-open"] });
    const chrome = paper.querySelector<HTMLElement>("[data-canvas-chrome]");
    if (chrome !== null) {
      mutationObserver.observe(chrome, { attributes: true, attributeFilter: ["data-overlay"] });
    }
    const onMediaQueryChange = () => scheduleDraw();
    desktopQuery.addEventListener("change", onMediaQueryChange);
    forcedColorsQuery.addEventListener("change", onMediaQueryChange);
    window.addEventListener("resize", scheduleDraw);
    scheduleDraw();

    const video = videoRef.current as VideoFrameCallbackVideo | null;
    const presentNextVideoFrame = () => {
      if (disposed || video === null) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrame = video.requestVideoFrameCallback(() => {
          scheduleDraw();
          presentNextVideoFrame();
        });
      } else {
        animationFrame = window.requestAnimationFrame(() => {
          animationFrame = 0;
          draw();
          presentNextVideoFrame();
        });
      }
    };
    if (motionReady && video !== null) presentNextVideoFrame();

    return () => {
      disposed = true;
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      if (videoFrame !== null) video?.cancelVideoFrameCallback?.(videoFrame);
      restoreBaseMedia();
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      desktopQuery.removeEventListener("change", onMediaQueryChange);
      forcedColorsQuery.removeEventListener("change", onMediaQueryChange);
      window.removeEventListener("resize", scheduleDraw);
    };
  }, [motionReady, poster, videoRef]);

  return (
    <canvas
      aria-hidden="true"
      className={`matter-ambient__foreground-pass ${styles.foregroundPass}`}
      data-active="false"
      data-matter-ambient-foreground-pass
      ref={canvasRef}
    />
  );
}
