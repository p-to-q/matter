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
  largeTargets: boolean;
}>;

/**
 * A local action may disappear when its material has no clear adjacent space.
 * Clamping an overlapping control onto text would turn a layout edge case into
 * an accidental material action.
 */
export function projectNodeHandlePosition(input: Input): NodeHandlePosition | null {
  if (!Number.isInteger(input.toolCount) || input.toolCount < 1) return null;
  const button = input.largeTargets ? 48 : 44;
  const gap = 4;
  // The border-box reserves 4px padding and a 1px border on both sides.
  const chrome = 10;
  const width = button + chrome;
  const height = input.toolCount * button + Math.max(0, input.toolCount - 1) * gap + chrome;
  const inset = 12;
  const minimumLeft = input.documentRect.left + inset;
  const maximumLeft = input.documentRect.right - inset - width;
  const minimumTop = input.documentRect.top + inset;
  const guidanceTop = input.guidanceRect === null
    ? input.documentRect.bottom - inset
    : Math.min(input.documentRect.bottom - inset, input.guidanceRect.top - 14);
  const maximumTop = guidanceTop - height;
  if (maximumLeft < minimumLeft || maximumTop < minimumTop) return null;

  const sideTop = clamp(
    input.textRect.top - 10,
    minimumTop,
    maximumTop,
  );
  const rightAlignedLeft = clamp(input.textRect.right - width, minimumLeft, maximumLeft);
  const candidates = [
    { left: input.textRect.right + 12, top: sideTop },
    { left: rightAlignedLeft, top: input.textRect.top - height - 12 },
    { left: input.textRect.left - width - 12, top: sideTop },
    { left: rightAlignedLeft, top: input.textRect.bottom + 12 },
  ];

  for (const candidate of candidates) {
    const rect = rectangle(candidate.left, candidate.top, width, height);
    if (
      candidate.left >= minimumLeft &&
      candidate.left <= maximumLeft &&
      candidate.top >= minimumTop &&
      candidate.top <= maximumTop &&
      !intersects(input.textRect, rect) &&
      !intersectsNullable(input.railRect, rect) &&
      !intersectsNullable(input.guidanceRect, rect)
    ) {
      return Object.freeze({ left: Math.round(candidate.left), top: Math.round(candidate.top) });
    }
  }
  return null;
}

function rectangle(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
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
