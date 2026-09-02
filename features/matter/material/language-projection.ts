import { validateSelection, type SegmentSelection } from "./text-segments";

export type LanguageProjection = Readonly<{
  before: string;
  selected: string;
  after: string;
  /** The protected outer punctuation seam travels with the selected material. */
  outerSeam: string;
  /** Visible seam material belongs to the address; trailing whitespace belongs only to flow. */
  visibleOuterSeam: string;
  outerSeamTail: string;
  addressText: string;
  selectedWithSeam: string;
  hasBefore: boolean;
  hasAfter: boolean;
}>;

export type MaterialAddressTextRange = Readonly<{
  start: number;
  end: number;
  selectedText: string;
}>;

export type LanguageProjectionResult =
  | Readonly<{ ok: true; projection: LanguageProjection }>
  | Readonly<{ ok: false; error: "INVALID_SELECTION" | "OUTER_SEAM_UNAVAILABLE" }>;

export type MaterialAddressTextRangeResult =
  | Readonly<{ ok: true; range: MaterialAddressTextRange }>
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
  const selectedSegments = validated.segments.filter((segment) =>
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
  const visibleOuterSeamEnd = trailingWhitespaceStart(outerSeam);
  const visibleOuterSeam = outerSeam.slice(0, visibleOuterSeamEnd);
  const projection = Object.freeze({
    before: text.slice(0, selection.start),
    selected: selection.selectedText,
    after: text.slice(seamEnd),
    outerSeam,
    visibleOuterSeam,
    outerSeamTail: outerSeam.slice(visibleOuterSeamEnd),
    addressText: `${selection.selectedText}${visibleOuterSeam}`,
    selectedWithSeam: text.slice(selection.start, seamEnd),
    hasBefore: selection.start > 0,
    hasAfter: seamEnd < text.length,
  });
  return Object.freeze({ ok: true, projection });
}

/**
 * The operation owns only the semantic segment, while its visible address also
 * owns the protected punctuation that travels with that material. Whitespace
 * remains in the flow projection so line breaking is unchanged, but it never
 * makes the painted address look wider than the authored mark.
 */
export function projectMaterialAddressTextRange(
  text: string,
  selection: SegmentSelection,
): MaterialAddressTextRangeResult {
  const result = projectLanguageAroundSelection(text, selection);
  if (!result.ok) return result;
  const range = Object.freeze({
    start: selection.start,
    end: selection.end + result.projection.visibleOuterSeam.length,
    selectedText: result.projection.addressText,
  });
  return Object.freeze({ ok: true, range });
}

const SEAM_GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});
const SEAM_TRAILING_WHITESPACE = /^\p{White_Space}+$/u;

function trailingWhitespaceStart(text: string): number {
  let visibleEnd = 0;
  for (const part of SEAM_GRAPHEME_SEGMENTER.segment(text)) {
    if (!SEAM_TRAILING_WHITESPACE.test(part.segment)) {
      visibleEnd = part.index + part.segment.length;
    }
  }
  return visibleEnd;
}
