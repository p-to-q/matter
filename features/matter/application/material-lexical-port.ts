import type { MatterLocale } from "../config/locales";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import { isWellFormedUnicodeText } from "../tree/unicode-text";

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });
const MAX_MATERIAL_LEXICAL_OUTPUT_CODE_UNITS = MAX_NODE_TEXT_CODE_UNITS * 128;
const OCCURRENCE_TOKEN = /^[A-Za-z0-9_-]{1,64}$/u;

export type MaterialLexicalChannel = "spoken" | "written";

export type MaterialLexicalRange = Readonly<{
  start: number;
  end: number;
}>;

export type MaterialLexicalRequest = Readonly<{
  locale: MatterLocale;
  channel: MaterialLexicalChannel;
  text: string;
  eligibleRanges?: readonly MaterialLexicalRange[];
}>;

export type MaterialLexicalPatch = Readonly<{
  start: number;
  end: number;
  replacement: string;
  /**
   * Opaque attribution minted by the adapter for this one edit. Matter checks
   * only its shape and uniqueness, drops anything else, and never reads it.
   */
  occurrence?: string;
}>;

/**
 * One applied patch in the coordinates of the returned text. `sourceText` is
 * content: the form before the patch. It may travel only through transient
 * memory and must never reach a receipt, state, history, storage, or log.
 */
export type MaterialLexicalAppliedEdit = Readonly<{
  start: number;
  end: number;
  sourceText: string;
  occurrence?: string;
}>;

/** One attributed edit addressed in committed node text. */
export type MaterialLexicalOccurrenceEdit = Readonly<{
  start: number;
  end: number;
  occurrence: string;
  sourceText: string;
}>;

/**
 * A lexical adapter proposes bounded edits, never a replacement document.
 * Matter validates and applies every patch inside the requested authority.
 */
export type MaterialLexicalSuggestion =
  | Readonly<{ status: "unchanged" }>
  | Readonly<{
      status: "changed";
      patches: readonly MaterialLexicalPatch[];
    }>;

export type MaterialLexicalResult = Readonly<{
  status: "changed" | "unchanged";
  text: string;
  changed: boolean;
  editCount: number;
  /** Ordered, non-overlapping applied edits in `text` coordinates. */
  edits: readonly MaterialLexicalAppliedEdit[];
}>;

export type MaterialLexicalSnapshot = Readonly<{
  generation: number;
  sourceRevision: number;
}>;

/**
 * One operation keeps one captured lexical authority. The authority may
 * suggest text only; Matter still owns validation, commands, and publication.
 */
export type MaterialLexicalSession = Readonly<{
  snapshot: MaterialLexicalSnapshot;
  canonicalize: (request: MaterialLexicalRequest) => MaterialLexicalSuggestion;
}>;

export type MaterialLexicalPort = Readonly<{
  capture: () => MaterialLexicalSession;
}>;

const NO_EDITS: readonly MaterialLexicalAppliedEdit[] = Object.freeze([]);

const IDENTITY_RESULT = (text: string): MaterialLexicalResult => Object.freeze({
  status: "unchanged",
  text,
  changed: false,
  editCount: 0,
  edits: NO_EDITS,
});

/** Shape of an opaque occurrence token; content-free by construction. */
export function isMaterialLexicalOccurrenceToken(value: unknown): value is string {
  return typeof value === "string" && OCCURRENCE_TOKEN.test(value);
}

export const IDENTITY_MATERIAL_LEXICAL_SESSION: MaterialLexicalSession = Object.freeze({
  snapshot: Object.freeze({ generation: 0, sourceRevision: 0 }),
  canonicalize: () => Object.freeze({ status: "unchanged" }),
});

export const IDENTITY_MATERIAL_LEXICAL_PORT: MaterialLexicalPort = Object.freeze({
  capture: () => IDENTITY_MATERIAL_LEXICAL_SESSION,
});

/** A missing or broken local authority never makes human material unavailable. */
export function captureMaterialLexicalSession(
  port: MaterialLexicalPort,
): MaterialLexicalSession {
  try {
    const session = port.capture();
    if (
      typeof session?.canonicalize !== "function" ||
      !isVersion(session.snapshot?.generation) ||
      !isVersion(session.snapshot?.sourceRevision)
    ) return IDENTITY_MATERIAL_LEXICAL_SESSION;
    return Object.freeze({
      snapshot: Object.freeze({
        generation: session.snapshot.generation,
        sourceRevision: session.snapshot.sourceRevision,
      }),
      canonicalize: (request) => session.canonicalize(request),
    });
  } catch {
    return IDENTITY_MATERIAL_LEXICAL_SESSION;
  }
}

/**
 * Treats a malformed or failing adapter as an identity suggestion. This seam
 * is intentionally not a plugin trust boundary; final Matter validation still
 * judges every changed result.
 */
export function canonicalizeMaterialText(
  session: MaterialLexicalSession,
  request: MaterialLexicalRequest,
): MaterialLexicalResult {
  const ownedRequest = ownRequest(request);
  if (ownedRequest === null) return IDENTITY_RESULT(request.text);
  try {
    const suggestion = session.canonicalize(ownedRequest);
    if (suggestion?.status === "unchanged") return IDENTITY_RESULT(ownedRequest.text);
    if (suggestion?.status !== "changed" || !Array.isArray(suggestion.patches)) {
      return IDENTITY_RESULT(ownedRequest.text);
    }
    const applied = applyPatches(ownedRequest, suggestion.patches);
    if (applied !== null && applied.text !== ownedRequest.text) {
      return Object.freeze({
        status: "changed",
        text: applied.text,
        changed: true,
        editCount: suggestion.patches.length,
        edits: applied.edits,
      });
    }
  } catch {
    // Local lexical authority is an optional aid, never material availability.
  }
  return IDENTITY_RESULT(ownedRequest.text);
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function ownRequest(request: MaterialLexicalRequest): MaterialLexicalRequest | null {
  if (
    typeof request.text !== "string" ||
    !isWellFormedUnicodeText(request.text) ||
    request.text.length > MAX_NODE_TEXT_CODE_UNITS
  ) return null;
  const eligibleRanges = normalizeRanges(request.eligibleRanges, request.text.length);
  if (eligibleRanges === null) return null;
  return Object.freeze({
    locale: request.locale,
    channel: request.channel,
    text: request.text,
    ...(request.eligibleRanges === undefined ? {} : { eligibleRanges }),
  });
}

function applyPatches(
  request: MaterialLexicalRequest,
  patches: readonly MaterialLexicalPatch[],
): Readonly<{ text: string; edits: readonly MaterialLexicalAppliedEdit[] }> | null {
  if (patches.length === 0 || patches.length > MAX_NODE_TEXT_CODE_UNITS) return null;
  const seams = graphemeSeams(request.text);
  const eligibleRanges = request.eligibleRanges ?? Object.freeze([
    Object.freeze({ start: 0, end: request.text.length }),
  ]);
  const owned: MaterialLexicalPatch[] = [];
  const occurrences = new Set<string>();
  let priorEnd = 0;
  let eligibleIndex = 0;
  let outputLength = request.text.length;

  for (const patch of patches) {
    if (
      typeof patch !== "object" ||
      patch === null ||
      !Number.isSafeInteger(patch.start) ||
      !Number.isSafeInteger(patch.end) ||
      patch.start < priorEnd ||
      patch.start < 0 ||
      patch.end <= patch.start ||
      patch.end > request.text.length ||
      !seams.has(patch.start) ||
      !seams.has(patch.end) ||
      typeof patch.replacement !== "string" ||
      !isWellFormedUnicodeText(patch.replacement) ||
      patch.replacement === request.text.slice(patch.start, patch.end)
    ) return null;

    while (
      eligibleIndex < eligibleRanges.length &&
      eligibleRanges[eligibleIndex].end <= patch.start
    ) eligibleIndex += 1;
    const range = eligibleRanges[eligibleIndex];
    if (range === undefined || patch.start < range.start || patch.end > range.end) return null;

    outputLength += patch.replacement.length - (patch.end - patch.start);
    if (
      outputLength < 0 ||
      outputLength > MAX_MATERIAL_LEXICAL_OUTPUT_CODE_UNITS
    ) return null;
    // A malformed or repeated token only loses attribution, never the edit.
    const occurrence = isMaterialLexicalOccurrenceToken(patch.occurrence) &&
        !occurrences.has(patch.occurrence)
      ? patch.occurrence
      : undefined;
    if (occurrence !== undefined) occurrences.add(occurrence);
    owned.push(Object.freeze({
      start: patch.start,
      end: patch.end,
      replacement: patch.replacement,
      ...(occurrence === undefined ? {} : { occurrence }),
    }));
    priorEnd = patch.end;
  }

  const output: string[] = [];
  const edits: MaterialLexicalAppliedEdit[] = [];
  let cursor = 0;
  let outputCursor = 0;
  for (const patch of owned) {
    const unchanged = request.text.slice(cursor, patch.start);
    output.push(unchanged, patch.replacement);
    outputCursor += unchanged.length;
    edits.push(Object.freeze({
      start: outputCursor,
      end: outputCursor + patch.replacement.length,
      sourceText: request.text.slice(patch.start, patch.end),
      ...(patch.occurrence === undefined ? {} : { occurrence: patch.occurrence }),
    }));
    outputCursor += patch.replacement.length;
    cursor = patch.end;
  }
  output.push(request.text.slice(cursor));
  const text = output.join("");
  return text.length === outputLength
    ? Object.freeze({ text, edits: Object.freeze(edits) })
    : null;
}

function normalizeRanges(
  ranges: readonly MaterialLexicalRange[] | undefined,
  textLength: number,
): readonly MaterialLexicalRange[] | null {
  if (ranges === undefined) return Object.freeze([]);
  const owned: MaterialLexicalRange[] = [];
  let priorEnd = 0;
  for (const range of ranges) {
    if (
      typeof range !== "object" ||
      range === null ||
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < priorEnd ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > textLength
    ) return null;
    owned.push(Object.freeze({ start: range.start, end: range.end }));
    priorEnd = range.end;
  }
  return Object.freeze(owned);
}

function graphemeSeams(text: string): ReadonlySet<number> {
  const seams = new Set<number>([0, text.length]);
  for (const entry of GRAPHEME_SEGMENTER.segment(text)) {
    seams.add(entry.index);
  }
  return seams;
}
