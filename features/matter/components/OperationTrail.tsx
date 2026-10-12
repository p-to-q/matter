import {
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { ColumnarLayout } from "../layout/model";
import {
  operationTrailGeometry,
  trailWindow,
  type OperationTrail,
  type TrailPaths,
} from "../layout/operation-trail";
import type { ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import type { TrailPresentation, TrailStrength } from "./operation-target";
import { trailClose, trailPresencePolicy } from "./operation-trail-presence";
import { prefersReducedMotion, usePresence } from "./use-presence";
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
    for (const targetId of presentation.targetIds) {
      const lineage = selectLineage(tree, targetId);
      if (lineage !== null) found.push(lineage.map((node) => node.id));
    }
    return found.length === 0 ? null : found;
    // The target ids are the key: the array identity changes with every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, tree]);
  const frame = useTrailFrame(props.canvasRef, lineages === null ? null : targetKey, props.currentLayoutEpoch);

  const trail = useMemo(() => {
    if (frame === null || lineages === null) return null;
    return operationTrailGeometry({
      layout,
      currentLayoutEpoch: props.currentLayoutEpoch,
      lineages,
      descendantsOf: presentation.descendants ? presentation.targetIds[0] ?? null : null,
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
  }, [frame, layout, lineages, presentation.descendants, presentation.targetIds, props.currentLayoutEpoch, viewport]);

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
    layoutCurrent: layout !== null && layout.layoutEpoch === props.currentLayoutEpoch,
    passageExists: last.targetIds.length === 0 || last.targetIds.some((id) => Object.hasOwn(tree.nodes, id)),
    lastStrength: last.strength,
    pointTalkPhase: props.pointTalkPhase,
  });
  const frameState = usePresence(live, close, reducedMotionPolicy);
  if (frameState === null) return null;
  return (
    <TrailDrawing
      close={frameState.close}
      stage={frameState.stage}
      view={frameState.view}
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
  view: DrawnTrail;
  remainder: Readonly<{ x: number; y: number }>;
  stage: "present" | "holding" | "exiting";
  close: string | null;
}>) {
  const { trail, strength, working } = view;
  const unit = 1 / trail.zoom;
  const { box, up, down } = trail;
  const place = (x: number, y: number) =>
    `translate(${x}px, ${y}px) scale(${unit}) translate(-50%, -50%)`;
  const drawn = up.line !== "" || up.dots !== "" || down.line !== "" || down.dots !== "";
  return (
    <div
      aria-hidden="true"
      className="operation-trail"
      data-pinned={trail.targets.some(({ pinned }) => pinned) || undefined}
      data-presence={stage}
      data-presence-close={close ?? undefined}
      data-strength={strength}
      data-working={working || undefined}
      style={{
        "--operation-trail-unit": `${unit}px`,
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
        </svg>
      ) : null}
      {trail.targets.map((target) => (
        <span
          className="operation-trail__bead operation-trail__bead--target"
          key={target.nodeId}
          style={{ transform: place(target.x, target.y) }}
        />
      ))}
      {trail.chevron === null ? null : (
        <span
          className="operation-trail__chevron"
          style={{
            transform: `translate(${trail.chevron.x}px, ${trail.chevron.y}px) scale(${unit}) ` +
              `rotate(${trail.chevron.angle}deg) rotate(45deg) translate(-50%, -50%)`,
          }}
        />
      )}
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
