import {
  createMaterialTextRange,
  normalizeClientRects,
  type ClientTextRect,
} from "../interaction/range-measurement";
import { trackPressedPointers } from "../interaction/pressed-pointers";
import type { WikiOccurrenceView } from "../interaction/wiki-occurrence-driver";
import {
  findMaterialTextElement,
  visualViewportBounds,
} from "../interaction/wiki-occurrence-browser";
import {
  visibleAreaFraction,
  WIKI_OCCURRENCE_PERCEPTION,
} from "../interaction/wiki-occurrence-lifecycle";

/**
 * Render-edge disclosure of committed Wiki occurrences. The source text node
 * stays the single DOM, selection, find, and accessibility owner: the settle
 * is a Custom Highlight veil plus an inert world-space overlay that exists for
 * under 600 ms, and the quiet mark is a second highlight. Nothing here wraps a
 * character or word in an element.
 */

export const WIKI_LEXEME_VEIL = "matter-lexeme-veil";
export const WIKI_APPLIED_MARK = "matter-wiki-applied";

const WIKI_HIGHLIGHT_STYLE_ATTRIBUTE = "data-matter-wiki-highlights";

/**
 * The paint of the two highlights this module registers. Highlight pseudos
 * accept only highlight-legal properties and do not resolve paper custom
 * properties reliably, so each theme names its own ink; the veil hides only
 * the word's glyphs during its settle. The rules live with the registration
 * rather than in the app stylesheet, which the development CSS parser cannot
 * read when it contains `::highlight()`.
 */
export const WIKI_HIGHLIGHT_STYLE_TEXT = [
  `.spatial-thought__text::highlight(${WIKI_APPLIED_MARK}) { text-decoration-line: underline; text-decoration-style: dotted; text-decoration-thickness: 1px; text-decoration-color: rgba(22, 29, 39, .35); text-underline-offset: 3px; }`,
  `.matter-shell[data-canvas-theme="dark"] .spatial-thought__text::highlight(${WIKI_APPLIED_MARK}) { text-decoration-color: rgba(243, 244, 241, .35); }`,
  `.spatial-thought__text::highlight(${WIKI_LEXEME_VEIL}) { color: transparent; -webkit-text-fill-color: transparent; text-shadow: none; text-decoration-color: transparent; }`,
  `@media (forced-colors: active) { .spatial-thought__text::highlight(${WIKI_APPLIED_MARK}) { text-decoration-color: CanvasText; } }`,
].join("\n");

type HighlightStyleHost = Readonly<{
  head: Pick<HTMLHeadElement, "append">;
  createElement: (tagName: "style") => HTMLStyleElement;
  querySelector: (selectors: string) => Element | null;
}>;

/** Installs the highlight paint once per document; later calls are no-ops. */
export function installWikiHighlightStyles(host: HighlightStyleHost): void {
  if (host.querySelector(`style[${WIKI_HIGHLIGHT_STYLE_ATTRIBUTE}]`) !== null) return;
  const style = host.createElement("style");
  style.setAttribute(WIKI_HIGHLIGHT_STYLE_ATTRIBUTE, "");
  style.textContent = WIKI_HIGHLIGHT_STYLE_TEXT;
  host.head.append(style);
}

/** Heard-to-canonical settle; every value is milliseconds from its start. */
export const WIKI_MORPH_TIMELINE = Object.freeze({
  holdMs: 160,
  crossfadeEndMs: 380,
  shiverEndMs: 500,
  totalMs: 580,
  blurPx: 2,
});

/** Underline fallback for wrapped, complex-script, or unmeasurable words. */
export const WIKI_SWEEP_TIMELINE = Object.freeze({
  drawMs: 220,
  fadeMs: 180,
  staggerMs: 80,
});

export const WIKI_DISCLOSURE_GEOMETRY = Object.freeze({
  /** A copy further than this from its Range is not trusted to overlay it. */
  copyTolerancePx: 1,
  ghostWidthRatioMin: 0.8,
  ghostWidthRatioMax: 1.25,
});

/**
 * An interrupted settle counts as disclosure only once the person could have
 * read the change: after the crossfade, or after an underline finished its
 * draw. An earlier interruption leaves the word undisclosed and is retried
 * this many times; after that the word discloses with the static mark alone,
 * as under reduced motion, so its takeover stays reachable.
 */
export const WIKI_DISCLOSURE_RETRIES = 1;

export function interruptedDisclosureCounts(elapsedMs: number, readableAfterMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= readableAfterMs;
}

/** A committed word waits this long so its own arrival can settle first. */
export const WIKI_DISCLOSURE_ARRIVAL_MS = 240;
const DISCLOSURE_CHECK_MS = 200;

export type WikiDisclosureCapabilities = Readonly<{
  highlights: boolean;
  userSelectNone: boolean;
  animations: boolean;
  reducedMotion: boolean;
  forcedColors: boolean;
}>;

export type WikiDisclosurePlan = "morph" | "sweep" | "mark" | "none";

/**
 * Chooses the most faithful disclosure the platform and the word allow.
 * Reduced motion and forced colors keep only the static mark; without Custom
 * Highlight nothing can be veiled or marked, so only the underline can speak.
 */
export function planWikiDisclosure(
  capabilities: WikiDisclosureCapabilities,
  shape: Readonly<{ fragments: number; complexScript: boolean }>,
): WikiDisclosurePlan {
  if (capabilities.reducedMotion || capabilities.forcedColors || !capabilities.animations) {
    return staticWikiDisclosure(capabilities);
  }
  if (!capabilities.highlights || !capabilities.userSelectNone) return "sweep";
  if (shape.complexScript || shape.fragments !== 1) return "sweep";
  return "morph";
}

/**
 * The disclosure without motion: the quiet mark itself. Without Custom
 * Highlight there is no static form, so the word cannot be disclosed at all.
 */
export function staticWikiDisclosure(capabilities: WikiDisclosureCapabilities): WikiDisclosurePlan {
  return capabilities.highlights ? "mark" : "none";
}

// Joining and conjunct-forming scripts reshape across a range edge, so a
// separately painted copy of only the word would not match its glyphs.
const COMPLEX_SHAPING = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Tibetan}\p{Script=Myanmar}\p{Script=Khmer}]/u;

export function requiresUnderlineOnly(...texts: readonly string[]): boolean {
  return texts.some((text) => COMPLEX_SHAPING.test(text));
}

export type WorldRect = Readonly<{ left: number; top: number; width: number; height: number }>;

/**
 * Converts a client rect into the thought element's own untransformed space,
 * so an overlay placed there follows pan and zoom without remeasurement.
 */
export function toWorldRect(
  rect: ClientTextRect,
  host: Readonly<{ left: number; top: number; width: number }>,
  hostLayoutWidth: number,
): WorldRect | null {
  const scale = hostLayoutWidth > 0 ? host.width / hostLayoutWidth : 0;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return Object.freeze({
    left: (rect.x - host.left) / scale,
    top: (rect.y - host.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  });
}

export function copyMatchesRange(copy: ClientTextRect, range: ClientTextRect): boolean {
  const tolerance = WIKI_DISCLOSURE_GEOMETRY.copyTolerancePx;
  return Math.abs(copy.x - range.x) <= tolerance &&
    Math.abs(copy.y - range.y) <= tolerance &&
    Math.abs(copy.width - range.width) <= tolerance &&
    Math.abs(copy.height - range.height) <= tolerance;
}

export function ghostFits(heardWidth: number, canonicalWidth: number): boolean {
  if (!(heardWidth > 0) || !(canonicalWidth > 0)) return false;
  const ratio = heardWidth / canonicalWidth;
  return ratio >= WIKI_DISCLOSURE_GEOMETRY.ghostWidthRatioMin &&
    ratio <= WIKI_DISCLOSURE_GEOMETRY.ghostWidthRatioMax;
}

export function readWikiDisclosureCapabilities(): WikiDisclosureCapabilities {
  const media = (query: string) => typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches;
  const css = typeof CSS === "undefined" ? undefined : CSS;
  return Object.freeze({
    highlights: css !== undefined && "highlights" in css && typeof Highlight === "function",
    userSelectNone: css !== undefined && typeof css.supports === "function" &&
      (css.supports("user-select", "none") || css.supports("-webkit-user-select", "none")),
    animations: typeof Element !== "undefined" && typeof Element.prototype.animate === "function",
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    forcedColors: media("(forced-colors: active)"),
  });
}

export type WikiDisclosureContext = Readonly<{
  /** The committed text of a node, or undefined when it is gone. */
  readText: (nodeId: string) => string | undefined;
  /** Another owner holds the paper: a gesture, a turn, or a covering surface. */
  blocked: boolean;
}>;

export type WikiDisclosureController = Readonly<{
  sync(views: readonly WikiOccurrenceView[], context: WikiDisclosureContext): void;
  /** Ends every running settle at once, keeping the quiet marks. */
  abort(): void;
  dispose(): void;
}>;

type RunningDisclosure = Readonly<{
  stop: () => void;
  startedAtMs: number;
  readableAfterMs: number;
}>;

/**
 * Owns the short-lived resources of disclosure: one scheduling timer while a
 * word waits, the running settles with their observers, and the two shared
 * highlights. `dispose` releases all of them and is idempotent.
 */
export function createWikiDisclosureController(
  onDisclosed: (occurrenceId: string) => void,
  capabilities: WikiDisclosureCapabilities = readWikiDisclosureCapabilities(),
): WikiDisclosureController {
  let views: readonly WikiOccurrenceView[] = Object.freeze([]);
  let context: WikiDisclosureContext = Object.freeze({ readText: () => undefined, blocked: true });
  const running = new Map<string, RunningDisclosure>();
  const veiled = new Map<string, Range>();
  // A word this platform cannot disclose is not retried and so is never
  // perceived. One whose settles kept being cut off early discloses statically.
  const undisclosable = new Set<string>();
  const interruptions = new Map<string, number>();
  const settleExhausted = new Set<string>();
  // Shared with delivery, including recovery from a release never delivered.
  const pressed = trackPressedPointers(window);
  if (capabilities.highlights) installWikiHighlightStyles(document);
  let schedule: number | null = null;
  let markObserver: MutationObserver | null = null;
  let observedList: Element | null = null;
  let markFrame: number | null = null;
  let disposed = false;

  const syncVeil = () => {
    if (!capabilities.highlights) return;
    if (veiled.size === 0) {
      CSS.highlights.delete(WIKI_LEXEME_VEIL);
      return;
    }
    const veil = new Highlight(...veiled.values());
    veil.priority = 2;
    CSS.highlights.set(WIKI_LEXEME_VEIL, veil);
  };

  const syncMarks = () => {
    markFrame = null;
    if (!capabilities.highlights || disposed) return;
    const ranges: Range[] = [];
    for (const view of views) {
      if (!view.disclosed || running.has(view.id)) continue;
      const text = context.readText(view.nodeId);
      const element = findMaterialTextElement(view.nodeId);
      const range = text === undefined || element === null
        ? null
        : createMaterialTextRange(element, text, view.start, view.end);
      if (range !== null) ranges.push(range);
    }
    if (ranges.length === 0) {
      CSS.highlights.delete(WIKI_APPLIED_MARK);
      markObserver?.disconnect();
      markObserver = null;
      observedList = null;
      return;
    }
    const mark = new Highlight(...ranges);
    mark.priority = 1;
    CSS.highlights.set(WIKI_APPLIED_MARK, mark);
    // React may replace a text node (for example when a passage becomes
    // selected); a live Range left behind would collapse and drop the mark.
    const list = document.querySelector(".spatial-thoughts");
    if (list !== observedList && typeof MutationObserver !== "undefined") {
      markObserver?.disconnect();
      markObserver = null;
      observedList = list;
      if (list !== null) {
        markObserver = new MutationObserver(requestMarkSync);
        markObserver.observe(list, { characterData: true, childList: true, subtree: true });
      }
    }
  };

  function requestMarkSync() {
    if (markFrame !== null || disposed) return;
    markFrame = window.requestAnimationFrame(syncMarks);
  }

  const finish = (occurrenceId: string, disclosed: boolean) => {
    const disclosure = running.get(occurrenceId);
    if (disclosure === undefined) return;
    running.delete(occurrenceId);
    disclosure.stop();
    if (disclosed && !disposed) onDisclosed(occurrenceId);
    requestMarkSync();
    // A cut settle left its word waiting; nothing else may re-arm the check
    // until the views change, so the retry would otherwise never come.
    if (!disclosed) arm();
  };

  /** Ends a running settle early; it discloses only if it was readable. */
  const interrupt = (occurrenceId: string) => {
    const disclosure = running.get(occurrenceId);
    if (disclosure === undefined) return;
    const readable = interruptedDisclosureCounts(
      performance.now() - disclosure.startedAtMs,
      disclosure.readableAfterMs,
    );
    if (!readable) {
      const count = (interruptions.get(occurrenceId) ?? 0) + 1;
      interruptions.set(occurrenceId, count);
      if (count > WIKI_DISCLOSURE_RETRIES) settleExhausted.add(occurrenceId);
    }
    finish(occurrenceId, readable);
  };

  const eligible = (view: WikiOccurrenceView, nowMs: number): boolean => {
    if (context.blocked || pressed.isPressed() || document.visibilityState !== "visible") return false;
    if (nowMs - view.admittedAtMs < WIKI_DISCLOSURE_ARRIVAL_MS) return false;
    const element = findMaterialTextElement(view.nodeId);
    const text = context.readText(view.nodeId);
    if (element === null || text === undefined) return false;
    // Another presentation, such as a repair reveal, owns the passage.
    if (element.closest("[data-material-motion]") !== null) return false;
    const range = createMaterialTextRange(element, text, view.start, view.end);
    if (range === null) return false;
    const rects = normalizeClientRects(range.getClientRects());
    return visibleAreaFraction(rects, visualViewportBounds()) >=
      WIKI_OCCURRENCE_PERCEPTION.viewportFraction;
  };

  const start = (view: WikiOccurrenceView) => {
    const element = findMaterialTextElement(view.nodeId);
    const host = element?.closest<HTMLElement>(".spatial-thought") ?? null;
    const text = context.readText(view.nodeId);
    if (element === null || host === null || text === undefined) return;
    const range = createMaterialTextRange(element, text, view.start, view.end);
    if (range === null) return;
    const fragments = normalizeClientRects(range.getClientRects());
    const plan = settleExhausted.has(view.id)
      ? staticWikiDisclosure(capabilities)
      : planWikiDisclosure(capabilities, {
          fragments: fragments.length,
          complexScript: requiresUnderlineOnly(
            text.slice(Math.max(0, view.start - 1), view.end + 1),
            view.sourceText,
          ),
        });
    if (plan === "none") {
      undisclosable.add(view.id);
      return;
    }
    if (plan === "mark") {
      onDisclosed(view.id);
      return;
    }
    const stop = plan === "morph"
      ? playMorph(view, element, host, range, fragments[0]!, {
          veil: (occurrenceId, veilRange) => {
            if (veilRange === null) veiled.delete(occurrenceId);
            else veiled.set(occurrenceId, veilRange);
            syncVeil();
          },
          done: () => finish(view.id, true),
          interrupted: () => interrupt(view.id),
        })
      : null;
    if (stop !== null) {
      running.set(view.id, Object.freeze({
        stop,
        startedAtMs: performance.now(),
        readableAfterMs: WIKI_MORPH_TIMELINE.crossfadeEndMs,
      }));
      return;
    }
    startSweep(view, element, host, range, fragments);
  };

  const startSweep = (
    view: WikiOccurrenceView,
    element: HTMLElement,
    host: HTMLElement,
    range: Range,
    fragments: readonly ClientTextRect[],
  ) => {
    const stop = playSweep(
      element,
      host,
      range,
      fragments,
      () => finish(view.id, true),
      () => interrupt(view.id),
    );
    // Nothing could be drawn, so nothing was disclosed; a later check retries.
    if (stop !== null) {
      running.set(view.id, Object.freeze({
        stop,
        startedAtMs: performance.now(),
        readableAfterMs: WIKI_SWEEP_TIMELINE.drawMs,
      }));
    }
  };

  const check = () => {
    schedule = null;
    if (disposed) return;
    const nowMs = performance.now();
    for (const view of views) {
      if (
        view.disclosed || running.has(view.id) || undisclosable.has(view.id) ||
        !eligible(view, nowMs)
      ) continue;
      start(view);
    }
    arm();
  };

  const arm = () => {
    const waiting = views.some((view) =>
      !view.disclosed && !running.has(view.id) && !undisclosable.has(view.id));
    if (!waiting || schedule !== null || disposed) {
      if (!waiting && schedule !== null) {
        window.clearTimeout(schedule);
        schedule = null;
      }
      return;
    }
    schedule = window.setTimeout(check, DISCLOSURE_CHECK_MS);
  };

  const abort = () => {
    for (const occurrenceId of [...running.keys()]) interrupt(occurrenceId);
  };

  return Object.freeze({
    sync(nextViews, nextContext) {
      if (disposed) return;
      views = nextViews;
      context = nextContext;
      const live = new Set(nextViews.map((view) => view.id));
      for (const occurrenceId of [...running.keys()]) {
        // A settled or censored occurrence leaves at once, without disclosure.
        if (!live.has(occurrenceId)) finish(occurrenceId, false);
      }
      for (const occurrenceId of undisclosable) {
        if (!live.has(occurrenceId)) undisclosable.delete(occurrenceId);
      }
      for (const occurrenceId of interruptions.keys()) {
        if (!live.has(occurrenceId)) interruptions.delete(occurrenceId);
      }
      for (const occurrenceId of settleExhausted) {
        if (!live.has(occurrenceId)) settleExhausted.delete(occurrenceId);
      }
      if (nextContext.blocked) abort();
      requestMarkSync();
      arm();
    },
    abort,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const disclosure of running.values()) disclosure.stop();
      running.clear();
      veiled.clear();
      interruptions.clear();
      settleExhausted.clear();
      if (schedule !== null) window.clearTimeout(schedule);
      schedule = null;
      if (markFrame !== null) window.cancelAnimationFrame(markFrame);
      markFrame = null;
      markObserver?.disconnect();
      markObserver = null;
      observedList = null;
      undisclosable.clear();
      pressed.dispose();
      if (capabilities.highlights) {
        CSS.highlights.delete(WIKI_LEXEME_VEIL);
        CSS.highlights.delete(WIKI_APPLIED_MARK);
      }
    },
  });
}

type MorphCallbacks = Readonly<{
  veil: (occurrenceId: string, range: Range | null) => void;
  done: () => void;
  interrupted: () => void;
}>;

const COPIED_TEXT_PROPERTIES = Object.freeze([
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-feature-settings",
  "font-variation-settings",
  "font-kerning",
  "font-variant-caps",
  "font-variant-east-asian",
  "font-variant-ligatures",
  "font-variant-numeric",
  "font-variant-position",
  "font-variant-alternates",
  "font-optical-sizing",
  "font-synthesis",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-rendering",
  "-webkit-font-smoothing",
  "color",
]);

/**
 * Plays one heard-to-canonical settle and returns its idempotent stop, or null
 * when the canonical copy cannot be trusted to overlay its Range. Any change to
 * the text, its layout or fonts, a touch on the passage, a selection reaching
 * the word, or a hidden page ends it within the same frame.
 */
function playMorph(
  view: WikiOccurrenceView,
  element: HTMLElement,
  host: HTMLElement,
  range: Range,
  rect: ClientTextRect,
  callbacks: MorphCallbacks,
): (() => void) | null {
  const hostRect = host.getBoundingClientRect();
  const world = toWorldRect(rect, hostRect, host.offsetWidth);
  if (world === null) return null;
  const source = range.startContainer.parentElement ?? element;
  const computed = getComputedStyle(source);
  const overlay = document.createElement("span");
  overlay.className = "wiki-lexeme-morph";
  overlay.setAttribute("aria-hidden", "true");
  overlay.inert = true;
  overlay.style.left = `${world.left}px`;
  overlay.style.top = `${world.top}px`;
  overlay.style.width = `${world.width}px`;
  overlay.style.height = `${world.height}px`;
  const lang = element.closest("[lang]")?.getAttribute("lang");
  if (lang) overlay.lang = lang;
  const canonical = document.createElement("span");
  const heard = document.createElement("span");
  canonical.className = "wiki-lexeme-morph__form";
  heard.className = "wiki-lexeme-morph__form";
  canonical.textContent = view.canonicalText;
  heard.textContent = view.sourceText;
  for (const form of [canonical, heard]) {
    for (const property of COPIED_TEXT_PROPERTIES) {
      form.style.setProperty(property, computed.getPropertyValue(property));
    }
    form.style.lineHeight = `${world.height}px`;
  }
  overlay.append(heard, canonical);
  host.append(overlay);

  const canonicalRect = normalizeClientRects([canonical.getBoundingClientRect()])[0];
  if (canonicalRect === undefined || !copyMatchesRange(canonicalRect, rect)) {
    overlay.remove();
    return null;
  }
  const heardWidth = heard.getBoundingClientRect().width;
  const withGhost = ghostFits(heardWidth, canonicalRect.width);
  if (withGhost) {
    heard.style.left = `${(world.width - heardWidth * (world.width / rect.width)) / 2}px`;
  } else {
    heard.remove();
  }

  let stopped = false;
  const animations: Animation[] = [];
  let unveilTimer: number | null = null;
  const observers: { disconnect(): void }[] = [];
  const removeListeners: (() => void)[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (unveilTimer !== null) window.clearTimeout(unveilTimer);
    for (const animation of animations) animation.cancel();
    for (const observer of observers) observer.disconnect();
    for (const remove of removeListeners) remove();
    callbacks.veil(view.id, null);
    overlay.remove();
  };
  const abort = () => {
    if (!stopped) callbacks.interrupted();
  };

  watchDisclosureAbort(element, host, range, abort, observers, removeListeners);
  callbacks.veil(view.id, range);
  const timeline = WIKI_MORPH_TIMELINE;
  const at = (milliseconds: number) => milliseconds / timeline.totalMs;
  const blur = (pixels: number) => `blur(${pixels}px)`;
  if (withGhost) {
    animations.push(heard.animate([
      { offset: 0, opacity: 1, filter: blur(0) },
      { offset: at(timeline.holdMs), opacity: 1, filter: blur(0), easing: "cubic-bezier(.4,0,.2,1)" },
      { offset: at(timeline.crossfadeEndMs), opacity: 0, filter: blur(timeline.blurPx) },
      { offset: 1, opacity: 0, filter: blur(timeline.blurPx) },
    ], { duration: timeline.totalMs, fill: "both" }));
  }
  animations.push(canonical.animate([
    withGhost
      ? { offset: 0, opacity: 0, filter: blur(timeline.blurPx), transform: "translateX(0)" }
      : { offset: 0, opacity: 1, filter: blur(0), transform: "translateX(0)" },
    withGhost
      ? {
          offset: at(timeline.holdMs),
          opacity: 0,
          filter: blur(timeline.blurPx),
          transform: "translateX(0)",
          easing: "cubic-bezier(.4,0,.2,1)",
        }
      : { offset: at(timeline.holdMs), opacity: 1, filter: blur(0), transform: "translateX(0)" },
    ...(withGhost ? [] : [{
      offset: at((timeline.holdMs + timeline.crossfadeEndMs) / 2),
      opacity: 0.55,
      filter: blur(timeline.blurPx * 0.75),
      transform: "translateX(0)",
    }]),
    { offset: at(timeline.crossfadeEndMs), opacity: 1, filter: blur(0), transform: "translateX(0)" },
    { offset: at(timeline.crossfadeEndMs + 40), opacity: 1, filter: blur(0), transform: "translateX(.75px)" },
    { offset: at(timeline.crossfadeEndMs + 80), opacity: 1, filter: blur(0), transform: "translateX(-.5px)" },
    { offset: at(timeline.shiverEndMs), opacity: 1, filter: blur(0), transform: "translateX(0)" },
    { offset: 1, opacity: 0, filter: blur(0), transform: "translateX(0)" },
  ], { duration: timeline.totalMs, fill: "both" }));
  unveilTimer = window.setTimeout(() => {
    unveilTimer = null;
    // The real glyphs return beneath an identical copy, which then fades.
    callbacks.veil(view.id, null);
  }, timeline.shiverEndMs);
  void animations.at(-1)!.finished.then(
    () => {
      if (!stopped) callbacks.done();
    },
    () => undefined,
  );
  return stop;
}

/**
 * The underline fallback: one 1 px bar per line fragment, drawn from the line
 * start in the passage's direction, staggered across wrapped lines. It never
 * copies glyphs, so it is safe for any script.
 */
function playSweep(
  element: HTMLElement,
  host: HTMLElement,
  range: Range,
  fragments: readonly ClientTextRect[],
  done: () => void,
  interrupted: () => void,
): (() => void) | null {
  if (typeof Element.prototype.animate !== "function" || fragments.length === 0) return null;
  const hostRect = host.getBoundingClientRect();
  const rtl = getComputedStyle(element).direction === "rtl";
  const color = getComputedStyle(element).color;
  const bars: HTMLElement[] = [];
  const animations: Animation[] = [];
  const timeline = WIKI_SWEEP_TIMELINE;
  fragments.forEach((fragment, index) => {
    const world = toWorldRect(fragment, hostRect, host.offsetWidth);
    if (world === null) return;
    const bar = document.createElement("span");
    bar.className = "wiki-lexeme-sweep";
    bar.setAttribute("aria-hidden", "true");
    bar.style.left = `${world.left}px`;
    bar.style.top = `${world.top + world.height - 1}px`;
    bar.style.width = `${world.width}px`;
    bar.style.background = color;
    bar.style.transformOrigin = rtl ? "right center" : "left center";
    host.append(bar);
    bars.push(bar);
    animations.push(bar.animate([
      { offset: 0, transform: "scaleX(0)", opacity: 0.5 },
      {
        offset: timeline.drawMs / (timeline.drawMs + timeline.fadeMs),
        transform: "scaleX(1)",
        opacity: 0.5,
      },
      { offset: 1, transform: "scaleX(1)", opacity: 0 },
    ], {
      delay: index * timeline.staggerMs,
      duration: timeline.drawMs + timeline.fadeMs,
      easing: "cubic-bezier(.2,.75,.2,1)",
      fill: "both",
    }));
  });
  if (animations.length === 0) return null;
  let stopped = false;
  const observers: { disconnect(): void }[] = [];
  const removeListeners: (() => void)[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const animation of animations) animation.cancel();
    for (const observer of observers) observer.disconnect();
    for (const remove of removeListeners) remove();
    for (const bar of bars) bar.remove();
  };
  watchDisclosureAbort(element, host, range, () => {
    if (!stopped) interrupted();
  }, observers, removeListeners);
  void Promise.all(animations.map((animation) => animation.finished)).then(
    () => {
      if (!stopped) done();
    },
    () => undefined,
  );
  return stop;
}

function watchDisclosureAbort(
  element: HTMLElement,
  host: HTMLElement,
  range: Range,
  abort: () => void,
  observers: { disconnect(): void }[],
  removeListeners: (() => void)[],
): void {
  const text = element.textContent;
  if (typeof MutationObserver !== "undefined") {
    const mutations = new MutationObserver(() => {
      if (element.textContent !== text || !element.isConnected) abort();
    });
    mutations.observe(element, { characterData: true, childList: true, subtree: true });
    observers.push(mutations);
  }
  if (typeof ResizeObserver !== "undefined") {
    let initial = true;
    const resize = new ResizeObserver(() => {
      if (initial) {
        initial = false;
        return;
      }
      abort();
    });
    resize.observe(element);
    observers.push(resize);
  }
  const listen = <K extends keyof DocumentEventMap>(
    target: Document | Window,
    type: K | "pointerdown" | "loadingdone",
    handler: (event: Event) => void,
    capture = false,
  ) => {
    target.addEventListener(type, handler, capture);
    removeListeners.push(() => target.removeEventListener(type, handler, capture));
  };
  listen(window, "pointerdown", (event) => {
    if (event.target instanceof Node && host.contains(event.target)) abort();
  }, true);
  listen(document, "visibilitychange", () => {
    if (document.visibilityState !== "visible") abort();
  });
  listen(document, "selectionchange", () => {
    const selection = document.getSelection();
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return;
    for (let index = 0; index < selection.rangeCount; index += 1) {
      try {
        if (selection.getRangeAt(index).intersectsNode(element) &&
            rangesTouch(selection.getRangeAt(index), range)) {
          abort();
          return;
        }
      } catch {
        abort();
        return;
      }
    }
  });
  const fonts = document.fonts as FontFaceSet | undefined;
  if (fonts !== undefined && typeof fonts.addEventListener === "function") {
    const onFonts = () => abort();
    fonts.addEventListener("loadingdone", onFonts);
    removeListeners.push(() => fonts.removeEventListener("loadingdone", onFonts));
  }
}

/** Whether two ranges overlap or meet: left starts before right ends and ends after it starts. */
function rangesTouch(left: Range, right: Range): boolean {
  return left.compareBoundaryPoints(Range.END_TO_START, right) <= 0 &&
    left.compareBoundaryPoints(Range.START_TO_END, right) >= 0;
}
