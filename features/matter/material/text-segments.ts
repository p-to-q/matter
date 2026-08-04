export type TextSegment = Readonly<{
  index: number;
  start: number;
  end: number;
  seamEnd: number;
}>;

export type SegmentSelection = Readonly<{
  type: "segment-range";
  nodeId: string;
  start: number;
  end: number;
  selectedText: string;
}>;

export type SegmentHit = Readonly<{
  nodeId: string;
  segmentIndex: number;
}>;

export type SelectionErrorCode =
  | "INVALID_SELECTION"
  | "NODE_MISMATCH"
  | "EMPTY_HITS"
  | "CROSS_NODE_HITS"
  | "INVALID_SEGMENT_HIT"
  | "NON_ADJACENT_HITS";

export type SelectionResult =
  | {
      readonly ok: true;
      readonly selection: SegmentSelection;
      readonly segments: readonly TextSegment[];
    }
  | {
      readonly ok: false;
      readonly error: Readonly<{ code: SelectionErrorCode }>;
    };

export type SelectionCopyResult =
  | Readonly<{ ok: true; text: string; nodeId: string }>
  | Readonly<{ ok: false; error: "INVALID_SELECTION" }>;

type Grapheme = Readonly<{
  start: number;
  end: number;
  value: string;
  kind: "content" | "delimiter" | "horizontal-space";
}>;

const SINGLE_DELIMITERS = new Set([
  "，",
  "。",
  "；",
  "：",
  "！",
  "？",
  "、",
  "…",
  ",",
  ".",
  ";",
  ":",
  "!",
  "?",
]);

const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});

/**
 * Derives the only replaceable text units. Punctuation remains outside a
 * single selection, while internal seams become part of an adjacent merge.
 */
export function segmentText(text: string): readonly TextSegment[] {
  const graphemes = classifyGraphemes(text);
  const segments: TextSegment[] = [];
  let segmentStart = 0;
  let lastContentEnd: number | null = null;

  for (let index = 0; index < graphemes.length; index += 1) {
    const grapheme = graphemes[index]!;
    if (grapheme.kind === "content") {
      lastContentEnd = grapheme.end;
      continue;
    }
    if (grapheme.kind === "horizontal-space") continue;

    let seamEnd = grapheme.end;
    while (
      index + 1 < graphemes.length &&
      graphemes[index + 1]!.kind !== "content"
    ) {
      index += 1;
      seamEnd = graphemes[index]!.end;
    }

    if (lastContentEnd !== null && lastContentEnd > segmentStart) {
      segments.push(Object.freeze({
        index: segments.length,
        start: segmentStart,
        end: lastContentEnd,
        seamEnd,
      }));
    }
    // A delimiter before any content is an unselectable prefix. Horizontal
    // whitespace after it belongs to that prefix because it is the same seam.
    segmentStart = seamEnd;
    lastContentEnd = null;
  }

  if (lastContentEnd !== null && lastContentEnd > segmentStart) {
    segments.push(Object.freeze({
      index: segments.length,
      start: segmentStart,
      end: lastContentEnd,
      seamEnd: text.length,
    }));
  }

  return Object.freeze(segments);
}

/** Recomputes the address space and accepts exactly one contiguous segment run. */
export function validateSelection(
  text: string,
  selection: unknown,
  expectedNodeId?: string,
): SelectionResult {
  if (!isSelectionShape(selection)) return failure("INVALID_SELECTION");
  if (expectedNodeId !== undefined && selection.nodeId !== expectedNodeId) {
    return failure("NODE_MISMATCH");
  }
  if (text.slice(selection.start, selection.end) !== selection.selectedText) {
    return failure("INVALID_SELECTION");
  }

  const segments = segmentText(text);
  for (let first = 0; first < segments.length; first += 1) {
    const firstSegment = segments[first]!;
    if (firstSegment.start !== selection.start) continue;
    for (let last = first; last < segments.length; last += 1) {
      const lastSegment = segments[last]!;
      if (last > first) {
        const previous = segments[last - 1]!;
        if (
          lastSegment.index !== previous.index + 1 ||
          previous.seamEnd !== lastSegment.start
        ) {
          break;
        }
      }
      if (lastSegment.end === selection.end) {
        return { ok: true, selection: ownSelection(selection), segments };
      }
      if (lastSegment.end > selection.end) break;
    }
  }
  return failure("INVALID_SELECTION");
}

/**
 * Converts geometry hits into one semantic address. Duplicate fragments of a
 * wrapped segment collapse, but ambiguity across nodes or gaps is rejected.
 */
export function selectionFromSegmentHits(
  textByNodeId: Readonly<Record<string, string>>,
  hits: readonly SegmentHit[],
): SelectionResult {
  if (hits.length === 0) return failure("EMPTY_HITS");
  const nodeId = hits[0]!.nodeId;
  if (nodeId.length === 0 || hits.some((hit) => hit.nodeId !== nodeId)) {
    return failure("CROSS_NODE_HITS");
  }
  const text = textByNodeId[nodeId];
  if (typeof text !== "string") return failure("INVALID_SEGMENT_HIT");

  const segments = segmentText(text);
  const indices = [...new Set(hits.map((hit) => hit.segmentIndex))].sort(
    (left, right) => left - right,
  );
  if (
    indices.some(
      (index) =>
        !Number.isSafeInteger(index) || index < 0 || index >= segments.length,
    )
  ) {
    return failure("INVALID_SEGMENT_HIT");
  }

  for (let index = 1; index < indices.length; index += 1) {
    const previous = segments[indices[index - 1]!]!;
    const current = segments[indices[index]!]!;
    if (
      current.index !== previous.index + 1 ||
      previous.seamEnd !== current.start
    ) {
      return failure("NON_ADJACENT_HITS");
    }
  }

  const first = segments[indices[0]!]!;
  const last = segments[indices.at(-1)!]!;
  return validateSelection(
    text,
    {
      type: "segment-range",
      nodeId,
      start: first.start,
      end: last.end,
      selectedText: text.slice(first.start, last.end),
    },
    nodeId,
  );
}

/** Captures exact validated lasso language for a future clipboard tool intent. */
export function serializeSegmentSelection(
  text: string,
  selection: unknown,
  expectedNodeId?: string,
): SelectionCopyResult {
  const validated = validateSelection(text, selection, expectedNodeId);
  return validated.ok
    ? Object.freeze({
        ok: true,
        text: validated.selection.selectedText,
        nodeId: validated.selection.nodeId,
      })
    : Object.freeze({ ok: false, error: "INVALID_SELECTION" });
}

function classifyGraphemes(text: string): Grapheme[] {
  const graphemes = [...GRAPHEME_SEGMENTER.segment(text)].map((part) => ({
    start: part.index,
    end: part.index + part.segment.length,
    value: part.segment,
    kind: baseKind(part.segment),
  }));

  // One em dash is language; a run of two or more is a delimiter.
  for (let index = 0; index < graphemes.length; index += 1) {
    if (graphemes[index]!.value !== "—") continue;
    let runEnd = index + 1;
    while (runEnd < graphemes.length && graphemes[runEnd]!.value === "—") {
      runEnd += 1;
    }
    if (runEnd - index >= 2) {
      for (let cursor = index; cursor < runEnd; cursor += 1) {
        graphemes[cursor] = { ...graphemes[cursor]!, kind: "delimiter" };
      }
    }
    index = runEnd - 1;
  }
  return graphemes;
}

function baseKind(value: string): Grapheme["kind"] {
  if (
    SINGLE_DELIMITERS.has(value) ||
    value === "\r\n" ||
    value === "\r" ||
    value === "\n" ||
    value === "\u2028" ||
    value === "\u2029"
  ) {
    return "delimiter";
  }
  return /^(?:\p{Zs}|\t)+$/u.test(value)
    ? "horizontal-space"
    : "content";
}

function isSelectionShape(value: unknown): value is SegmentSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SegmentSelection>;
  return (
    Object.keys(value).length === 5 &&
    candidate.type === "segment-range" &&
    typeof candidate.nodeId === "string" &&
    candidate.nodeId.length > 0 &&
    Number.isSafeInteger(candidate.start) &&
    Number.isSafeInteger(candidate.end) &&
    (candidate.start ?? -1) >= 0 &&
    (candidate.end ?? -1) > (candidate.start ?? -1) &&
    typeof candidate.selectedText === "string" &&
    candidate.selectedText.length > 0
  );
}

function ownSelection(selection: SegmentSelection): SegmentSelection {
  return Object.freeze({ ...selection });
}

function failure(code: SelectionErrorCode): SelectionResult {
  return { ok: false, error: { code } };
}
