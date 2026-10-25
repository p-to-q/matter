import { describe, expect, it, vi } from "vitest";
import { measureTrailMaterialBounds, trailMaterialBoundsFromClientRects, trailWorldScale } from "./trail-material-bounds";

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const canvasOrigin = { left: 100, top: 200 };
const measured = (bounds: ReturnType<typeof rect>, firstRow = bounds, bottomExtent = 0) => ({ bounds, firstRow, bottomExtent });
const domRect = (value: ReturnType<typeof rect>) => ({ ...value, left: value.x, top: value.y,
  right: value.x + value.width, bottom: value.y + value.height });

function textElement(text: string, values = [rect(180, 210, 40, 20)], witness: HTMLElement | null = null) {
  const range = { setStart: vi.fn(), setEnd: vi.fn(), getClientRects: vi.fn(() => values.map(domRect)), detach: vi.fn() };
  const element = { isConnected: true, textContent: text,
    childNodes: [{ nodeType: 3, data: text, childNodes: [] }],
    ownerDocument: { createRange: () => range }, closest: () => witness,
    getBoundingClientRect: () => domRect(rect(140, 200, 120, 40)),
  } as unknown as HTMLElement;
  return { element, range };
}

function canonicalInput(text = "material") {
  const { element, range } = textElement(text);
  return { range, input: { text: element, canonicalText: text, projection: null,
    picture: null, expectsPicture: false, canvasOrigin, scale: 1 } };
}

function elastic() {
  const witness = { getBoundingClientRect: () => domRect(rect(140, 200, 120, 25)) } as HTMLElement;
  const before = textElement("ab", [rect(180, 210, 20, 20)], witness);
  const selected = textElement("cd", [rect(200, 210, 20, 20)], witness);
  const seam = textElement(" ", [], witness);
  const tail = textElement("", [], witness);
  const after = textElement("ef", [rect(170, 300, 40, 20)]);
  const leaves = [before, selected, seam, tail, after];
  const querySelectorAll = vi.fn(() => leaves.map(({ element }) => element));
  const projection = { isConnected: true, dataset: { previewMode: "expand", layoutMode: "expand" },
    querySelectorAll, querySelector: () => ({ getBoundingClientRect: () => domRect(rect(140, 200, 120, 120)) }),
    style: { getPropertyValue: () => "80px" },
  } as unknown as HTMLElement;
  const { input } = canonicalInput("abcd ef");
  return { input: { ...input, projection }, leaves, querySelectorAll };
}

describe("trail material bounds", () => {
  it("measures centred short text, not its empty full-width column", () => {
    expect(trailMaterialBoundsFromClientRects({ rects: [rect(180, 210, 40, 20)], picture: null, canvasOrigin, scale: 1 }))
      .toEqual(measured(rect(80, 10, 40, 20)));
  });

  it("unions wrapped RTL fragments but attaches only to the complete first row, independent of DOM order", () => {
    const rects = [rect(160, 210, 45, 18), rect(210, 210, 70, 18), rect(190, 232, 50, 18)];
    const input = { rects, picture: null, canvasOrigin, scale: 1 };
    expect(trailMaterialBoundsFromClientRects(input)).toEqual(measured(rect(60, 10, 120, 40), rect(60, 10, 120, 18)));
    expect(trailMaterialBoundsFromClientRects({ ...input, rects: [...rects].reverse() }))
      .toEqual(trailMaterialBoundsFromClientRects(input));
  });

  it("includes resident/missing picture frames in the envelope without pulling ports into their middle", () => {
    expect(trailMaterialBoundsFromClientRects({ rects: [rect(180, 210, 40, 20)],
      picture: rect(140, 240, 120, 90), canvasOrigin, scale: 1 }))
      .toEqual(measured(rect(40, 10, 120, 120), rect(80, 10, 40, 20)));
  });

  it("converts once into identical world bounds at translated/animated camera scales", () => {
    for (const scale of [0.6, 1, 1.37, 1.8]) for (const left of [-400, 100, 1600]) {
      const expected = { x: expect.closeTo(80, 8), y: expect.closeTo(10, 8), width: expect.closeTo(40, 8), height: expect.closeTo(20, 8) };
      expect(trailMaterialBoundsFromClientRects({ rects: [rect(left + 80 * scale, 200 + 10 * scale, 40 * scale, 20 * scale)],
        picture: null, canvasOrigin: { left, top: 200 }, scale })).toMatchObject({ bounds: expected, firstRow: expected });
    }
  });

  it("accepts only finite uniform 2D translation/scaling, never skew, rotation, reflection or perspective", () => {
    const matrix = { m11: 0.6, m12: 0, m13: 0, m14: 0, m21: 0, m22: 0.6, m23: 0, m24: 0,
      m31: 0, m32: 0, m33: 1, m34: 0, m41: 42, m42: -80, m43: 0, m44: 1 };
    expect(trailWorldScale(matrix)).toBe(0.6);
    // Equivalent matrix3d serialization is harmless; its numeric transform, not is2D's flag, owns the check.
    expect(trailWorldScale({ ...matrix, ...{ is2D: false } })).toBe(0.6);
    for (const invalid of [{ m13: 0.1 }, { m14: 0.001 }, { m12: 0.1 }, { m21: -0.1 }, { m22: 1 },
      { m11: -0.6, m22: -0.6 }, { m11: 0, m22: 0 }, { m33: 2 }, { m44: 2 }, { m43: 1 },
      { m41: Number.NaN }, { m42: Number.POSITIVE_INFINITY }]) {
      expect(trailWorldScale({ ...matrix, ...invalid })).toBeNull();
    }
  });

  it("refuses missing/non-finite bounds and invalid damage rather than manufacturing container geometry", () => {
    const input = { rects: [rect(180, 210, 40, 20)], picture: null, canvasOrigin, scale: 1 };
    for (const invalid of [{ rects: [] }, { scale: 0 }, { scale: Number.NaN }, { bottomExtent: -1 },
      { bottomExtent: Number.NaN }, { bottomExtent: Number.POSITIVE_INFINITY },
      { picture: rect(0, 0, 0, 10) }, { rects: [rect(0, Number.NaN, 10, 10)] }]) {
      expect(trailMaterialBoundsFromClientRects({ ...input, ...invalid })).toBeNull();
    }
  });

  it("reuses a canonical text Range and releases it, requiring exactly the expected picture", () => {
    const { input, range } = canonicalInput();
    expect(measureTrailMaterialBounds(input)).toEqual(measured(rect(80, 10, 40, 20)));
    expect(range.setStart).toHaveBeenCalledWith(input.text.childNodes[0], 0);
    expect(range.setEnd).toHaveBeenCalledWith(input.text.childNodes[0], input.canonicalText.length);
    expect(range.detach).toHaveBeenCalledOnce();
    expect(measureTrailMaterialBounds({ ...input, expectsPicture: true })).toBeNull();
    const picture = { isConnected: true, getBoundingClientRect: () => domRect(rect(140, 240, 120, 90)) } as HTMLElement;
    expect(measureTrailMaterialBounds({ ...input, picture })).toBeNull();
    expect(measureTrailMaterialBounds({ ...input, picture, expectsPicture: true }))
      .toEqual(measured(rect(40, 10, 120, 120), rect(80, 10, 40, 20)));
  });

  it("fails closed on stale canonical text, detached roots and Range exceptions", () => {
    const { input, range } = canonicalInput();
    expect(measureTrailMaterialBounds({ ...input, canonicalText: "new identity" })).toBeNull();
    expect(range.getClientRects).not.toHaveBeenCalled();
    expect(measureTrailMaterialBounds({ ...input, text: { ...input.text, isConnected: false } as HTMLElement })).toBeNull();
    range.getClientRects.mockImplementation(() => { throw new Error("read refused"); });
    expect(measureTrailMaterialBounds(input)).toBeNull();
    expect(range.detach).toHaveBeenCalledOnce();
  });

  it("rejects mixed non-finite native rects instead of retaining only convenient fragments", () => {
    const { input, range } = canonicalInput();
    range.getClientRects.mockReturnValue([domRect(rect(180, 210, 40, 20)), domRect(rect(Number.NaN, 232, 40, 20))]);
    expect(measureTrailMaterialBounds(input)).toBeNull();
  });

  it("measures exact visible Elastic leaves, clips witness ink, and counts the real slot only once", () => {
    const { input, querySelectorAll, leaves } = elastic();
    expect(measureTrailMaterialBounds(input)).toEqual(measured(rect(70, 10, 50, 110), rect(80, 10, 40, 15), 80));
    expect(querySelectorAll.mock.calls[0]).toEqual([
      ".language-split-before-copy, .language-split-selected-copy, .language-split-seam, .language-split-seam-tail, .language-split-block--after",
    ]);
    expect(leaves[3]!.range.getClientRects).not.toHaveBeenCalled();
  });

  it("never falls back to a transparent canonical button for malformed/non-expand projections", () => {
    const { input, leaves } = elastic();
    expect(measureTrailMaterialBounds({ ...input, projection: { ...input.projection, dataset: { previewMode: "neutral", layoutMode: "expand" } } as HTMLElement })).toBeNull();
    expect(measureTrailMaterialBounds({ ...input, projection: { ...input.projection, dataset: { previewMode: "expand", layoutMode: "neutral" } } as HTMLElement })).toBeNull();
    Object.assign(leaves[4]!.element, { textContent: "stale" });
    expect(measureTrailMaterialBounds(input)).toBeNull();
  });

  it("retains existing language-flow semantics when real partition reflow is shorter than the source", () => {
    const { input } = elastic();
    const shorter = { ...input, text: { ...input.text,
      getBoundingClientRect: () => domRect(rect(140, 200, 120, 140)),
    } as HTMLElement };
    expect(measureTrailMaterialBounds(shorter)?.bottomExtent).toBe(0);
    expect(measureTrailMaterialBounds({ ...shorter, projection: null })?.bottomExtent).toBe(0);
  });

  it("rejects non-finite, negative or missing split depth and non-finite flow geometry", () => {
    const { input } = elastic();
    for (const depth of ["", "NaNpx", "Infinitypx", "-80px", "80px junk", "100000000000000000000px"]) {
      expect(measureTrailMaterialBounds({ ...input, projection: { ...input.projection,
        style: { getPropertyValue: () => depth } } as unknown as HTMLElement })).toBeNull();
    }
    expect(measureTrailMaterialBounds({ ...input, projection: { ...input.projection,
      querySelector: () => ({ getBoundingClientRect: () => domRect(rect(140, 200, 120, Number.NaN)) }),
    } as unknown as HTMLElement })).toBeNull();
  });
});
