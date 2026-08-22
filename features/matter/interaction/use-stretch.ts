"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import type { SegmentSelection } from "../material/text-segments";
import {
  createStretchInteractionState,
  isStretchInteractionKey,
  reduceStretchInteraction,
  stretchCommitBasisFromTransition,
  type StretchCommitBasis,
  type StretchHandle,
  type StretchInteractionEvent,
  type StretchInteractionState,
  type StretchPointerType,
} from "../runtime/stretch-interaction";
import {
  createStretchPreviewFrame,
  type StretchPreviewFrame,
} from "./stretch-preview-frame";

export type StretchController = Readonly<{
  mode: StretchInteractionState["mode"];
  amount: number;
  dragging: boolean;
  activeHandle: StretchHandle | null;
  lastHandle: StretchHandle | null;
  pointerDown: (
    handle: StretchHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => boolean;
  pointerMove: (event: React.PointerEvent<HTMLButtonElement>) => boolean;
  pointerUp: (event: React.PointerEvent<HTMLButtonElement>) => boolean;
  pointerCancel: (pointerId: number) => boolean;
  reopen: () => void;
  keyDown: (key: string, handle?: StretchHandle) => boolean;
  layoutInvalidated: () => void;
}>;

export type StretchPreviewSignal = Readonly<{
  amount: number;
  handle: StretchHandle | null;
  dragging: boolean;
}>;

/** Owns degree settlement while hot-path preview values stay in the DOM edge. */
export function useStretch(input: {
  selection: SegmentSelection | null;
  treeId: string;
  revision: number;
  documentEpoch?: number;
  navigationKey: string;
  layoutKey: string;
  onPreview: (signal: StretchPreviewSignal) => void;
  onCommit?: (basis: StretchCommitBasis) => void;
}): StretchController {
  const {
    documentEpoch = 0,
    layoutKey,
    navigationKey,
    onCommit,
    onPreview,
    revision,
    selection,
    treeId,
  } = input;
  const [state, dispatchBase] = useReducer(
    reduceStretchInteraction,
    undefined,
    createStretchInteractionState,
  );
  const stateRef = useRef(state);
  const previousNavigationRef = useRef(`${documentEpoch}:${navigationKey}`);
  const previousLayoutRef = useRef(layoutKey);
  const previewRef = useRef(onPreview);
  const commitRef = useRef(onCommit);
  const previewFrameRef = useRef<StretchPreviewFrame<StretchPreviewSignal> | null>(null);

  useLayoutEffect(() => {
    previewRef.current = onPreview;
    commitRef.current = onCommit;
  }, [onCommit, onPreview]);

  useLayoutEffect(() => {
    const frame = createStretchPreviewFrame<StretchPreviewSignal>({
      request: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle),
    }, (signal) => previewRef.current(signal));
    previewFrameRef.current = frame;
    return () => {
      frame.cancel();
      if (previewFrameRef.current === frame) previewFrameRef.current = null;
    };
  }, []);

  const flushPreview = useCallback((signal: StretchPreviewSignal) => {
    const frame = previewFrameRef.current;
    if (frame === null) {
      previewRef.current(signal);
      return;
    }
    frame.flush(signal);
  }, []);

  const schedulePreview = useCallback((signal: StretchPreviewSignal) => {
    const frame = previewFrameRef.current;
    if (frame === null) {
      previewRef.current(signal);
      return;
    }
    frame.schedule(signal);
  }, []);

  const send = useCallback((event: StretchInteractionEvent) => {
    const next = reduceStretchInteraction(stateRef.current, event);
    stateRef.current = next;
    dispatchBase(event);
    return next;
  }, []);

  const sendHot = useCallback((event: StretchInteractionEvent) => {
    const next = reduceStretchInteraction(stateRef.current, event);
    stateRef.current = next;
    return next;
  }, []);

  const emitCommit = useCallback((
    previous: StretchInteractionState,
    next: StretchInteractionState,
  ) => {
    const basis = stretchCommitBasisFromTransition(previous, next);
    if (basis !== null) commitRef.current?.(basis);
  }, []);

  useLayoutEffect(() => {
    if (selection === null) {
      send({ type: "selection-invalidated" });
      flushPreview(previewSignal(createStretchInteractionState()));
      return;
    }
    send({
      type: "arm",
      anchor: {
        selection,
        treeId,
        revision,
        documentEpoch,
      },
    });
  }, [documentEpoch, flushPreview, revision, selection, treeId, send]);

  useEffect(() => {
    const sessionNavigationKey = `${documentEpoch}:${navigationKey}`;
    if (previousNavigationRef.current === sessionNavigationKey) return;
    previousNavigationRef.current = sessionNavigationKey;
    send({ type: "navigation-invalidated" });
    flushPreview(previewSignal(createStretchInteractionState()));
  }, [documentEpoch, flushPreview, navigationKey, send]);

  useEffect(() => {
    if (previousLayoutRef.current === layoutKey) return;
    previousLayoutRef.current = layoutKey;
    const next = send({ type: "layout-invalidated" });
    flushPreview(previewSignal(next));
  }, [flushPreview, layoutKey, send]);

  useEffect(() => {
    const rollbackDrag = (type: "scroll-invalidated" | "resize-invalidated") => {
      if (stateRef.current.mode !== "dragging") return;
      const next = send({ type });
      flushPreview(previewSignal(next));
    };
    const onScroll = () => rollbackDrag("scroll-invalidated");
    const onResize = () => rollbackDrag("resize-invalidated");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || stateRef.current.mode !== "dragging") return;
      event.preventDefault();
      const next = send({ type: "key-down", key: event.key });
      flushPreview(previewSignal(next));
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [flushPreview, send]);

  const pointerDown = useCallback((
    handle: StretchHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const next = send({
      type: "pointer-down",
      handle,
      pointerId: event.pointerId,
      pointerType: normalizePointerType(event.pointerType),
      isPrimary: event.isPrimary,
      button: event.button,
      clientY: event.clientY,
    });
    flushPreview(previewSignal(next));
    return next.mode === "dragging" && next.pointerId === event.pointerId;
  }, [flushPreview, send]);

  const pointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = stateRef.current;
    if (current.mode !== "dragging" || current.pointerId !== event.pointerId) return false;
    const next = sendHot({ type: "pointer-move", pointerId: event.pointerId, clientY: event.clientY });
    if (next !== current) schedulePreview(previewSignal(next));
    return true;
  }, [schedulePreview, sendHot]);

  const pointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = stateRef.current;
    if (current.mode !== "dragging" || current.pointerId !== event.pointerId) return false;
    const next = send({ type: "pointer-up", pointerId: event.pointerId, clientY: event.clientY });
    flushPreview(previewSignal(next));
    emitCommit(current, next);
    return true;
  }, [emitCommit, flushPreview, send]);

  const pointerCancel = useCallback((pointerId: number) => {
    const current = stateRef.current;
    if (current.mode !== "dragging" || current.pointerId !== pointerId) return false;
    const next = send({ type: "pointer-cancel", pointerId });
    flushPreview(previewSignal(next));
    return true;
  }, [flushPreview, send]);

  const reopen = useCallback(() => {
    const next = send({ type: "reopen" });
    flushPreview(previewSignal(next));
  }, [flushPreview, send]);

  const keyDown = useCallback((key: string, handle?: StretchHandle) => {
    if (!isStretchInteractionKey(key)) return false;
    const current = stateRef.current;
    const next = send({ type: "key-down", key, handle });
    flushPreview(previewSignal(next));
    emitCommit(current, next);
    return true;
  }, [emitCommit, flushPreview, send]);

  const layoutInvalidated = useCallback(() => {
    const next = send({ type: "layout-invalidated" });
    flushPreview(previewSignal(next));
  }, [flushPreview, send]);

  return {
    mode: state.mode,
    amount: amountOf(state),
    dragging: state.mode === "dragging",
    activeHandle: state.mode === "dragging" ? state.handle : null,
    lastHandle: state.mode === "committed"
      ? state.lastHandle
      : state.mode === "dragging"
        ? state.handle
        : state.mode === "adjusted"
          ? state.lastHandle
        : null,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    reopen,
    keyDown,
    layoutInvalidated,
  };
}

function amountOf(state: ReturnType<typeof createStretchInteractionState> | ReturnType<typeof reduceStretchInteraction>): number {
  return state.mode === "idle" ? 0 : state.amount;
}

function previewSignal(
  state: ReturnType<typeof createStretchInteractionState> | ReturnType<typeof reduceStretchInteraction>,
): StretchPreviewSignal {
  return Object.freeze({
    amount: amountOf(state),
    handle: state.mode === "dragging"
      ? state.handle
      : state.mode === "committed" || state.mode === "adjusted"
        ? state.lastHandle
        : null,
    dragging: state.mode === "dragging",
  });
}

function normalizePointerType(value: string): StretchPointerType {
  return value === "touch" || value === "pen" ? value : "mouse";
}
