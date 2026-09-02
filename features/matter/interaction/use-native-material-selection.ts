"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  positioningRef: RefObject<HTMLElement | null>;
  scopeRef: RefObject<HTMLElement | null>;
  treeId: string;
  viewportKey: string;
}>;

export type NativeMaterialSelectionPresentation = Readonly<
  | { phase: "none"; receipt: null }
  | { phase: "browser"; receipt: null }
  | { phase: "custom"; receipt: ProjectedLayoutReceipt }
>;

const NO_NATIVE_SELECTION = Object.freeze({ phase: "none", receipt: null }) as
  NativeMaterialSelectionPresentation;
const BROWSER_NATIVE_SELECTION = Object.freeze({ phase: "browser", receipt: null }) as
  NativeMaterialSelectionPresentation;

/**
 * Observes browser copy selection without taking its semantic ownership.
 * Measurement is coalesced to one animation frame and fails open to native
 * Highlight whenever a single current material range cannot be proven.
 */
export function useNativeMaterialSelection(
  input: NativeSelectionInput,
): NativeMaterialSelectionPresentation {
  const [presentation, setPresentation] = useState<NativeMaterialSelectionPresentation>(
    NO_NATIVE_SELECTION,
  );
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const currentPresence = useCallback((): NativeMaterialSelectionPresentation => {
    const scope = input.scopeRef.current;
    return input.enabled && scope !== null && nativeSelectionPresent(scope)
      ? BROWSER_NATIVE_SELECTION
      : NO_NATIVE_SELECTION;
  }, [input.enabled, input.scopeRef]);

  const measure = useCallback(() => {
    const scope = input.scopeRef.current;
    const selection = window.getSelection();
    if (
      !input.enabled || scope === null || selection === null ||
      !nativeSelectionPresent(scope, selection)
    ) {
      setPresentation(NO_NATIVE_SELECTION);
      return;
    }
    if (selection.rangeCount !== 1) {
      setPresentation(BROWSER_NATIVE_SELECTION);
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
      setPresentation(BROWSER_NATIVE_SELECTION);
      return;
    }
    const nodeId = startRoot.dataset.thoughtTextId;
    if (nodeId === undefined || nodeId.length === 0) {
      setPresentation(BROWSER_NATIVE_SELECTION);
      return;
    }

    try {
      const rects = normalizeClientRects(range.getClientRects());
      if (rects.length > MATERIAL_ADDRESS_NATIVE_FRAGMENT_LIMIT) {
        setPresentation(BROWSER_NATIVE_SELECTION);
        return;
      }
      const column = startRoot.getBoundingClientRect();
      const offsets = rangeOffsets(startRoot, range);
      if (offsets === null) {
        setPresentation(BROWSER_NATIVE_SELECTION);
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
      setPresentation(next !== null && next.rows.length <= MATERIAL_ADDRESS_NATIVE_ROW_LIMIT
        ? Object.freeze({ phase: "custom", receipt: next })
        : BROWSER_NATIVE_SELECTION);
    } catch {
      // Selection may mutate between selectionchange and this frame. Keeping
      // the browser paint is the safe and perceivable fallback.
      setPresentation(currentPresence());
    }
  }, [
    input.documentEpoch,
    input.enabled,
    input.layoutEpoch,
    input.scopeRef,
    input.treeId,
    input.viewportKey,
    currentPresence,
  ]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const fonts = document.fonts;
    let fontLoading = fonts?.status === "loading";
    const transitioning = new Set<EventTarget>();
    const cancelScheduledMeasurement = () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    const measurementSuspended = () => fontLoading || transitioning.size > 0;
    const schedule = () => {
      if (frameRef.current !== null || measurementSuspended()) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (generation === generationRef.current && !measurementSuspended()) measure();
      });
    };
    const invalidateAndSchedule = () => {
      // The browser has already moved its Selection. Release the old custom
      // paint before this native event returns, then measure the new identity
      // at most once in the next frame. A normal concurrent update may merge
      // with that measurement and leave the old path suppressing ::selection.
      flushSync(() => setPresentation(currentPresence()));
      schedule();
    };
    const invalidateOnly = () => {
      cancelScheduledMeasurement();
      flushSync(() => setPresentation(currentPresence()));
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
    document.addEventListener("selectionchange", invalidateAndSchedule);
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
      document.removeEventListener("selectionchange", invalidateAndSchedule);
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
  }, [currentPresence, input.positioningRef, measure]);

  if (!input.enabled || presentation.phase === "none") return NO_NATIVE_SELECTION;
  if (
    presentation.phase === "custom" &&
    nativeReceiptMatchesInput(presentation.receipt, input)
  ) return presentation;
  return BROWSER_NATIVE_SELECTION;
}

function nativeReceiptMatchesInput(
  receipt: ProjectedLayoutReceipt,
  input: NativeSelectionInput,
): receipt is ProjectedLayoutReceipt {
  if (!input.enabled) return false;
  const basis = receipt.basis;
  return basis.documentEpoch === input.documentEpoch &&
    basis.layoutEpoch === input.layoutEpoch &&
    basis.partitionKey === "native-selection" &&
    basis.treeId === input.treeId &&
    basis.viewportKey === input.viewportKey;
}

function nativeSelectionPresent(scope: HTMLElement, selection = window.getSelection()): boolean {
  if (
    selection === null || selection.isCollapsed || selection.rangeCount === 0 ||
    selection.toString().length === 0
  ) return false;
  try {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      if (selection.getRangeAt(index).intersectsNode(scope)) return true;
    }
  } catch {
    return false;
  }
  return false;
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
