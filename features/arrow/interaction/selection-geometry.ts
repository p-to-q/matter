import type { Point, Rect, TextSelection, ThoughtObject } from "../engine/protocol";

export type TokenBox = {
  objectId: string;
  start: number;
  end: number;
  text: string;
  rect: Rect;
};

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }

  return inside;
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function pathArea(points: Point[]) {
  return Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

export function mergeTokenRects(rects: Rect[], lineTolerance = 6): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: Rect[] = [];

  for (const rect of sorted) {
    const previous = merged.at(-1);
    const sameLine =
      previous && Math.abs(previous.y + previous.height / 2 - (rect.y + rect.height / 2)) <= lineTolerance;
    const close = previous && rect.x <= previous.x + previous.width + 9;

    if (previous && sameLine && close) {
      const right = Math.max(previous.x + previous.width, rect.x + rect.width);
      const bottom = Math.max(previous.y + previous.height, rect.y + rect.height);
      previous.x = Math.min(previous.x, rect.x);
      previous.y = Math.min(previous.y, rect.y);
      previous.width = right - previous.x;
      previous.height = bottom - previous.y;
    } else {
      merged.push({ ...rect });
    }
  }

  return merged;
}

export function resolveLassoSelection(
  points: Point[],
  tokens: TokenBox[],
  thoughts: Record<string, ThoughtObject>,
): TextSelection | null {
  if (points.length < 4 || pathArea(points) < 36) return null;

  const hitsByObject = new Map<string, TokenBox[]>();
  for (const token of tokens) {
    if (!pointInPolygon(rectCenter(token.rect), points)) continue;
    const hits = hitsByObject.get(token.objectId) ?? [];
    hits.push(token);
    hitsByObject.set(token.objectId, hits);
  }

  const best = [...hitsByObject.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) return null;

  const [objectId, hits] = best;
  const thought = thoughts[objectId];
  if (!thought) return null;

  const start = Math.min(...hits.map((token) => token.start));
  let end = Math.max(...hits.map((token) => token.end));
  while (end < thought.text.length && /[，。！？；：、,.!?;:]/.test(thought.text[end])) {
    end += 1;
  }

  const selectedTokens = tokens.filter(
    (token) => token.objectId === objectId && token.start >= start && token.end <= end,
  );

  return {
    type: "text-range",
    objectId,
    start,
    end,
    selectedText: thought.text.slice(start, end),
    before: thought.text.slice(0, start),
    after: thought.text.slice(end),
    screenRects: mergeTokenRects(selectedTokens.map((token) => token.rect)),
  };
}
