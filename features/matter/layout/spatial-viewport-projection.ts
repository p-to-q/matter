import type { ColumnarLayout, LayoutBounds, LayoutBox } from "./model";

export const VIEWPORT_OVERSCAN_MIN_SCREEN_PX = 160;
export const VIEWPORT_OVERSCAN_MAX_SCREEN_PX = 480;
export const VIEWPORT_OVERSCAN_AXIS_RATIO = .5;

/**
 * Screen-space paper bounds relative to the transformed world origin. Camera
 * translation is therefore already represented by x/y; zoom remains explicit
 * so the pure projector can recover world geometry without consulting the DOM.
 */
export type ScreenPaperViewport = LayoutBounds;

export type SpatialViewportBasis = Readonly<{
  documentEpoch: number;
  layoutEpoch: number;
}>;

export type TransientViewportPinLease = Readonly<{
  documentEpoch: number;
  ids: readonly string[];
  layoutEpoch: number;
  ownerId: string;
}>;

export type InvalidPinOwnerCode =
  | "INVALID_OWNER_ID"
  | "DUPLICATE_OWNER_ID"
  | "INVALID_EPOCH"
  | "STALE_DOCUMENT_EPOCH"
  | "STALE_LAYOUT_EPOCH"
  | "INVALID_PIN_IDS"
  | "EMPTY_PIN_IDS"
  | "INVALID_PIN_ID"
  | "UNKNOWN_PIN_ID";

export type InvalidPinOwner = Readonly<{
  code: InvalidPinOwnerCode;
  nodeId?: string;
  ownerId: string;
}>;

export type SpatialViewportProjection = Readonly<{
  basis: SpatialViewportBasis;
  boxes: readonly LayoutBox[];
  expandedWorldViewport: LayoutBounds;
  invalidPinOwners: readonly InvalidPinOwner[];
  nodeIds: readonly string[];
  pinnedNodeIds: readonly string[];
  validPinOwnerIds: readonly string[];
}>;

export type SpatialViewportProjectionErrorCode =
  | "INVALID_EXPECTED_BASIS"
  | "STALE_LAYOUT_BASIS"
  | "INVALID_SCREEN_VIEWPORT"
  | "INVALID_CAMERA_ZOOM"
  | "VIEWPORT_OVERFLOW"
  | "INVALID_COMPLETE_PREORDER"
  | "INVALID_LAYOUT_BOUNDS"
  | "INVALID_LAYOUT_BOX"
  | "INVALID_PIN_LEASES";

export type SpatialViewportProjectionResult =
  | Readonly<{ ok: true; projection: SpatialViewportProjection }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: SpatialViewportProjectionErrorCode;
        index?: number;
        nodeId?: string;
      }>;
    }>;

/**
 * Derives disposable native material membership from complete authored
 * geometry. A bad lease invalidates only that transient owner; bad global
 * geometry or basis rejects the whole candidate. Pins are always filtered
 * back through the complete preorder and never create node identity.
 */
export function projectSpatialViewport(input: Readonly<{
  cameraZoom: number;
  completePreorderNodeIds: readonly string[];
  expectedBasis: SpatialViewportBasis;
  layout: ColumnarLayout;
  pinLeases: readonly TransientViewportPinLease[];
  screenPaperViewport: ScreenPaperViewport;
}>): SpatialViewportProjectionResult {
  if (!validBasis(input.expectedBasis)) return failure("INVALID_EXPECTED_BASIS");
  if (!Number.isSafeInteger(input.layout.layoutEpoch) || input.layout.layoutEpoch < 0 ||
    input.layout.layoutEpoch !== input.expectedBasis.layoutEpoch) {
    return failure("STALE_LAYOUT_BASIS");
  }
  const viewport = expandedWorldViewport(input.screenPaperViewport, input.cameraZoom);
  if (typeof viewport === "string") return failure(viewport);
  if (!Array.isArray(input.completePreorderNodeIds) || !Array.isArray(input.layout.boxes) ||
    input.completePreorderNodeIds.length !== input.layout.boxes.length) {
    return failure("INVALID_COMPLETE_PREORDER");
  }

  const completeIds = new Set<string>();
  const boxes: LayoutBox[] = [];
  for (let index = 0; index < input.completePreorderNodeIds.length; index += 1) {
    const nodeId = input.completePreorderNodeIds[index];
    if (typeof nodeId !== "string" || nodeId.length === 0 || completeIds.has(nodeId)) {
      return failure("INVALID_COMPLETE_PREORDER", { index, nodeId });
    }
    const box = input.layout.boxes[index];
    if (box === undefined || box.nodeId !== nodeId || !validLayoutBox(box)) {
      return failure("INVALID_LAYOUT_BOX", { index, nodeId });
    }
    completeIds.add(nodeId);
    // C2 publishes frozen boxes. The fallback copy keeps this result immutable
    // for structurally valid synthetic callers without mutating their input.
    boxes.push(Object.isFrozen(box) ? box : Object.freeze({ ...box }));
  }
  if (!validLayoutBounds(input.layout.bounds, input.layout.boxes.length === 0)) {
    return failure("INVALID_LAYOUT_BOUNDS");
  }
  if (!Array.isArray(input.pinLeases)) return failure("INVALID_PIN_LEASES");

  const reconciliation = reconcilePinLeases(
    input.pinLeases,
    input.expectedBasis,
    completeIds,
    input.completePreorderNodeIds,
  );
  const pinned = new Set(reconciliation.pinnedNodeIds);
  const expandedRight = viewport.x + viewport.width;
  const expandedBottom = viewport.y + viewport.height;
  const projectedBoxes: LayoutBox[] = [];
  const projectedNodeIds: string[] = [];
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]!;
    const intersects = box.x <= expandedRight && box.x + box.width >= viewport.x &&
      box.y <= expandedBottom && box.y + box.height >= viewport.y;
    if (!intersects && !pinned.has(box.nodeId)) continue;
    projectedBoxes.push(box);
    projectedNodeIds.push(box.nodeId);
  }

  return Object.freeze({
    ok: true,
    projection: Object.freeze({
      basis: Object.freeze({ ...input.expectedBasis }),
      boxes: Object.freeze(projectedBoxes),
      expandedWorldViewport: viewport,
      invalidPinOwners: reconciliation.invalidOwners,
      nodeIds: Object.freeze(projectedNodeIds),
      pinnedNodeIds: reconciliation.pinnedNodeIds,
      validPinOwnerIds: reconciliation.validOwnerIds,
    }),
  });
}

function reconcilePinLeases(
  leases: readonly TransientViewportPinLease[],
  basis: SpatialViewportBasis,
  completeIds: ReadonlySet<string>,
  completePreorderNodeIds: readonly string[],
): Readonly<{
  invalidOwners: readonly InvalidPinOwner[];
  pinnedNodeIds: readonly string[];
  validOwnerIds: readonly string[];
}> {
  const ownerCounts = new Map<string, number>();
  for (const lease of leases) {
    const ownerId = lease?.ownerId;
    if (typeof ownerId !== "string" || ownerId.length === 0) continue;
    ownerCounts.set(ownerId, (ownerCounts.get(ownerId) ?? 0) + 1);
  }

  const invalidOwners: InvalidPinOwner[] = [];
  const reportedInvalidOwners = new Set<string>();
  const pinned = new Set<string>();
  const validOwnerIds: string[] = [];
  for (let index = 0; index < leases.length; index += 1) {
    const lease = leases[index];
    const ownerId = lease?.ownerId;
    if (typeof ownerId !== "string" || ownerId.length === 0) {
      invalidOwners.push(invalidOwner("", "INVALID_OWNER_ID"));
      continue;
    }
    if ((ownerCounts.get(ownerId) ?? 0) > 1) {
      if (!reportedInvalidOwners.has(ownerId)) {
        invalidOwners.push(invalidOwner(ownerId, "DUPLICATE_OWNER_ID"));
        reportedInvalidOwners.add(ownerId);
      }
      continue;
    }
    const rejected = invalidLease(lease, basis, completeIds);
    if (rejected !== null) {
      invalidOwners.push(rejected);
      continue;
    }
    validOwnerIds.push(ownerId);
    for (const id of lease.ids) pinned.add(id);
  }

  return Object.freeze({
    invalidOwners: Object.freeze(invalidOwners),
    pinnedNodeIds: Object.freeze(completePreorderNodeIds.filter((id) => pinned.has(id))),
    validOwnerIds: Object.freeze(validOwnerIds),
  });
}

function invalidLease(
  lease: TransientViewportPinLease,
  basis: SpatialViewportBasis,
  completeIds: ReadonlySet<string>,
): InvalidPinOwner | null {
  if (!validEpoch(lease.documentEpoch) || !validEpoch(lease.layoutEpoch)) {
    return invalidOwner(lease.ownerId, "INVALID_EPOCH");
  }
  if (lease.documentEpoch !== basis.documentEpoch) {
    return invalidOwner(lease.ownerId, "STALE_DOCUMENT_EPOCH");
  }
  if (lease.layoutEpoch !== basis.layoutEpoch) {
    return invalidOwner(lease.ownerId, "STALE_LAYOUT_EPOCH");
  }
  if (!Array.isArray(lease.ids)) return invalidOwner(lease.ownerId, "INVALID_PIN_IDS");
  if (lease.ids.length === 0) return invalidOwner(lease.ownerId, "EMPTY_PIN_IDS");
  for (const id of lease.ids) {
    if (typeof id !== "string" || id.length === 0) {
      return invalidOwner(lease.ownerId, "INVALID_PIN_ID");
    }
    if (!completeIds.has(id)) return invalidOwner(lease.ownerId, "UNKNOWN_PIN_ID", id);
  }
  return null;
}

function expandedWorldViewport(
  screen: ScreenPaperViewport,
  zoom: number,
): LayoutBounds | "INVALID_SCREEN_VIEWPORT" | "INVALID_CAMERA_ZOOM" | "VIEWPORT_OVERFLOW" {
  if (!validPositiveRect(screen)) return "INVALID_SCREEN_VIEWPORT";
  if (!Number.isFinite(zoom) || zoom <= 0) return "INVALID_CAMERA_ZOOM";
  const overscanX = clampScreenOverscan(screen.width) / zoom;
  const overscanY = clampScreenOverscan(screen.height) / zoom;
  const worldX = screen.x / zoom;
  const worldY = screen.y / zoom;
  const worldWidth = screen.width / zoom;
  const worldHeight = screen.height / zoom;
  const expanded = {
    x: worldX - overscanX,
    y: worldY - overscanY,
    width: worldWidth + overscanX * 2,
    height: worldHeight + overscanY * 2,
  };
  if (!validPositiveRect(expanded)) return "VIEWPORT_OVERFLOW";
  return Object.freeze(expanded);
}

function clampScreenOverscan(axis: number): number {
  return Math.min(
    VIEWPORT_OVERSCAN_MAX_SCREEN_PX,
    Math.max(VIEWPORT_OVERSCAN_MIN_SCREEN_PX, axis * VIEWPORT_OVERSCAN_AXIS_RATIO),
  );
}

function validBasis(basis: SpatialViewportBasis): boolean {
  return basis !== null && typeof basis === "object" &&
    validEpoch(basis.documentEpoch) && validEpoch(basis.layoutEpoch);
}

function validEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validPositiveRect(rect: LayoutBounds): boolean {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
    rect.width > 0 && rect.height > 0 &&
    Number.isFinite(rect.x + rect.width) && Number.isFinite(rect.y + rect.height);
}

function validLayoutBounds(bounds: LayoutBounds, empty: boolean): boolean {
  return Number.isFinite(bounds.x) && Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) && Number.isFinite(bounds.height) &&
    bounds.width >= 0 && bounds.height >= 0 &&
    (empty || (bounds.width > 0 && bounds.height > 0)) &&
    Number.isFinite(bounds.x + bounds.width) && Number.isFinite(bounds.y + bounds.height);
}

function validLayoutBox(box: LayoutBox): boolean {
  return typeof box.nodeId === "string" && box.nodeId.length > 0 &&
    Number.isFinite(box.x) && Number.isFinite(box.y) &&
    Number.isFinite(box.width) && Number.isFinite(box.height) &&
    box.width > 0 && box.height > 0 &&
    Number.isFinite(box.x + box.width) && Number.isFinite(box.y + box.height);
}

function invalidOwner(
  ownerId: string,
  code: InvalidPinOwnerCode,
  nodeId?: string,
): InvalidPinOwner {
  return Object.freeze(nodeId === undefined ? { code, ownerId } : { code, nodeId, ownerId });
}

function failure(
  code: SpatialViewportProjectionErrorCode,
  detail: Readonly<{ index?: number; nodeId?: string }> = {},
): SpatialViewportProjectionResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code, ...detail }) });
}
