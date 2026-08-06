"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { SegmentSelection } from "../material/text-segments";
import {
  createStretchInteractionState,
  reduceStretchInteraction,
  type StretchHandle,
  type StretchInteractionEvent,
  type StretchPointerType,
} from "../runtime/stretch-interaction";

export type StretchController = Readonly<{
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
  setAmount: (amount: number, handle?: StretchHandle) => void;
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
}): StretchController {
  const { documentEpoch = 0, layoutKey, navigationKey, onPreview, revision, selection, treeId } = input;
  const [state, dispatchBase] = useReducer(
    reduceStretchInteraction,
    undefined,
    createStretchInteractionState,
  );
  const stateRef = useRef(state);
  const previousNavigationRef = useRef(`${documentEpoch}:${navigationKey}`);
  const previousLayoutRef = useRef(layoutKey);

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

  useEffect(() => {
    if (selection === null) {
      send({ type: "selection-invalidated" });
      onPreview(previewSignal(createStretchInteractionState()));
      return;
    }
    send({
      type: "arm",
      anchor: {
        selection,
        treeId,
        revision,
      },
    });
  }, [onPreview, revision, selection, treeId, send]);

  useEffect(() => {
    const sessionNavigationKey = `${documentEpoch}:${navigationKey}`;
    if (previousNavigationRef.current === sessionNavigationKey) return;
    previousNavigationRef.current = sessionNavigationKey;
    send({ type: "navigation-invalidated" });
    onPreview(previewSignal(createStretchInteractionState()));
  }, [documentEpoch, navigationKey, onPreview, send]);

  useEffect(() => {
    if (previousLayoutRef.current === layoutKey) return;
    previousLayoutRef.current = layoutKey;
    const next = send({ type: "layout-invalidated" });
    onPreview(previewSignal(next));
  }, [layoutKey, onPreview, send]);

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
    onPreview(previewSignal(next));
    return next.mode === "dragging" && next.pointerId === event.pointerId;
  }, [onPreview, send]);

  const pointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = stateRef.current;
    if (current.mode !== "dragging" || current.pointerId !== event.pointerId) return false;
    const next = sendHot({ type: "pointer-move", pointerId: event.pointerId, clientY: event.clientY });
    onPreview(previewSignal(next));
    return true;
  }, [onPreview, sendHot]);

  const pointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = stateRef.current;
    if (current.mode !== "dragging" || current.pointerId !== event.pointerId) return false;
    const next = send({ type: "pointer-up", pointerId: event.pointerId, clientY: event.clientY });
    onPreview(previewSignal(next));
    return true;
  }, [onPreview, send]);

  const pointerCancel = useCallback((pointerId: number) => {
    const current = stateRef.current;
    if (current.mode !== "dragging" || current.pointerId !== pointerId) return false;
    const next = send({ type: "pointer-cancel", pointerId });
    onPreview(previewSignal(next));
    return true;
  }, [onPreview, send]);

  const setAmount = useCallback((amount: number, handle?: StretchHandle) => {
    const next = send({ type: "set-amount", amount, handle });
    onPreview(previewSignal(next));
  }, [onPreview, send]);

  const layoutInvalidated = useCallback(() => {
    const next = send({ type: "layout-invalidated" });
    onPreview(previewSignal(next));
  }, [onPreview, send]);

  return {
    amount: amountOf(state),
    dragging: state.mode === "dragging",
    activeHandle: state.mode === "dragging" ? state.handle : null,
    lastHandle: state.mode === "committed"
      ? state.lastHandle
      : state.mode === "dragging"
        ? state.handle
        : null,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    setAmount,
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
      : state.mode === "committed"
        ? state.lastHandle
        : null,
    dragging: state.mode === "dragging",
  });
}

function normalizePointerType(value: string): StretchPointerType {
  return value === "touch" || value === "pen" ? value : "mouse";
}
