import { describe, expect, it } from "vitest";
import {
  copyMatchesRange,
  ghostFits,
  interruptedDisclosureCounts,
  planWikiDisclosure,
  requiresUnderlineOnly,
  staticWikiDisclosure,
  toWorldRect,
  WIKI_DISCLOSURE_RETRIES,
  WIKI_MORPH_TIMELINE,
  WIKI_SWEEP_TIMELINE,
  type WikiDisclosureCapabilities,
} from "./wiki-occurrence-disclosure";

const FULL: WikiDisclosureCapabilities = Object.freeze({
  highlights: true,
  userSelectNone: true,
  animations: true,
  reducedMotion: false,
  forcedColors: false,
});
const ONE_LINE = Object.freeze({ fragments: 1, complexScript: false });

describe("Wiki occurrence disclosure policy", () => {
  it("morphs one measurable line when the platform can veil and animate", () => {
    expect(planWikiDisclosure(FULL, ONE_LINE)).toBe("morph");
  });

  it("falls back to the underline sweep without a veil or for any risky shape", () => {
    expect(planWikiDisclosure({ ...FULL, highlights: false }, ONE_LINE)).toBe("sweep");
    expect(planWikiDisclosure({ ...FULL, userSelectNone: false }, ONE_LINE)).toBe("sweep");
    expect(planWikiDisclosure(FULL, { fragments: 2, complexScript: false })).toBe("sweep");
    expect(planWikiDisclosure(FULL, { fragments: 1, complexScript: true })).toBe("sweep");
    expect(planWikiDisclosure(FULL, { fragments: 0, complexScript: false })).toBe("sweep");
  });

  it("keeps only the static mark under reduced motion or forced colors", () => {
    expect(planWikiDisclosure({ ...FULL, reducedMotion: true }, ONE_LINE)).toBe("mark");
    expect(planWikiDisclosure({ ...FULL, forcedColors: true }, ONE_LINE)).toBe("mark");
    expect(planWikiDisclosure({ ...FULL, animations: false }, ONE_LINE)).toBe("mark");
    // Nothing can be shown, so nothing is disclosed and silence stays uninformed.
    expect(planWikiDisclosure({ ...FULL, reducedMotion: true, highlights: false }, ONE_LINE))
      .toBe("none");
  });

  it("yields an exhausted settle to the static mark wherever a mark can be painted", () => {
    expect(staticWikiDisclosure(FULL)).toBe("mark");
    expect(staticWikiDisclosure({ ...FULL, highlights: false })).toBe("none");
    expect(staticWikiDisclosure({ ...FULL, reducedMotion: true }))
      .toBe(planWikiDisclosure({ ...FULL, reducedMotion: true }, ONE_LINE));
  });

  it("recognizes joining and conjunct scripts around the word", () => {
    expect(requiresUnderlineOnly("[p → q]", "P to Q")).toBe(false);
    expect(requiresUnderlineOnly("我觉得")).toBe(false);
    expect(requiresUnderlineOnly("كتاب")).toBe(true);
    expect(requiresUnderlineOnly("x", "नमस्ते")).toBe(true);
    expect(requiresUnderlineOnly("ພາສາ", "ស្រី")).toBe(true);
  });

  it("converts client geometry into the thought's own space under zoom", () => {
    expect(toWorldRect(
      { x: 150, y: 90, width: 40, height: 20 },
      { left: 100, top: 50, width: 400 },
      200,
    )).toEqual({ left: 25, top: 20, width: 20, height: 10 });
    expect(toWorldRect({ x: 0, y: 0, width: 1, height: 1 }, { left: 0, top: 0, width: 0 }, 0))
      .toBeNull();
  });

  it("trusts a copy within one pixel and a heard ghost of similar width", () => {
    const range = { x: 10, y: 10, width: 50, height: 20 };
    expect(copyMatchesRange({ ...range, x: 10.9, width: 50.9 }, range)).toBe(true);
    expect(copyMatchesRange({ ...range, x: 11.2 }, range)).toBe(false);
    expect(copyMatchesRange({ ...range, width: 48.8 }, range)).toBe(false);
    // A copy on another line, or of another height, never overlays the word.
    expect(copyMatchesRange({ ...range, y: 11.2 }, range)).toBe(false);
    expect(copyMatchesRange({ ...range, height: 21.5 }, range)).toBe(false);
    expect(copyMatchesRange({ ...range, y: 10.8, height: 20.8 }, range)).toBe(true);
    expect(ghostFits(40, 50)).toBe(true);
    expect(ghostFits(62.5, 50)).toBe(true);
    expect(ghostFits(39, 50)).toBe(false);
    expect(ghostFits(63, 50)).toBe(false);
    expect(ghostFits(0, 50)).toBe(false);
  });

  it("counts an interrupted settle only once the change was readable", () => {
    const readable = WIKI_MORPH_TIMELINE.crossfadeEndMs;
    expect(interruptedDisclosureCounts(readable - 1, readable)).toBe(false);
    expect(interruptedDisclosureCounts(readable, readable)).toBe(true);
    expect(interruptedDisclosureCounts(WIKI_SWEEP_TIMELINE.drawMs, WIKI_SWEEP_TIMELINE.drawMs))
      .toBe(true);
    expect(interruptedDisclosureCounts(Number.NaN, readable)).toBe(false);
    // An early cut is retried, but not forever.
    expect(WIKI_DISCLOSURE_RETRIES).toBe(1);
  });

  it("keeps the settle restrained and ordered", () => {
    const timeline = WIKI_MORPH_TIMELINE;
    expect(0 < timeline.holdMs && timeline.holdMs < timeline.crossfadeEndMs).toBe(true);
    expect(timeline.crossfadeEndMs < timeline.shiverEndMs).toBe(true);
    expect(timeline.shiverEndMs < timeline.totalMs && timeline.totalMs <= 600).toBe(true);
    expect(WIKI_SWEEP_TIMELINE.drawMs + WIKI_SWEEP_TIMELINE.fadeMs).toBeLessThanOrEqual(400);
  });
});

describe("Wiki highlight paint", () => {
  it("installs its highlight rules once per document", async () => {
    const { installWikiHighlightStyles, WIKI_HIGHLIGHT_STYLE_TEXT } = await import("./wiki-occurrence-disclosure");
    const appended: { attributes: Map<string, string>; textContent: string }[] = [];
    const host = {
      head: { append: (style: unknown) => { appended.push(style as (typeof appended)[number]); } },
      createElement: () => {
        const attributes = new Map<string, string>();
        return { attributes, textContent: "", setAttribute: (name: string, value: string) => attributes.set(name, value) } as unknown as HTMLStyleElement;
      },
      querySelector: () => (appended.length > 0 ? ({} as Element) : null),
    };
    installWikiHighlightStyles(host);
    installWikiHighlightStyles(host);
    expect(appended).toHaveLength(1);
    expect(appended[0].textContent).toBe(WIKI_HIGHLIGHT_STYLE_TEXT);
    expect(WIKI_HIGHLIGHT_STYLE_TEXT).toContain("::highlight(matter-wiki-applied)");
    expect(WIKI_HIGHLIGHT_STYLE_TEXT).toContain("::highlight(matter-lexeme-veil)");
    expect(WIKI_HIGHLIGHT_STYLE_TEXT).toContain("forced-colors: active");
  });
});
