export type TypographyMeasurementTuple = Readonly<{
  borderBlockEndWidth: string;
  borderBlockStartWidth: string;
  borderInlineEndWidth: string;
  borderInlineStartWidth: string;
  boxSizing: string;
  direction: string;
  fontFamily: string;
  fontFeatureSettings: string;
  fontKerning: string;
  fontOpticalSizing: string;
  fontSizeAdjust: string;
  fontSize: string;
  fontStyle: string;
  fontStretch: string;
  fontSynthesis: string;
  fontVariant: string;
  fontVariationSettings: string;
  fontWeight: string;
  hyphenateCharacter: string;
  hyphenateLimitChars: string;
  hyphens: string;
  letterSpacing: string;
  lineBreak: string;
  lineHeight: string;
  overflowWrap: string;
  paddingBlockEnd: string;
  paddingBlockStart: string;
  paddingInlineEnd: string;
  paddingInlineStart: string;
  tabSize: string;
  textAlign: string;
  textAutospace: string;
  textIndent: string;
  textOrientation: string;
  textRendering: string;
  textSpacingTrim: string;
  textTransform: string;
  textWrap: string;
  textWrapMode: string;
  textWrapStyle: string;
  whiteSpaceCollapse: string;
  whiteSpace: string;
  width: string;
  wordSpacing: string;
  wordBreak: string;
  writingMode: string;
}>;

export type TypographyMeasurementInput = Readonly<{
  columnWidthPx: number;
  dir: "ltr" | "rtl";
  fontEpoch: string;
  grammarVersion: string;
  locale: string;
  root: boolean;
  text: string;
  typography: TypographyMeasurementTuple;
}>;

export type TypographyMeasurementInvalidation =
  | "column-width"
  | "direction"
  | "document"
  | "font"
  | "locale"
  | "theme"
  | "typography"
  | "viewport";

export type TypographyMeasurementCandidate = "one-shot" | 16 | 32 | 64 | 128;

export type TypographyMeasurementBatchReceipt = Readonly<{
  cleanupDurationMs: number;
  durationMs: number;
  heapAfterReadBytes: number | null;
  replicaCount: number;
  readDurationMs: number;
  writeDurationMs: number;
}>;

export type TypographyMeasurementReceipt = Readonly<{
  batchReceipts: readonly TypographyMeasurementBatchReceipt[];
  cacheHits: number;
  candidate: TypographyMeasurementCandidate;
  heapEndBytes: number | null;
  heapPeakBytes: number | null;
  heapStartBytes: number | null;
  heights: readonly number[];
  keyCount: number;
  maxBatchDurationMs: number;
  owner: Readonly<{
    ariaHidden: boolean;
    inert: boolean;
    offscreen: boolean;
    removedAfterMeasurement: boolean;
    semanticPath: "ol>li>button.spatial-thought__text";
  }>;
  peakDomNodes: number;
  synchronousDurationMs: number;
  uniqueMisses: number;
}>;

type PerformanceWithMemory = Performance & Readonly<{
  memory?: Readonly<{ usedJSHeapSize?: number }>;
}>;

/**
 * Phase B research authority only. The fixed tuple order is part of the cache
 * contract: no style field may be omitted merely because it usually inherits.
 */
export function createTypographyMeasurementKey(input: TypographyMeasurementInput): string {
  assertMeasurementInput(input);
  const { typography } = input;
  return JSON.stringify([
    input.text,
    input.root,
    input.columnWidthPx,
    input.grammarVersion,
    typography.boxSizing,
    typography.width,
    typography.paddingBlockStart,
    typography.paddingBlockEnd,
    typography.paddingInlineStart,
    typography.paddingInlineEnd,
    typography.borderBlockStartWidth,
    typography.borderBlockEndWidth,
    typography.borderInlineStartWidth,
    typography.borderInlineEndWidth,
    typography.fontFamily,
    typography.fontSize,
    typography.fontStyle,
    typography.fontWeight,
    typography.fontStretch,
    typography.fontKerning,
    typography.fontOpticalSizing,
    typography.fontSizeAdjust,
    typography.fontFeatureSettings,
    typography.fontVariationSettings,
    typography.fontVariant,
    typography.fontSynthesis,
    typography.lineHeight,
    typography.letterSpacing,
    typography.wordSpacing,
    typography.whiteSpace,
    typography.whiteSpaceCollapse,
    typography.wordBreak,
    typography.overflowWrap,
    typography.lineBreak,
    typography.hyphens,
    typography.hyphenateCharacter,
    typography.hyphenateLimitChars,
    typography.textWrap,
    typography.textWrapMode,
    typography.textWrapStyle,
    typography.textAlign,
    typography.textIndent,
    typography.textTransform,
    typography.textRendering,
    typography.textAutospace,
    typography.textSpacingTrim,
    typography.tabSize,
    typography.writingMode,
    typography.textOrientation,
    typography.direction,
    input.fontEpoch,
    input.dir,
    input.locale,
  ]);
}

/** A scalar-only research cache. Production owns no instance of this ledger. */
export class TypographyMeasurementLedger {
  readonly #heights = new Map<string, number>();
  readonly #invalidations: TypographyMeasurementInvalidation[] = [];
  #generation = 0;

  get generation(): number {
    return this.#generation;
  }

  get invalidations(): readonly TypographyMeasurementInvalidation[] {
    return Object.freeze([...this.#invalidations]);
  }

  get size(): number {
    return this.#heights.size;
  }

  get(key: string): number | undefined {
    return this.#heights.get(key);
  }

  set(key: string, heightPx: number): void {
    if (!Number.isFinite(heightPx) || heightPx < 0) {
      throw new TypeError("Typography height must be a finite non-negative scalar.");
    }
    this.#heights.set(key, heightPx);
  }

  invalidate(reason: TypographyMeasurementInvalidation): void {
    this.#generation += 1;
    this.#invalidations.push(reason);
    this.#heights.clear();
  }
}

/** Captures the height and wrap authority before replicas are written. */
export function captureTypographyMeasurementTuple(
  computed: CSSStyleDeclaration,
): TypographyMeasurementTuple {
  return Object.freeze({
    borderBlockEndWidth: computed.borderBlockEndWidth,
    borderBlockStartWidth: computed.borderBlockStartWidth,
    borderInlineEndWidth: computed.borderInlineEndWidth,
    borderInlineStartWidth: computed.borderInlineStartWidth,
    boxSizing: computed.boxSizing,
    direction: computed.direction,
    fontFamily: computed.fontFamily,
    fontFeatureSettings: computed.fontFeatureSettings,
    fontKerning: computed.fontKerning,
    fontOpticalSizing: computed.fontOpticalSizing,
    fontSize: computed.fontSize,
    fontSizeAdjust: computed.fontSizeAdjust,
    fontStretch: computed.fontStretch,
    fontStyle: computed.fontStyle,
    fontSynthesis: computed.fontSynthesis,
    fontVariant: computed.fontVariant,
    fontVariationSettings: computed.fontVariationSettings,
    fontWeight: computed.fontWeight,
    hyphenateCharacter: computed.getPropertyValue("hyphenate-character"),
    hyphenateLimitChars: computed.getPropertyValue("hyphenate-limit-chars"),
    hyphens: computed.hyphens,
    letterSpacing: computed.letterSpacing,
    lineBreak: computed.getPropertyValue("line-break"),
    lineHeight: computed.lineHeight,
    overflowWrap: computed.overflowWrap,
    paddingBlockEnd: computed.paddingBlockEnd,
    paddingBlockStart: computed.paddingBlockStart,
    paddingInlineEnd: computed.paddingInlineEnd,
    paddingInlineStart: computed.paddingInlineStart,
    tabSize: computed.tabSize,
    textAlign: computed.textAlign,
    textAutospace: computed.getPropertyValue("text-autospace"),
    textIndent: computed.textIndent,
    textOrientation: computed.textOrientation,
    textRendering: computed.textRendering,
    textSpacingTrim: computed.getPropertyValue("text-spacing-trim"),
    textTransform: computed.textTransform,
    textWrap: computed.getPropertyValue("text-wrap"),
    textWrapMode: computed.getPropertyValue("text-wrap-mode"),
    textWrapStyle: computed.getPropertyValue("text-wrap-style"),
    whiteSpace: computed.whiteSpace,
    whiteSpaceCollapse: computed.getPropertyValue("white-space-collapse"),
    width: computed.width,
    wordBreak: computed.wordBreak,
    wordSpacing: computed.wordSpacing,
    writingMode: computed.writingMode,
  });
}

/**
 * Measures all cache misses synchronously. A bounded candidate changes peak DOM
 * only: it never yields between batches and therefore cannot disguise a long task.
 */
export function measureTypographyWithDom(input: Readonly<{
  candidate: TypographyMeasurementCandidate;
  document: Document;
  items: readonly TypographyMeasurementInput[];
  ledger: TypographyMeasurementLedger;
  performance?: Performance;
}>): TypographyMeasurementReceipt {
  const view = input.document.defaultView;
  if (view === null) throw new Error("A browser document with a live view is required.");
  const clock = input.performance ?? view.performance;
  if (!["one-shot", 16, 32, 64, 128].includes(input.candidate)) {
    throw new TypeError("Unknown typography measurement candidate.");
  }
  const startedAt = clock.now();
  const heapStartBytes = readHeapBytes(clock);
  const keys = input.items.map(createTypographyMeasurementKey);
  const missByKey = new Map<string, TypographyMeasurementInput>();
  let cacheHits = 0;
  for (let index = 0; index < input.items.length; index += 1) {
    const key = keys[index]!;
    if (input.ledger.get(key) !== undefined || missByKey.has(key)) {
      cacheHits += 1;
      continue;
    }
    missByKey.set(key, input.items[index]!);
  }

  const misses = Array.from(missByKey, ([key, item]) => ({ item, key }));
  const stagedHeights = new Map<string, number>();
  const batchSize = input.candidate === "one-shot" ? Math.max(1, misses.length) : input.candidate;
  const batchReceipts: TypographyMeasurementBatchReceipt[] = [];
  let heapPeakBytes = heapStartBytes;
  let peakDomNodes = 0;
  let ownerProof: TypographyMeasurementReceipt["owner"] = Object.freeze({
    ariaHidden: true,
    inert: true,
    offscreen: true,
    removedAfterMeasurement: true,
    semanticPath: "ol>li>button.spatial-thought__text",
  });

  if (misses.length > 0) {
    const owner = createOffscreenOwner(input.document);
    input.document.body.append(owner);
    const validatedTypography = new Set<string>();
    try {
      for (let start = 0; start < misses.length; start += batchSize) {
        const batchStartedAt = clock.now();
        const batch = misses.slice(start, start + batchSize);
        const fragment = input.document.createDocumentFragment();
        const buttons: HTMLButtonElement[] = [];
        for (const { item } of batch) {
          const listItem = input.document.createElement("li");
          listItem.className = "spatial-thought";
          listItem.style.setProperty("--matter-column-width", `${item.columnWidthPx}px`);
          if (!item.root) listItem.dataset.parentId = "phase-b-parent";
          const button = input.document.createElement("button");
          button.className = "spatial-thought__text";
          button.dir = item.dir;
          button.lang = item.locale;
          button.textContent = item.text;
          applyTypography(button, item.typography);
          listItem.append(button);
          fragment.append(listItem);
          buttons.push(button);
        }
        owner.append(fragment);
        const writesFinishedAt = clock.now();
        peakDomNodes = Math.max(peakDomNodes, 1 + owner.querySelectorAll("*").length);
        heapPeakBytes = maximumNullable(heapPeakBytes, readHeapBytes(clock));

        for (let offset = 0; offset < buttons.length; offset += 1) {
          const expected = batch[offset]!.item.typography;
          const expectedKey = JSON.stringify(expected);
          const validationKey = JSON.stringify([
            expectedKey,
            batch[offset]!.item.columnWidthPx,
          ]);
          if (validatedTypography.has(validationKey)) continue;
          const actual = captureTypographyMeasurementTuple(
            view.getComputedStyle(buttons[offset]!),
          );
          const actualWidthPx = Number.parseFloat(actual.width);
          if (
            !Number.isFinite(actualWidthPx) ||
            Math.abs(actualWidthPx - batch[offset]!.item.columnWidthPx) > 0.5
          ) {
            throw new Error("The measured column width disagrees with its scalar authority.");
          }
          if (JSON.stringify(actual) !== expectedKey) {
            throw new Error("The production typography grammar changed during measurement.");
          }
          validatedTypography.add(validationKey);
        }
        const heights = buttons.map((button) => button.offsetHeight);
        const readsFinishedAt = clock.now();
        for (let offset = 0; offset < batch.length; offset += 1) {
          stagedHeights.set(batch[offset]!.key, heights[offset]!);
        }
        heapPeakBytes = maximumNullable(heapPeakBytes, readHeapBytes(clock));
        owner.replaceChildren();
        const cleanupFinishedAt = clock.now();
        batchReceipts.push(Object.freeze({
          cleanupDurationMs: cleanupFinishedAt - readsFinishedAt,
          durationMs: cleanupFinishedAt - batchStartedAt,
          heapAfterReadBytes: readHeapBytes(clock),
          replicaCount: batch.length,
          readDurationMs: readsFinishedAt - writesFinishedAt,
          writeDurationMs: writesFinishedAt - batchStartedAt,
        }));
      }
    } finally {
      owner.remove();
      ownerProof = Object.freeze({
        ariaHidden: owner.getAttribute("aria-hidden") === "true",
        inert: owner.inert && owner.hasAttribute("inert"),
        offscreen: owner.style.left.startsWith("-"),
        removedAfterMeasurement: !owner.isConnected,
        semanticPath: "ol>li>button.spatial-thought__text",
      });
    }
  }

  // A late grammar mismatch must not leave a partially valid epoch in cache.
  for (const [key, height] of stagedHeights) input.ledger.set(key, height);

  const heights = keys.map((key) => {
    const height = input.ledger.get(key);
    if (height === undefined) throw new Error("A typography measurement was not settled.");
    return height;
  });
  const synchronousDurationMs = clock.now() - startedAt;
  return Object.freeze({
    batchReceipts: Object.freeze(batchReceipts),
    cacheHits,
    candidate: input.candidate,
    heapEndBytes: readHeapBytes(clock),
    heapPeakBytes,
    heapStartBytes,
    heights: Object.freeze(heights),
    keyCount: keys.length,
    maxBatchDurationMs: batchReceipts.reduce(
      (maximum, receipt) => Math.max(maximum, receipt.durationMs),
      0,
    ),
    owner: ownerProof,
    peakDomNodes,
    synchronousDurationMs,
    uniqueMisses: misses.length,
  });
}

function createOffscreenOwner(document: Document): HTMLOListElement {
  const owner = document.createElement("ol");
  owner.className = "spatial-thoughts";
  owner.dataset.typographyDomBench = "true";
  owner.setAttribute("aria-hidden", "true");
  owner.inert = true;
  Object.assign(owner.style, {
    contain: "layout style paint",
    height: "0",
    left: "-100000px",
    overflow: "hidden",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    visibility: "hidden",
    width: "0",
  });
  return owner;
}

function applyTypography(
  element: HTMLElement,
  typography: TypographyMeasurementTuple,
): void {
  // The real class grammar must retain unitless line-height and clamp precision.
  // Phase B varies only the face; the complete computed tuple is validated after
  // mount and remains part of the cache key.
  element.style.fontFamily = typography.fontFamily;
}

function assertMeasurementInput(input: TypographyMeasurementInput): void {
  if (!Number.isFinite(input.columnWidthPx) || input.columnWidthPx <= 0) {
    throw new TypeError("Typography column width must be a finite positive scalar.");
  }
  if (input.fontEpoch.length === 0) {
    throw new TypeError("Typography measurements require a document.fonts epoch.");
  }
  if (input.grammarVersion.length === 0) {
    throw new TypeError("Typography measurements require a production grammar version.");
  }
  if (input.locale.length === 0) {
    throw new TypeError("Typography measurements require a locale.");
  }
  if (input.dir !== input.typography.direction) {
    throw new TypeError("Typography direction must agree with the element dir authority.");
  }
}

function readHeapBytes(performance: Performance): number | null {
  const value = (performance as PerformanceWithMemory).memory?.usedJSHeapSize;
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function maximumNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}
