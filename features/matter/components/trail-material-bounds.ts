import type { TrailRect } from "../layout/operation-trail";
import { createMaterialTextRange, normalizeClientRects, type ClientTextRect } from "../interaction/range-measurement";

type ClientOrigin = Readonly<{ left: number; top: number }>;
export type TrailMaterialMeasurement = Readonly<{
  bounds: TrailRect;
  firstRow: TrailRect;
  bottomExtent: number;
}>;

/** Only the world's supported uniform, two-dimensional camera has an inverse here. */
export function trailWorldScale(matrix: Pick<DOMMatrixReadOnly,
  "m11" | "m12" | "m13" | "m14" | "m21" | "m22" | "m23" | "m24" |
  "m31" | "m32" | "m33" | "m34" | "m41" | "m42" | "m43" | "m44">): number | null {
  const offAxis = [matrix.m12, matrix.m13, matrix.m14, matrix.m21, matrix.m23, matrix.m24,
    matrix.m31, matrix.m32, matrix.m34, matrix.m43];
  return [...offAxis, matrix.m11, matrix.m22, matrix.m33, matrix.m41, matrix.m42, matrix.m44].every(Number.isFinite) &&
    offAxis.every((value) => value === 0) && matrix.m11 > 0 && matrix.m11 === matrix.m22 &&
    matrix.m33 === 1 && matrix.m44 === 1 ? matrix.m11 : null;
}

/** Plain world geometry; neither the first text row nor its envelope follows camera motion. */
export function trailMaterialBoundsFromClientRects(input: Readonly<{
  rects: readonly ClientTextRect[];
  picture: ClientTextRect | null;
  canvasOrigin: ClientOrigin;
  scale: number;
  bottomExtent?: number;
}>): TrailMaterialMeasurement | null {
  const bottomExtent = input.bottomExtent ?? 0;
  if (!Number.isFinite(input.scale) || input.scale <= 0 || !Number.isFinite(bottomExtent) || bottomExtent < 0 ||
    !Number.isFinite(input.canvasOrigin.left) || !Number.isFinite(input.canvasOrigin.top) || input.rects.length === 0) return null;
  const rects = input.picture === null ? input.rects : [...input.rects, input.picture];
  if (rects.some((rect) => !finiteRect(rect))) return null;
  const first = input.rects.reduce((earliest, rect) => rect.y < earliest.y ? rect : earliest);
  const firstRow = input.rects.filter((rect) =>
    Math.min(rect.y + rect.height, first.y + first.height) - Math.max(rect.y, first.y) > Math.min(rect.height, first.height) / 2);
  const world = (values: readonly ClientTextRect[]): TrailRect | null => {
    const left = Math.min(...values.map((rect) => rect.x));
    const top = Math.min(...values.map((rect) => rect.y));
    const right = Math.max(...values.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...values.map((rect) => rect.y + rect.height));
    const result = { x: (left - input.canvasOrigin.left) / input.scale, y: (top - input.canvasOrigin.top) / input.scale,
      width: (right - left) / input.scale, height: (bottom - top) / input.scale };
    return finiteRect(result) ? Object.freeze(result) : null;
  };
  const bounds = world(rects);
  const row = world(firstRow);
  return bounds === null || row === null ? null : Object.freeze({ bounds, firstRow: row, bottomExtent });
}

/** Canonical text is mandatory; an active Elastic projection has no hidden-button fallback. */
export function measureTrailMaterialBounds(input: Readonly<{
  text: HTMLElement;
  canonicalText: string;
  projection: HTMLElement | null;
  picture: HTMLElement | null;
  expectsPicture: boolean;
  canvasOrigin: ClientOrigin;
  scale: number;
}>): TrailMaterialMeasurement | null {
  if (!input.text.isConnected || input.text.textContent !== input.canonicalText || input.canonicalText.length === 0 ||
    input.expectsPicture !== (input.picture !== null) || (input.picture !== null && !input.picture.isConnected)) return null;
  try {
    let rects: readonly ClientTextRect[];
    let bottomExtent = 0;
    if (input.projection === null) {
      const measured = measureCanonicalLeaf(input.text, input.canonicalText);
      if (measured === null) return null;
      rects = measured;
    } else {
      const projection = input.projection;
      if (!projection.isConnected || projection.dataset.previewMode !== "expand" || projection.dataset.layoutMode !== "expand") return null;
      const leaves = Array.from(projection.querySelectorAll<HTMLElement>(
        ".language-split-before-copy, .language-split-selected-copy, .language-split-seam, .language-split-seam-tail, .language-split-block--after",
      ));
      // These are the visible partitions, never the hidden witness tail or the blank slot.
      if (leaves.length < 4 || leaves.map((leaf) => leaf.textContent ?? "").join("") !== input.canonicalText) return null;
      const measured: ClientTextRect[] = [];
      for (const leaf of leaves) {
        const text = leaf.textContent ?? "";
        if (text.length === 0) continue;
        const fragment = measureCanonicalLeaf(leaf, text);
        if (fragment === null) return null;
        const witness = leaf.closest<HTMLElement>(".language-split-witness");
        const clip = witness?.getBoundingClientRect() ?? null;
        if (clip !== null && ![clip.left, clip.top, clip.right, clip.bottom].every(Number.isFinite)) return null;
        for (const rect of fragment) {
          if (clip === null) { measured.push(rect); continue; }
          const x = Math.max(rect.x, clip.left);
          const y = Math.max(rect.y, clip.top);
          const right = Math.min(rect.x + rect.width, clip.right);
          const bottom = Math.min(rect.y + rect.height, clip.bottom);
          if (right > x && bottom > y) measured.push({ x, y, width: right - x, height: bottom - y });
        }
      }
      const flow = projection.querySelector<HTMLElement>(":scope > .language-split-flow")?.getBoundingClientRect();
      const source = input.text.getBoundingClientRect();
      const depth = projection.style.getPropertyValue("--split-depth").trim();
      if (flow === undefined || !/^\d+(?:\.\d+)?px$/u.test(depth) || !Number.isFinite(Number.parseFloat(depth)) ||
        !Number.isFinite(flow.height) || !Number.isFinite(source.height) || flow.height <= 0 || source.height <= 0 ||
        !Number.isFinite(input.scale) || input.scale <= 0 || Number.parseFloat(depth) > flow.height / input.scale + 1) return null;
      // Real flow already contains the slot; adding --split-depth again would double its damage.
      bottomExtent = Math.max(0, (flow.height - source.height) / input.scale);
      rects = measured;
    }
    const picture = input.picture?.getBoundingClientRect() ?? null;
    return trailMaterialBoundsFromClientRects({ rects, bottomExtent,
      picture: picture === null ? null : { x: picture.left, y: picture.top, width: picture.width, height: picture.height },
      canvasOrigin: input.canvasOrigin, scale: input.scale });
  } catch {
    return null;
  }
}

function measureCanonicalLeaf(root: HTMLElement, text: string): readonly ClientTextRect[] | null {
  const range = createMaterialTextRange(root, text, 0, text.length);
  if (range === null) return null;
  try {
    const measured = Array.from(range.getClientRects());
    if (measured.some((rect) => ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite))) return null;
    const rects = normalizeClientRects(measured);
    return rects.length > 0 || text.trim().length === 0 ? rects : null;
  } finally {
    range.detach();
  }
}

function finiteRect(rect: ClientTextRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0;
}
