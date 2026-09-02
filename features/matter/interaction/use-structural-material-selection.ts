"use client";

import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { RefObject } from "react";
import { normalizeClientRects } from "./range-measurement";
import {
  createProjectedLayoutReceipt,
  type ProjectedLayoutReceipt,
} from "./projected-layout-receipt";

type StructuralSelectionInput = Readonly<{
  documentEpoch: number;
  enabled: boolean;
  layoutEpoch: number;
  nodeId: string | null;
  positioningRef: RefObject<HTMLElement | null>;
  scopeRef: RefObject<HTMLElement | null>;
  treeId: string;
  viewportKey: string;
}>;

/**
 * Measures whole-node selection at the rendering edge. The material document
 * keeps only structural identity; line boxes remain disposable browser state.
 */
export function useStructuralMaterialSelection(
  input: StructuralSelectionInput,
): ProjectedLayoutReceipt | null {
  const [receipt, setReceipt] = useState<ProjectedLayoutReceipt | null>(null);

  useLayoutEffect(() => {
    let frame: number | null = null;
    const fonts = document.fonts;
    let fontLoading = fonts?.status === "loading";
    const transitioning = new Set<EventTarget>();
    const cancelScheduledMeasurement = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const measurementSuspended = () => fontLoading || transitioning.size > 0;
    const measure = () => {
      frame = null;
      const scope = input.scopeRef.current;
      if (!input.enabled || input.nodeId === null || scope === null) {
        setReceipt(null);
        return;
      }
      const root = Array.from(
        scope.querySelectorAll<HTMLElement>("[data-thought-text-id]"),
      ).find((candidate) => candidate.dataset.thoughtTextId === input.nodeId) ?? null;
      const label = root?.querySelector<HTMLElement>(".spatial-thought__label") ?? null;
      if (root === null || label === null || !scope.contains(root)) {
        setReceipt(null);
        return;
      }

      try {
        const range = root.ownerDocument.createRange();
        range.selectNodeContents(label);
        const rects = normalizeClientRects(range.getClientRects());
        range.detach();
        const column = root.getBoundingClientRect();
        const style = getComputedStyle(root);
        setReceipt(createProjectedLayoutReceipt({
          basis: {
            addressKey: `${input.nodeId}:whole-node`,
            documentEpoch: input.documentEpoch,
            layoutEpoch: input.layoutEpoch,
            nodeId: input.nodeId,
            partitionKey: "structural-selection",
            treeId: input.treeId,
            viewportKey: input.viewportKey,
          },
          column: {
            left: column.left,
            top: column.top,
            right: column.right,
            bottom: column.bottom,
          },
          rects,
          textDirection: style.direction,
          writingMode: style.writingMode,
        }));
      } catch {
        setReceipt(null);
      }
    };
    const schedule = () => {
      if (frame !== null || measurementSuspended()) return;
      frame = window.requestAnimationFrame(() => {
        if (!measurementSuspended()) measure();
        else frame = null;
      });
    };
    const invalidateAndSchedule = () => {
      flushSync(() => setReceipt(null));
      schedule();
    };
    const invalidateOnly = () => {
      cancelScheduledMeasurement();
      flushSync(() => setReceipt(null));
    };
    const positioningElement = input.positioningRef.current;
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
    schedule();
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
    input.layoutEpoch,
    input.nodeId,
    input.positioningRef,
    input.scopeRef,
    input.treeId,
    input.viewportKey,
  ]);

  return structuralReceiptMatchesInput(receipt, input) ? receipt : null;
}

function structuralReceiptMatchesInput(
  receipt: ProjectedLayoutReceipt | null,
  input: StructuralSelectionInput,
): receipt is ProjectedLayoutReceipt {
  if (!input.enabled || input.nodeId === null || receipt === null) return false;
  const basis = receipt.basis;
  return basis.addressKey === `${input.nodeId}:whole-node` &&
    basis.documentEpoch === input.documentEpoch &&
    basis.layoutEpoch === input.layoutEpoch &&
    basis.nodeId === input.nodeId &&
    basis.partitionKey === "structural-selection" &&
    basis.treeId === input.treeId &&
    basis.viewportKey === input.viewportKey;
}
