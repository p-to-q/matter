import { segmentText, validateSelection, type SegmentSelection } from "./text-segments";

export type LanguageProjection = Readonly<{
  before: string;
  selected: string;
  after: string;
  /** The protected outer punctuation seam travels with the selected material. */
  outerSeam: string;
  selectedWithSeam: string;
  hasBefore: boolean;
  hasAfter: boolean;
}>;

export type LanguageProjectionResult =
  | Readonly<{ ok: true; projection: LanguageProjection }>
  | Readonly<{ ok: false; error: "INVALID_SELECTION" | "OUTER_SEAM_UNAVAILABLE" }>;

/**
 * Derives transient display material from one validated address. The tree keeps
 * the original text; this projection only decides which language visually
 * owns the expanding slot and its protected trailing seam.
 */
export function projectLanguageAroundSelection(
  text: string,
  selection: SegmentSelection,
): LanguageProjectionResult {
  const validated = validateSelection(text, selection, selection.nodeId);
  if (!validated.ok) return Object.freeze({ ok: false, error: "INVALID_SELECTION" });
  const selectedSegments = segmentText(text).filter((segment) =>
    segment.start >= selection.start && segment.end <= selection.end
  );
  const lastSegment = selectedSegments.at(-1);
  if (
    selectedSegments[0]?.start !== selection.start ||
    lastSegment?.end !== selection.end
  ) {
    return Object.freeze({ ok: false, error: "INVALID_SELECTION" });
  }
  const seamEnd = lastSegment.seamEnd;
  const outerSeam = text.slice(selection.end, seamEnd);
  const projection = Object.freeze({
    before: text.slice(0, selection.start),
    selected: selection.selectedText,
    after: text.slice(seamEnd),
    outerSeam,
    selectedWithSeam: text.slice(selection.start, seamEnd),
    hasBefore: selection.start > 0,
    hasAfter: seamEnd < text.length,
  });
  return Object.freeze({ ok: true, projection });
}
