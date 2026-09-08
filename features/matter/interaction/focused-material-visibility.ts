import type {
  CanvasAttentionGeometry,
  ClientRectGeometry,
} from "./canvas-viewport";

export type FocusedMaterialVisibilityInput = Readonly<{
  target: ClientRectGeometry;
  paper: ClientRectGeometry;
  visualViewport: ClientRectGeometry;
  occluders: readonly ClientRectGeometry[];
}>;

/**
 * Returns the largest unobscured paper field only when the focused material
 * is not already fully perceivable there. DOM measurement remains with the
 * caller; this policy owns only finite rectangle arithmetic.
 */
export function projectFocusedMaterialRevealField(
  input: FocusedMaterialVisibilityInput,
): CanvasAttentionGeometry | null {
  if (
    !validRect(input.target) ||
    !validRect(input.paper) ||
    !validRect(input.visualViewport) ||
    input.occluders.some((rect) => !validRect(rect))
  ) return null;
  let field = intersect(input.paper, input.visualViewport);
  if (field === null) return null;
  if (
    contains(field, input.target) &&
    input.occluders.every((occluder) => intersect(occluder, input.target) === null)
  ) return null;
  for (const occluder of input.occluders) {
    field = largestRemainder(field, occluder);
    if (field === null) return null;
  }
  if (contains(field, input.target)) return null;
  return Object.freeze({
    x: field.left + field.width / 2,
    y: field.top + field.height / 2,
    width: field.width,
    height: field.height,
  });
}

function largestRemainder(
  field: ClientRectGeometry,
  occluder: ClientRectGeometry,
): ClientRectGeometry | null {
  const overlap = intersect(field, occluder);
  if (overlap === null) return field;
  const fieldRight = field.left + field.width;
  const fieldBottom = field.top + field.height;
  const overlapRight = overlap.left + overlap.width;
  const overlapBottom = overlap.top + overlap.height;
  const candidates = [
    rect(field.left, field.top, overlap.left - field.left, field.height),
    rect(overlapRight, field.top, fieldRight - overlapRight, field.height),
    rect(field.left, field.top, field.width, overlap.top - field.top),
    rect(field.left, overlapBottom, field.width, fieldBottom - overlapBottom),
  ].filter((candidate): candidate is ClientRectGeometry => candidate !== null);
  return candidates.sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? null;
}

function intersect(
  first: ClientRectGeometry,
  second: ClientRectGeometry,
): ClientRectGeometry | null {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  return rect(
    left,
    top,
    Math.min(first.left + first.width, second.left + second.width) - left,
    Math.min(first.top + first.height, second.top + second.height) - top,
  );
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): ClientRectGeometry | null {
  return width > 0 && height > 0 ? Object.freeze({ left, top, width, height }) : null;
}

function contains(field: ClientRectGeometry, target: ClientRectGeometry): boolean {
  return target.left >= field.left &&
    target.top >= field.top &&
    target.left + target.width <= field.left + field.width &&
    target.top + target.height <= field.top + field.height;
}

function validRect(value: ClientRectGeometry): boolean {
  return Number.isFinite(value.left) && Number.isFinite(value.top) &&
    Number.isFinite(value.width) && Number.isFinite(value.height) &&
    value.width > 0 && value.height > 0;
}
