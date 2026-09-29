import {
  createMaterialTextRange,
  normalizeClientRects,
  type ClientTextRect,
} from "./range-measurement";
import {
  visibleAreaFraction,
  WIKI_OCCURRENCE_PERCEPTION,
  type MaterialView,
  type ViewportBounds,
  type WikiOccurrenceAddress,
} from "./wiki-occurrence-lifecycle";
import {
  createWikiOccurrenceDriver,
  type WikiOccurrenceDriver,
  type WikiOccurrenceDriverInput,
  type WikiOccurrenceEnvironment,
  type WikiOccurrenceTarget,
} from "./wiki-occurrence-driver";

/** The smallest square a tap on a marked word must be able to land in. */
export const WIKI_TAKEOVER_TARGET_PX = 24;

/**
 * The lazily loaded browser half of Wiki occurrences: the lifecycle, its DOM
 * environment, and the policy it settles through. Nothing here is part of the
 * initial material bundle.
 */
export function createBrowserWikiOccurrenceDriver(
  input: WikiOccurrenceDriverInput,
): WikiOccurrenceDriver {
  return createWikiOccurrenceDriver({
    ...input,
    environment: createBrowserWikiOccurrenceEnvironment(input.readMaterial),
  });
}

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
    hitTest(targets, clientX, clientY) {
      return hitTestWikiOccurrence(targets, readMaterial, clientX, clientY);
    },
    dispose() {
      observer?.disconnect();
      observer = null;
      tracked.clear();
      intersecting.clear();
    },
  });
}

/**
 * Resolves a pointer to the occurrence it lands on: the caret position under
 * it strictly inside a word, or a hit within a word's rects widened to the
 * minimum target. The nearest rect wins when two words are close.
 */
export function hitTestWikiOccurrence(
  targets: readonly WikiOccurrenceTarget[],
  readMaterial: () => MaterialView,
  clientX: number,
  clientY: number,
): string | null {
  const nodeId = targets[0]?.address.nodeId;
  if (nodeId === undefined) return null;
  const element = findMaterialTextElement(nodeId);
  const materialText = readMaterial().tree.nodes[nodeId]?.text;
  if (element === null || materialText === undefined) return null;
  const caretOffset = caretOffsetAt(element, clientX, clientY);
  let best: Readonly<{ id: string; distance: number }> | null = null;
  for (const target of targets) {
    const { address } = target;
    if (address.nodeId !== nodeId) continue;
    if (caretOffset !== null && caretOffset > address.start && caretOffset < address.end) {
      return target.id;
    }
    const range = createMaterialTextRange(element, materialText, address.start, address.end);
    if (range === null) continue;
    for (const rect of normalizeClientRects(range.getClientRects())) {
      const distance = targetDistance(rect, clientX, clientY);
      if (distance !== null && (best === null || distance < best.distance)) {
        best = Object.freeze({ id: target.id, distance });
      }
    }
  }
  return best?.id ?? null;
}

function targetDistance(rect: ClientTextRect, x: number, y: number): number | null {
  const width = Math.max(rect.width, WIKI_TAKEOVER_TARGET_PX);
  const height = Math.max(rect.height, WIKI_TAKEOVER_TARGET_PX);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  if (Math.abs(x - centerX) > width / 2 || Math.abs(y - centerY) > height / 2) return null;
  return Math.hypot(x - centerX, y - centerY);
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function caretOffsetAt(element: HTMLElement, x: number, y: number): number | null {
  const pageDocument = element.ownerDocument as CaretDocument;
  let node: Node | null = null;
  let offset = 0;
  try {
    const position = pageDocument.caretPositionFromPoint?.(x, y) ?? null;
    if (position !== null) {
      node = position.offsetNode;
      offset = position.offset;
    } else {
      const range = pageDocument.caretRangeFromPoint?.(x, y) ?? null;
      if (range !== null) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }
  } catch {
    return null;
  }
  if (node === null || node.nodeType !== Node.TEXT_NODE || !element.contains(node)) return null;
  let logical = 0;
  const walker = pageDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
    if (current === node) return logical + offset;
    logical += (current as Text).data.length;
  }
  return null;
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
