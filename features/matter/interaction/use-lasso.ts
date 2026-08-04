"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  analyzeLassoPath,
  LASSO_THRESHOLDS,
  type ClientPoint,
} from "../material/lasso-geometry";
import { lassoRenderPaths } from "../material/lasso-path";
import { lassoPointerSamples } from "./lasso-pointer-samples";
import {
  segmentText,
  validateSelection,
  type SegmentSelection,
} from "../material/text-segments";
import {
  resolveLassoTargets,
  type LassoTarget,
} from "../material/lasso-targets";
import {
  createLassoInteractionState,
  reduceLassoInteraction,
  type LassoInteractionEvent,
} from "../runtime/lasso-interaction";
import type { ThoughtTree } from "../tree/model";
import { measureTextRange, type ClientTextRect } from "./range-measurement";

export type LassoController = Readonly<{
  active: boolean;
  drawing: boolean;
  inkPathRef: React.RefObject<SVGPathElement | null>;
  closurePathRef: React.RefObject<SVGPathElement | null>;
  selection: SegmentSelection | null;
  sourceText: string | null;
  selectionRects: readonly ClientTextRect[];
  selectionColumn: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
  activate: () => void;
  deactivate: () => void;
  pointerDown: (event: React.PointerEvent<HTMLElement>) => boolean;
  pointerMove: (event: React.PointerEvent<HTMLElement>) => boolean;
  pointerUp: (event: React.PointerEvent<HTMLElement>) => boolean;
  pointerCancel: (pointerId: number) => boolean;
}>; 

type MeasurementEpoch = Readonly<{
  treeRevision: number;
  layoutEpoch: number;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
}>;

/**
 * Binds one transient lasso operation to client-space DOM geometry. Pointer
 * moves publish ink and resolve against one pointer-down geometry snapshot.
 * Range measurement never enters the per-frame path.
 */
export function useLasso(input: {
  tree: ThoughtTree;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  epoch: MeasurementEpoch;
  navigationKey: string;
  onGeometryInvalidated?: () => void;
}): LassoController {
  const { onGeometryInvalidated } = input;
  const [state, dispatchBase] = useReducer(
    reduceLassoInteraction,
    null,
    () => createLassoInteractionState(),
  );
  const stateRef = useRef(state);
  const sampledPointsRef = useRef<ClientPoint[]>([]);
  const inkPathRef = useRef<SVGPathElement>(null);
  const closurePathRef = useRef<SVGPathElement>(null);
  const inkFrameRef = useRef<number | null>(null);
  const pendingInkRef = useRef<readonly ClientPoint[]>([]);
  const targetSnapshotRef = useRef<readonly LassoTarget[] | null>(null);
  const targetSnapshotKeyRef = useRef<string | null>(null);
  const [selectionRects, setSelectionRects] = useState<readonly ClientTextRect[]>([]);
  const [selectionColumn, setSelectionColumn] = useState<Readonly<{
    left: number; top: number; right: number; bottom: number;
  }> | null>(null);
  const strokeEpochRef = useRef<MeasurementEpoch | null>(null);
  const latestEpochRef = useRef(input.epoch);
  useEffect(() => {
    latestEpochRef.current = input.epoch;
  }, [input.epoch]);

  const dispatch = useCallback((event: LassoInteractionEvent) => {
    stateRef.current = reduceLassoInteraction(stateRef.current, event);
    dispatchBase(event);
  }, []);

  const writeInk = useCallback((points: readonly ClientPoint[]) => {
    pendingInkRef.current = points;
    if (points.length === 0) {
      if (inkFrameRef.current !== null) cancelAnimationFrame(inkFrameRef.current);
      inkFrameRef.current = null;
      inkPathRef.current?.setAttribute("d", "");
      closurePathRef.current?.setAttribute("d", "");
      return;
    }
    if (inkFrameRef.current !== null) return;
    inkFrameRef.current = requestAnimationFrame(() => {
      inkFrameRef.current = null;
      const pendingPoints = pendingInkRef.current;
      const paths = lassoRenderPaths(pendingPoints);
      const analysis = analyzeLassoPath(pendingPoints);
      const showClosure = analysis.kind === "prepared" &&
        targetSnapshotRef.current !== null &&
        resolveLassoTargets(analysis.lasso, targetSnapshotRef.current).kind === "selection";
      inkPathRef.current?.setAttribute("d", paths.ink);
      closurePathRef.current?.setAttribute(
        "d",
        showClosure ? paths.closure : "",
      );
    });
  }, []);

  useEffect(() => () => {
    if (inkFrameRef.current !== null) cancelAnimationFrame(inkFrameRef.current);
  }, []);

  const remeasureSelection = useCallback((selection: SegmentSelection | null) => {
    if (selection === null) {
      setSelectionRects([]);
      setSelectionColumn(null);
      return;
    }
    const node = input.tree.nodes[selection.nodeId];
    const root = findTextRoot(input.canvasRef.current, selection.nodeId);
    if (node === undefined || root === null || !validateSelection(node.text, selection, node.id).ok) {
      setSelectionRects([]);
      setSelectionColumn(null);
      dispatch({ type: "material-invalidated" });
      return;
    }
    const measured = measureTextRange(root, node.text, selection);
    setSelectionRects(measured.ok ? measured.rects : []);
    const column = root.getBoundingClientRect();
    setSelectionColumn(measured.ok ? {
      left: column.left,
      top: column.top,
      right: column.right,
      bottom: column.bottom,
    } : null);
  }, [dispatch, input.canvasRef, input.tree]);

  const previousMaterialRef = useRef({ treeId: input.tree.id, revision: input.tree.revision });
  useEffect(() => {
    const previous = previousMaterialRef.current;
    previousMaterialRef.current = { treeId: input.tree.id, revision: input.tree.revision };
    if (previous.treeId === input.tree.id && previous.revision === input.tree.revision) return;
    dispatch({ type: "material-invalidated" });
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    setSelectionRects([]);
    setSelectionColumn(null);
  }, [dispatch, input.tree.id, input.tree.revision, writeInk]);

  const previousNavigationRef = useRef(input.navigationKey);
  useEffect(() => {
    if (previousNavigationRef.current === input.navigationKey) return;
    previousNavigationRef.current = input.navigationKey;
    dispatch({ type: "navigation-invalidated" });
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    setSelectionRects([]);
    setSelectionColumn(null);
  }, [dispatch, input.navigationKey, writeInk]);

  useEffect(() => {
    if (state.mode === "drawing") return;
    const frame = requestAnimationFrame(() => remeasureSelection(state.selection));
    return () => cancelAnimationFrame(frame);
  }, [
    input.epoch.layoutEpoch,
    input.epoch.treeRevision,
    input.epoch.viewportX,
    input.epoch.viewportY,
    input.epoch.viewportZoom,
    remeasureSelection,
    state.mode,
    state.selection,
  ]);

  useEffect(() => {
    const invalidate = () => {
      // Return pointer authority before geometry disappears and capture can be lost.
      onGeometryInvalidated?.();
      dispatch({ type: "layout-invalidated" });
      sampledPointsRef.current = [];
      strokeEpochRef.current = null;
      targetSnapshotRef.current = null;
      targetSnapshotKeyRef.current = null;
      writeInk([]);
      setSelectionRects([]);
      setSelectionColumn(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => remeasureSelection(stateRef.current.selection));
      });
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("blur", invalidate);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") invalidate();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.visualViewport?.addEventListener("resize", invalidate);
    window.visualViewport?.addEventListener("scroll", invalidate);
    document.fonts?.addEventListener?.("loadingdone", invalidate);
    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("blur", invalidate);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.visualViewport?.removeEventListener("resize", invalidate);
      window.visualViewport?.removeEventListener("scroll", invalidate);
      document.fonts?.removeEventListener?.("loadingdone", invalidate);
    };
  }, [dispatch, onGeometryInvalidated, remeasureSelection, writeInk]);

  const activate = useCallback(() => dispatch({ type: "activate" }), [dispatch]);
  const deactivate = useCallback(() => {
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    dispatch({ type: "deactivate" });
  }, [dispatch, writeInk]);

  const pointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (stateRef.current.mode !== "ready") return false;
    const startEvent: LassoInteractionEvent = {
      type: "pointer-down",
      pointerId: event.pointerId,
      pointerType: normalizeLassoPointerType(event.pointerType),
      isPrimary: event.isPrimary,
      button: event.button,
    };
    const started = reduceLassoInteraction(stateRef.current, startEvent);
    stateRef.current = started;
    dispatchBase(startEvent);
    if (started.mode !== "drawing" || started.pointerId !== event.pointerId) return false;
    strokeEpochRef.current = latestEpochRef.current;
    const snapshotKey = measurementEpochKey(latestEpochRef.current, input.navigationKey);
    if (targetSnapshotKeyRef.current !== snapshotKey || targetSnapshotRef.current === null) {
      targetSnapshotRef.current = measureLassoTargets(input.canvasRef.current, input.tree);
      targetSnapshotKeyRef.current = snapshotKey;
    }
    sampledPointsRef.current = [{ x: event.clientX, y: event.clientY }];
    setSelectionRects([]);
    setSelectionColumn(null);
    writeInk(sampledPointsRef.current);
    return true;
  }, [input.canvasRef, input.navigationKey, input.tree, writeInk]);

  const pointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const current = stateRef.current;
    if (current.mode !== "drawing" || current.pointerId !== event.pointerId) return false;
    for (const pointer of lassoPointerSamples(event.nativeEvent)) {
      appendSampledPoint(sampledPointsRef.current, { x: pointer.clientX, y: pointer.clientY });
    }
    if (sampledPointsRef.current.length > 0) {
      writeInk(sampledPointsRef.current);
    }
    return true;
  }, [writeInk]);

  const pointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const current = stateRef.current;
    if (current.mode !== "drawing" || current.pointerId !== event.pointerId) return false;
    for (const pointer of lassoPointerSamples(event.nativeEvent)) {
      appendSampledPoint(
        sampledPointsRef.current,
        { x: pointer.clientX, y: pointer.clientY },
        true,
      );
    }
    appendSampledPoint(
      sampledPointsRef.current,
      { x: event.clientX, y: event.clientY },
      true,
    );
    const analysis = analyzeLassoPath(sampledPointsRef.current);
    const resolution = !sameMeasurementEpoch(strokeEpochRef.current, latestEpochRef.current)
      ? { kind: "ambiguous" as const }
      : analysis.kind === "prepared"
      ? resolveLassoTargets(
          analysis.lasso,
          targetSnapshotRef.current ?? measureLassoTargets(input.canvasRef.current, input.tree),
        )
      : { kind: analysis.kind };
    dispatch({ type: "pointer-up", pointerId: event.pointerId, resolution });
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    remeasureSelection(stateRef.current.selection);
    return true;
  }, [dispatch, input.canvasRef, input.tree, remeasureSelection, writeInk]);

  const pointerCancel = useCallback((pointerId: number) => {
    const current = stateRef.current;
    if (current.mode !== "drawing" || current.pointerId !== pointerId) return false;
    dispatch({ type: "pointer-cancel", pointerId });
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    remeasureSelection(stateRef.current.selection);
    return true;
  }, [dispatch, remeasureSelection, writeInk]);

  return {
    active: state.mode !== "inactive",
    drawing: state.mode === "drawing",
    inkPathRef,
    closurePathRef,
    selection: state.selection,
    sourceText: state.selection === null
      ? null
      : input.tree.nodes[state.selection.nodeId]?.text ?? null,
    selectionRects,
    selectionColumn,
    activate,
    deactivate,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
  };
}

function appendSampledPoint(
  points: ClientPoint[],
  point: ClientPoint,
  force = false,
): void {
  const previous = points.at(-1);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  if (
    previous &&
    !force &&
    Math.hypot(point.x - previous.x, point.y - previous.y) <
      LASSO_THRESHOLDS.sampleDistance
  ) return;
  if (previous?.x === point.x && previous.y === point.y) return;
  if (points.length < LASSO_THRESHOLDS.maximumPointCount) {
    points.push(point);
    return;
  }
  // Preserve the already-painted line. The last slot follows the pointer once
  // the semantic buffer is full, so old geometry never jumps under the hand.
  points[points.length - 1] = point;
}

function measureLassoTargets(
  canvas: HTMLDivElement | null,
  tree: ThoughtTree,
): readonly LassoTarget[] {
  if (canvas === null) return Object.freeze([]);
  const viewport = clientViewportBounds();
  const targets: LassoTarget[] = [];
  for (const root of canvas.querySelectorAll<HTMLElement>("[data-thought-text-id]")) {
    const nodeId = root.dataset.thoughtTextId ?? "";
    const node = tree.nodes[nodeId];
    if (node === undefined) continue;
    const rect = root.getBoundingClientRect();
    // A client-space stroke cannot reach off-screen material. Keeping those
    // nodes out of the snapshot bounds Range work on large spatial documents.
    if (!clientRectsOverlap(rect, viewport)) continue;
    const measuredSegments: Array<{
      index: number;
      rects: readonly ClientTextRect[];
    }> = [];
    let measurementFailed = false;
    for (const segment of segmentText(node.text)) {
      const measured = measureTextRange(root, node.text, {
        start: segment.start,
        end: segment.end,
        selectedText: node.text.slice(segment.start, segment.end),
      });
      if (!measured.ok) {
        measurementFailed = true;
        continue;
      }
      measuredSegments.push({ index: segment.index, rects: measured.rects });
    }
    targets.push(Object.freeze({
      nodeId,
      text: node.text,
      bounds: Object.freeze({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }),
      measurement: measurementFailed
        ? "failed"
        : Object.freeze(measuredSegments.map((segment) => Object.freeze(segment))),
    }));
  }
  return Object.freeze(targets);
}

function clientViewportBounds(): Readonly<{
  left: number; top: number; right: number; bottom: number;
}> {
  const viewport = window.visualViewport;
  if (viewport !== null) {
    return Object.freeze({
      left: viewport.offsetLeft,
      top: viewport.offsetTop,
      right: viewport.offsetLeft + viewport.width,
      bottom: viewport.offsetTop + viewport.height,
    });
  }
  return Object.freeze({
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
  });
}

function clientRectsOverlap(
  left: Readonly<{ left: number; top: number; right: number; bottom: number }>,
  right: Readonly<{ left: number; top: number; right: number; bottom: number }>,
): boolean {
  return left.right >= right.left && left.left <= right.right &&
    left.bottom >= right.top && left.top <= right.bottom;
}

function findTextRoot(canvas: HTMLDivElement | null, nodeId: string): HTMLElement | null {
  if (canvas === null) return null;
  return Array.from(canvas.querySelectorAll<HTMLElement>("[data-thought-text-id]"))
    .find((element) => element.dataset.thoughtTextId === nodeId) ?? null;
}

function normalizeLassoPointerType(pointerType: string): "mouse" | "pen" | "touch" {
  return pointerType === "pen" || pointerType === "touch" ? pointerType : "mouse";
}

function sameMeasurementEpoch(
  left: MeasurementEpoch | null,
  right: MeasurementEpoch,
): boolean {
  return left !== null &&
    left.treeRevision === right.treeRevision &&
    left.layoutEpoch === right.layoutEpoch &&
    left.viewportX === right.viewportX &&
    left.viewportY === right.viewportY &&
    left.viewportZoom === right.viewportZoom;
}

function measurementEpochKey(epoch: MeasurementEpoch, navigationKey: string): string {
  return `${epoch.treeRevision}:${epoch.layoutEpoch}:${epoch.viewportX}:${epoch.viewportY}:${epoch.viewportZoom}:${navigationKey}`;
}
