"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { normalizeClientRects } from "./range-measurement";
import {
  MATERIAL_ADDRESS_NATIVE_FRAGMENT_LIMIT,
  MATERIAL_ADDRESS_NATIVE_ROW_LIMIT,
  createProjectedLayoutReceipt,
  type ProjectedLayoutReceipt,
} from "./projected-layout-receipt";

type NativeSelectionInput = Readonly<{
  documentEpoch: number;
  enabled: boolean;
  layoutEpoch: number;
  scopeRef: RefObject<HTMLElement | null>;
  treeId: string;
  viewportKey: string;
}>;

/**
 * Observes browser copy selection without taking its semantic ownership.
 * Measurement is coalesced to one animation frame and fails open to native
 * Highlight whenever a single current material range cannot be proven.
 */
export function useNativeMaterialSelection(
  input: NativeSelectionInput,
): ProjectedLayoutReceipt | null {
  const [receipt, setReceipt] = useState<ProjectedLayoutReceipt | null>(null);
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const measure = useCallback(() => {
    const scope = input.scopeRef.current;
    const selection = window.getSelection();
    if (
      !input.enabled || scope === null || selection === null || selection.isCollapsed ||
      selection.rangeCount !== 1 || selection.toString().length === 0
    ) {
      setReceipt(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startRoot = materialTextRoot(range.startContainer);
    const endRoot = materialTextRoot(range.endContainer);
    if (
      startRoot === null || endRoot === null || startRoot !== endRoot ||
      !scope.contains(startRoot) ||
      !startRoot.contains(range.startContainer) || !startRoot.contains(range.endContainer)
    ) {
      setReceipt(null);
      return;
    }
    const nodeId = startRoot.dataset.thoughtTextId;
    if (nodeId === undefined || nodeId.length === 0) {
      setReceipt(null);
      return;
    }

    try {
      const rects = normalizeClientRects(range.getClientRects());
      if (rects.length > MATERIAL_ADDRESS_NATIVE_FRAGMENT_LIMIT) {
        setReceipt(null);
        return;
      }
      const column = startRoot.getBoundingClientRect();
      const offsets = rangeOffsets(startRoot, range);
      if (offsets === null) {
        setReceipt(null);
        return;
      }
      const style = getComputedStyle(startRoot);
      const next = createProjectedLayoutReceipt({
        basis: {
          addressKey: `${nodeId}:${offsets.start}:${offsets.end}`,
          documentEpoch: input.documentEpoch,
          layoutEpoch: input.layoutEpoch,
          nodeId,
          partitionKey: "native-selection",
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
      });
      setReceipt(next !== null && next.rows.length <= MATERIAL_ADDRESS_NATIVE_ROW_LIMIT
        ? next
        : null);
    } catch {
      // Selection may mutate between selectionchange and this frame. Keeping
      // the browser paint is the safe and perceivable fallback.
      setReceipt(null);
    }
  }, [
    input.documentEpoch,
    input.enabled,
    input.layoutEpoch,
    input.scopeRef,
    input.treeId,
    input.viewportKey,
  ]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    setReceipt(null);
    const generation = generationRef.current;
    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (generation === generationRef.current) measure();
      });
    };
    schedule();
    document.addEventListener("selectionchange", schedule);
    return () => {
      document.removeEventListener("selectionchange", schedule);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [measure]);

  return receipt;
}

function materialTextRoot(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>("[data-thought-text-id]") ?? null;
}

function rangeOffsets(root: HTMLElement, range: Range): Readonly<{
  end: number;
  start: number;
}> | null {
  const ownerDocument = root.ownerDocument;
  if (typeof ownerDocument.createRange !== "function") return null;
  const prefix = ownerDocument.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const suffix = ownerDocument.createRange();
  suffix.selectNodeContents(root);
  suffix.setEnd(range.endContainer, range.endOffset);
  const start = prefix.toString().length;
  const end = suffix.toString().length;
  return end > start ? Object.freeze({ start, end }) : null;
}
