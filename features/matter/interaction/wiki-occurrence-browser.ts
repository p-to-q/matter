import { createMaterialTextRange } from "./range-measurement";
import {
  visibleAreaFraction,
  WIKI_OCCURRENCE_PERCEPTION,
  type MaterialView,
  type ViewportBounds,
  type WikiOccurrenceAddress,
} from "./wiki-occurrence-lifecycle";
import type { WikiOccurrenceEnvironment } from "./wiki-occurrence-driver";

/**
 * Browser capabilities for the occurrence driver. Nothing touches the DOM
 * until the driver attaches; every observer and listener it creates is
 * released by the returned cleanups or `dispose`, which are idempotent.
 */
export function createBrowserWikiOccurrenceEnvironment(
  readMaterial: () => MaterialView,
): WikiOccurrenceEnvironment {
  const tracked = new Map<string, Element | null>();
  const intersecting = new Set<string>();
  let observer: IntersectionObserver | null = null;

  const ensureObserver = (): IntersectionObserver | null => {
    if (observer !== null || typeof IntersectionObserver === "undefined") return observer;
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const nodeId = (entry.target as HTMLElement).dataset.thoughtTextId;
        if (nodeId === undefined) continue;
        if (entry.isIntersecting) intersecting.add(nodeId);
        else intersecting.delete(nodeId);
      }
    });
    return observer;
  };

  /** Re-observes when React replaced the element that renders a passage. */
  const currentElement = (nodeId: string): Element | null => {
    const element = findMaterialTextElement(nodeId);
    const previous = tracked.get(nodeId) ?? null;
    if (element === previous) return element;
    if (previous !== null) observer?.unobserve(previous);
    intersecting.delete(nodeId);
    tracked.set(nodeId, element);
    if (element !== null) ensureObserver()?.observe(element);
    return element;
  };

  const rangeFor = (address: WikiOccurrenceAddress): Range | null => {
    const element = currentElement(address.nodeId);
    const text = readMaterial().tree.nodes[address.nodeId]?.text;
    return element === null || text === undefined
      ? null
      : createMaterialTextRange(element, text, address.start, address.end);
  };

  return Object.freeze({
    now: () => performance.now(),
    isPageVisible: () => document.visibilityState === "visible",
    startTicker(tick, intervalMs) {
      const handle = window.setInterval(tick, intervalMs);
      return () => window.clearInterval(handle);
    },
    listenPage(handlers) {
      document.addEventListener("visibilitychange", handlers.visibility);
      window.addEventListener("pagehide", handlers.exit);
      document.addEventListener("copy", handlers.copy);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        document.removeEventListener("visibilitychange", handlers.visibility);
        window.removeEventListener("pagehide", handlers.exit);
        document.removeEventListener("copy", handlers.copy);
      };
    },
    track(nodeId) {
      if (!tracked.has(nodeId)) tracked.set(nodeId, null);
      currentElement(nodeId);
    },
    untrack(nodeId) {
      const element = tracked.get(nodeId) ?? null;
      if (element !== null) observer?.unobserve(element);
      tracked.delete(nodeId);
      intersecting.delete(nodeId);
    },
    isPerceivable(address) {
      if (document.visibilityState !== "visible") return false;
      const range = rangeFor(address);
      // Without IntersectionObserver the Range check alone decides.
      if (range === null || (observer !== null && !intersecting.has(address.nodeId))) return false;
      const rects = Array.from(range.getClientRects(), (rect) => ({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }));
      return visibleAreaFraction(rects, visualViewportBounds()) >=
        WIKI_OCCURRENCE_PERCEPTION.viewportFraction;
    },
    selectionCovers(address) {
      const selection = document.getSelection();
      if (selection === null || selection.rangeCount === 0) return false;
      const range = rangeFor(address);
      if (range === null) return false;
      for (let index = 0; index < selection.rangeCount; index += 1) {
        const selected = selection.getRangeAt(index);
        try {
          if (
            selected.compareBoundaryPoints(Range.START_TO_START, range) <= 0 &&
            selected.compareBoundaryPoints(Range.END_TO_END, range) >= 0
          ) return true;
        } catch {
          // Ranges in different documents or detached trees cannot contain it.
        }
      }
      return false;
    },
    dispose() {
      observer?.disconnect();
      observer = null;
      tracked.clear();
      intersecting.clear();
    },
  });
}

/** The single text owner of one rendered passage. */
export function findMaterialTextElement(nodeId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(
    `.spatial-thought__text[data-thought-text-id="${CSS.escape(nodeId)}"]`,
  );
}

export function visualViewportBounds(): ViewportBounds {
  const visual = window.visualViewport;
  if (visual !== null && visual !== undefined) {
    return Object.freeze({
      left: visual.offsetLeft,
      top: visual.offsetTop,
      right: visual.offsetLeft + visual.width,
      bottom: visual.offsetTop + visual.height,
    });
  }
  return Object.freeze({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
}
