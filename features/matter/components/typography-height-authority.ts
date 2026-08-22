"use client";

import {
  TypographyHeightLedger,
  type TypographyHeightAuthorityToken,
} from "../layout/typography-height-ledger";

export const TYPOGRAPHY_HEIGHT_BATCH_SIZE = 32;

export type TypographyHeightTuple = Readonly<{
  aspectRatio: string;
  borderBlockEndWidth: string;
  borderBlockStartWidth: string;
  borderInlineEndWidth: string;
  borderInlineStartWidth: string;
  boxDecorationBreak: string;
  boxSizing: string;
  contain: string;
  contentVisibility: string;
  display: string;
  direction: string;
  fontFamily: string;
  fontFeatureSettings: string;
  fontKerning: string;
  fontLanguageOverride: string;
  fontOpticalSizing: string;
  fontPalette: string;
  fontSize: string;
  fontSizeAdjust: string;
  fontStretch: string;
  fontStyle: string;
  fontSynthesis: string;
  fontVariant: string;
  fontVariantCaps: string;
  fontVariantEastAsian: string;
  fontVariantLigatures: string;
  fontVariantNumeric: string;
  fontVariantPosition: string;
  fontVariationSettings: string;
  fontWeight: string;
  hyphenateCharacter: string;
  hyphenateLimitChars: string;
  hyphens: string;
  letterSpacing: string;
  lineBreak: string;
  lineClamp: string;
  lineHeight: string;
  marginBlockEnd: string;
  marginBlockStart: string;
  marginInlineEnd: string;
  marginInlineStart: string;
  maxBlockSize: string;
  maxHeight: string;
  minBlockSize: string;
  minHeight: string;
  overflowWrap: string;
  overflowX: string;
  overflowY: string;
  paddingBlockEnd: string;
  paddingBlockStart: string;
  paddingInlineEnd: string;
  paddingInlineStart: string;
  tabSize: string;
  textAlign: string;
  textAutospace: string;
  textIndent: string;
  textEmphasisPosition: string;
  textEmphasisStyle: string;
  textOrientation: string;
  textRendering: string;
  textSizeAdjust: string;
  textSpacingTrim: string;
  textTransform: string;
  textWrap: string;
  textWrapMode: string;
  textWrapStyle: string;
  unicodeBidi: string;
  verticalAlign: string;
  webkitLineClamp: string;
  webkitTextSizeAdjust: string;
  whiteSpace: string;
  whiteSpaceCollapse: string;
  width: string;
  wordBreak: string;
  wordSpacing: string;
  writingMode: string;
  zoom: string;
}>;

export type TypographyHeightItem = Readonly<{
  columnWidthPx: number;
  dir: "ltr" | "rtl";
  locale: string;
  nodeId: string;
  root: boolean;
  text: string;
}>;

export type TypographyHeightSnapshot = Readonly<{
  basis: TypographyHeightAuthorityToken;
  heights: readonly number[];
  keys: readonly string[];
  nodeIds: readonly string[];
}>;

export type TypographyAuthorityContext = Readonly<{
  dir: "ltr" | "rtl";
  documentEpoch: number;
  grammarEpoch: number;
  locale: string;
  styleEpoch: number;
}>;

export type TypographyAuthorityInvalidationReason =
  | "font-loading"
  | "font-settled";

type FontFaceSetLike = EventTarget & Readonly<{ status?: string }>;

type IssuedTypographyTuples = Readonly<{
  child: TypographyHeightTuple;
  columnWidthPx: number;
  root: TypographyHeightTuple;
}>;

/**
 * Rendering-edge owner for exact browser text heights. It owns only disposable
 * probes, font/style generations and a bounded scalar cache; tree and world
 * geometry never enter this object.
 */
export class TypographyHeightAuthority {
  readonly #container: HTMLElement;
  readonly #document: Document;
  readonly #fonts: FontFaceSetLike | null;
  readonly #ledger: TypographyHeightLedger;
  readonly #tokenTuples = new WeakMap<object, IssuedTypographyTuples>();
  readonly #probeOwner: HTMLOListElement;
  readonly #rootProbe: HTMLButtonElement;
  readonly #childProbe: HTMLButtonElement;
  readonly #onInvalidated: ((reason: TypographyAuthorityInvalidationReason) => void) | null;
  #context: TypographyAuthorityContext;
  #destroyed = false;
  #fontEpoch = 0;
  #fontLoading = false;

  constructor(input: Readonly<{
    container: HTMLElement;
    context: TypographyAuthorityContext;
    document: Document;
    fontFaceSet?: FontFaceSetLike | null;
    limit?: number;
    onInvalidated?: (reason: TypographyAuthorityInvalidationReason) => void;
  }>) {
    assertContext(input.context);
    if (input.document.defaultView === null) {
      throw new Error("Typography authority requires a browser document with a live view.");
    }
    if (input.container.ownerDocument !== input.document) {
      throw new Error("Typography authority probes must share the measured document.");
    }
    this.#container = input.container;
    this.#document = input.document;
    this.#context = Object.freeze({ ...input.context });
    this.#onInvalidated = input.onInvalidated ?? null;
    this.#ledger = new TypographyHeightLedger(input.limit);
    const probes = createProbeOwner(input.document, input.context);
    this.#probeOwner = probes.owner;
    this.#rootProbe = probes.root;
    this.#childProbe = probes.child;
    input.container.append(probes.owner);

    const fonts = input.fontFaceSet === undefined
      ? readFontFaceSet(input.document)
      : input.fontFaceSet;
    this.#fonts = fonts;
    this.#fontLoading = fonts?.status === "loading";
    fonts?.addEventListener("loading", this.#onFontLoading);
    fonts?.addEventListener("loadingdone", this.#onFontSettled);
    fonts?.addEventListener("loadingerror", this.#onFontSettled);
  }

  get cacheLimit(): number {
    return this.#ledger.limit;
  }

  get cacheSize(): number {
    return this.#ledger.size;
  }

  get fontEpoch(): number {
    return this.#fontEpoch;
  }

  get probeConnected(): boolean {
    return this.#probeOwner.isConnected;
  }

  setContext(next: TypographyAuthorityContext): void {
    this.#assertLive();
    assertContext(next);
    if (sameContext(this.#context, next)) return;
    this.#context = Object.freeze({ ...next });
    this.#rootProbe.dir = next.dir;
    this.#rootProbe.lang = next.locale;
    this.#childProbe.dir = next.dir;
    this.#childProbe.lang = next.locale;
    this.#ledger.invalidate();
  }

  begin(projectionKey: string): TypographyHeightAuthorityToken | null {
    this.#assertLive();
    if (projectionKey.length === 0) throw new TypeError("Typography authority requires a projection key.");
    if (this.#synchronizeFontLoading()) return null;
    if (!this.#container.isConnected || !this.#probeOwner.isConnected) return null;
    const view = this.#document.defaultView;
    if (view === null) return null;
    const token = this.#ledger.begin({
      documentEpoch: this.#context.documentEpoch,
      fontEpoch: this.#fontEpoch,
      grammarEpoch: this.#context.grammarEpoch,
      projectionKey,
      styleEpoch: this.#context.styleEpoch,
    });
    const child = captureTypographyHeightTuple(view.getComputedStyle(this.#childProbe));
    const root = captureTypographyHeightTuple(view.getComputedStyle(this.#rootProbe));
    const childWidth = readTupleWidth(child);
    const rootWidth = readTupleWidth(root);
    if (Math.abs(childWidth - rootWidth) > .5) {
      this.#ledger.invalidate();
      return null;
    }
    this.#tokenTuples.set(token, Object.freeze({
      child,
      columnWidthPx: rootWidth,
      root,
    }));
    return token;
  }

  isCurrent(token: TypographyHeightAuthorityToken): boolean {
    if (this.#destroyed || this.#synchronizeFontLoading()) return false;
    if (!this.#ledger.isCurrent(token) || !this.#container.isConnected ||
      !this.#probeOwner.isConnected) return false;
    if (token.documentEpoch !== this.#context.documentEpoch ||
      token.fontEpoch !== this.#fontEpoch ||
      token.grammarEpoch !== this.#context.grammarEpoch ||
      token.styleEpoch !== this.#context.styleEpoch) return false;
    const issued = this.#tokenTuples.get(token);
    const view = this.#document.defaultView;
    if (issued === undefined || view === null) return false;
    const liveRoot = captureTypographyHeightTuple(view.getComputedStyle(this.#rootProbe));
    const liveChild = captureTypographyHeightTuple(view.getComputedStyle(this.#childProbe));
    if (sameTuple(liveRoot, issued.root) && sameTuple(liveChild, issued.child)) return true;
    this.#ledger.invalidate();
    return false;
  }

  measure(input: Readonly<{
    batchSize: 32 | 64 | 128;
    items: readonly TypographyHeightItem[];
    token: TypographyHeightAuthorityToken;
  }>): TypographyHeightSnapshot | null {
    this.#assertLive();
    if (!this.isCurrent(input.token)) return null;
    if (!this.#container.isConnected || !this.#probeOwner.isConnected) return null;
    const view = this.#document.defaultView;
    if (view === null) return null;
    const issuedTuples = this.#tokenTuples.get(input.token);
    if (issuedTuples === undefined) return null;
    for (const item of input.items) {
      assertItem(item);
      if (item.dir !== this.#context.dir || item.locale !== this.#context.locale) {
        throw new Error("Typography item language disagrees with its epoch authority.");
      }
      if (Math.abs(item.columnWidthPx - issuedTuples.columnWidthPx) > .5) {
        throw new Error("Typography item width disagrees with its epoch authority.");
      }
    }
    const rootTuple = issuedTuples.root;
    const childTuple = issuedTuples.child;
    const keys = input.items.map((item) => createTypographyHeightKey(
      item,
      item.root ? "root" : "child",
      input.token,
    ));
    const staged = new Map<string, number>();
    const accessedKeys: string[] = [];
    const misses = new Map<string, TypographyHeightItem>();
    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index]!;
      const key = keys[index]!;
      if (this.#ledger.peek(input.token, key) !== undefined) {
        accessedKeys.push(key);
      } else if (!misses.has(key)) {
        misses.set(key, item);
      }
    }
    if (new Set(keys).size > this.#ledger.limit) {
      throw new RangeError("Typography request exceeds the owner cache limit.");
    }

    if (misses.size > 0) {
      const owner = createMeasurementOwner(this.#document);
      this.#container.append(owner);
      try {
        const pending = Array.from(misses, ([key, item]) => ({ item, key }));
        const validatedGroups = new Set<string>();
        for (let start = 0; start < pending.length; start += input.batchSize) {
          if (!this.#ledger.isCurrent(input.token) || this.#fontLoading) return null;
          const batch = pending.slice(start, start + input.batchSize);
          const fragment = this.#document.createDocumentFragment();
          const buttons: HTMLButtonElement[] = [];
          for (const { item } of batch) {
            const row = createThoughtRow(this.#document, item);
            fragment.append(row.owner);
            buttons.push(row.button);
          }
          owner.append(fragment);
          for (let offset = 0; offset < batch.length; offset += 1) {
            const item = batch[offset]!.item;
            const group = `${item.root ? "root" : "child"}\u0000${item.dir}\u0000${item.locale}`;
            if (validatedGroups.has(group)) continue;
            const measured = captureTypographyHeightTuple(view.getComputedStyle(buttons[offset]!));
            const expected = item.root ? rootTuple : childTuple;
            assertMeasuredAuthority(measured, expected, item.columnWidthPx);
            validatedGroups.add(group);
          }
          const heights = buttons.map((button) => button.offsetHeight);
          for (let offset = 0; offset < batch.length; offset += 1) {
            const height = heights[offset]!;
            if (!Number.isFinite(height) || height <= 0) {
              throw new Error("Typography measurement did not produce a positive height.");
            }
            staged.set(batch[offset]!.key, height);
          }
          owner.replaceChildren();
        }
      } finally {
        owner.remove();
      }
    }

    // A previously unseen glyph can start font loading while replicas are
    // measured. FontFaceSet events are delivered after this task, so the live
    // status must be re-read before any scalar or LRU order becomes visible.
    if (!this.isCurrent(input.token)) return null;
    if (!this.#ledger.commit(input.token, staged, accessedKeys)) return null;
    const heights = keys.map((key) => this.#ledger.peek(input.token, key));
    if (heights.some((height) => height === undefined)) return null;
    return Object.freeze({
      basis: input.token,
      heights: Object.freeze(heights as number[]),
      keys: Object.freeze(keys),
      nodeIds: Object.freeze(input.items.map(({ nodeId }) => nodeId)),
    });
  }

  invalidate(): void {
    this.#assertLive();
    this.#ledger.invalidate();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#fonts?.removeEventListener("loading", this.#onFontLoading);
    this.#fonts?.removeEventListener("loadingdone", this.#onFontSettled);
    this.#fonts?.removeEventListener("loadingerror", this.#onFontSettled);
    this.#probeOwner.remove();
    this.#ledger.invalidate();
  }

  readonly #onFontLoading = () => {
    if (this.#destroyed || this.#fontLoading) return;
    this.#fontLoading = true;
    this.#ledger.invalidate();
    this.#notifyInvalidated("font-loading");
  };

  readonly #onFontSettled = () => {
    if (this.#destroyed || !this.#fontLoading) return;
    this.#fontLoading = false;
    if (this.#fontEpoch >= Number.MAX_SAFE_INTEGER) {
      this.#ledger.invalidate();
      return;
    }
    this.#fontEpoch += 1;
    this.#ledger.invalidate();
    this.#notifyInvalidated("font-settled");
  };

  #assertLive(): void {
    if (this.#destroyed) throw new Error("Typography height authority was destroyed.");
  }

  #synchronizeFontLoading(): boolean {
    if (this.#fonts?.status !== "loading") return this.#fontLoading;
    if (!this.#fontLoading) this.#onFontLoading();
    return true;
  }

  #notifyInvalidated(reason: TypographyAuthorityInvalidationReason): void {
    try {
      this.#onInvalidated?.(reason);
    } catch {
      // Render invalidation observation cannot change authority settlement.
    }
  }
}

export function captureTypographyHeightTuple(
  computed: CSSStyleDeclaration,
): TypographyHeightTuple {
  const property = (name: string) => computed.getPropertyValue(name);
  return Object.freeze({
    aspectRatio: computed.aspectRatio,
    borderBlockEndWidth: computed.borderBlockEndWidth,
    borderBlockStartWidth: computed.borderBlockStartWidth,
    borderInlineEndWidth: computed.borderInlineEndWidth,
    borderInlineStartWidth: computed.borderInlineStartWidth,
    boxDecorationBreak: property("box-decoration-break"),
    boxSizing: computed.boxSizing,
    contain: computed.contain,
    contentVisibility: property("content-visibility"),
    display: computed.display,
    direction: computed.direction,
    fontFamily: computed.fontFamily,
    fontFeatureSettings: computed.fontFeatureSettings,
    fontKerning: computed.fontKerning,
    fontLanguageOverride: property("font-language-override"),
    fontOpticalSizing: computed.fontOpticalSizing,
    fontPalette: property("font-palette"),
    fontSize: computed.fontSize,
    fontSizeAdjust: computed.fontSizeAdjust,
    fontStretch: computed.fontStretch,
    fontStyle: computed.fontStyle,
    fontSynthesis: computed.fontSynthesis,
    fontVariant: computed.fontVariant,
    fontVariantCaps: computed.fontVariantCaps,
    fontVariantEastAsian: computed.fontVariantEastAsian,
    fontVariantLigatures: computed.fontVariantLigatures,
    fontVariantNumeric: computed.fontVariantNumeric,
    fontVariantPosition: computed.fontVariantPosition,
    fontVariationSettings: computed.fontVariationSettings,
    fontWeight: computed.fontWeight,
    hyphenateCharacter: property("hyphenate-character"),
    hyphenateLimitChars: property("hyphenate-limit-chars"),
    hyphens: computed.hyphens,
    letterSpacing: computed.letterSpacing,
    lineBreak: property("line-break"),
    lineClamp: property("line-clamp"),
    lineHeight: computed.lineHeight,
    marginBlockEnd: computed.marginBlockEnd,
    marginBlockStart: computed.marginBlockStart,
    marginInlineEnd: computed.marginInlineEnd,
    marginInlineStart: computed.marginInlineStart,
    maxBlockSize: computed.maxBlockSize,
    maxHeight: computed.maxHeight,
    minBlockSize: computed.minBlockSize,
    minHeight: computed.minHeight,
    overflowWrap: computed.overflowWrap,
    overflowX: computed.overflowX,
    overflowY: computed.overflowY,
    paddingBlockEnd: computed.paddingBlockEnd,
    paddingBlockStart: computed.paddingBlockStart,
    paddingInlineEnd: computed.paddingInlineEnd,
    paddingInlineStart: computed.paddingInlineStart,
    tabSize: computed.tabSize,
    textAlign: computed.textAlign,
    textAutospace: property("text-autospace"),
    textIndent: computed.textIndent,
    textEmphasisPosition: property("text-emphasis-position"),
    textEmphasisStyle: property("text-emphasis-style"),
    textOrientation: computed.textOrientation,
    textRendering: computed.textRendering,
    textSizeAdjust: property("text-size-adjust"),
    textSpacingTrim: property("text-spacing-trim"),
    textTransform: computed.textTransform,
    textWrap: property("text-wrap"),
    textWrapMode: property("text-wrap-mode"),
    textWrapStyle: property("text-wrap-style"),
    unicodeBidi: computed.unicodeBidi,
    verticalAlign: computed.verticalAlign,
    webkitLineClamp: property("-webkit-line-clamp"),
    webkitTextSizeAdjust: property("-webkit-text-size-adjust"),
    whiteSpace: computed.whiteSpace,
    whiteSpaceCollapse: property("white-space-collapse"),
    width: computed.width,
    wordBreak: computed.wordBreak,
    wordSpacing: computed.wordSpacing,
    writingMode: computed.writingMode,
    zoom: property("zoom"),
  });
}

export function createTypographyHeightKey(
  item: TypographyHeightItem,
  tupleSlot: "child" | "root",
  token: TypographyHeightAuthorityToken,
): string {
  assertItem(item);
  return JSON.stringify([
    item.text,
    tupleSlot,
    item.columnWidthPx,
    token.authorityGeneration,
    token.documentEpoch,
    token.grammarEpoch,
    token.fontEpoch,
    token.styleEpoch,
    item.dir,
    item.locale,
  ]);
}

function createProbeOwner(
  document: Document,
  context: TypographyAuthorityContext,
): Readonly<{
  child: HTMLButtonElement;
  owner: HTMLOListElement;
  root: HTMLButtonElement;
}> {
  const owner = createHiddenOwner(document, "typographyAuthorityProbes");
  const root = createThoughtRow(document, {
    dir: context.dir,
    locale: context.locale,
    nodeId: "typography-probe-root",
    root: true,
    text: "M",
  });
  const child = createThoughtRow(document, {
    dir: context.dir,
    locale: context.locale,
    nodeId: "typography-probe-child",
    root: false,
    text: "M",
  });
  owner.append(root.owner, child.owner);
  return Object.freeze({ child: child.button, owner, root: root.button });
}

function createMeasurementOwner(document: Document): HTMLOListElement {
  return createHiddenOwner(document, "typographyAuthorityMeasurement");
}

function createHiddenOwner(document: Document, datasetKey: string): HTMLOListElement {
  const owner = document.createElement("ol");
  owner.className = "spatial-thoughts";
  owner.dataset[datasetKey] = "true";
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

function createThoughtRow(
  document: Document,
  item: Omit<TypographyHeightItem, "columnWidthPx">,
): Readonly<{ button: HTMLButtonElement; owner: HTMLLIElement }> {
  const owner = document.createElement("li");
  owner.className = "spatial-thought";
  if (!item.root) owner.dataset.parentId = "typography-parent";
  const button = document.createElement("button");
  button.className = "spatial-thought__text";
  button.dir = item.dir;
  button.lang = item.locale;
  button.tabIndex = -1;
  button.textContent = item.text;
  owner.append(button);
  return Object.freeze({ button, owner });
}

function assertMeasuredAuthority(
  actual: TypographyHeightTuple,
  expected: TypographyHeightTuple,
  columnWidthPx: number,
): void {
  const width = Number.parseFloat(actual.width);
  if (!Number.isFinite(width) || Math.abs(width - columnWidthPx) > .5) {
    throw new Error("Measured typography width disagrees with its scalar authority.");
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Measured typography tuple disagrees with its probe authority.");
  }
}

function readTupleWidth(tuple: TypographyHeightTuple): number {
  const width = Number.parseFloat(tuple.width);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error("Typography probe did not resolve one positive column width.");
  }
  return width;
}

function assertContext(context: TypographyAuthorityContext): void {
  for (const value of [context.documentEpoch, context.grammarEpoch, context.styleEpoch]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("Typography context epochs must be non-negative safe integers.");
    }
  }
  if (context.locale.length === 0) throw new TypeError("Typography context requires a locale.");
}

function assertItem(item: TypographyHeightItem): void {
  if (!Number.isFinite(item.columnWidthPx) || item.columnWidthPx <= 0) {
    throw new TypeError("Typography items require a positive column width.");
  }
  if (item.locale.length === 0 || item.nodeId.length === 0) {
    throw new TypeError("Typography items require locale and node identity.");
  }
  if (item.text.trim().length === 0) {
    throw new TypeError("Typography items require visible material text.");
  }
}

function sameContext(left: TypographyAuthorityContext, right: TypographyAuthorityContext): boolean {
  return left.dir === right.dir &&
    left.documentEpoch === right.documentEpoch &&
    left.grammarEpoch === right.grammarEpoch &&
    left.locale === right.locale &&
    left.styleEpoch === right.styleEpoch;
}

function sameTuple(left: TypographyHeightTuple, right: TypographyHeightTuple): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readFontFaceSet(document: Document): FontFaceSetLike | null {
  const fonts = document.fonts as FontFaceSetLike | undefined;
  return fonts !== undefined && typeof fonts.addEventListener === "function" ? fonts : null;
}
