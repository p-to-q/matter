import { layoutColumnarTree } from "./columnar-layout";
import type {
  ColumnarLayout,
  ColumnarLayoutInput,
  LayoutError,
  LayoutNode,
} from "./model";
import type { TypographyHeightAuthorityToken } from "./typography-height-ledger";

export type CompleteLayoutProjectionItem = Readonly<{
  depth: number;
  node: Readonly<{ id: string }>;
  parentId: string | null;
}>;

/**
 * Structural rendering-edge input. The production typography owner satisfies
 * this contract without making the pure layout layer depend on a component.
 */
export type CompleteTypographyHeightSnapshot = Readonly<{
  basis: TypographyHeightAuthorityToken;
  heights: readonly number[];
  keys: readonly string[];
  nodeIds: readonly string[];
}>;

export type CompleteLayoutConfig = Omit<ColumnarLayoutInput, "nodes">;

export type CompleteLayoutPublication = Readonly<{
  basis: TypographyHeightAuthorityToken;
  layout: ColumnarLayout;
  nodeIds: readonly string[];
}>;

export type CompleteLayoutPublicationErrorCode =
  | "INVALID_HEIGHT_BASIS"
  | "STALE_HEIGHT_BASIS"
  | "INCOMPLETE_HEIGHT_SNAPSHOT"
  | "INVALID_PROJECTION_NODE_ID"
  | "DUPLICATE_PROJECTION_NODE_ID"
  | "INVALID_SNAPSHOT_NODE_ID"
  | "DUPLICATE_SNAPSHOT_NODE_ID"
  | "HEIGHT_NODE_ORDER_MISMATCH"
  | "INVALID_HEIGHT_KEY"
  | "INVALID_HEIGHT"
  | "LAYOUT_REJECTED"
  | "INCOMPLETE_LAYOUT_PUBLICATION";

export type CompleteLayoutPublicationError = Readonly<{
  code: CompleteLayoutPublicationErrorCode;
  index?: number;
  layoutError?: LayoutError;
  nodeId?: string;
}>;

export type CompleteLayoutPublicationResult =
  | Readonly<{ ok: true; publication: CompleteLayoutPublication }>
  | Readonly<{ ok: false; error: CompleteLayoutPublicationError }>;

/**
 * Converts one complete, owner-issued scalar snapshot into one atomic pure
 * layout publication. No prefix is returned when any authority, order, height,
 * or layout invariant fails.
 */
export function publishCompleteLayout(input: Readonly<{
  expectedBasis: TypographyHeightAuthorityToken;
  layout: CompleteLayoutConfig;
  projection: readonly CompleteLayoutProjectionItem[];
  snapshot: CompleteTypographyHeightSnapshot;
}>): CompleteLayoutPublicationResult {
  const { expectedBasis, projection, snapshot } = input;
  if (!validBasis(expectedBasis) || !validBasis(snapshot.basis)) {
    return failure("INVALID_HEIGHT_BASIS");
  }
  // Typography tokens are instance capabilities. Equal counters copied from a
  // different owner are not authority for this publication.
  if (snapshot.basis !== expectedBasis) return failure("STALE_HEIGHT_BASIS");
  if (
    !Array.isArray(projection) ||
    !Array.isArray(snapshot.heights) ||
    !Array.isArray(snapshot.keys) ||
    !Array.isArray(snapshot.nodeIds) ||
    snapshot.heights.length !== projection.length ||
    snapshot.keys.length !== projection.length ||
    snapshot.nodeIds.length !== projection.length
  ) {
    return failure("INCOMPLETE_HEIGHT_SNAPSHOT");
  }

  const projectionIds = new Set<string>();
  const snapshotIds = new Set<string>();
  const nodes: LayoutNode[] = [];
  for (let index = 0; index < projection.length; index += 1) {
    const item = projection[index];
    const projectionNodeId = item?.node?.id;
    if (typeof projectionNodeId !== "string" || projectionNodeId.length === 0) {
      return failure("INVALID_PROJECTION_NODE_ID", { index });
    }
    if (projectionIds.has(projectionNodeId)) {
      return failure("DUPLICATE_PROJECTION_NODE_ID", { index, nodeId: projectionNodeId });
    }
    projectionIds.add(projectionNodeId);

    const snapshotNodeId = snapshot.nodeIds[index];
    if (typeof snapshotNodeId !== "string" || snapshotNodeId.length === 0) {
      return failure("INVALID_SNAPSHOT_NODE_ID", { index });
    }
    if (snapshotIds.has(snapshotNodeId)) {
      return failure("DUPLICATE_SNAPSHOT_NODE_ID", { index, nodeId: snapshotNodeId });
    }
    snapshotIds.add(snapshotNodeId);
    if (snapshotNodeId !== projectionNodeId) {
      return failure("HEIGHT_NODE_ORDER_MISMATCH", { index, nodeId: snapshotNodeId });
    }

    const key = snapshot.keys[index];
    if (typeof key !== "string" || key.length === 0) {
      return failure("INVALID_HEIGHT_KEY", { index, nodeId: projectionNodeId });
    }
    const height = snapshot.heights[index];
    if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
      return failure("INVALID_HEIGHT", { index, nodeId: projectionNodeId });
    }
    nodes.push(Object.freeze({
      depth: item.depth,
      id: projectionNodeId,
      parentId: item.parentId,
      size: Object.freeze({ height, width: input.layout.columnWidth }),
    }));
  }

  const result = layoutColumnarTree(Object.freeze({
    ...input.layout,
    nodes: Object.freeze(nodes),
  }));
  if (!result.ok) {
    return failure("LAYOUT_REJECTED", {
      layoutError: Object.freeze({ ...result.error }),
      nodeId: result.error.nodeId,
    });
  }
  if (
    result.layout.boxes.length !== projection.length ||
    result.layout.boxes.some((box, index) => box.nodeId !== snapshot.nodeIds[index])
  ) {
    return failure("INCOMPLETE_LAYOUT_PUBLICATION");
  }

  const nodeIds = Object.freeze([...snapshot.nodeIds]);
  return Object.freeze({
    ok: true,
    // Preserve the owner-issued capability identity. The token is already
    // frozen by its ledger; cloning it would make later isCurrent checks fail.
    publication: Object.freeze({ basis: snapshot.basis, layout: result.layout, nodeIds }),
  });
}

function validBasis(value: TypographyHeightAuthorityToken): boolean {
  if (value === null || typeof value !== "object") return false;
  // Owner-issued tokens are frozen capabilities. Requiring that property lets
  // the publication retain identity without admitting later mutation.
  if (!Object.isFrozen(value)) return false;
  for (const epoch of [
    value.authorityGeneration,
    value.documentEpoch,
    value.fontEpoch,
    value.grammarEpoch,
    value.styleEpoch,
  ]) {
    if (!Number.isSafeInteger(epoch) || epoch < 0) return false;
  }
  return typeof value.projectionKey === "string" && value.projectionKey.length > 0;
}

function failure(
  code: CompleteLayoutPublicationErrorCode,
  detail: Omit<CompleteLayoutPublicationError, "code"> = {},
): CompleteLayoutPublicationResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, ...detail }),
  });
}
