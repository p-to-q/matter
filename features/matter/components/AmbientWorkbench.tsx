"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AmbientWorkbench.module.css";
import { clientMatterBasePath } from "../config/base-path";
import {
  shouldPresentAmbientMotion,
  type AmbientConnectionHint,
} from "./ambient-motion-policy";

export type AmbientWorkbenchProps = Readonly<{
  className?: string;
  enabled?: boolean;
  navigationActive?: boolean;
}>;

const BASE_PLAYBACK_RATE = 0.72;
const NAVIGATION_PLAYBACK_RATE = 1.55;

/**
 * Decorative atmosphere for the workbench. It owns no document, interaction,
 * or camera state and stays outside the material mutation path.
 */
export function AmbientWorkbench({ className, enabled = true, navigationActive = false }: AmbientWorkbenchProps) {
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [motionFailed, setMotionFailed] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const basePath = clientMatterBasePath();
  const assetPath = (name: string) => `${basePath}/matter-ui/${name}`;
  const rootClassName = ["matter-ambient", styles.root, className]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & {
      connection?: AmbientConnectionHint & Partial<EventTarget>;
    }).connection;
    const update = () => setMotionAllowed(shouldPresentAmbientMotion({
      connection,
      reducedMotion: motionPreference.matches,
    }));
    update();
    const legacyMotionPreference = motionPreference as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    if (typeof motionPreference.addEventListener === "function") {
      motionPreference.addEventListener("change", update);
    } else {
      legacyMotionPreference.addListener?.(update);
    }
    connection?.addEventListener?.("change", update);
    return () => {
      if (typeof motionPreference.removeEventListener === "function") {
        motionPreference.removeEventListener("change", update);
      } else {
        legacyMotionPreference.removeListener?.(update);
      }
      connection?.removeEventListener?.("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !motionAllowed || motionFailed || motionReady) return;

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
  }, [enabled, motionAllowed, motionFailed, motionReady]);

  useEffect(() => {
    if (!enabled || !motionAllowed || !motionReady) return;
    const video = videoRef.current;
    if (video === null) return;
    const followVisibility = () => {
      if (!enabled || document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    followVisibility();
    document.addEventListener("visibilitychange", followVisibility);
    return () => document.removeEventListener("visibilitychange", followVisibility);
  }, [enabled, motionAllowed, motionReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    video.playbackRate = navigationActive ? NAVIGATION_PLAYBACK_RATE : BASE_PLAYBACK_RATE;
  }, [motionReady, navigationActive]);

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
      {enabled && motionAllowed && motionReady ? (
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
          onError={() => {
            setMotionFailed(true);
            setMotionReady(false);
          }}
        >
          <source src={assetPath("shadows-loop.webm")} type="video/webm" />
          <source src={assetPath("shadows-loop.mp4")} type="video/mp4" />
        </video>
      ) : null}
      <div className={`matter-ambient__wash ${styles.wash}`} />
    </div>
  );
}
