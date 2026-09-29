"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import type { MatterLocale } from "../config/locales";
import { createMaterialTextRange, normalizeClientRects } from "../interaction/range-measurement";
import {
  findMaterialTextElement,
  visualViewportBounds,
} from "../interaction/wiki-occurrence-browser";
import type {
  WikiOccurrenceDriver,
  WikiOccurrenceView,
} from "../interaction/wiki-occurrence-driver";
import type { ThoughtTree } from "../tree/model";
import type { CanvasLanguage } from "./canvas-preferences";
import { useEscapeLayer } from "./escape-layers";
import {
  projectPointTalkPlacementWithinSurfaces,
  type PointTalkBounds,
  type PointTalkPlacement,
} from "./point-talk-placement";
import type { PresenceClose } from "./presence";
import { deferUntilTouchCommits } from "./touch-commitment";
import { usePresence } from "./use-presence";
import {
  createWikiDisclosureController,
  type WikiDisclosureController,
} from "./wiki-occurrence-disclosure";
import { wikiTakeoverCopy } from "./wiki-takeover-copy";

const EMPTY_VIEWS: readonly WikiOccurrenceView[] = Object.freeze([]);
/** How long the quiet "passage changed" line stays before it leaves. */
const PASSAGE_CHANGED_NOTICE_MS = 1_600;
const TAKEOVER_GAP_PX = 10;

export type WikiTermRequest = Readonly<{ canonical: string; locale: MatterLocale }>;

/**
 * Binds committed Wiki occurrences to the paper: the one-time settle, the
 * quiet mark, and the takeover opened by a tap on a marked word. It owns no
 * occurrence state; the driver does.
 */
export function WikiOccurrenceLayer({
  blocked,
  boundaryRef,
  driver,
  geometryKey,
  locale,
  onOpenWiki,
  penActive,
  positioningRef,
  surfaceAvailable,
  tree,
}: Readonly<{
  /** A gesture, a turn, or a covering surface owns the paper. */
  blocked: boolean;
  boundaryRef: RefObject<HTMLElement | null>;
  driver: WikiOccurrenceDriver;
  geometryKey: string;
  locale: CanvasLanguage;
  onOpenWiki: (term: WikiTermRequest, trigger: HTMLElement | null) => void;
  penActive: (timeStamp: number) => boolean;
  positioningRef: RefObject<HTMLElement | null>;
  surfaceAvailable: boolean;
  tree: ThoughtTree;
}>) {
  const views = useSyncExternalStore(driver.subscribe, driver.getSnapshot, () => EMPTY_VIEWS);
  const treeRef = useRef(tree);
  const controllerRef = useRef<WikiDisclosureController | null>(null);
  useLayoutEffect(() => {
    treeRef.current = tree;
  }, [tree]);
  // Declared before the sync below, so a fresh controller exists when it runs.
  useLayoutEffect(() => {
    const controller = createWikiDisclosureController(driver.markDisclosed);
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, [driver]);
  useLayoutEffect(() => {
    controllerRef.current?.sync(views, Object.freeze({
      readText: (nodeId: string) => treeRef.current.nodes[nodeId]?.text,
      blocked,
    }));
  }, [blocked, driver, tree, views]);

  const takeover = views.find((view) => view.takeover) ?? null;
  return (
    <WikiOccurrenceTakeover
      boundaryRef={boundaryRef}
      driver={driver}
      geometryKey={geometryKey}
      locale={locale}
      onOpenWiki={onOpenWiki}
      penActive={penActive}
      positioningRef={positioningRef}
      surfaceAvailable={surfaceAvailable}
      tree={tree}
      view={takeover}
    />
  );
}

type TakeoverContent = Readonly<{
  occurrenceId: string;
  nodeId: string;
  start: number;
  end: number;
  heard: string;
  canonical: string;
  termLocale: MatterLocale;
  changed: boolean;
}>;

function WikiOccurrenceTakeover({
  boundaryRef,
  driver,
  geometryKey,
  locale,
  onOpenWiki,
  penActive,
  positioningRef,
  surfaceAvailable,
  tree,
  view,
}: Readonly<{
  boundaryRef: RefObject<HTMLElement | null>;
  driver: WikiOccurrenceDriver;
  geometryKey: string;
  locale: CanvasLanguage;
  onOpenWiki: (term: WikiTermRequest, trigger: HTMLElement | null) => void;
  penActive: (timeStamp: number) => boolean;
  positioningRef: RefObject<HTMLElement | null>;
  surfaceAvailable: boolean;
  tree: ThoughtTree;
  view: WikiOccurrenceView | null;
}>) {
  const copy = wikiTakeoverCopy(locale);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  // A close belongs to the surface identity it ended; any other ending, such
  // as a censored word or a covering surface, is a preemption.
  const [closing, setClosing] = useState<Readonly<{ identity: string; close: PresenceClose }> | null>(null);
  const [notice, setNotice] = useState<TakeoverContent | null>(null);
  const [placement, setPlacement] = useState<PointTalkPlacement | null>(null);
  const content = useMemo<TakeoverContent | null>(() => view === null ? null : Object.freeze({
    occurrenceId: view.id,
    nodeId: view.nodeId,
    start: view.start,
    end: view.end,
    heard: view.sourceText,
    canonical: view.canonicalText,
    termLocale: view.locale,
    changed: false,
  }), [view]);
  const live = useMemo(() => {
    if (!surfaceAvailable) return null;
    if (notice !== null) return Object.freeze({ identity: `${notice.occurrenceId}:changed`, view: notice });
    return content === null ? null : Object.freeze({ identity: content.occurrenceId, view: content });
  }, [content, notice, surfaceAvailable]);
  const [lastIdentity, setLastIdentity] = useState<string | null>(null);
  if (live !== null && live.identity !== lastIdentity) setLastIdentity(live.identity);
  const endingIdentity = live?.identity ?? lastIdentity;
  const frame = usePresence(
    live,
    closing !== null && closing.identity === endingIdentity ? closing.close : "preempted",
  );
  const present = frame?.stage === "present";
  const shown = frame?.view ?? null;

  const measure = useCallback(() => {
    const bubble = bubbleRef.current;
    const boundary = boundaryRef.current;
    const positioning = positioningRef.current;
    // A frozen exit and the quiet notice keep the last placement: the word
    // they describe may already be gone.
    if (
      !present || shown === null || shown.changed ||
      bubble === null || boundary === null || positioning === null
    ) return;
    const target = wordBounds(shown, tree);
    if (target === null) {
      setPlacement(null);
      return;
    }
    const bubbleRect = bubble.getBoundingClientRect();
    const toolRail = boundary.closest(".matter-shell")?.querySelector<HTMLElement>(".tool-rail");
    const projection = projectPointTalkPlacementWithinSurfaces({
      target,
      bubble: { width: bubbleRect.width || 180, height: bubbleRect.height || 36 },
      visualViewport: visualViewportBounds(),
      boundary: boundary.getBoundingClientRect(),
      positioningSurface: positioning.getBoundingClientRect(),
      rightOccluder: toolRail?.getBoundingClientRect() ?? null,
      gap: TAKEOVER_GAP_PX,
    });
    const next = projection.kind === "placed" ? projection.placement : null;
    setPlacement((current) => current !== null && next !== null &&
      current.left === next.left && current.top === next.top && current.maxWidth === next.maxWidth
      ? current
      : next);
  }, [boundaryRef, positioningRef, present, shown, tree]);

  useLayoutEffect(() => {
    if (shown === null) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (bubbleRef.current !== null) observer?.observe(bubbleRef.current);
    const visual = window.visualViewport;
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
    };
  }, [geometryKey, measure, shown]);

  const placed = placement !== null;
  useLayoutEffect(() => {
    // A hidden surface cannot take focus; the first placed frame can.
    if (!present || !placed || shown?.changed !== false ||
        document.visibilityState !== "visible") return;
    keepRef.current?.focus({ preventScroll: true });
  }, [placed, present, shown]);

  const returnFocus = useCallback((nodeId: string) => {
    const active = document.activeElement;
    if (active !== null && bubbleRef.current?.contains(active) !== true) return;
    queueMicrotask(() => findMaterialTextElement(nodeId)?.focus({ preventScroll: true }));
  }, []);

  const dismiss = useCallback((restoreFocus: boolean) => {
    if (content === null) return;
    setClosing(Object.freeze({ identity: content.occurrenceId, close: "person" }));
    if (restoreFocus) returnFocus(content.nodeId);
    driver.closeTakeover(content.occurrenceId, "inspected-kept");
  }, [content, driver, returnFocus]);

  useEscapeLayer(present && content !== null && notice === null, "transient", () => {
    dismiss(true);
    return true;
  });

  useEffect(() => {
    if (content === null || notice !== null) return;
    let pendingTouch: (() => void) | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && bubbleRef.current?.contains(event.target)) return;
      // The press already addresses something else; focus follows it.
      if (event.pointerType !== "touch") {
        dismiss(false);
        return;
      }
      // A palm beside a pen is not a tap; a touch dismisses once it commits.
      if (penActive(event.timeStamp)) return;
      pendingTouch?.();
      pendingTouch = deferUntilTouchCommits(
        { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY },
        () => dismiss(false),
      );
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      pendingTouch?.();
    };
  }, [content, dismiss, notice, penActive]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => {
      setClosing(Object.freeze({ identity: `${notice.occurrenceId}:changed`, close: "finished" }));
      setNotice(null);
    }, PASSAGE_CHANGED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const personCloses = (occurrenceId: string) =>
    setClosing(Object.freeze({ identity: occurrenceId, close: "person" }));
  // A keyboard activation hands focus back to the passage; a pointer one lets
  // focus follow the pointer, so no passage lens opens behind the person.
  const keep = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (content === null) return;
    personCloses(content.occurrenceId);
    if (event.detail === 0) returnFocus(content.nodeId);
    driver.closeTakeover(content.occurrenceId, "explicit-confirm");
  };
  const restore = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (content === null) return;
    personCloses(content.occurrenceId);
    if (event.detail === 0) returnFocus(content.nodeId);
    if (driver.revert(content.occurrenceId) === "reverted") return;
    // The passage no longer holds the word: say so quietly, change nothing.
    setNotice(Object.freeze({ ...content, changed: true }));
  };
  const openWiki = () => {
    if (content === null) return;
    personCloses(content.occurrenceId);
    driver.leaveTakeover(content.occurrenceId);
    onOpenWiki(
      Object.freeze({ canonical: content.canonical, locale: content.termLocale }),
      findMaterialTextElement(content.nodeId),
    );
  };

  if (frame === null || shown === null) return null;
  const actionable = present && !shown.changed;
  return (
    <div
      aria-hidden={!present || undefined}
      aria-label={shown.changed ? undefined : copy.changed(shown.heard, shown.canonical)}
      className="wiki-takeover"
      data-canvas-interactive
      data-presence={frame.stage}
      data-presence-close={frame.close ?? undefined}
      data-wiki-takeover={shown.changed ? "changed" : "open"}
      inert={!present || undefined}
      onPointerDown={(event) => event.stopPropagation()}
      ref={bubbleRef}
      role="group"
      style={placed
        ? { left: placement.left, top: placement.top, maxWidth: placement.maxWidth } as CSSProperties
        : { visibility: "hidden" }}
    >
      {shown.changed ? (
        <p className="wiki-takeover__notice" role="status">{copy.passageChanged}</p>
      ) : (
        <>
          <button
            aria-label={copy.keepLabel(shown.canonical)}
            onClick={actionable ? keep : undefined}
            ref={keepRef}
            type="button"
          >
            {copy.keep}
          </button>
          <button
            aria-label={copy.restoreLabel(shown.heard)}
            className="wiki-takeover__heard"
            onClick={actionable ? restore : undefined}
            type="button"
          >
            {shown.heard}
          </button>
          <button
            aria-label={copy.wikiLabel(shown.canonical)}
            onClick={actionable ? openWiki : undefined}
            type="button"
          >
            {copy.wiki}
          </button>
        </>
      )}
    </div>
  );
}

/** Client bounds of the addressed word, or null when it cannot be measured. */
function wordBounds(content: TakeoverContent, tree: ThoughtTree): PointTalkBounds | null {
  const element = findMaterialTextElement(content.nodeId);
  const text = tree.nodes[content.nodeId]?.text;
  if (element === null || text === undefined) return null;
  const range = createMaterialTextRange(element, text, content.start, content.end);
  const rects = range === null ? [] : normalizeClientRects(range.getClientRects());
  if (rects.length === 0) return null;
  return Object.freeze({
    left: Math.min(...rects.map((rect) => rect.x)),
    top: Math.min(...rects.map((rect) => rect.y)),
    right: Math.max(...rects.map((rect) => rect.x + rect.width)),
    bottom: Math.max(...rects.map((rect) => rect.y + rect.height)),
  });
}
