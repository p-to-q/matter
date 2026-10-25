import type { ColumnarLayout, LayoutBox, LayoutEdge } from "./model";

/**
 * The trail drawn while a passage is selected, an AI operation is addressed at
 * it, or Ask Matter is addressed at lassoed passages. Each actual parent-child
 * bridge comes from the published layout and stops at passage boundaries;
 * bridges never join across the intervening passage's text. Render-edge bounds
 * attach a small point at each end just outside the visible material.
 * A single selected passage also shows its own
 * children (and theirs, to a small cap) a little lighter. It is orientation,
 * not navigation: nothing here is stored, and the caller draws it only for
 * targets it derives.
 *
 * Topology comes from the published layout; every resolved passage also needs
 * current render-edge bounds, so unmounted or stale material draws nothing.
 * Sizes are screen sizes: the constants
 * below are CSS pixels on the screen, and every world-space length derived from
 * them is divided by the current zoom.
 */
export const OPERATION_TRAIL_PX = Object.freeze({
  /** One corner radius for every turn, clamped for a short leg. */
  corner: 4,
  clearance: 8,
  stroke: 2.5,
  /** Diameters. */
  bead: 5,
  target: 7,
  moreDot: 2.5,
  /** Open-arrow comparison geometry only; the live candidate draws points. */
  arrowLength: 4.5,
  arrowWidth: 9,
  chevron: 6,
  /** The ramp from the clipping edge to full ink. */
  fade: 56,
  /** Where the ramp has reached `kneeAlpha`, so a cue at the edge can still be seen. */
  knee: 14,
  kneeAlpha: 0.55,
  /** The cue stands this far inside the edge the thread leaves by. */
  chevronInset: 12,
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

export type TrailMaterialBounds = Readonly<{
  layoutEpoch: number;
  passages: readonly Readonly<{ nodeId: string; bounds: TrailRect; firstRow: TrailRect; bottomExtent: number }>[];
}>;

export type TrailTargetBead = Readonly<{ nodeId: string; x: number; y: number }>;

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
  /** One slightly larger point per visible target. */
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
  for (const box of layout.boxes) {
    const isChild = descendantsOf !== null && box.parentId === descendantsOf;
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
      nodes.push({ id, parentId, kind: "up", target: targets.has(id), box });
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
      for (const box of layout.boxes) {
        if (box.parentId !== null && childIds.has(box.parentId)) {
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
      });
    }
    if (drawGrandchildren) {
      for (const child of drawnChildren) {
        for (const grand of grandchildren) {
          if (grand.parentId === child.nodeId) {
            nodes.push({
              id: grand.nodeId, parentId: child.nodeId, kind: "down", target: false, box: grand,
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
  /** Current render-edge material envelopes, never column-container fallbacks. */
  materialBounds: TrailMaterialBounds | null;
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
  if (!Object.values(window).every(Number.isFinite) || !(window.width > 0) || !(window.height > 0)) return null;
  if (input.grid !== undefined && (
    !Object.values(input.grid).every(Number.isFinite) || !(input.grid.dpr > 0)
  )) return null;
  if (input.lineages === null) return null;
  const lineages = input.lineages.slice(0, OPERATION_TRAIL_LIMITS.targets);
  const resolved = operationTrailNodes(layout, lineages, input.descendantsOf ?? null);
  if (resolved === null) return null;
  const material = resolveMaterialBounds(input.materialBounds, layout, resolved.nodes);
  if (material === null) return null;
  const edges = resolveTrailEdges(layout, resolved.nodes, material, zoom, input.grid);
  if (edges === null) return null;

  const unit = 1 / zoom;
  const box = snapBox(window, zoom, input.grid);
  const anchors = placeAnchors(resolved.nodes, material, edges, zoom, input.grid);
  const targetNodes = resolved.nodes.filter((entry) => entry.target);

  const pieces = {
    up: { line: "", dots: "", arrows: "" },
    down: { line: "", dots: "", arrows: "" },
  };
  const dotted = new Set<string>();
  const targetPoints = new Set(targetNodes.map((entry) => pointKey(anchors.get(entry.id)!)));
  for (const entry of resolved.nodes) {
    const group = pieces[entry.kind];
    if (entry.parentId === null) continue;
    const points = edges.get(entry.id)!;
    group.line += edgePath(points, PX.corner * unit);
    group.arrows += edgeArrow(points, zoom);
    for (const point of [points[0]!, points[3]!]) {
      const key = pointKey(point);
      if (dotted.has(key) || targetPoints.has(key) || !contains(window, point)) continue;
      dotted.add(key);
      group.dots += `M${fmt(point.x)} ${fmt(point.y)}h0`;
    }
  }

  let more = "";
  if (resolved.more !== null) {
    const last = anchors.get(resolved.more)!;
    const bounds = material.get(resolved.more)!.bounds;
    for (let step = 0; step < 3; step += 1) {
      more += `M${fmt(last.x)} ${fmt(bounds.y + bounds.height + (8 + step * 5) * unit)}h0`;
    }
  }

  const targets = targetNodes
    .map((entry) => anchors.get(entry.id)!)
    .filter((anchor) => contains(window, anchor))
    .map((anchor) => Object.freeze({ nodeId: anchor.nodeId, x: anchor.x, y: anchor.y }));

  let chevron: OperationTrail["chevron"] = null;
  for (const lineage of lineages) {
    for (let index = lineage.length - 1; index > 0; index -= 1) {
      chevron = continuationCue(edges.get(lineage[index]!)!, window, unit);
      if (chevron !== null) break;
    }
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

/** Marks attach to passage boundaries, never a second above-passage geometry. */
function placeAnchors(
  nodes: readonly TrailNode[],
  material: ReadonlyMap<string, TrailMaterialBounds["passages"][number]>,
  edges: ReadonlyMap<string, readonly Point[]>,
  zoom: number,
  grid: TrailPixelGrid | undefined,
): Map<string, Anchor> {
  const anchors = new Map<string, Anchor>();
  for (const entry of nodes) {
    const bounds = material.get(entry.id)!.firstRow;
    anchors.set(entry.id, {
      nodeId: entry.id,
      ...(entry.parentId === null
        ? snapPoint({ x: bounds.x - PX.clearance / zoom, y: bounds.y + bounds.height / 2 }, zoom, grid)
        : edges.get(entry.id)![3]!),
    });
  }
  return anchors;
}

function resolveMaterialBounds(
  receipt: TrailMaterialBounds | null,
  layout: ColumnarLayout,
  nodes: readonly TrailNode[],
): Map<string, TrailMaterialBounds["passages"][number]> | null {
  if (receipt === null || receipt.layoutEpoch !== layout.layoutEpoch || receipt.passages.length !== nodes.length ||
    !Object.values(layout.bounds).every(Number.isFinite) || layout.bounds.width <= 0 || layout.bounds.height <= 0) return null;
  const wanted = new Map(nodes.map((node) => [node.id, node.box]));
  const found = new Map<string, TrailMaterialBounds["passages"][number]>();
  for (const passage of receipt.passages) {
    const { nodeId, bounds, firstRow, bottomExtent } = passage;
    const box = wanted.get(nodeId);
    if (box === undefined) return null;
    if (found.has(nodeId) || ![bounds, firstRow].every((rect) =>
      [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) &&
      rect.width > 0 && rect.height > 0) || !Number.isFinite(bottomExtent) || bottomExtent < 0) return null;
    // CSSOM measurement and publication may differ by one canvas unit, never by a column's blank air.
    if (bounds.x < box.x - 1 || bounds.y < box.y - 1 ||
      bounds.x + bounds.width > box.x + box.width + 1 ||
      bounds.y + bounds.height > box.y + box.height + bottomExtent + 1 ||
      bounds.y + bounds.height > layout.bounds.y + layout.bounds.height + 1 ||
      !Number.isFinite(box.y + box.height + bottomExtent) ||
      box.y + box.height + bottomExtent > layout.bounds.y + layout.bounds.height + 1 ||
      firstRow.x < bounds.x - EPSILON || firstRow.y < bounds.y - EPSILON ||
      firstRow.x + firstRow.width > bounds.x + bounds.width + EPSILON ||
      firstRow.y + firstRow.height > bounds.y + bounds.height + EPSILON) return null;
    found.set(nodeId, passage);
  }
  return nodes.some((node) => !found.has(node.id)) ? null : found;
}

/** A missing or inconsistent published bridge cannot be replaced by a guessed route. */
function resolveTrailEdges(
  layout: ColumnarLayout,
  nodes: readonly TrailNode[],
  material: ReadonlyMap<string, TrailMaterialBounds["passages"][number]>,
  zoom: number,
  grid: TrailPixelGrid | undefined,
): Map<string, readonly Point[]> | null {
  if (nodes.some(({ box }) => (
    ![box.x, box.y, box.width, box.height].every(Number.isFinite) || !(box.width > 0) || !(box.height > 0)
  ))) return null;
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const boxIds = new Set<string>();
  for (const box of layout.boxes) {
    if (!byId.has(box.nodeId)) continue;
    if (boxIds.has(box.nodeId)) return null;
    boxIds.add(box.nodeId);
  }
  const bridges = new Map<string, LayoutEdge>();
  const firstChildren = new Map<string, string>();
  for (const box of layout.boxes) {
    if (box.parentId !== null && byId.has(box.parentId) && !firstChildren.has(box.parentId)) {
      firstChildren.set(box.parentId, box.nodeId);
    }
  }
  const outgoingY = new Map<string, number>();
  const incomingY = new Map<string, number>();
  for (const edge of layout.edges) {
    const child = byId.get(edge.childId);
    if (child === undefined || child.parentId === null) continue;
    const parent = byId.get(child.parentId);
    if (parent === undefined || bridges.has(edge.childId) || !validBridge(edge, parent.box, child.box)) return null;
    bridges.set(edge.childId, edge);
    if (firstChildren.get(parent.id) !== child.id || parent.box.y !== child.box.y) continue;
    const parentBounds = material.get(parent.id)!.firstRow;
    const childBounds = material.get(child.id)!.firstRow;
    const top = Math.max(parentBounds.y, childBounds.y);
    const bottom = Math.min(parentBounds.y + parentBounds.height, childBounds.y + childBounds.height);
    if (bottom - top <= 2 * EPSILON) continue;
    // Different type sizes may share a real reading row without sharing its centre.
    const wanted = Math.max(top + EPSILON, Math.min(bottom - EPSILON, childBounds.y + childBounds.height / 2));
    const common = snapPoint({ x: 0, y: wanted }, zoom, grid).y;
    if (common <= top || common >= bottom) continue;
    outgoingY.set(parent.id, common);
    incomingY.set(child.id, common);
  }
  const found = new Map<string, readonly Point[]>();
  for (const [childId, edge] of bridges) {
    const child = byId.get(childId)!;
    const parent = byId.get(child.parentId!)!;
    const parentBounds = material.get(parent.id)!.firstRow;
    const childBounds = material.get(child.id)!.firstRow;
    if (parentBounds.x + parentBounds.width + PX.clearance / zoom > edge.points[1].x ||
      childBounds.x - PX.clearance / zoom < edge.points[1].x) return null;
    const from = snapPoint({
      x: parentBounds.x + parentBounds.width + PX.clearance / zoom,
      y: parentBounds.y + parentBounds.height / 2,
    }, zoom, grid);
    const to = snapPoint({ x: childBounds.x - PX.clearance / zoom, y: childBounds.y + childBounds.height / 2 }, zoom, grid);
    const source = { ...from, y: outgoingY.get(parent.id) ?? from.y };
    const target = { ...to, y: incomingY.get(child.id) ?? to.y };
    const elbowX = snapPoint(edge.points[1], zoom, grid).x;
    found.set(child.id, [source, { x: elbowX, y: source.y }, { x: elbowX, y: target.y }, target]);
  }
  return nodes.some((entry) => entry.parentId !== null && !found.has(entry.id)) ? null : found;
}

function validBridge(edge: LayoutEdge, parent: LayoutBox, child: LayoutBox): boolean {
  if (edge.parentId !== parent.nodeId || edge.childId !== child.nodeId || edge.points.length !== 4) return false;
  const [start, first, second, end] = edge.points;
  return edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) &&
    start.x === parent.x + parent.width && start.y === parent.y + parent.height / 2 &&
    end.x === child.x && end.y === child.y + child.height / 2 &&
    first.y === start.y && second.y === end.y && first.x === second.x &&
    first.x >= start.x && first.x <= end.x;
}

function snapPoint(point: Point, zoom: number, grid: TrailPixelGrid | undefined): Point {
  const snap = (value: number, origin: number | undefined) => {
    if (grid === undefined || origin === undefined) return round(value);
    return round((snapStrokeCentre(origin + zoom * value, grid.dpr, PX.stroke) - origin) / zoom);
  };
  return { x: snap(point.x, grid?.x0), y: snap(point.y, grid?.y0) };
}

/** Round only the gap's two turns; the published passage attachments stay exact. */
function edgePath(points: readonly Point[], corner: number): string {
  const [start, first, second, end] = points as LayoutEdge["points"];
  const drop = end.y - start.y;
  const radius = edgeCorner(points, corner);
  const move = `M${fmt(start.x)} ${fmt(start.y)}`;
  if (Math.abs(drop) <= EPSILON) return `${move}L${fmt(end.x)} ${fmt(end.y)}`;
  if (radius <= EPSILON) {
    return `${move}L${fmt(first.x)} ${fmt(first.y)}L${fmt(second.x)} ${fmt(second.y)}L${fmt(end.x)} ${fmt(end.y)}`;
  }
  const sign = drop > 0 ? 1 : -1;
  return `${move}L${fmt(first.x - radius)} ${fmt(start.y)}` +
    `A${fmt(radius)} ${fmt(radius)} 0 0 ${sign > 0 ? 1 : 0} ${fmt(first.x)} ${fmt(start.y + sign * radius)}` +
    `L${fmt(second.x)} ${fmt(end.y - sign * radius)}` +
    `A${fmt(radius)} ${fmt(radius)} 0 0 ${sign > 0 ? 0 : 1} ${fmt(second.x + radius)} ${fmt(end.y)}` +
    `L${fmt(end.x)} ${fmt(end.y)}`;
}

function edgeCorner(points: readonly Point[], corner: number): number {
  const [start, first, second, end] = points as LayoutEdge["points"];
  return Math.min(corner, Math.abs(end.y - start.y) / 2, first.x - start.x, end.x - second.x);
}

/**
 * Optional open-arrow comparison geometry, never a filled triangle or control.
 */
function edgeArrow(points: readonly Point[], zoom: number): string {
  const unit = 1 / zoom;
  const to = points[3]!;
  const from = Math.abs(to.y - points[0]!.y) <= EPSILON ? points[0]! : points[2]!;
  const length = Math.min(PX.arrowLength * unit, to.x - from.x - edgeCorner(points, PX.corner * unit));
  if (length <= EPSILON) return "";
  const half = PX.arrowWidth / 2 * length / PX.arrowLength;
  const stop = to.x;
  return `M${fmt(stop - length)} ${fmt(to.y - half)}L${fmt(stop)} ${fmt(to.y)}L${fmt(stop - length)} ${fmt(to.y + half)}`;
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
  const route: Point[] = [];
  for (const point of vertices) {
    if (route.length > 0 && pointKey(route.at(-1)!) === pointKey(point)) continue;
    const before = route.at(-2);
    const last = route.at(-1);
    if (before !== undefined && last !== undefined &&
      ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) route.pop();
    route.push(point);
  }
  for (let index = route.length - 1; index > 0; index -= 1) {
    const near = route[index]!;
    const far = route[index - 1]!;
    const nearInside = contains(window, near);
    const farInside = contains(window, far);
    if (nearInside && farInside) continue;
    if (nearInside || farInside) {
      const inside = nearInside ? near : far;
      const outside = nearInside ? far : near;
      const cue = cueAt(inside, exitPoint(inside, outside, window), unit);
      if (cue !== null) return cue;
      continue;
    }
    // A long genuine segment may cross the viewport with both endpoints outside.
    const horizontal = near.y === far.y;
    const cross = horizontal ? near.y : near.x;
    const crossMin = horizontal ? window.y : window.x;
    const crossMax = crossMin + (horizontal ? window.height : window.width);
    if (cross < crossMin || cross > crossMax) continue;
    const start = horizontal ? window.x : window.y;
    const end = start + (horizontal ? window.width : window.height);
    const nearAlong = horizontal ? near.x : near.y;
    const farAlong = horizontal ? far.x : far.y;
    if (Math.min(nearAlong, farAlong) >= end || Math.max(nearAlong, farAlong) <= start) continue;
    const edgeAlong = nearAlong < start ? start : end;
    const middle = (start + end) / 2;
    return cueAt(
      horizontal ? { x: middle, y: cross } : { x: cross, y: middle },
      horizontal ? { x: edgeAlong, y: cross } : { x: cross, y: edgeAlong },
      unit,
    );
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

function contains(window: TrailRect, point: Point): boolean {
  return point.x >= window.x && point.x <= window.x + window.width &&
    point.y >= window.y && point.y <= window.y + window.height;
}

function pointKey(point: Point): string { return `${point.x}:${point.y}`; }

const EPSILON = 0.01;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  return String(round(value));
}
