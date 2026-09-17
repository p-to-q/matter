"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { RefObject } from "react";
import { normalizeClientRects } from "./range-measurement";
import {
  createProjectedLayoutReceipt,
  type ProjectedLayoutBasis,
  type ProjectedLayoutReceipt,
} from "./projected-layout-receipt";
import {
  rebaseStructuralMaterialMeasurement,
  type StructuralMaterialGeometryBasis,
  type StructuralMaterialMeasurement,
} from "./structural-material-geometry";

type StructuralSelectionInput = Readonly<{
  documentEpoch: number;
  enabled: boolean;
  geometryBasis: StructuralMaterialGeometryBasis | null;
  layoutEpoch: number;
  nodeId: string | null;
  positioningRef: RefObject<HTMLElement | null>;
  scopeRef: RefObject<HTMLElement | null>;
  source: "point-talk" | "structural-selection";
  treeId: string;
  viewportKey: string;
}>;

/** Cached line boxes belong to the exact render-edge elements that produced them. */
type OwnedStructuralMaterialMeasurement = StructuralMaterialMeasurement & Readonly<{
  positioningElement: HTMLElement;
  scopeElement: HTMLElement;
}>;

/**
 * Measures whole-node selection at the rendering edge. The material document
 * keeps only structural identity; line boxes remain disposable browser state.
 */
export function useStructuralMaterialSelection(
  input: StructuralSelectionInput,
): ProjectedLayoutReceipt | null {
  const [measurement, setMeasurement] = useState<OwnedStructuralMaterialMeasurement | null>(null);
  const receiptBasis = useMemo<ProjectedLayoutBasis>(() => ({
    addressKey: wholeNodeAddressKey(input.nodeId ?? "", input.source),
    documentEpoch: input.documentEpoch,
    layoutEpoch: input.layoutEpoch,
    nodeId: input.nodeId ?? "",
    partitionKey: input.source,
    treeId: input.treeId,
    viewportKey: input.viewportKey,
  }), [
    input.documentEpoch,
    input.layoutEpoch,
    input.nodeId,
    input.source,
    input.treeId,
    input.viewportKey,
  ]);
  const positioningElement = input.positioningRef.current;
  const scopeElement = input.scopeRef.current;
  const receipt = useMemo(
    () => !input.enabled || input.nodeId === null || input.geometryBasis === null ||
        positioningElement === null || scopeElement === null || measurement === null ||
        measurement.positioningElement !== positioningElement ||
        measurement.scopeElement !== scopeElement
      ? null
      : rebaseStructuralMaterialMeasurement(measurement, input.geometryBasis, receiptBasis),
    [
      input.enabled,
      input.geometryBasis,
      input.nodeId,
      measurement,
      positioningElement,
      receiptBasis,
      scopeElement,
    ],
  );
  const receiptRef = useRef(receipt);
  const transitioningRef = useRef(new Set<EventTarget>());
  const transitionOwnerRef = useRef<Readonly<{
    documentEpoch: number;
    element: HTMLElement;
    treeId: string;
  }> | null>(null);
  useLayoutEffect(() => {
    receiptRef.current = receipt;
  });
  useLayoutEffect(() => () => {
    transitioningRef.current.clear();
    transitionOwnerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const positioningElement = input.positioningRef.current;
    if (
      !input.enabled || input.nodeId === null || input.geometryBasis === null ||
      positioningElement === null
    ) {
      // `receipt` is already null for every invalid input. The retained cache
      // also carries both DOM owners, so replacement elements cannot revive it.
      transitioningRef.current.clear();
      transitionOwnerRef.current = null;
      return;
    }
    const transitionOwner = transitionOwnerRef.current;
    if (
      transitionOwner === null ||
      transitionOwner.documentEpoch !== input.documentEpoch ||
      transitionOwner.element !== positioningElement ||
      transitionOwner.treeId !== input.treeId
    ) transitioningRef.current.clear();
    transitionOwnerRef.current = Object.freeze({
      documentEpoch: input.documentEpoch,
      element: positioningElement,
      treeId: input.treeId,
    });
    const geometryBasis = input.geometryBasis;
    const nodeId = input.nodeId;
    let disposed = false;
    let frame: number | null = null;
    const fonts = document.fonts;
    let fontLoading = fonts?.status === "loading";
    const transitioning = transitioningRef.current;
    const cancelScheduledMeasurement = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const measurementSuspended = () => fontLoading || transitioning.size > 0;
    const measure = () => {
      frame = null;
      const scope = input.scopeRef.current;
      if (scope === null) {
        setMeasurement(null);
        return;
      }
      const root = scope.querySelector<HTMLElement>(
        `[data-layout-node-id][data-thought-id="${CSS.escape(nodeId)}"] > ` +
          `[data-thought-text-id="${CSS.escape(nodeId)}"]`,
      );
      const label = root?.querySelector<HTMLElement>(".spatial-thought__label") ?? null;
      // The declared surface, not conditional DOM presence, owns measurement.
      // Selection paint must not change line breaking; Point Talk may still
      // deliberately address the complete text root when its basis says so.
      const material = geometryBasis.surface === "label" ? label : root;
      if (root === null || material === null || !scope.contains(root)) {
        setMeasurement(null);
        return;
      }

      try {
        const range = root.ownerDocument.createRange();
        let rects: ReturnType<typeof normalizeClientRects>;
        try {
          range.selectNodeContents(material);
          rects = normalizeClientRects(range.getClientRects());
        } finally {
          range.detach();
        }
        const column = root.getBoundingClientRect();
        const style = getComputedStyle(root);
        const nextReceipt = createProjectedLayoutReceipt({
          basis: receiptBasis,
          column: {
            left: column.left,
            top: column.top,
            right: column.right,
            bottom: column.bottom,
          },
          rects,
          textDirection: style.direction,
          writingMode: style.writingMode,
        });
        setMeasurement(nextReceipt === null ? null : Object.freeze({
          geometryBasis,
          positioningElement,
          receipt: nextReceipt,
          scopeElement: scope,
        }));
      } catch {
        setMeasurement(null);
      }
    };
    const schedule = () => {
      if (disposed || frame !== null || measurementSuspended()) return;
      frame = window.requestAnimationFrame(() => {
        if (!disposed && !measurementSuspended()) measure();
        else frame = null;
      });
    };
    const invalidateAndSchedule = () => {
      flushSync(() => setMeasurement(null));
      schedule();
    };
    const invalidateOnly = () => {
      cancelScheduledMeasurement();
      flushSync(() => setMeasurement(null));
    };
    const finishPositioningTransition = (event: TransitionEvent) => {
      const target = event.target;
      if (
        event.propertyName !== "transform" ||
        !(target instanceof HTMLElement) ||
        (target !== positioningElement && !target.classList.contains("matter-world"))
      ) return;
      transitioning.delete(target);
      invalidateAndSchedule();
    };
    const beginPositioningTransition = (event: TransitionEvent) => {
      const target = event.target;
      if (
        event.propertyName !== "transform" ||
        !(target instanceof HTMLElement) ||
        (target !== positioningElement && !target.classList.contains("matter-world"))
      ) return;
      transitioning.add(target);
      invalidateOnly();
    };
    const beginFontLoading = () => {
      fontLoading = true;
      invalidateOnly();
    };
    const finishFontLoading = () => {
      fontLoading = false;
      invalidateAndSchedule();
    };
    if (receiptRef.current === null) schedule();
    window.addEventListener("resize", invalidateAndSchedule);
    window.addEventListener("scroll", invalidateAndSchedule, true);
    window.visualViewport?.addEventListener("resize", invalidateAndSchedule);
    window.visualViewport?.addEventListener("scroll", invalidateAndSchedule);
    fonts?.addEventListener?.("loading", beginFontLoading);
    fonts?.addEventListener?.("loadingdone", finishFontLoading);
    fonts?.addEventListener?.("loadingerror", finishFontLoading);
    positioningElement?.addEventListener("transitionrun", beginPositioningTransition);
    positioningElement?.addEventListener("transitioncancel", finishPositioningTransition);
    positioningElement?.addEventListener("transitionend", finishPositioningTransition);
    return () => {
      disposed = true;
      window.removeEventListener("resize", invalidateAndSchedule);
      window.removeEventListener("scroll", invalidateAndSchedule, true);
      window.visualViewport?.removeEventListener("resize", invalidateAndSchedule);
      window.visualViewport?.removeEventListener("scroll", invalidateAndSchedule);
      fonts?.removeEventListener?.("loading", beginFontLoading);
      fonts?.removeEventListener?.("loadingdone", finishFontLoading);
      fonts?.removeEventListener?.("loadingerror", finishFontLoading);
      positioningElement?.removeEventListener("transitionrun", beginPositioningTransition);
      positioningElement?.removeEventListener("transitioncancel", finishPositioningTransition);
      positioningElement?.removeEventListener("transitionend", finishPositioningTransition);
      cancelScheduledMeasurement();
    };
  }, [
    input.documentEpoch,
    input.enabled,
    input.geometryBasis,
    input.layoutEpoch,
    input.nodeId,
    input.positioningRef,
    input.scopeRef,
    input.source,
    input.treeId,
    input.viewportKey,
    receiptBasis,
  ]);

  return receipt;
}

function wholeNodeAddressKey(
  nodeId: string,
  source: StructuralSelectionInput["source"],
): string {
  return source === "structural-selection"
    ? `${nodeId}:whole-node`
    : `${nodeId}:point-talk`;
}
