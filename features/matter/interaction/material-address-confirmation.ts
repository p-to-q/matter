import type { MaterialAddressProjection } from "./projected-layout-receipt";

export type MaterialAddressConfirmationBasis = Readonly<{
  addressKey: string;
  direction: MaterialAddressProjection["direction"];
  documentEpoch: number;
  layoutEpoch: number;
  nodeId: string;
  outlinePath: string;
  partitionKey: string;
  treeId: string;
  viewportKey: string;
}>;

export type MaterialAddressConfirmationPress = Readonly<{
  basis: MaterialAddressConfirmationBasis;
  cancelled: boolean;
  pointerId: number;
  pointerType: "mouse" | "pen" | "touch";
  startClientX: number;
  startClientY: number;
}>;

type ConfirmationPointer = Readonly<{
  button: number;
  clientX: number;
  clientY: number;
  isPrimary: boolean;
  pointerId: number;
  pointerType: string;
}>;

const MOUSE_PEN_TAP_SLOP_PX = 4;
const TOUCH_TAP_SLOP_PX = 8;

/**
 * Freezes the exact rendered address a confirming pointer began on. The
 * component owns pointer capture; this policy owns only tap qualification.
 */
export function createMaterialAddressConfirmationBasis(
  projection: MaterialAddressProjection,
  outlinePath: string,
): MaterialAddressConfirmationBasis {
  return Object.freeze({
    addressKey: projection.basis.addressKey,
    direction: projection.direction,
    documentEpoch: projection.basis.documentEpoch,
    layoutEpoch: projection.basis.layoutEpoch,
    nodeId: projection.basis.nodeId,
    outlinePath,
    partitionKey: projection.basis.partitionKey,
    treeId: projection.basis.treeId,
    viewportKey: projection.basis.viewportKey,
  });
}

export function beginMaterialAddressConfirmation(
  basis: MaterialAddressConfirmationBasis,
  pointer: ConfirmationPointer,
): MaterialAddressConfirmationPress | null {
  const pointerType = normalizePointerType(pointer.pointerType);
  if (
    pointerType === null || !pointer.isPrimary || pointer.button !== 0 ||
    !Number.isSafeInteger(pointer.pointerId) || pointer.pointerId < 0 ||
    !Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)
  ) return null;
  return Object.freeze({
    basis,
    cancelled: false,
    pointerId: pointer.pointerId,
    pointerType,
    startClientX: pointer.clientX,
    startClientY: pointer.clientY,
  });
}

export function moveMaterialAddressConfirmation(
  press: MaterialAddressConfirmationPress,
  pointer: Pick<ConfirmationPointer, "clientX" | "clientY" | "pointerId">,
): MaterialAddressConfirmationPress {
  if (pointer.pointerId !== press.pointerId || press.cancelled) return press;
  if (!Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) {
    return Object.freeze({ ...press, cancelled: true });
  }
  const slop = press.pointerType === "touch" ? TOUCH_TAP_SLOP_PX : MOUSE_PEN_TAP_SLOP_PX;
  return Math.hypot(
    pointer.clientX - press.startClientX,
    pointer.clientY - press.startClientY,
  ) > slop
    ? Object.freeze({ ...press, cancelled: true })
    : press;
}

export function finishesMaterialAddressConfirmation(
  press: MaterialAddressConfirmationPress,
  currentBasis: MaterialAddressConfirmationBasis,
  pointer: Pick<ConfirmationPointer, "clientX" | "clientY" | "pointerId">,
  insideCurrentAddress: boolean,
  currentOutlinePath: string | null,
): boolean {
  const moved = moveMaterialAddressConfirmation(press, pointer);
  return !moved.cancelled &&
    moved.pointerId === pointer.pointerId &&
    insideCurrentAddress &&
    currentOutlinePath === currentBasis.outlinePath &&
    sameMaterialAddressConfirmationBasis(moved.basis, currentBasis);
}

export function sameMaterialAddressConfirmationBasis(
  left: MaterialAddressConfirmationBasis,
  right: MaterialAddressConfirmationBasis,
): boolean {
  return left.addressKey === right.addressKey &&
    left.direction === right.direction &&
    left.documentEpoch === right.documentEpoch &&
    left.layoutEpoch === right.layoutEpoch &&
    left.nodeId === right.nodeId &&
    left.outlinePath === right.outlinePath &&
    left.partitionKey === right.partitionKey &&
    left.treeId === right.treeId &&
    left.viewportKey === right.viewportKey;
}

function normalizePointerType(value: string): MaterialAddressConfirmationPress["pointerType"] | null {
  return value === "mouse" || value === "pen" || value === "touch" ? value : null;
}
