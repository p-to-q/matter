export type LogicalTextRange = Readonly<{
  start: number;
  end: number;
  selectedText: string;
}>;

export type ClientTextRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RangeMeasurementErrorCode =
  | "UNMOUNTED_ROOT"
  | "TEXT_MISMATCH"
  | "INVALID_RANGE"
  | "UNSAFE_GRAPHEME_BOUNDARY"
  | "STALE_ADDRESS"
  | "RANGE_UNAVAILABLE"
  | "RANGE_FAILED"
  | "EMPTY_GEOMETRY";

export type RangeMeasurementResult =
  | { readonly ok: true; readonly rects: readonly ClientTextRect[] }
  | {
      readonly ok: false;
      readonly error: Readonly<{ code: RangeMeasurementErrorCode }>;
    };

type TextPosition = Readonly<{ node: Text; offset: number }>;

const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});

/**
 * Measures a semantic text address at the rendering edge. It intentionally
 * returns plain values and never retains a DOM Range or layout geometry.
 */
export function measureTextRange(
  root: Element,
  materialText: string,
  address: LogicalTextRange,
): RangeMeasurementResult {
  if (!root.isConnected) return failure("UNMOUNTED_ROOT");

  const textNodes = collectDescendantTextNodes(root);
  const renderedText = textNodes.map((node) => node.data).join("");
  if (renderedText !== materialText) return failure("TEXT_MISMATCH");
  if (!isValidRange(address, materialText.length)) {
    return failure("INVALID_RANGE");
  }
  if (!hasGraphemeBoundaries(materialText, address.start, address.end)) {
    return failure("UNSAFE_GRAPHEME_BOUNDARY");
  }
  if (materialText.slice(address.start, address.end) !== address.selectedText) {
    return failure("STALE_ADDRESS");
  }

  const start = locatePosition(textNodes, address.start, "start");
  const end = locatePosition(textNodes, address.end, "end");
  const ownerDocument = root.ownerDocument;
  if (!start || !end || typeof ownerDocument?.createRange !== "function") {
    return failure("RANGE_UNAVAILABLE");
  }

  try {
    const range = ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = normalizeClientRects(range.getClientRects());
    return rects.length > 0
      ? { ok: true, rects }
      : failure("EMPTY_GEOMETRY");
  } catch {
    // A DOM mutation between indexing and Range construction invalidates the
    // whole measurement; partial geometry must never become a selection.
    return failure("RANGE_FAILED");
  }
}

/** Converts live CSSOM rectangles into immutable client-pixel values. */
export function normalizeClientRects(
  rects: Iterable<Pick<DOMRect, "left" | "top" | "right" | "bottom">>,
): readonly ClientTextRect[] {
  const normalized: ClientTextRect[] = [];
  for (const rect of rects) {
    const { left, top, right, bottom } = rect;
    if (![left, top, right, bottom].every(Number.isFinite)) continue;
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) continue;
    normalized.push(Object.freeze({ x: left, y: top, width, height }));
  }
  return Object.freeze(normalized);
}

function collectDescendantTextNodes(root: Element): Text[] {
  const textNodes: Text[] = [];
  const stack = Array.from(root.childNodes).reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.nodeType === 3) {
      textNodes.push(node as Text);
      continue;
    }
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      stack.push(node.childNodes[index]!);
    }
  }
  return textNodes;
}

function locatePosition(
  textNodes: readonly Text[],
  target: number,
  affinity: "start" | "end",
): TextPosition | null {
  let cursor = 0;
  for (let index = 0; index < textNodes.length; index += 1) {
    const node = textNodes[index]!;
    const next = cursor + node.data.length;
    if (target < next || (target === next && affinity === "end")) {
      return { node, offset: target - cursor };
    }
    if (target === next && affinity === "start") {
      const following = textNodes[index + 1];
      return following ? { node: following, offset: 0 } : { node, offset: node.data.length };
    }
    cursor = next;
  }
  return null;
}

function isValidRange(address: LogicalTextRange, textLength: number): boolean {
  return (
    Number.isSafeInteger(address.start) &&
    Number.isSafeInteger(address.end) &&
    address.start >= 0 &&
    address.end > address.start &&
    address.end <= textLength &&
    typeof address.selectedText === "string" &&
    address.selectedText.length > 0
  );
}

function hasGraphemeBoundaries(text: string, start: number, end: number): boolean {
  const boundaries = new Set<number>([0, text.length]);
  for (const part of GRAPHEME_SEGMENTER.segment(text)) boundaries.add(part.index);
  return boundaries.has(start) && boundaries.has(end);
}

function failure(code: RangeMeasurementErrorCode): RangeMeasurementResult {
  return { ok: false, error: { code } };
}
