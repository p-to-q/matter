"use client";

// Loads with this lazy chunk; nothing in the initial graph renders these classes.
import "./WikiOccurrenceLayer.css";
import {
  useCallback,
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
import { useOutsidePressDismissal } from "./touch-commitment";
import { usePresence } from "./use-presence";
import {
  createWikiDisclosureController,
  type WikiDisclosureController,
} from "./wiki-occurrence-disclosure";
import { wikiTakeoverCopy } from "./wiki-takeover-copy";

const EMPTY_VIEWS: readonly WikiOccurrenceView[] = Object.freeze([]);
const TAKEOVER_GAP_PX = 10;
/**
 * A takeover dismissed sooner than this after it could first be seen was not
 * read, so its dismissal is not an inspection and the word returns to silence.
 */
const WIKI_TAKEOVER_READABLE_MS = 500;

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
  onRestoreRefused,
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
  /** Restore found the passage no longer holding the word; nothing changed. */
  onRestoreRefused: () => void;
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
      onRestoreRefused={onRestoreRefused}
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
}>;

function WikiOccurrenceTakeover({
  boundaryRef,
  driver,
  geometryKey,
  locale,
  onOpenWiki,
  onRestoreRefused,
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
  onRestoreRefused: () => void;
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
  const [placement, setPlacement] = useState<PointTalkPlacement | null>(null);
  // Keyed on the fields the takeover shows and addresses, so another word
  // settling (or this one's bookkeeping changing) never rebuilds it.
  const occurrenceId = view?.id ?? null;
  const nodeId = view?.nodeId ?? null;
  const start = view?.start ?? null;
  const end = view?.end ?? null;
  const heard = view?.sourceText ?? null;
  const canonical = view?.canonicalText ?? null;
  const termLocale = view?.locale ?? null;
  const content = useMemo<TakeoverContent | null>(() =>
    occurrenceId === null || nodeId === null || start === null || end === null ||
      heard === null || canonical === null || termLocale === null
      ? null
      : Object.freeze({ occurrenceId, nodeId, start, end, heard, canonical, termLocale }),
  [canonical, end, heard, nodeId, occurrenceId, start, termLocale]);
  const live = useMemo(
    () => !surfaceAvailable || content === null
      ? null
      : Object.freeze({ identity: content.occurrenceId, view: content }),
    [content, surfaceAvailable],
  );
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
    // A frozen exit keeps the last placement: the word may already be gone.
    if (
      !present || shown === null ||
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
  // When this takeover could first be read: present, placed, and on screen.
  const readableSinceRef = useRef<Readonly<{ id: string; atMs: number }> | null>(null);
  useLayoutEffect(() => {
    if (content === null) readableSinceRef.current = null;
  }, [content]);
  useLayoutEffect(() => {
    if (!present || !placed || shown === null ||
        document.visibilityState !== "visible" ||
        readableSinceRef.current?.id === shown.occurrenceId) return;
    readableSinceRef.current = Object.freeze({ id: shown.occurrenceId, atMs: performance.now() });
  }, [placed, present, shown]);
  // Focus lands once per opened word: on the first placed, visible frame. A
  // later render of the same word (another word settling, a remapped offset)
  // must never pull focus back to Keep from wherever the person moved it.
  const focusedIdRef = useRef<string | null>(null);
  const shownId = shown?.occurrenceId ?? null;
  useLayoutEffect(() => {
    if (content === null) focusedIdRef.current = null;
  }, [content]);
  useLayoutEffect(() => {
    // A hidden surface cannot take focus; the first placed frame can.
    if (!present || !placed || shownId === null ||
        focusedIdRef.current === shownId ||
        document.visibilityState !== "visible") return;
    focusedIdRef.current = shownId;
    keepRef.current?.focus({ preventScroll: true });
  }, [placed, present, shownId]);

  const returnFocus = useCallback((nodeId: string) => {
    const active = document.activeElement;
    if (active !== null && bubbleRef.current?.contains(active) !== true) return;
    queueMicrotask(() => findMaterialTextElement(nodeId)?.focus({ preventScroll: true }));
  }, []);

  /**
   * Dismissal is an inspection only when the takeover could be read and the
   * dismissing press is not on the word itself, as the second press of a
   * double-click is. Otherwise the word returns to silence unsettled.
   */
  const dismiss = useCallback((restoreFocus: boolean, onWord: boolean) => {
    if (content === null) return;
    setClosing(Object.freeze({ identity: content.occurrenceId, close: "person" }));
    if (restoreFocus) returnFocus(content.nodeId);
    const since = readableSinceRef.current;
    const read = since !== null && since.id === content.occurrenceId &&
      performance.now() - since.atMs >= WIKI_TAKEOVER_READABLE_MS;
    if (onWord || !read) driver.leaveTakeover(content.occurrenceId, "unread");
    else driver.closeTakeover(content.occurrenceId, "inspected-kept");
  }, [content, driver, returnFocus]);

  // A paper surface at its word: chrome or a panel that covers it closes first.
  useEscapeLayer(present && content !== null, "paper", () => {
    dismiss(true, false);
    return true;
  });

  // The press already addresses something else, so focus follows it. A palm
  // beside a pen is not a tap; a touch dismisses once it commits, even if the
  // takeover re-renders meanwhile.
  useOutsidePressDismissal(content?.occurrenceId ?? null, {
    resolve: (event) => {
      if (content === null ||
          (event.target instanceof Node && bubbleRef.current?.contains(event.target))) return null;
      const onWord = driver.hitTest(content.nodeId, event.clientX, event.clientY) ===
        content.occurrenceId;
      return () => dismiss(false, onWord);
    },
    penActive,
  });

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
    // The passage no longer holds the word: change nothing, and let the one
    // outcome line say so until the person's next action.
    if (driver.revert(content.occurrenceId) !== "reverted") onRestoreRefused();
  };
  const openWiki = () => {
    if (content === null) return;
    personCloses(content.occurrenceId);
    // Silence stays suspended until the Wiki surface has come and gone.
    driver.leaveTakeover(content.occurrenceId, "consult");
    onOpenWiki(
      Object.freeze({ canonical: content.canonical, locale: content.termLocale }),
      findMaterialTextElement(content.nodeId),
    );
  };

  if (frame === null || shown === null) return null;
  return (
    <div
      aria-hidden={!present || undefined}
      aria-label={copy.changed(shown.heard, shown.canonical)}
      className="wiki-takeover"
      data-canvas-interactive
      data-presence={frame.stage}
      data-presence-close={frame.close ?? undefined}
      data-wiki-takeover="open"
      inert={!present || undefined}
      onPointerDown={(event) => event.stopPropagation()}
      ref={bubbleRef}
      role="group"
      style={placed
        ? { left: placement.left, top: placement.top, maxWidth: placement.maxWidth } as CSSProperties
        : { visibility: "hidden" }}
    >
      <button
        aria-label={copy.keepLabel(shown.canonical)}
        onClick={present ? keep : undefined}
        ref={keepRef}
        type="button"
      >
        {copy.keep}
      </button>
      <button
        aria-label={copy.restoreLabel(shown.heard)}
        className="wiki-takeover__heard"
        onClick={present ? restore : undefined}
        type="button"
      >
        {shown.heard}
      </button>
      <button
        aria-label={copy.wikiLabel(shown.canonical)}
        onClick={present ? openWiki : undefined}
        type="button"
      >
        {copy.wiki}
      </button>
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
