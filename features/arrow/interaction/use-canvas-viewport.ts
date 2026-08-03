"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useArrowStore } from "../store/arrow-store";

type CanvasViewport = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.2;

export function useCanvasViewport() {
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 });
  const surfaceRef = useRef<HTMLElement | null>(null);

  const updateFromWheel = useCallback((event: WheelEvent) => {
    if ((event.target as HTMLElement | null)?.closest("button, a")) return;
    event.preventDefault();
    const store = useArrowStore.getState();
    if (store.selection) {
      store.setSelection(null);
      store.setPhase("idle");
    }

    setViewport((current) => {
      if (!event.ctrlKey) {
        return {
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        };
      }

      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, current.zoom * Math.exp(-event.deltaY * 0.006)),
      );
      const worldX = (event.clientX - current.x) / current.zoom;
      const worldY = (event.clientY - current.y) / current.zoom;
      return {
        x: event.clientX - worldX * zoom,
        y: event.clientY - worldY * zoom,
        zoom,
      };
    });
  }, []);

  const attachSurface = useCallback((node: HTMLElement | null) => {
    surfaceRef.current = node;
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.addEventListener("wheel", updateFromWheel, { passive: false });
    return () => surface.removeEventListener("wheel", updateFromWheel);
  }, [updateFromWheel]);

  return { viewport, attachSurface };
}
