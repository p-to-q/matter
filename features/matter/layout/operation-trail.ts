import type { ColumnarLayout, LayoutBox } from "./model";

/**
 * The trail drawn while a passage is selected, an AI operation is addressed at
 * it, or Ask Matter is addressed at lassoed passages. A bead sits on the left
 * gutter of every passage on the path from the root down to the target, and
 * the beads are joined by one hairline that runs in each passage's top margin,
 * never through its text. Each edge ends in a small solid arrowhead pointing
 * into the passage it reaches. A single selected passage also shows its own
 * children (and theirs, to a small cap) a little lighter. It is orientation,
 * not navigation: nothing here is stored, and the caller draws it only for
 * targets it derives.
 *
 * Everything is derived from the published layout, so unmounted passages have
 * the same positions as mounted ones. Sizes are screen sizes: the constants
 * below are CSS pixels on the screen, and every world-space length derived from
 * them is divided by the current zoom.
 */
export const OPERATION_TRAIL_PX = Object.freeze({
  /** Bead centre to the passage's left edge: clear of the highlight and the AI mark. */
  gutter: 36,
  /** One corner radius for every turn, clamped for a short leg. */
  corner: 8,
  stroke: 1.75,
  /** Diameters. */
  bead: 7,
  target: 11,
  ring: 20,
  moreDot: 3,
  /** A solid arrowhead: its length along the edge, its width across it, and its gap to the bead. */
  arrowLength: 6.5,
  arrowWidth: 6,
  arrowGap: 1.5,
  chevron: 6,
  /** The ramp from the clipping edge to full ink. */
  fade: 56,
  /** Where the ramp has reached `kneeAlpha`, so a cue at the edge can still be seen. */
  knee: 14,
  kneeAlpha: 0.55,
  /** The cue stands this far inside the edge the thread leaves by. */
  chevronInset: 12,
  /** A target bead that would fall outside the window is kept this far inside it. */
  pinInset: 22,
  /** Two passages whose beads sit closer than this vertically get one level leg. */
  levelBelow: 6,
  /**
   * The thread runs this far above a passage's top edge, in the gap above it,
   * so it clears the first line's glyphs and the passage's own AI mark at every
   * zoom and never crosses text. It never rises past a share of the gap to the
   * passage above (`LIFT_OF_GAP`).
   */
  lift: 24,
});

/** What is drawn below a selected passage, and no more: never the subtree of a large branch. */
export const OPERATION_TRAIL_LIMITS = Object.freeze({
  /** Children drawn; more than this and the last drawn child carries the "more" dots. */
  children: 6,
  /** Grandchildren drawn, and only while the children fit and nothing lies deeper. */
  grandchildren: 8,
  /** Passages that carry a target bead at once (an Ask Matter over many lassoed passages). */
  targets: 6,
});

/** The most of the gap above a passage the thread may take. */
export const OPERATION_TRAIL_LIFT_OF_GAP = 0.55;

export type TrailRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/**
 * Where canvas coordinates land on the device's pixel grid: the screen position
 * of canvas (0, 0) in CSS pixels and the device pixel ratio. With it the
 * hairline's legs and the beads' centres are placed on the grid, so a leg is a
 * crisp run of whole pixels rather than blurred ones.
 */
export type TrailPixelGrid = Readonly<{ x0: number; y0: number; dpr: number }>;

/** The path data of one weight of the drawing; each string is one SVG path. */
export type TrailPaths = Readonly<{ line: string; dots: string; arrows: string }>;

export type TrailTargetBead = Readonly<{ nodeId: string; x: number; y: number; pinned: boolean }>;

export type OperationTrail = Readonly<{
  zoom: number;
  /** The visible area in the canvas's own coordinates; the drawing is clipped to it. */
  window: TrailRect;
  /**
   * The drawing's box: the window, widened so its top-left corner sits on a
   * device pixel. A replaced box at a fractional position is snapped by the
   * browser, which would shift the hairline off the grid it was placed on.
   */
  box: TrailRect;
  /** From the root down to each target. */
  up: TrailPaths;
  /** Below the one selected passage; empty for any other target. `more` is the dots of an unfinished branch. */
  down: TrailPaths & Readonly<{ more: string }>;
  /** One bead, larger and ringed, per target. */
  targets: readonly TrailTargetBead[];
  /** Where the thread continues beyond the window; `angle` is degrees, 0 pointing right. */
  chevron: Readonly<{ x: number; y: number; angle: number }> | null;
}>;

type Point = Readonly<{ x: number; y: number }>;
type Anchor = Point & Readonly<{ nodeId: string }>;
type TrailNode = Readonly<{
  id: string;
  parentId: string | null;
  kind: "up" | "down";
  target: boolean;
  box: LayoutBox;
  /** Space between this passage and the previous sibling's box above it, or null for the first. */
  gapAbove: number | null;
}>;

const PX = OPERATION_TRAIL_PX;

/**
 * The visible area in canvas coordinates. `viewport` is the camera (the
 * world's translation and zoom), `worldSize` the on-screen size of the plane the
 * world fills, and `canvasOrigin` the canvas's offset inside the world.
 */
export function trailWindow(input: Readonly<{
  viewport: Readonly<{ x: number; y: number; zoom: number }>;
  worldSize: Readonly<{ width: number; height: number }>;
  canvasOrigin: Point;
}>): TrailRect {
  const { viewport, worldSize, canvasOrigin } = input;
  return {
    x: -viewport.x / viewport.zoom - canvasOrigin.x,
    y: -viewport.y / viewport.zoom - canvasOrigin.y,
    width: worldSize.width / viewport.zoom,
    height: worldSize.height / viewport.zoom,
  };
}

/** The share of full ink at `distance` screen pixels inside a clipping edge. */
export function trailEdgeAlpha(distance: number): number {
  const { fade, knee, kneeAlpha } = PX;
  if (!(distance > 0)) return 0;
  if (distance >= fade) return 1;
  if (distance <= knee) return kneeAlpha * (distance / knee);
  return kneeAlpha + (1 - kneeAlpha) * ((distance - knee) / (fade - knee));
}

/**
 * The centre, in screen pixels, that puts a stroke of `widthPx` on whole
 * device pixels: on a pixel centre when it covers an odd number of device
 * pixels, on a pixel edge when it covers an even number.
 */
export function snapStrokeCentre(screen: number, dpr: number, widthPx: number): number {
  const device = Math.max(1, Math.round(widthPx * dpr));
  const scaled = screen * dpr;
  const snapped = device % 2 === 1 ? Math.floor(scaled) + 0.5 : Math.round(scaled);
  return snapped / dpr;
}

/** The window widened up and left to the device pixel that contains its corner. */
export function snapBox(window: TrailRect, zoom: number, grid: TrailPixelGrid | undefined): TrailRect {
  if (grid === undefined) return window;
  const snapCorner = (value: number, origin: number) =>
    (Math.floor((origin + zoom * value) * grid.dpr) / grid.dpr - origin) / zoom;
  const x = snapCorner(window.x, grid.x0);
  const y = snapCorner(window.y, grid.y0);
  return {
    x: round(x),
    y: round(y),
    width: round(window.width + (window.x - x)),
    height: round(window.height + (window.y - y)),
  };
}

/**
 * The trail's passages: every lineage from the root to its target, merged so a
 * shared ancestor is one passage, and, for one selected passage, the part of
 * its subtree the limits allow. `null` unless the layout names every step of
 * every lineage with the parent that lineage says: a target that is not laid
 * out, or a layout that disagrees with the tree, draws nothing instead of a
 * partial or guessed trail.
 */
export function operationTrailNodes(
  layout: ColumnarLayout,
  lineages: readonly (readonly string[])[],
  descendantsOf: string | null,
): Readonly<{ nodes: readonly TrailNode[]; more: string | null }> | null {
  if (lineages.length === 0 || lineages.some((lineage) => lineage.length === 0)) return null;
  const wanted = new Set(lineages.flat());
  const boxes = new Map<string, LayoutBox>();
  const children: LayoutBox[] = [];
  const gaps = new Map<string, number | null>();
  const previousSibling = new Map<string | null, LayoutBox>();
  for (const box of layout.boxes) {
    const above = previousSibling.get(box.parentId);
    const isChild = descendantsOf !== null && box.parentId === descendantsOf;
    if (wanted.has(box.nodeId) || isChild) {
      gaps.set(box.nodeId, above === undefined ? null : Math.max(0, box.y - (above.y + above.height)));
    }
    previousSibling.set(box.parentId, box);
    if (wanted.has(box.nodeId)) boxes.set(box.nodeId, box);
    if (isChild) children.push(box);
  }

  const nodes: TrailNode[] = [];
  const seen = new Map<string, string | null>();
  const targets = new Set(lineages.map((lineage) => lineage[lineage.length - 1]!));
  for (const lineage of lineages) {
    for (let index = 0; index < lineage.length; index += 1) {
      const id = lineage[index]!;
      const box = boxes.get(id);
      if (box === undefined) return null;
      const parentId = index === 0 ? null : lineage[index - 1]!;
      if (index > 0 && box.parentId !== parentId) return null;
      if (seen.has(id)) {
        if (seen.get(id) !== parentId) return null;
        continue;
      }
      seen.set(id, parentId);
      nodes.push({ id, parentId, kind: "up", target: targets.has(id), box, gapAbove: gaps.get(id) ?? null });
    }
  }

  let more: string | null = null;
  if (descendantsOf !== null && seen.has(descendantsOf) && children.length > 0) {
    const { children: childLimit, grandchildren: grandLimit } = OPERATION_TRAIL_LIMITS;
    const drawnChildren = children.slice(0, childLimit);
    const childIds = new Set(children.map((child) => child.nodeId));
    const grandchildren: LayoutBox[] = [];
    let deeper = false;
    if (children.length <= childLimit) {
      const grandIds = new Set<string>();
      const siblingAbove = new Map<string, LayoutBox>();
      for (const box of layout.boxes) {
        if (box.parentId !== null && childIds.has(box.parentId)) {
          const above = siblingAbove.get(box.parentId);
          gaps.set(box.nodeId, above === undefined ? null : Math.max(0, box.y - (above.y + above.height)));
          siblingAbove.set(box.parentId, box);
          grandchildren.push(box);
          grandIds.add(box.nodeId);
        }
      }
      for (const box of layout.boxes) {
        if (box.parentId !== null && grandIds.has(box.parentId)) {
          deeper = true;
          break;
        }
      }
    }
    const drawGrandchildren = children.length <= childLimit && !deeper && grandchildren.length <= grandLimit;
    for (const child of drawnChildren) {
      nodes.push({
        id: child.nodeId, parentId: descendantsOf, kind: "down", target: false, box: child,
        gapAbove: gaps.get(child.nodeId) ?? null,
      });
    }
    if (drawGrandchildren) {
      for (const child of drawnChildren) {
        for (const grand of grandchildren) {
          if (grand.parentId === child.nodeId) {
            nodes.push({
              id: grand.nodeId, parentId: child.nodeId, kind: "down", target: false, box: grand,
              gapAbove: gaps.get(grand.nodeId) ?? null,
            });
          }
        }
      }
    }
    // Anything the drawing leaves out is said once, on the last child drawn.
    const complete = drawnChildren.length === children.length && drawGrandchildren;
    if (!complete) more = drawnChildren[drawnChildren.length - 1]!.nodeId;
  }
  return Object.freeze({ nodes: Object.freeze(nodes), more });
}

/**
 * The trail for one published layout, or `null` when there is nothing current
 * to draw. A layout whose epoch is not the current publication is never drawn,
 * so the trail cannot lag the passages it joins.
 */
export function operationTrailGeometry(input: Readonly<{
  layout: ColumnarLayout | null;
  currentLayoutEpoch: number | null;
  /** Root-to-target lineages, one per target. */
  lineages: readonly (readonly string[])[] | null;
  /** The one selected passage whose children are drawn, or null. */
  descendantsOf?: string | null;
  zoom: number;
  window: TrailRect;
  grid?: TrailPixelGrid;
}>): OperationTrail | null {
  const { layout, zoom, window } = input;
  if (layout === null || layout.layoutEpoch !== input.currentLayoutEpoch) return null;
  if (!(zoom > 0) || !Number.isFinite(zoom)) return null;
  if (!(window.width > 0) || !(window.height > 0)) return null;
  if (input.lineages === null) return null;
  const lineages = input.lineages.slice(0, OPERATION_TRAIL_LIMITS.targets);
  const resolved = operationTrailNodes(layout, lineages, input.descendantsOf ?? null);
  if (resolved === null) return null;

  const unit = 1 / zoom;
  const box = snapBox(window, zoom, input.grid);
  const anchors = placeAnchors(resolved.nodes, zoom, input.grid);
  const targetNodes = resolved.nodes.filter((entry) => entry.target);
  const inner = inset(window, PX.pinInset * 0.5 * unit);

  // A lone target whose bead is off the screen keeps a bead on the edge it is
  // past, with a short lead-in from that edge, so the operation always belongs
  // to something. It stands in for the target; it is not a second target.
  if (targetNodes.length === 1) {
    const only = anchors.get(targetNodes[0]!.id)!;
    if (!contains(inner, only)) {
      const pin = clamp(only, inset(window, PX.pinInset * unit));
      const edge = nearestEdgePoint(window, pin);
      return Object.freeze({
        zoom,
        window,
        box,
        up: Object.freeze({ line: `M${fmt(edge.x)} ${fmt(edge.y)}L${fmt(pin.x)} ${fmt(pin.y)}`, dots: "", arrows: "" }),
        down: EMPTY_DOWN,
        targets: Object.freeze([Object.freeze({ nodeId: only.nodeId, x: pin.x, y: pin.y, pinned: true })]),
        chevron: cueAt(pin, edge, unit),
      });
    }
  }

  const pieces = {
    up: { line: "", dots: "", arrows: "" },
    down: { line: "", dots: "", arrows: "" },
  };
  for (const entry of resolved.nodes) {
    const anchor = anchors.get(entry.id)!;
    const group = pieces[entry.kind];
    if (!entry.target && contains(window, anchor)) {
      group.dots += `M${fmt(anchor.x)} ${fmt(anchor.y)}h0`;
    }
    if (entry.parentId === null) continue;
    const from = anchors.get(entry.parentId)!;
    group.line += edgePath(from, anchor, PX.corner * unit);
    group.arrows += edgeArrow(from, anchor, entry.target ? PX.target : PX.bead, zoom);
  }

  let more = "";
  if (resolved.more !== null) {
    const last = anchors.get(resolved.more)!;
    for (let step = 0; step < 3; step += 1) {
      more += `M${fmt(last.x)} ${fmt(last.y + (PX.bead / 2 + 7 + step * 6) * unit)}h0`;
    }
  }

  const targets = targetNodes
    .map((entry) => anchors.get(entry.id)!)
    .filter((anchor) => contains(window, anchor))
    .map((anchor) => Object.freeze({ nodeId: anchor.nodeId, x: anchor.x, y: anchor.y, pinned: false }));

  let chevron: OperationTrail["chevron"] = null;
  for (const lineage of lineages) {
    chevron = continuationCue(threadVertices(lineage.map((id) => anchors.get(id)!)), window, unit);
    if (chevron !== null) break;
  }

  return Object.freeze({
    zoom,
    window,
    box,
    up: Object.freeze(pieces.up),
    down: Object.freeze({ ...pieces.down, more }),
    targets: Object.freeze(targets),
    chevron,
  });
}

const EMPTY_DOWN = Object.freeze({ line: "", dots: "", arrows: "", more: "" });

/** The bead of every trail passage, placed from its parent's bead so level legs stay level. */
function placeAnchors(
  nodes: readonly TrailNode[],
  zoom: number,
  grid: TrailPixelGrid | undefined,
): Map<string, Anchor> {
  const gutter = PX.gutter / zoom;
  const snap = (value: number, origin: number | undefined): number => {
    if (grid === undefined || origin === undefined) return round(value);
    const screen = origin + zoom * value;
    return round((snapStrokeCentre(screen, grid.dpr, PX.stroke) - origin) / zoom);
  };
  const anchors = new Map<string, Anchor>();
  for (const entry of nodes) {
    const lift = Math.min(
      PX.lift / zoom,
      entry.gapAbove === null ? Number.POSITIVE_INFINITY : entry.gapAbove * OPERATION_TRAIL_LIFT_OF_GAP,
    );
    const wantedY = entry.box.y - lift;
    const parent = entry.parentId === null ? undefined : anchors.get(entry.parentId);
    // Two passages whose beads are all but level are joined by one level leg,
    // never by a stair-step of a few pixels.
    const level = parent !== undefined && Math.abs(wantedY - parent.y) * zoom < PX.levelBelow;
    anchors.set(entry.id, {
      nodeId: entry.id,
      x: snap(entry.box.x - gutter, grid?.x0),
      y: level ? parent.y : snap(wantedY, grid?.y0),
    });
  }
  return anchors;
}

/**
 * One edge, made only of level and plumb legs. Where it drops to a lower
 * passage it runs level in the parent's margin, turns down with a rounded
 * corner and meets the child's bead from above; at a bead the turn is sharp,
 * because the opaque bead covers it.
 */
function edgePath(from: Point, to: Point, corner: number): string {
  const start = `M${fmt(from.x)} ${fmt(from.y)}`;
  const drop = to.y - from.y;
  const reach = to.x - from.x;
  if (Math.abs(drop) <= EPSILON) return `${start}L${fmt(to.x)} ${fmt(to.y)}`;
  const radius = Math.min(corner, Math.abs(drop), Math.max(0, reach));
  const sign = drop > 0 ? 1 : -1;
  if (radius <= EPSILON) return `${start}L${fmt(to.x)} ${fmt(from.y)}L${fmt(to.x)} ${fmt(to.y)}`;
  return `${start}L${fmt(to.x - radius)} ${fmt(from.y)}` +
    `A${fmt(radius)} ${fmt(radius)} 0 0 ${sign > 0 ? 1 : 0} ${fmt(to.x)} ${fmt(from.y + sign * radius)}` +
    `L${fmt(to.x)} ${fmt(to.y)}`;
}

/**
 * The solid arrowhead where an edge reaches a passage: pointing down into the
 * bead when the edge turns down and has room for it above the bead, otherwise
 * rightward along the last level run. Its tip stops a gap short of the bead.
 */
function edgeArrow(from: Point, to: Point, beadDiameter: number, zoom: number): string {
  const unit = 1 / zoom;
  const length = PX.arrowLength * unit;
  const half = (PX.arrowWidth / 2) * unit;
  const clear = (beadDiameter / 2 + PX.arrowGap) * unit;
  const drop = to.y - from.y;
  const down = drop > EPSILON && drop * zoom >= PX.arrowLength + beadDiameter / 2 + PX.arrowGap + PX.corner;
  const up = drop < -EPSILON && -drop * zoom >= PX.arrowLength + beadDiameter / 2 + PX.arrowGap + PX.corner;
  if (down || up) {
    const sign = down ? 1 : -1;
    const tip = to.y - sign * clear;
    const base = tip - sign * length;
    return `M${fmt(to.x)} ${fmt(tip)}L${fmt(to.x - half)} ${fmt(base)}L${fmt(to.x + half)} ${fmt(base)}Z`;
  }
  // Rightward: along the level run that ends at the bead, or just before a short drop's corner.
  const stop = Math.abs(drop) <= EPSILON ? to.x - clear : to.x - Math.min(PX.corner * unit, Math.abs(drop)) - PX.arrowGap * unit;
  const y = Math.abs(drop) <= EPSILON ? to.y : from.y;
  return `M${fmt(stop)} ${fmt(y)}L${fmt(stop - length)} ${fmt(y - half)}L${fmt(stop - length)} ${fmt(y + half)}Z`;
}

/** The thread's sharp vertices: each step is level, or runs level then drops. */
function threadVertices(anchors: readonly Point[]): Point[] {
  const vertices: Point[] = [anchors[0]!];
  for (let index = 1; index < anchors.length; index += 1) {
    const from = anchors[index - 1]!;
    const to = anchors[index]!;
    if (Math.abs(to.y - from.y) > EPSILON) vertices.push({ x: to.x, y: from.y });
    vertices.push(to);
  }
  return vertices;
}

/**
 * One cue where the thread, walked from the target toward the root, first
 * leaves the window. `null` when the whole thread is on screen.
 */
function continuationCue(
  vertices: readonly Point[],
  window: TrailRect,
  unit: number,
): OperationTrail["chevron"] {
  for (let index = vertices.length - 1; index > 0; index -= 1) {
    const near = vertices[index]!;
    const far = vertices[index - 1]!;
    if (!contains(window, near) || contains(window, far)) continue;
    return cueAt(near, exitPoint(near, far, window), unit);
  }
  return null;
}

/** A cue standing `chevronInset` inside `edge`, pointing from `inner` toward it. */
function cueAt(inner: Point, edge: Point, unit: number): OperationTrail["chevron"] {
  const dx = edge.x - inner.x;
  const dy = edge.y - inner.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return null;
  const back = Math.min(PX.chevronInset * unit, length);
  const ux = dx / length;
  const uy = dy / length;
  return Object.freeze({
    x: round(edge.x - ux * back),
    y: round(edge.y - uy * back),
    angle: round(Math.atan2(uy, ux) * 180 / Math.PI),
  });
}

/** Where the axis-aligned segment from an inside point to an outside one crosses the window. */
function exitPoint(inside: Point, outside: Point, window: TrailRect): Point {
  const left = window.x;
  const right = window.x + window.width;
  const top = window.y;
  const bottom = window.y + window.height;
  if (Math.abs(inside.y - outside.y) <= EPSILON) {
    return { x: outside.x < inside.x ? left : right, y: inside.y };
  }
  return { x: inside.x, y: outside.y < inside.y ? top : bottom };
}

function nearestEdgePoint(window: TrailRect, point: Point): Point {
  const toLeft = point.x - window.x;
  const toRight = window.x + window.width - point.x;
  const toTop = point.y - window.y;
  const toBottom = window.y + window.height - point.y;
  const nearest = Math.min(toLeft, toRight, toTop, toBottom);
  if (nearest === toLeft) return { x: window.x, y: point.y };
  if (nearest === toRight) return { x: window.x + window.width, y: point.y };
  if (nearest === toTop) return { x: point.x, y: window.y };
  return { x: point.x, y: window.y + window.height };
}

function inset(window: TrailRect, by: number): TrailRect {
  return {
    x: window.x + by,
    y: window.y + by,
    width: Math.max(0, window.width - by * 2),
    height: Math.max(0, window.height - by * 2),
  };
}

function contains(window: TrailRect, point: Point): boolean {
  return point.x >= window.x && point.x <= window.x + window.width &&
    point.y >= window.y && point.y <= window.y + window.height;
}

function clamp(point: Point, window: TrailRect): Point {
  return {
    x: round(Math.min(window.x + window.width, Math.max(window.x, point.x))),
    y: round(Math.min(window.y + window.height, Math.max(window.y, point.y))),
  };
}

const EPSILON = 0.01;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  return String(round(value));
}
