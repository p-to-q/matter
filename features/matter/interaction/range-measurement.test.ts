import { describe, expect, it } from "vitest";
import {
  measureTextRange,
  normalizeClientRects,
  type LogicalTextRange,
} from "./range-measurement";

describe("DOM Range measurement", () => {
  it("indexes nested Text nodes in rendered order and maps boundary affinity", () => {
    const first = text("hello");
    const second = text(" ");
    const third = text("世界");
    const range = rangeWithRects([{ left: 10, top: 20, right: 42, bottom: 36 }]);
    const root = element([first, elementNode([second, third])], range);

    expect(measureTextRange(root, "hello 世界", address(5, 8, "hello 世界"))).toEqual({
      ok: true,
      rects: [{ x: 10, y: 20, width: 32, height: 16 }],
    });
    expect(range.positions).toEqual([
      { kind: "start", node: second, offset: 0 },
      { kind: "end", node: third, offset: 2 },
    ]);
  });

  it("uses the preceding Text node for an end exactly at a descendant boundary", () => {
    const first = text("甲");
    const second = text("乙");
    const range = rangeWithRects([{ left: 0, top: 0, right: 8, bottom: 12 }]);
    const root = element([first, second], range);

    expect(measureTextRange(root, "甲乙", address(0, 1, "甲乙"))).toMatchObject({ ok: true });
    expect(range.positions.at(-1)).toEqual({ kind: "end", node: first, offset: 1 });
  });

  it("rejects unmounted, mismatched, invalid, stale and grapheme-splitting inputs", () => {
    const family = "👩‍👩‍👧‍👦, later";
    const mounted = element([text(family)], rangeWithRects([]));
    const unmounted = { ...mounted, isConnected: false } as Element;

    expect(measureTextRange(unmounted, family, address(0, family.length, family))).toEqual(
      failure("UNMOUNTED_ROOT"),
    );
    expect(measureTextRange(mounted, `${family}!`, address(0, family.length, family))).toEqual(
      failure("TEXT_MISMATCH"),
    );
    expect(measureTextRange(mounted, family, address(2, 1, family))).toEqual(
      failure("INVALID_RANGE"),
    );
    expect(measureTextRange(mounted, family, { start: 0, end: 1, selectedText: family[0]! })).toEqual(
      failure("UNSAFE_GRAPHEME_BOUNDARY"),
    );
    expect(measureTextRange(mounted, family, { start: 0, end: family.length, selectedText: "old" })).toEqual(
      failure("STALE_ADDRESS"),
    );
  });

  it("rejects absent Range support, Range races and all-empty geometry", () => {
    const noDocument = element([text("甲")], null);
    expect(measureTextRange(noDocument, "甲", address(0, 1, "甲"))).toEqual(
      failure("RANGE_UNAVAILABLE"),
    );

    const broken = element([text("甲")], {
      setStart() { throw new Error("detached during measurement"); },
      setEnd() {},
      getClientRects() { return []; },
    });
    expect(measureTextRange(broken, "甲", address(0, 1, "甲"))).toEqual(
      failure("RANGE_FAILED"),
    );

    const empty = element([text("甲")], rangeWithRects([
      { left: 0, top: 0, right: 0, bottom: 10 },
      { left: Number.NaN, top: 0, right: 10, bottom: 10 },
    ]));
    expect(measureTextRange(empty, "甲", address(0, 1, "甲"))).toEqual(
      failure("EMPTY_GEOMETRY"),
    );
  });
});

describe("client rectangle normalization", () => {
  it("derives dimensions, rejects non-finite or zero-area fragments and freezes output", () => {
    const rects = normalizeClientRects([
      { left: -4, top: 2, right: 6, bottom: 14 },
      { left: 0, top: 0, right: 0, bottom: 8 },
      { left: 0, top: 0, right: Number.POSITIVE_INFINITY, bottom: 8 },
      { left: 8, top: 8, right: 4, bottom: 12 },
    ]);
    expect(rects).toEqual([{ x: -4, y: 2, width: 10, height: 12 }]);
    expect(Object.isFrozen(rects)).toBe(true);
    expect(Object.isFrozen(rects[0])).toBe(true);
  });
});

type FakeNode = {
  readonly nodeType: number;
  readonly childNodes: readonly (FakeNode | Text)[];
  readonly data?: string;
};

type FakeRange = {
  readonly positions?: Array<{ kind: "start" | "end"; node: Text; offset: number }>;
  setStart(node: Text, offset: number): void;
  setEnd(node: Text, offset: number): void;
  getClientRects(): Iterable<Pick<DOMRect, "left" | "top" | "right" | "bottom">>;
};

function text(data: string): Text {
  return { nodeType: 3, childNodes: [], data } as unknown as Text;
}

function elementNode(children: readonly (FakeNode | Text)[]): FakeNode {
  return { nodeType: 1, childNodes: children };
}

function element(children: readonly (FakeNode | Text)[], range: FakeRange | null): Element {
  return {
    nodeType: 1,
    childNodes: children,
    isConnected: true,
    ownerDocument: range ? { createRange: () => range } : null,
  } as unknown as Element;
}

function rangeWithRects(
  rects: Iterable<Pick<DOMRect, "left" | "top" | "right" | "bottom">>,
): FakeRange & { positions: Array<{ kind: "start" | "end"; node: Text; offset: number }> } {
  const positions: Array<{ kind: "start" | "end"; node: Text; offset: number }> = [];
  return {
    positions,
    setStart: (node, offset) => positions.push({ kind: "start", node, offset }),
    setEnd: (node, offset) => positions.push({ kind: "end", node, offset }),
    getClientRects: () => rects,
  };
}

function address(start: number, end: number, source: string): LogicalTextRange {
  return { start, end, selectedText: source.slice(start, end) };
}

function failure(code: string) {
  return { ok: false, error: { code } };
}
