"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AmbientWorkbench.module.css";

export type AmbientWorkbenchProps = Readonly<{
  className?: string;
  enabled?: boolean;
}>;

/**
 * Decorative atmosphere for the workbench. It owns no document, interaction,
 * or camera state and stays outside the material mutation path.
 */
export function AmbientWorkbench({ className, enabled = true }: AmbientWorkbenchProps) {
  const [motionReady, setMotionReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const basePath = process.env.NEXT_PUBLIC_MATTER_BASE_PATH ?? "/matter";
  const assetPath = (name: string) => `${basePath}/matter-ui/${name}`;
  const rootClassName = ["matter-ambient", styles.root, className]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const revealMotion = () => setMotionReady(true);
    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(revealMotion, { timeout: 1_200 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(revealMotion, 320);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!motionReady) return;
    const video = videoRef.current;
    if (video === null) return;
    video.playbackRate = 0.72;
    const followVisibility = () => {
      if (!enabled || document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    followVisibility();
    document.addEventListener("visibilitychange", followVisibility);
    return () => document.removeEventListener("visibilitychange", followVisibility);
  }, [enabled, motionReady]);

  return (
    <div
      aria-hidden="true"
      className={rootClassName}
      data-fx={enabled ? "on" : "off"}
      data-matter-ambient="leaf-shadows"
    >
      <div
        className={`matter-ambient__poster ${styles.poster}`}
        style={{ backgroundImage: `url("${assetPath("shadows-poster.jpg")}")` }}
      />
      {motionReady ? (
        <video
          aria-hidden="true"
          autoPlay
          className={`matter-ambient__video ${styles.video}`}
          loop
          muted
          playsInline
          poster={assetPath("shadows-poster.jpg")}
          preload="none"
          ref={videoRef}
          tabIndex={-1}
          onError={() => setMotionReady(false)}
        >
          <source src={assetPath("shadows-loop.webm")} type="video/webm" />
          <source src={assetPath("shadows-loop.mp4")} type="video/mp4" />
        </video>
      ) : null}
      <div className={`matter-ambient__wash ${styles.wash}`} />
    </div>
  );
}
