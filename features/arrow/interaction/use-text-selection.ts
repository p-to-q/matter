"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, ThoughtObject } from "../engine/protocol";
import { useArrowStore } from "../store/arrow-store";
import { resolveLassoSelection, type TokenBox } from "./selection-geometry";
import { stretchAmountFromDrag } from "./stretch";

type StretchSession = {
  pointerId: number;
  startY: number;
  initialAmount: number;
  side: "top" | "bottom";
};

function measuredTokens(): TokenBox[] {
  return [...document.querySelectorAll<HTMLElement>("[data-arrow-token]")]
    .flatMap((element) => {
      const objectId = element.dataset.objectId;
      const start = Number(element.dataset.start);
      const end = Number(element.dataset.end);
      if (!objectId || !Number.isInteger(start) || !Number.isInteger(end)) return [];
      return [...element.getClientRects()].map((rect) => ({
        objectId,
        start,
        end,
        text: element.textContent ?? "",
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }));
    })
    .filter((token) => token.rect.width > 0);
}

export function useTextSelection() {
  const scene = useArrowStore((state) => state.scene);
  const phase = useArrowStore((state) => state.phase);
  const tool = useArrowStore((state) => state.tool);
  const selection = useArrowStore((state) => state.selection);
  const stretchAmount = useArrowStore((state) => state.stretchAmount);
  const setPhase = useArrowStore((state) => state.setPhase);
  const setSelection = useArrowStore((state) => state.setSelection);
  const setStretchAmount = useArrowStore((state) => state.setStretchAmount);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [stretching, setStretching] = useState(false);
  const lassoPointer = useRef<number | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const stretchSession = useRef<StretchSession | null>(null);

  useEffect(() => {
    const clearStaleGeometry = () => {
      if (!useArrowStore.getState().selection) return;
      setSelection(null);
      setPhase("idle");
    };
    window.addEventListener("resize", clearStaleGeometry);
    return () => window.removeEventListener("resize", clearStaleGeometry);
  }, [setPhase, setSelection]);

  const beginLasso = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || scene.order.length === 0 || tool !== "select") return false;
      if (phase !== "idle" && phase !== "selected") return false;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = { x: event.clientX, y: event.clientY };
      lassoPointer.current = event.pointerId;
      lassoPointsRef.current = [point];
      setLassoPoints([point]);
      setSelection(null);
      setPhase("selecting");
      return true;
    },
    [phase, scene.order.length, setPhase, setSelection, tool],
  );

  const moveLasso = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (lassoPointer.current !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    const previous = lassoPointsRef.current.at(-1);
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
    lassoPointsRef.current = [...lassoPointsRef.current, point];
    setLassoPoints(lassoPointsRef.current);
  }, []);

  const finishLasso = useCallback(
    (pointerId: number, point: Point) => {
      if (lassoPointer.current !== pointerId) return;
      const points = [
        ...lassoPointsRef.current,
        point,
      ];
      lassoPointer.current = null;
      lassoPointsRef.current = [];
      setLassoPoints([]);

      const thoughts = Object.fromEntries(
        Object.values(scene.objects)
          .filter((object): object is ThoughtObject => object.type === "thought")
          .map((thought) => [thought.id, thought]),
      );
      const resolved = resolveLassoSelection(points, measuredTokens(), thoughts);
      setSelection(resolved);
      setPhase(resolved ? "selected" : "idle");
    },
    [scene.objects, setPhase, setSelection],
  );

  const endLasso = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      finishLasso(event.pointerId, { x: event.clientX, y: event.clientY });
    },
    [finishLasso],
  );

  const cancelLasso = useCallback(() => {
    if (lassoPointer.current === null) return;
    lassoPointer.current = null;
    lassoPointsRef.current = [];
    setLassoPoints([]);
    setSelection(null);
    setPhase("idle");
  }, [setPhase, setSelection]);

  useEffect(() => {
    const finishFromWindow = (event: PointerEvent) => {
      finishLasso(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointerup", finishFromWindow);
    window.addEventListener("pointercancel", cancelLasso);
    return () => {
      window.removeEventListener("pointerup", finishFromWindow);
      window.removeEventListener("pointercancel", cancelLasso);
    };
  }, [cancelLasso, finishLasso]);

  const beginStretch = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, side: "top" | "bottom") => {
      if (!selection || (phase !== "selected" && phase !== "listening")) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      stretchSession.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        initialAmount: stretchAmount,
        side,
      };
      setStretching(true);
    },
    [phase, selection, stretchAmount],
  );

  const moveStretch = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = stretchSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      setStretchAmount(
        stretchAmountFromDrag(
          session.initialAmount,
          event.clientY - session.startY,
          session.side,
        ),
      );
    },
    [setStretchAmount],
  );

  const endStretch = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (stretchSession.current?.pointerId !== event.pointerId) return;
    stretchSession.current = null;
    setStretching(false);
  }, []);

  return {
    beginLasso,
    moveLasso,
    endLasso,
    cancelLasso,
    lassoPoints,
    stretching,
    beginStretch,
    moveStretch,
    endStretch,
  };
}
