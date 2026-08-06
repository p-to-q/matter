export type ClientRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

export type NodeHandlePosition = Readonly<{ left: number; top: number }>;

type Input = Readonly<{
  documentRect: ClientRect;
  guidanceRect: ClientRect | null;
  railRect: ClientRect | null;
  textRect: ClientRect;
  toolCount: number;
  coarse: boolean;
}>;

/**
 * A local action may disappear when its material has no clear adjacent space.
 * Clamping an overlapping control onto text would turn a layout edge case into
 * an accidental material action.
 */
export function projectNodeHandlePosition(input: Input): NodeHandlePosition | null {
  if (!Number.isInteger(input.toolCount) || input.toolCount < 1) return null;
  const button = input.coarse ? 48 : 44;
  const gap = 4;
  const padding = 5;
  const width = button + padding * 2;
  const height = input.toolCount * button + Math.max(0, input.toolCount - 1) * gap + padding * 2;
  const inset = 12;
  const minimumLeft = input.documentRect.left + inset;
  const maximumLeft = input.documentRect.right - inset - width;
  const minimumTop = input.documentRect.top + inset;
  const guidanceTop = input.guidanceRect === null
    ? input.documentRect.bottom - inset
    : Math.min(input.documentRect.bottom - inset, input.guidanceRect.top - 14);
  const maximumTop = guidanceTop - height;
  if (maximumLeft < minimumLeft || maximumTop < minimumTop) return null;

  const top = clamp(
    input.textRect.top + input.textRect.height / 2 - height / 2,
    minimumTop,
    maximumTop,
  );
  const preferredRight = input.textRect.left + input.textRect.width / 2 < input.documentRect.left + input.documentRect.width / 2;
  const candidates = preferredRight
    ? [input.textRect.right + 12, input.textRect.left - width - 12]
    : [input.textRect.left - width - 12, input.textRect.right + 12];

  for (const left of candidates) {
    const rect = rectangle(left, top, width, height);
    if (
      contains(input.documentRect, rect) &&
      !intersects(input.textRect, rect) &&
      !intersectsNullable(input.railRect, rect) &&
      !intersectsNullable(input.guidanceRect, rect)
    ) {
      return Object.freeze({ left: Math.round(left), top: Math.round(top) });
    }
  }

  const centeredLeft = clamp(
    input.textRect.left + input.textRect.width / 2 - width / 2,
    minimumLeft,
    maximumLeft,
  );
  for (const verticalTop of [input.textRect.top - height - 12, input.textRect.bottom + 12]) {
    const rect = rectangle(centeredLeft, verticalTop, width, height);
    if (
      contains(input.documentRect, rect) &&
      !intersects(input.textRect, rect) &&
      !intersectsNullable(input.railRect, rect) &&
      !intersectsNullable(input.guidanceRect, rect)
    ) {
      return Object.freeze({ left: Math.round(centeredLeft), top: Math.round(verticalTop) });
    }
  }
  return null;
}

function rectangle(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function contains(outer: ClientRect, inner: ClientRect): boolean {
  return inner.left >= outer.left && inner.right <= outer.right &&
    inner.top >= outer.top && inner.bottom <= outer.bottom;
}

function intersectsNullable(rect: ClientRect | null, candidate: ClientRect): boolean {
  return rect !== null && intersects(rect, candidate);
}

function intersects(left: ClientRect, right: ClientRect): boolean {
  return left.left < right.right && left.right > right.left &&
    left.top < right.bottom && left.bottom > right.top;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
