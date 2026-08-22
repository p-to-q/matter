import { describe, expect, it } from "vitest";
import {
  segmentText,
  selectionFromSegmentHits,
  serializeSegmentSelection,
  validateSelection,
  type SegmentSelection,
} from "./text-segments";

describe("punctuation text segments", () => {
  it("derives mixed CJK and Latin ranges without putting outer seams in the range", () => {
    const text = "我们还在想， maybe later. 再等等？yes";
    const segments = segmentText(text);

    expect(segments).toEqual([
      { index: 0, start: 0, end: 5, seamEnd: 7 },
      { index: 1, start: 7, end: 18, seamEnd: 20 },
      { index: 2, start: 20, end: 23, seamEnd: 24 },
      { index: 3, start: 24, end: 27, seamEnd: 27 },
    ]);
    expect(segments.map(({ start, end }) => text.slice(start, end))).toEqual([
      "我们还在想",
      "maybe later",
      "再等等",
      "yes",
    ]);
  });

  it("treats punctuation runs, CRLF and two-or-more em dashes as seams", () => {
    const text = "甲？！ 乙...\r\n丙—— 丁———戊\u2028己";
    expect(segmentText(text).map((segment) => ({
      text: text.slice(segment.start, segment.end),
      seam: text.slice(segment.end, segment.seamEnd),
    }))).toEqual([
      { text: "甲", seam: "？！ " },
      { text: "乙", seam: "...\r\n" },
      { text: "丙", seam: "—— " },
      { text: "丁", seam: "———" },
      { text: "戊", seam: "\u2028" },
      { text: "己", seam: "" },
    ]);
  });

  it("keeps one em dash and internal whitespace as content", () => {
    const text = "  甲 — 乙  ";
    expect(segmentText(text)).toEqual([
      { index: 0, start: 0, end: 7, seamEnd: 9 },
    ]);
    expect(text.slice(0, 7)).toBe("  甲 — 乙");
  });

  it("keeps English and German closing quotes in the preceding seam", () => {
    const text = '"One." ‘Two?’\r\n„Drei.“ »Vier!«';
    expect(segmentText(text).map((segment) => ({
      text: text.slice(segment.start, segment.end),
      seam: text.slice(segment.end, segment.seamEnd),
    }))).toEqual([
      { text: '"One', seam: '." ' },
      { text: "‘Two", seam: "?’\r\n" },
      { text: "„Drei", seam: ".“ " },
      { text: "»Vier", seam: "!«" },
    ]);
  });

  it("keeps Chinese and Japanese nested closing punctuation in the seam", () => {
    const text = "“甲‘乙！’”） 「丙。」『丁？』\r\n（戊：己）";
    expect(segmentText(text).map((segment) => ({
      text: text.slice(segment.start, segment.end),
      seam: text.slice(segment.end, segment.seamEnd),
    }))).toEqual([
      { text: "“甲‘乙", seam: "！’”） " },
      { text: "「丙", seam: "。」" },
      { text: "『丁", seam: "？』\r\n" },
      { text: "（戊", seam: "：" },
      { text: "己）", seam: "" },
    ]);
  });

  it("does not swallow a next opener and does not split an unmatched closer", () => {
    const text = "甲。 “乙。”丙）丁。";
    expect(segmentText(text).map((segment) => ({
      text: text.slice(segment.start, segment.end),
      seam: text.slice(segment.end, segment.seamEnd),
    }))).toEqual([
      { text: "甲", seam: "。 " },
      { text: "“乙", seam: "。”" },
      { text: "丙）丁", seam: "。" },
    ]);
  });

  it("keeps emoji graphemes intact across quoted multilingual boundaries", () => {
    const text = "“👩‍👩‍👧‍👦！” 「👍🏽？」\r\n🇩🇪.";
    expect(segmentText(text).map((segment) => ({
      text: text.slice(segment.start, segment.end),
      seam: text.slice(segment.end, segment.seamEnd),
    }))).toEqual([
      { text: "“👩‍👩‍👧‍👦", seam: "！” " },
      { text: "「👍🏽", seam: "？」\r\n" },
      { text: "🇩🇪", seam: "." },
    ]);
  });

  it("drops leading delimiter prefixes and returns no whitespace-or-seam-only ranges", () => {
    const text = " ？！  甲";
    expect(segmentText(text)).toEqual([
      { index: 0, start: 5, end: 6, seamEnd: 6 },
    ]);
    for (const empty of ["", " \t ", "？！...", " —— \r\n ， "]) {
      expect(segmentText(empty)).toEqual([]);
    }
  });

  it("does not normalize or split grapheme families", () => {
    const graphemes = [
      "e\u0301",
      "𠮷",
      "🇨🇳",
      "👍🏽",
      "✈️",
      "👩‍👩‍👧‍👦",
      "क्ष",
    ];
    const text = graphemes.join("，") + "。";
    const segments = segmentText(text);
    expect(segments).toHaveLength(graphemes.length);
    expect(segments.map((segment) => text.slice(segment.start, segment.end))).toEqual(graphemes);
    expect(segments.every((segment) => segment.end <= segment.seamEnd)).toBe(true);
  });
});

describe("segment selection validation", () => {
  const text = "甲， 乙。丙？";

  it("accepts one segment or one adjacent segment run", () => {
    expect(validateSelection(text, selection("node_a", 0, 1, text))).toMatchObject({ ok: true });
    expect(validateSelection(text, selection("node_a", 0, 4, text))).toMatchObject({ ok: true });
  });

  it("rejects partial, punctuation-only, split-grapheme, stale-text and foreign-node addresses", () => {
    const family = "👩‍👩‍👧‍👦，later";
    for (const invalid of [
      selection("node_a", 0, 2, text),
      selection("node_a", 1, 2, text),
      { ...selection("node_a", 0, 1, text), selectedText: "stale" },
    ]) {
      expect(validateSelection(text, invalid)).toMatchObject({ ok: false });
    }
    expect(validateSelection(family, {
      type: "segment-range",
      nodeId: "node_a",
      start: 0,
      end: 1,
      selectedText: family.slice(0, 1),
    })).toMatchObject({ ok: false });
    expect(validateSelection(text, selection("node_a", 0, 1, text), "node_b")).toEqual({
      ok: false,
      error: { code: "NODE_MISMATCH" },
    });
  });

  it("rejects unknown fields and invalid runtime values without throwing", () => {
    for (const value of [
      null,
      {},
      { ...selection("node_a", 0, 1, text), extra: true },
      { ...selection("node_a", 0, 1, text), start: Number.NaN },
      { ...selection("node_a", 0, 1, text), end: 0 },
    ]) {
      expect(validateSelection(text, value)).toEqual({
        ok: false,
        error: { code: "INVALID_SELECTION" },
      });
    }
  });
});

describe("selection from geometry hits", () => {
  const nodes = { a: "甲， 乙。丙？", b: "另一个节点。" };

  it("deduplicates wrapped fragments and joins adjacent segments in one node", () => {
    expect(selectionFromSegmentHits(nodes, [
      { nodeId: "a", segmentIndex: 1 },
      { nodeId: "a", segmentIndex: 1 },
    ])).toMatchObject({
      ok: true,
      selection: { nodeId: "a", start: 3, end: 4, selectedText: "乙" },
    });
    expect(selectionFromSegmentHits(nodes, [
      { nodeId: "a", segmentIndex: 1 },
      { nodeId: "a", segmentIndex: 0 },
      { nodeId: "a", segmentIndex: 1 },
    ])).toMatchObject({
      ok: true,
      selection: { nodeId: "a", start: 0, end: 4, selectedText: "甲， 乙" },
    });
  });

  it("rejects no hits, gaps, cross-node ambiguity, missing nodes and invalid indices", () => {
    expect(selectionFromSegmentHits(nodes, [])).toEqual({ ok: false, error: { code: "EMPTY_HITS" } });
    expect(selectionFromSegmentHits(nodes, [
      { nodeId: "a", segmentIndex: 0 },
      { nodeId: "a", segmentIndex: 2 },
    ])).toEqual({ ok: false, error: { code: "NON_ADJACENT_HITS" } });
    expect(selectionFromSegmentHits(nodes, [
      { nodeId: "a", segmentIndex: 0 },
      { nodeId: "b", segmentIndex: 0 },
    ])).toEqual({ ok: false, error: { code: "CROSS_NODE_HITS" } });
    expect(selectionFromSegmentHits(nodes, [{ nodeId: "missing", segmentIndex: 0 }])).toEqual({
      ok: false,
      error: { code: "INVALID_SEGMENT_HIT" },
    });
    expect(selectionFromSegmentHits(nodes, [{ nodeId: "a", segmentIndex: 99 }])).toEqual({
      ok: false,
      error: { code: "INVALID_SEGMENT_HIT" },
    });
  });
});

describe("selection clipboard serialization", () => {
  it("returns one validated contiguous segment range", () => {
    const text = "甲， 乙。丙？";
    expect(serializeSegmentSelection(text, selection("a", 3, 4, text), "a")).toEqual({
      ok: true,
      text: "乙",
      nodeId: "a",
    });
    expect(serializeSegmentSelection(text, selection("a", 0, 4, text), "a")).toEqual({
      ok: true,
      text: "甲， 乙",
      nodeId: "a",
    });
    expect(serializeSegmentSelection(text, selection("a", 0, 4, text), "other")).toEqual({
      ok: false,
      error: "INVALID_SELECTION",
    });
  });
});

function selection(
  nodeId: string,
  start: number,
  end: number,
  source: string,
): SegmentSelection {
  return {
    type: "segment-range",
    nodeId,
    start,
    end,
    selectedText: source.slice(start, end),
  };
}
