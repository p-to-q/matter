"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  projectCanvasRulingGeometry,
  type CanvasRulingViewport,
} from "./canvas-ruling-geometry";

export type CanvasRulingProps = Readonly<{
  active: boolean;
  viewport: CanvasRulingViewport;
}>;

type RulingSurface = Readonly<{
  anchorX: number;
  cellHeight: number;
  columnGap: number;
  columnWidth: number;
  height: number;
  width: number;
}>;

/**
 * One render-only orientation layer follows the transient canvas camera. The
 * pure projection shares layout tokens, but never authors material coordinates.
 */
export function CanvasRuling({ active, viewport }: CanvasRulingProps) {
  const rulingRef = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState<RulingSurface | null>(null);

  useLayoutEffect(() => {
    const ruling = rulingRef.current;
    if (ruling === null) return;
    const update = () => {
      const style = getComputedStyle(ruling);
      const next = {
        anchorX: readCssPixels(style, "--matter-canvas-anchor-x"),
        cellHeight: readCssPixels(style, "--matter-ruling-cell-height"),
        columnGap: readCssPixels(style, "--matter-column-gap"),
        columnWidth: readCssPixels(style, "--matter-column-width"),
        height: ruling.clientHeight,
        width: ruling.clientWidth,
      };
      setSurface((current) => sameSurface(current, next)
        ? current
        : Object.freeze(next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(ruling);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => surface === null
    ? null
    : projectCanvasRulingGeometry({
        anchorX: surface.anchorX,
        cellHeight: surface.cellHeight,
        columnGap: surface.columnGap,
        columnWidth: surface.columnWidth,
        surfaceHeight: surface.height,
        surfaceWidth: surface.width,
        viewport,
      }), [surface, viewport]);
  const style = geometry === null ? undefined : {
    "--canvas-ruling-cell-height": `${geometry.cellHeight}px`,
    "--canvas-ruling-cell-width": `${geometry.cellWidth}px`,
    "--canvas-ruling-origin-x": `${geometry.originX}px`,
    "--canvas-ruling-origin-y": `${geometry.originY}px`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className="canvas-ruling"
      data-active={active && geometry !== null || undefined}
      data-canvas-ruling="structural"
      ref={rulingRef}
      style={style}
    />
  );
}

function readCssPixels(style: CSSStyleDeclaration, property: string): number {
  return Number.parseFloat(style.getPropertyValue(property));
}

function sameSurface(current: RulingSurface | null, next: RulingSurface): boolean {
  return current !== null &&
    current.anchorX === next.anchorX &&
    current.cellHeight === next.cellHeight &&
    current.columnGap === next.columnGap &&
    current.columnWidth === next.columnWidth &&
    current.height === next.height &&
    current.width === next.width;
}
