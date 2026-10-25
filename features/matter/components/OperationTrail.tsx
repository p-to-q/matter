import {
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import type { ColumnarLayout } from "../layout/model";
import {
  operationTrailGeometry,
  operationTrailNodes,
  OPERATION_TRAIL_LIMITS,
  OPERATION_TRAIL_PX,
  trailWindow,
  type OperationTrail,
  type TrailPaths,
  type TrailMaterialBounds,
} from "../layout/operation-trail";
import type { ThoughtTree } from "../tree/model";
import { MAX_TREE_DEPTH } from "../tree/invariants";
import { selectLineage } from "../tree/selectors";
import type { TrailPresentation, TrailStrength } from "./operation-target";
import { trailClose, trailPresencePolicy } from "./operation-trail-presence";
import { prefersReducedMotion, usePresence } from "./use-presence";
import { measureTrailMaterialBounds, trailWorldScale } from "./trail-material-bounds";
import "./OperationTrail.css";

type Viewport = Readonly<{ x: number; y: number; zoom: number }>;

type Frame = Readonly<{
  /** The canvas's offset inside the world, in the world's own pixels. */
  origin: Readonly<{ x: number; y: number }>;
  size: Readonly<{ width: number; height: number }>;
  /** Where the untransformed world sits on the page. */
  page: Readonly<{ x: number; y: number }>;
  dpr: number;
}>;

type DrawnTrail = Readonly<{
  trail: OperationTrail;
  strength: Exclude<TrailStrength, "off">;
  working: boolean;
}>;

// One surface, one identity: moving the selection from one passage to another
// updates the drawing in place, so nothing re-enters and shared ancestors never blink.
const TRAIL_IDENTITY = "operation-trail";

/**
 * The trail joining the root to the selected passage (and the children below
 * it), to the passage an AI operation is addressed at, or to the passages an
 * open Ask Matter is addressed to. The caller derives the presentation;
 * everything drawn is derived from it and the published layout on every
 * render. The only thing kept is the frozen last drawing a leaving trail fades
 * from.
 */
export function OperationTrailLayer(props: Readonly<{
  presentation: TrailPresentation;
  pointTalkPhase: string;
  tree: ThoughtTree;
  layout: ColumnarLayout | null;
  currentLayoutEpoch: number | null;
  viewport: Viewport;
  canvasRef: RefObject<HTMLElement | null>;
}>) {
  const { presentation, tree, layout, viewport } = props;
  const targetKey = presentation.targetIds.join("\u0000");
  const lineages = useMemo(() => {
    const found: string[][] = [];
    for (const targetId of presentation.targetIds.slice(0, OPERATION_TRAIL_LIMITS.targets)) {
      const lineage = selectLineage(tree, targetId);
      if (lineage === null || lineage.length > MAX_TREE_DEPTH) return null;
      found.push(lineage.map((node) => node.id));
    }
    return found.length === 0 ? null : found;
    // The target ids are the key: the array identity changes with every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, tree]);
  const frame = useTrailFrame(props.canvasRef, lineages === null ? null : targetKey, props.currentLayoutEpoch);
  const descendantsOf = presentation.descendants ? presentation.targetIds[0] ?? null : null;
  const resolved = useMemo(
    () => layout === null || layout.layoutEpoch !== props.currentLayoutEpoch || lineages === null
      ? null
      : operationTrailNodes(layout, lineages, descendantsOf),
    [descendantsOf, layout, lineages, props.currentLayoutEpoch],
  );
  const materialBounds = useTrailMaterialBounds(props.canvasRef, tree, layout, resolved?.nodes ?? null);

  const trail = useMemo(() => {
    if (frame === null || lineages === null) return null;
    return operationTrailGeometry({
      layout,
      materialBounds,
      currentLayoutEpoch: props.currentLayoutEpoch,
      lineages,
      descendantsOf,
      zoom: viewport.zoom,
      window: trailWindow({ viewport, worldSize: frame.size, canvasOrigin: frame.origin }),
      // The camera moves the world layer by a fraction of a pixel; the trail
      // cancels that fraction (see `TrailDrawing`), so its grid is the screen's
      // with the camera's translation taken to whole device pixels.
      grid: {
        x0: frame.page.x + Math.round(viewport.x * frame.dpr) / frame.dpr + viewport.zoom * frame.origin.x,
        y0: frame.page.y + Math.round(viewport.y * frame.dpr) / frame.dpr + viewport.zoom * frame.origin.y,
        dpr: frame.dpr,
      },
    });
  }, [descendantsOf, frame, layout, lineages, materialBounds, props.currentLayoutEpoch, viewport]);

  const strength = presentation.strength;
  const working = presentation.working;
  const live = useMemo(
    () => trail === null || strength === "off"
      ? null
      : { identity: TRAIL_IDENTITY, view: { trail, strength, working } as DrawnTrail },
    [strength, trail, working],
  );

  // What the trail was last joined to decides how it leaves. It is presentation
  // only: set while drawing, read only once nothing is drawn.
  const [last, setLast] = useState<Readonly<{ targetIds: readonly string[]; strength: TrailStrength }>>(
    { targetIds: [], strength: "off" },
  );
  if (live !== null && (last.strength !== strength || last.targetIds.join("\u0000") !== targetKey)) {
    setLast({ targetIds: presentation.targetIds, strength });
  }
  const close = trailClose({
    layoutCurrent: trailBasisCurrent({ layout, currentLayoutEpoch: props.currentLayoutEpoch, strength, trail }),
    passageExists: last.targetIds.length === 0 || last.targetIds.some((id) => Object.hasOwn(tree.nodes, id)),
    lastStrength: last.strength,
    pointTalkPhase: props.pointTalkPhase,
  });
  const frameState = usePresence(live, close, reducedMotionPolicy);
  if (frameState === null && (lineages === null || strength === "off")) return null;
  return (
    <TrailDrawing
      close={frameState?.close ?? null}
      stage={frameState?.stage ?? "present"}
      view={frameState?.view ?? null}
      remainder={cameraRemainder(viewport, frame?.dpr ?? 1)}
    />
  );
}

/**
 * The fraction of a device pixel the camera moves the world layer by. The
 * compositor resamples a layer moved by a fraction, which would blur a
 * hairline; the trail is its own layer and moves back by this amount, so its
 * net position is whole device pixels.
 */
function cameraRemainder(viewport: Viewport, dpr: number): Readonly<{ x: number; y: number }> {
  return {
    x: viewport.x - Math.round(viewport.x * dpr) / dpr,
    y: viewport.y - Math.round(viewport.y * dpr) / dpr,
  };
}

function reducedMotionPolicy() {
  return trailPresencePolicy(prefersReducedMotion());
}

/** Only a genuine departure may fade; an active target with invalid geometry cuts immediately. */
export function trailBasisCurrent(input: Readonly<{
  layout: ColumnarLayout | null;
  currentLayoutEpoch: number | null;
  strength: TrailStrength;
  trail: OperationTrail | null;
}>): boolean {
  return input.layout !== null && input.layout.layoutEpoch === input.currentLayoutEpoch &&
    (input.strength === "off" || input.trail !== null);
}

/** One weight of the drawing: its hairline, its dots and its arrowheads. */
function Paths({ paths, tone }: Readonly<{ paths: TrailPaths; tone: "up" | "down" }>) {
  return (
    <>
      {paths.line === "" ? null : <path className={`operation-trail__path operation-trail__path--${tone}`} d={paths.line} />}
      {paths.dots === "" ? null : <path className={`operation-trail__dots operation-trail__dots--${tone}`} d={paths.dots} />}
      {paths.arrows === "" ? null : <path className={`operation-trail__arrows operation-trail__arrows--${tone}`} d={paths.arrows} />}
    </>
  );
}

/** Dumb on purpose: the caller owns when it exists and the geometry it draws. */
function TrailDrawing({ view, stage, close, remainder }: Readonly<{
  view: DrawnTrail | null;
  remainder: Readonly<{ x: number; y: number }>;
  stage: "present" | "holding" | "exiting";
  close: string | null;
}>) {
  // Retain the passive host across a selection's pre-paint remeasurement,
  // but never keep the previous identity's ink while its bounds are stale.
  if (view === null) return <div aria-hidden="true" className="operation-trail" data-presence="present" />;
  const { trail, strength, working } = view;
  const unit = 1 / trail.zoom;
  const chevronHalf = OPERATION_TRAIL_PX.chevron * unit / 2;
  const { box, up, down } = trail;
  const drawn = up.line !== "" || up.dots !== "" || down.line !== "" || down.dots !== "" || trail.targets.length > 0;
  return (
    <div
      aria-hidden="true"
      className="operation-trail"
      data-presence={stage}
      data-presence-close={close ?? undefined}
      data-strength={strength}
      data-working={working || undefined}
      style={{
        "--operation-trail-unit": `${unit}px`,
        "--operation-trail-stroke": `${OPERATION_TRAIL_PX.stroke}px`,
        "--operation-trail-bead": `${OPERATION_TRAIL_PX.bead}px`,
        "--operation-trail-more-dot": `${OPERATION_TRAIL_PX.moreDot}px`,
        transform: `translate(${-remainder.x * unit}px, ${-remainder.y * unit}px)`,
      } as CSSProperties}
    >
      {drawn ? (
        <svg
          className="operation-trail__line"
          focusable="false"
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        >
          <Paths paths={down} tone="down" />
          {down.more === "" ? null : <path className="operation-trail__more" d={down.more} />}
          <Paths paths={up} tone="up" />
          {trail.targets.map((target) => (
            <circle
              className="operation-trail__bead operation-trail__bead--target"
              cx={target.x}
              cy={target.y}
              key={target.nodeId}
              r={OPERATION_TRAIL_PX.target * unit / 2}
            />
          ))}
          {trail.chevron === null ? null : (
            <path
              className="operation-trail__chevron"
              d={`M${-chevronHalf} ${-chevronHalf}L0 0L${-chevronHalf} ${chevronHalf}`}
              transform={`translate(${trail.chevron.x} ${trail.chevron.y}) rotate(${trail.chevron.angle})`}
            />
          )}
        </svg>
      ) : null}
    </div>
  );
}

/**
 * The rendering-edge measurements the geometry needs and the layout does not
 * hold: the canvas's offset inside the world, the size of the plane the world
 * fills. None of them depends on the camera, so a moving camera never
 * re-measures.
 */
function useTrailFrame(
  canvasRef: RefObject<HTMLElement | null>,
  targetKey: string | null,
  layoutEpoch: number | null,
): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || targetKey === null) return;
    const world = canvas.offsetParent instanceof HTMLElement ? canvas.offsetParent : null;
    if (world === null) return;
    const measure = () => {
      // Computed style, not offsetLeft: the used position is fractional, and the
      // device pixel grid depends on the fraction.
      const style = getComputedStyle(canvas);
      const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
      const plane = (world.parentElement ?? world).getBoundingClientRect();
      const next: Frame = {
        origin: {
          x: (Number.parseFloat(style.left) || 0) + matrix.m41,
          y: (Number.parseFloat(style.top) || 0) + matrix.m42,
        },
        size: { width: world.clientWidth, height: world.clientHeight },
        page: { x: plane.left, y: plane.top },
        dpr: window.devicePixelRatio || 1,
      };
      setFrame((current) => sameFrame(current, next) ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(world);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, targetKey, layoutEpoch]);

  return targetKey === null ? null : frame;
}

function sameFrame(a: Frame | null, b: Frame): boolean {
  if (a === null) return false;
  if (a.origin.x !== b.origin.x || a.origin.y !== b.origin.y) return false;
  if (a.size.width !== b.size.width || a.size.height !== b.size.height) return false;
  if (a.page.x !== b.page.x || a.page.y !== b.page.y || a.dpr !== b.dpr) return false;
  return true;
}

type MaterialReceipt = Readonly<{
  canvas: HTMLElement;
  tree: ThoughtTree;
  layout: ColumnarLayout;
  nodes: NonNullable<ReturnType<typeof operationTrailNodes>>["nodes"];
  value: TrailMaterialBounds;
}>;

/** One bounded render-edge measurement, invalidated before a changed basis can paint. */
function useTrailMaterialBounds(
  canvasRef: RefObject<HTMLElement | null>,
  tree: ThoughtTree,
  layout: ColumnarLayout | null,
  nodes: NonNullable<ReturnType<typeof operationTrailNodes>>["nodes"] | null,
): TrailMaterialBounds | null {
  const [receipt, setReceipt] = useState<MaterialReceipt | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const current = canvasRef.current;
    setCanvasElement((previous) => previous === current ? previous : current);
  }, [canvasRef, layout, nodes, tree]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || canvas !== canvasElement || layout === null || nodes === null) return;
    const world = canvas.offsetParent;
    if (!(world instanceof HTMLElement)) return;
    const shell = canvas.closest<HTMLElement>(".matter-shell");
    const fonts = canvas.ownerDocument.fonts;
    let fontLoading = fonts?.status === "loading";
    let disposed = false;
    const invalidate = () => setReceipt(null);
    // Observer/font events run outside React's commit: cut old ink before reading a changed source.
    const invalidateAndMeasure = () => { if (disposed) return; flushSync(invalidate); measure(); };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidateAndMeasure);
    let observedSizes = new Set<HTMLElement>();
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(invalidateAndMeasure);
    const drag = typeof MutationObserver === "undefined" ? null : new MutationObserver(invalidateAndMeasure);
    if (shell !== null) drag?.observe(shell, { attributes: true, attributeFilter: ["data-node-dragging"] });
    const measure = () => {
      if (disposed) return;
      mutation?.disconnect();
      const list = canvas.querySelector<HTMLElement>(":scope > .spatial-thoughts");
      if (list !== null) mutation?.observe(list, { childList: true });
      if (!canvas.isConnected || fontLoading || list === null || shell?.dataset.nodeDragging === "true") {
        invalidate();
        return;
      }
      const nextSizes = new Set<HTMLElement>();
      try {
        // The used transform may be between index-camera animation endpoints.
        // Reading its actual scale here converts once into stable world values;
        // subsequent camera ticks only project those values arithmetically.
        const transform = getComputedStyle(world).transform;
        const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
        const scale = trailWorldScale(matrix);
        if (scale === null) {
          invalidate();
          return;
        }
        const canvasOrigin = canvas.getBoundingClientRect();
        const elements = new Map<string, HTMLElement>();
        for (const element of list.children) {
          if (!(element instanceof HTMLElement)) continue;
          const id = element.dataset.thoughtId;
          if (id !== undefined && element.dataset.layoutNodeId === id) {
            if (elements.has(id)) { invalidate(); return; }
            elements.set(id, element);
          }
        }
        const passages: Array<TrailMaterialBounds["passages"][number]> = [];
        for (const node of nodes) {
          const passage = elements.get(node.id);
          const text = passage?.querySelector<HTMLElement>(":scope > [data-thought-text-id]") ?? null;
          const picture = passage?.querySelector<HTMLElement>(":scope > .passage-picture") ?? null;
          const projection = passage?.querySelector<HTMLElement>(":scope > .language-split-projection[data-preview-mode='expand']") ?? null;
          if (passage === undefined || text === null || text.dataset.thoughtTextId !== node.id ||
            tree.nodes[node.id] === undefined) { invalidate(); return; }
          nextSizes.add(text);
          if (picture !== null) nextSizes.add(picture);
          if (projection !== null) {
            const flow = projection.querySelector<HTMLElement>(":scope > .language-split-flow");
            if (flow !== null) nextSizes.add(flow);
          }
          mutation?.observe(passage, { childList: true, subtree: true, characterData: true, attributes: true,
            attributeFilter: ["style", "class", "data-preview-mode", "data-layout-mode", "data-visual-projection", "data-material-motion"] });
          const measured = measureTrailMaterialBounds({
            text,
            canonicalText: tree.nodes[node.id]!.text,
            projection,
            picture,
            expectsPicture: tree.nodes[node.id]!.image !== undefined,
            canvasOrigin,
            scale,
          });
          if (measured === null) { invalidate(); return; }
          passages.push(Object.freeze({ nodeId: node.id, ...measured }));
        }
        const value: TrailMaterialBounds = Object.freeze({ layoutEpoch: layout.layoutEpoch, passages: Object.freeze(passages) });
        setReceipt((current) => current !== null && current.canvas === canvas && current.tree === tree &&
          current.layout === layout && current.nodes === nodes && sameMaterialBounds(current.value, value)
          ? current
          : Object.freeze({ canvas, tree, layout, nodes, value }));
      } catch {
        invalidate();
      } finally {
        // Re-observing an unchanged element would schedule another initial ResizeObserver delivery.
        for (const element of observedSizes) if (!nextSizes.has(element)) resize?.unobserve(element);
        for (const element of nextSizes) if (!observedSizes.has(element)) resize?.observe(element);
        observedSizes = nextSizes;
      }
    };
    const loading = () => { if (disposed) return; fontLoading = true; flushSync(invalidate); };
    const loaded = () => { if (disposed) return; fontLoading = fonts?.status === "loading"; invalidateAndMeasure(); };
    measure();
    fonts?.addEventListener("loading", loading);
    fonts?.addEventListener("loadingdone", loaded);
    fonts?.addEventListener("loadingerror", loaded);
    return () => {
      disposed = true;
      resize?.disconnect();
      mutation?.disconnect();
      drag?.disconnect();
      fonts?.removeEventListener("loading", loading);
      fonts?.removeEventListener("loadingdone", loaded);
      fonts?.removeEventListener("loadingerror", loaded);
    };
  }, [canvasElement, canvasRef, layout, nodes, tree]);
  return receipt !== null && receipt.canvas === canvasElement && receipt.tree === tree &&
    receipt.layout === layout && receipt.nodes === nodes ? receipt.value : null;
}

function sameMaterialBounds(left: TrailMaterialBounds, right: TrailMaterialBounds): boolean {
  return left.layoutEpoch === right.layoutEpoch && left.passages.length === right.passages.length &&
    left.passages.every((passage, index) => {
      const other = right.passages[index]!;
      return passage.nodeId === other.nodeId && passage.bottomExtent === other.bottomExtent &&
        (["bounds", "firstRow"] as const).every((key) => passage[key].x === other[key].x &&
          passage[key].y === other[key].y && passage[key].width === other[key].width &&
          passage[key].height === other[key].height);
    });
}
