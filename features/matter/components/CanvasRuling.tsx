"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  projectCanvasRulingPaths,
  projectCanvasRulingPlacement,
  projectCanvasRulingTopology,
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
 * One render-only orientation layer shares the material camera. The pure
 * projection never authors material coordinates.
 */
export function CanvasRuling({ active, viewport }: CanvasRulingProps) {
  const patternId = `canvas-ruling-${useId().replaceAll(":", "")}`;
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

  const topology = useMemo(() => surface === null
    ? null
    : projectCanvasRulingTopology({
        anchorX: surface.anchorX,
        cellHeight: surface.cellHeight,
        columnGap: surface.columnGap,
        columnWidth: surface.columnWidth,
        surfaceHeight: surface.height,
        surfaceWidth: surface.width,
        zoom: viewport.zoom,
      }), [surface, viewport.zoom]);
  const placement = useMemo(() => topology === null
    ? null
    : projectCanvasRulingPlacement(topology, { x: viewport.x, y: viewport.y }),
  [topology, viewport.x, viewport.y]);
  const paths = useMemo(() => topology === null
    ? null
    : projectCanvasRulingPaths(topology), [topology]);
  const style = topology === null || placement === null ? undefined : {
    "--canvas-ruling-cell-height": `${topology.cellHeight}px`,
    "--canvas-ruling-cell-width": `${topology.cellWidth}px`,
    "--canvas-ruling-curve-tension": topology.curveTension,
    "--canvas-ruling-dash": `${topology.dashLength}px`,
    "--canvas-ruling-horizontal-gap": `${topology.horizontalGap}px`,
    "--canvas-ruling-intersection-clearance": `${topology.intersectionClearance}px`,
    "--canvas-ruling-origin-x": `${placement.originX}px`,
    "--canvas-ruling-origin-y": `${placement.originY}px`,
    "--canvas-ruling-line-width": `${topology.lineWidth}px`,
    "--canvas-ruling-vertical-gap": `${topology.verticalGap}px`,
  } as CSSProperties;
  const halfLine = topology === null ? 0 : topology.lineWidth / 2;
  const ready = topology !== null && placement !== null && paths !== null;

  return (
    <div
      aria-hidden="true"
      className="canvas-ruling"
      data-active={active && ready || undefined}
      data-canvas-ruling="structural"
      ref={rulingRef}
      style={style}
    >
      {!ready ? null : (
        <svg focusable="false" height="100%" width="100%">
          <defs>
            <pattern
              height={topology.cellHeight}
              id={patternId}
              patternUnits="userSpaceOnUse"
              width={topology.cellWidth}
              x={placement.phaseX - halfLine}
              y={placement.phaseY - halfLine}
            >
              <path
                d={paths.verticalPath}
                data-curve-tension={topology.curveTension}
                data-dash-count={topology.verticalDashCount}
                data-ruling-axis="vertical"
                fill="var(--canvas-ruling-line)"
              />
              <path
                d={paths.horizontalPath}
                data-curve-tension={topology.curveTension}
                data-dash-count={topology.horizontalDashCount}
                data-ruling-axis="horizontal"
                fill="var(--canvas-ruling-line)"
              />
            </pattern>
          </defs>
          <rect fill={`url(#${patternId})`} height="100%" width="100%" />
        </svg>
      )}
    </div>
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
