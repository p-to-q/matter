import { describe, expect, it } from "vitest";
import {
  projectCanvasRulingGeometry,
  projectCanvasRulingPaths,
  projectCanvasRulingPlacement,
  projectCanvasRulingTopology,
} from "./canvas-ruling-geometry";

const DESKTOP_SURFACE = Object.freeze({
  anchorX: 0,
  cellHeight: 196,
  columnGap: 116,
  columnWidth: 520,
  surfaceHeight: 700,
  surfaceWidth: 960,
});

describe("canvas ruling projection", () => {
  it("shares the desktop material step and follows camera translation", () => {
    const geometry = projectCanvasRulingGeometry({
      ...DESKTOP_SURFACE,
      viewport: { x: 42, y: -18, zoom: 1 },
    });
    expect(geometry).toMatchObject({
      cellHeight: 196,
      cellWidth: 636,
      curveTension: 0.72,
      dashLength: 6,
      horizontalDashCount: 40,
      horizontalGap: 10,
      intersectionClearance: 3,
      lineWidth: 1.4,
      originX: 204,
      originY: 195,
      phaseX: 204,
      phaseY: 195,
      verticalDashCount: 13,
    });
    expect(geometry?.verticalGap).toBeCloseTo(9.333, 3);
  });

  it("scales world rhythm while retaining a 1.4px reading thickness", () => {
    const geometry = projectCanvasRulingGeometry({
      ...DESKTOP_SURFACE,
      viewport: { x: -25, y: 31, zoom: 1.5 },
    });
    expect(geometry).toMatchObject({
      cellHeight: 294,
      cellWidth: 954,
      dashLength: 9,
      horizontalGap: 15,
      intersectionClearance: 4.5,
      lineWidth: 1.4,
      originX: 218,
      originY: 350.5,
      phaseX: 218,
      phaseY: 56.5,
      verticalGap: 14,
    });

    const minimum = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 0.6 });
    const maximum = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 1.8 });
    expect(minimum).toMatchObject({
      dashLength: 3.6,
      intersectionClearance: 1.8,
      lineWidth: 1.4,
    });
    expect(maximum).toMatchObject({
      dashLength: 10.8,
      intersectionClearance: 5.4,
      lineWidth: 1.4,
    });
    expect(minimum === null ? null : projectCanvasRulingPaths(minimum)).not.toBeNull();
    expect(maximum === null ? null : projectCanvasRulingPaths(maximum)).not.toBeNull();
  });

  it("keeps narrow and compact lanes aligned to their responsive canvas anchors", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: -28,
      cellHeight: 172,
      columnGap: 64,
      columnWidth: 280,
      surfaceHeight: 760,
      surfaceWidth: 374,
      viewport: { x: 0, y: 0, zoom: 1 },
    })).toMatchObject({ cellHeight: 172, cellWidth: 344, originX: -13, originY: 238.8 });
    expect(projectCanvasRulingGeometry({
      anchorX: -34,
      cellHeight: 160,
      columnGap: 56,
      columnWidth: 236,
      surfaceHeight: 640,
      surfaceWidth: 304,
      viewport: { x: 0, y: 0, zoom: 1 },
    })).toMatchObject({ cellHeight: 160, cellWidth: 292, originX: -28, originY: 187.2 });
  });

  it("balances complete visible dashes between every pair of open joints", () => {
    const geometry = projectCanvasRulingGeometry({
      anchorX: -28,
      cellHeight: 172,
      columnGap: 64,
      columnWidth: 280,
      surfaceHeight: 760,
      surfaceWidth: 374,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(geometry?.horizontalGap).toBeCloseTo(9.81, 2);
    expect(geometry?.verticalGap).toBe(10);
    if (geometry === null) throw new Error("valid ruling geometry must project");
    expect(edgeEndsOnFullDash(
      geometry.cellWidth,
      geometry.intersectionClearance,
      geometry.dashLength,
      geometry.horizontalGap,
    )).toBe(true);
    expect(edgeEndsOnFullDash(
      geometry.cellHeight,
      geometry.intersectionClearance,
      geometry.dashLength,
      geometry.verticalGap,
    )).toBe(true);
  });

  it("builds two filled continuous-cap paths with exact visible bounds", () => {
    const topology = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 1 });
    if (topology === null) throw new Error("valid ruling topology must project");
    const paths = projectCanvasRulingPaths(topology);
    if (paths === null) throw new Error("valid ruling paths must project");

    expect(commandCount(paths.horizontalPath, "M")).toBe(topology.horizontalDashCount);
    expect(commandCount(paths.horizontalPath, "C")).toBe(topology.horizontalDashCount * 4);
    expect(commandCount(paths.horizontalPath, "Z")).toBe(topology.horizontalDashCount);
    expect(commandCount(paths.verticalPath, "M")).toBe(topology.verticalDashCount);
    expect(commandCount(paths.verticalPath, "C")).toBe(topology.verticalDashCount * 4);
    expect(commandCount(paths.verticalPath, "Z")).toBe(topology.verticalDashCount);
    expect(paths.horizontalPath).toContain("M 4.54 0 L 8.86 0 C");
    expect(paths.verticalPath).toContain("M 0 4.54 L 0 8.86 C");
    expect(paths.horizontalPath).toContain(
      "C 9.465 0 9.7 0 9.7 0.7 C 9.7 1.4 9.465 1.4 8.86 1.4",
    );
    expect(paths.horizontalPath).not.toMatch(/[AQ]/);
    expect(paths.verticalPath).not.toMatch(/[AQ]/);
    expect(projectCanvasRulingPaths({ ...topology, curveTension: 0.5 }))
      .not.toEqual(paths);
  });

  it("keeps path bytes stable across Pan and rebuilds them only for zoom topology", () => {
    const topology = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 1 });
    const zoomed = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 1.5 });
    if (topology === null || zoomed === null) throw new Error("valid topologies must project");
    const paths = projectCanvasRulingPaths(topology);
    const movedPaths = projectCanvasRulingPaths(topology);
    const zoomedPaths = projectCanvasRulingPaths(zoomed);
    expect(projectCanvasRulingPlacement(topology, { x: 0, y: 0 })).not.toEqual(
      projectCanvasRulingPlacement(topology, { x: 61, y: -37 }),
    );
    expect(movedPaths).toEqual(paths);
    expect(zoomedPaths).not.toEqual(paths);
  });

  it("normalizes negative and whole-cell camera phases without moving topology", () => {
    const topology = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 1 });
    if (topology === null) throw new Error("valid ruling topology must project");
    const negative = projectCanvasRulingPlacement(topology, { x: -1_000, y: -1_000 });
    const equivalent = projectCanvasRulingPlacement(topology, {
      x: -1_000 + topology.cellWidth,
      y: -1_000 + topology.cellHeight,
    });
    expect(negative?.phaseX).toBeGreaterThanOrEqual(0);
    expect(negative?.phaseX).toBeLessThan(topology.cellWidth);
    expect(negative?.phaseY).toBeGreaterThanOrEqual(0);
    expect(negative?.phaseY).toBeLessThan(topology.cellHeight);
    expect(equivalent?.phaseX).toBeCloseTo(negative?.phaseX ?? Number.NaN, 3);
    expect(equivalent?.phaseY).toBeCloseTo(negative?.phaseY ?? Number.NaN, 3);

    const seam = projectCanvasRulingPlacement(topology, {
      x: -topology.baseOriginX + topology.cellWidth - 0.0004,
      y: 0,
    });
    expect(seam?.phaseX).toBe(0);
  });

  it("fails closed for invalid, overflowing, or unbounded surface values", () => {
    expect(projectCanvasRulingGeometry({
      ...DESKTOP_SURFACE,
      surfaceHeight: 0,
      viewport: { x: 0, y: 0, zoom: 1 },
    })).toBeNull();
    expect(projectCanvasRulingGeometry({
      ...DESKTOP_SURFACE,
      viewport: { x: 0, y: 0, zoom: Number.NaN },
    })).toBeNull();
    expect(projectCanvasRulingGeometry({
      ...DESKTOP_SURFACE,
      cellHeight: 1,
      columnGap: 0,
      columnWidth: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    })).toBeNull();
    expect(projectCanvasRulingTopology({
      ...DESKTOP_SURFACE,
      columnWidth: 1_000_000,
      zoom: 1,
    })).toBeNull();
    expect(projectCanvasRulingTopology({
      ...DESKTOP_SURFACE,
      surfaceWidth: Number.MAX_VALUE,
      zoom: 1.8,
    })).toBeNull();
    const topology = projectCanvasRulingTopology({ ...DESKTOP_SURFACE, zoom: 1 });
    if (topology === null) throw new Error("valid ruling topology must project");
    expect(projectCanvasRulingPlacement({
      ...topology,
      baseOriginX: Number.MAX_SAFE_INTEGER,
    }, {
      x: Number.MAX_SAFE_INTEGER,
      y: 0,
    })).toBeNull();
  });
});

function commandCount(path: string, command: "C" | "M" | "Z"): number {
  return path.split(" ").filter((token) => token === command).length;
}

function edgeEndsOnFullDash(
  edgeLength: number,
  clearance: number,
  dashLength: number,
  gap: number,
): boolean {
  const usableLength = edgeLength - 2 * clearance;
  const periodsAfterFirstDash = (usableLength - dashLength) / (dashLength + gap);
  return Math.abs(periodsAfterFirstDash - Math.round(periodsAfterFirstDash)) < 0.001;
}
