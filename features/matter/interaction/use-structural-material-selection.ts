"use client";

import { useLayoutEffect, useState } from "react";
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
      if (frame !== null) return;
      frame = window.requestAnimationFrame(measure);
    };
    const positioningElement = input.positioningRef.current;
    const finishPositioningTransition = (event: TransitionEvent) => {
      const target = event.target;
      if (
        event.propertyName !== "transform" ||
        !(target instanceof HTMLElement) ||
        (target !== positioningElement && !target.classList.contains("matter-world"))
      ) return;
      schedule();
    };
    schedule();
    positioningElement?.addEventListener("transitioncancel", finishPositioningTransition);
    positioningElement?.addEventListener("transitionend", finishPositioningTransition);
    return () => {
      positioningElement?.removeEventListener("transitioncancel", finishPositioningTransition);
      positioningElement?.removeEventListener("transitionend", finishPositioningTransition);
      if (frame !== null) window.cancelAnimationFrame(frame);
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
