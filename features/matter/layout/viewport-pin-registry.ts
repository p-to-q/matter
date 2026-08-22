export const VIEWPORT_PIN_OWNER_IDS = Object.freeze([
  "selected",
  "focus",
  "dom-focus",
  "camera",
  "lasso",
  "stretch",
  "drag",
  "admission",
] as const);

export type ViewportPinOwnerId = (typeof VIEWPORT_PIN_OWNER_IDS)[number];

export type ViewportPinRegistryBasis = Readonly<{
  documentEpoch: number;
  layoutEpoch: number;
  projectionEpoch: number;
}>;

/**
 * An immutable transient capability. Release authority depends on object
 * identity, not on forgeable equal fields, so an older lifecycle cannot clear
 * a newer lease for the same owner.
 */
export type ViewportPinLease = Readonly<{
  basis: ViewportPinRegistryBasis;
  ids: readonly string[];
  ownerId: ViewportPinOwnerId;
  serial: number;
}>;

export type ViewportPinRegistryState = Readonly<{
  basis: ViewportPinRegistryBasis;
  lastLeaseSerial: number;
  leases: readonly ViewportPinLease[];
}>;

export type ViewportPinRegistryErrorCode =
  | "INVALID_REGISTRY"
  | "DUPLICATE_OWNER"
  | "INVALID_EXPECTED_BASIS"
  | "STALE_REGISTRY_BASIS"
  | "INVALID_COMPLETE_PREORDER"
  | "UNRECONCILED_OWNER"
  | "INVALID_OWNER"
  | "INVALID_PIN_IDS"
  | "EMPTY_PIN_IDS"
  | "INVALID_PIN_ID"
  | "DUPLICATE_PIN_ID"
  | "UNKNOWN_PIN_ID"
  | "LEASE_SERIAL_EXHAUSTED";

export type ViewportPinRegistryError = Readonly<{
  code: ViewportPinRegistryErrorCode;
  index?: number;
  nodeId?: string;
  ownerId?: string;
}>;

export type ViewportPinRegistryFailure = Readonly<{
  error: ViewportPinRegistryError;
  ok: false;
}>;

export type AcquireViewportPinLeaseResult =
  | Readonly<{
      lease: ViewportPinLease;
      ok: true;
      replaced: boolean;
      state: ViewportPinRegistryState;
    }>
  | ViewportPinRegistryFailure;

export type ReleaseViewportPinLeaseResult =
  | Readonly<{
      ok: true;
      state: ViewportPinRegistryState;
      status: "released" | "late-release";
    }>
  | ViewportPinRegistryFailure;

export type ViewportPinInvalidationCode =
  | "DOCUMENT_INVALIDATED"
  | "LAYOUT_INVALIDATED"
  | "PROJECTION_INVALIDATED"
  | "UNKNOWN_PIN_ID";

export type ViewportPinInvalidation = Readonly<{
  code: ViewportPinInvalidationCode;
  nodeId?: string;
  ownerId: ViewportPinOwnerId;
}>;

export type ViewportPinReconciliation = Readonly<{
  activeOwnerIds: readonly ViewportPinOwnerId[];
  invalidatedOwners: readonly ViewportPinInvalidation[];
  leases: readonly ViewportPinLease[];
  orderedPinnedNodeIds: readonly string[];
  state: ViewportPinRegistryState;
}>;

export type ReconcileViewportPinRegistryResult =
  | Readonly<{ ok: true; reconciliation: ViewportPinReconciliation }>
  | ViewportPinRegistryFailure;

const OWNER_ORDER = new Map<ViewportPinOwnerId, number>(
  VIEWPORT_PIN_OWNER_IDS.map((ownerId, index) => [ownerId, index]),
);

/** Creates one empty transient registry for a complete projection basis. */
export function createViewportPinRegistry(
  basis: ViewportPinRegistryBasis,
): ViewportPinRegistryState {
  if (!validBasis(basis)) {
    throw new TypeError("Viewport pin epochs must be non-negative safe integers.");
  }
  return frozenState(frozenBasis(basis), Object.freeze([]), 0);
}

/**
 * Acquires or atomically replaces one owner's lease. Callers must first
 * reconcile the registry with the same complete preorder; this function
 * verifies that no existing lease became structurally stale in between.
 */
export function acquireViewportPinLease(input: Readonly<{
  completePreorderNodeIds: readonly string[];
  expectedBasis: ViewportPinRegistryBasis;
  ids: readonly string[];
  ownerId: ViewportPinOwnerId;
  state: ViewportPinRegistryState;
}>): AcquireViewportPinLeaseResult {
  const invalidState = invalidRegistry(input.state);
  if (invalidState !== null) return existingFailure(invalidState);
  if (!validBasis(input.expectedBasis)) return failure("INVALID_EXPECTED_BASIS");
  if (!equalBasis(input.state.basis, input.expectedBasis)) {
    return failure("STALE_REGISTRY_BASIS");
  }
  const preorder = validateCompletePreorder(input.completePreorderNodeIds);
  if (!preorder.ok) return preorder;
  for (const existing of input.state.leases) {
    for (const id of existing.ids) {
      if (!preorder.ids.has(id)) {
        return failure("UNRECONCILED_OWNER", { ownerId: existing.ownerId, nodeId: id });
      }
    }
  }
  if (!isOwnerId(input.ownerId)) {
    return failure("INVALID_OWNER", { ownerId: String(input.ownerId ?? "") });
  }
  const validatedIds = validateLeaseIds(input.ids, preorder.ids, input.ownerId);
  if (!validatedIds.ok) return validatedIds;
  if (input.state.lastLeaseSerial >= Number.MAX_SAFE_INTEGER) {
    return failure("LEASE_SERIAL_EXHAUSTED", { ownerId: input.ownerId });
  }

  const serial = input.state.lastLeaseSerial + 1;
  const lease: ViewportPinLease = Object.freeze({
    basis: input.state.basis,
    ids: validatedIds.ids,
    ownerId: input.ownerId,
    serial,
  });
  const replaced = input.state.leases.some(({ ownerId }) => ownerId === input.ownerId);
  const leases = [...input.state.leases.filter(({ ownerId }) => ownerId !== input.ownerId), lease]
    .sort(compareLeaseOwner);
  const state = frozenState(input.state.basis, Object.freeze(leases), serial);
  return Object.freeze({ lease, ok: true, replaced, state });
}

/**
 * Releases only the exact current lease. Replaced, copied, foreign and
 * post-invalidation leases are classified as late and leave state untouched.
 */
export function releaseViewportPinLease(input: Readonly<{
  lease: ViewportPinLease;
  state: ViewportPinRegistryState;
}>): ReleaseViewportPinLeaseResult {
  const invalidState = invalidRegistry(input.state);
  if (invalidState !== null) return existingFailure(invalidState);
  const current = input.state.leases.find(({ ownerId }) => ownerId === input.lease?.ownerId);
  if (current !== input.lease) {
    return Object.freeze({ ok: true, state: input.state, status: "late-release" });
  }
  const leases = Object.freeze(input.state.leases.filter((lease) => lease !== current));
  return Object.freeze({
    ok: true,
    state: frozenState(input.state.basis, leases, input.state.lastLeaseSerial),
    status: "released",
  });
}

/**
 * Reconciles transient intent against one complete authored preorder. Basis
 * changes cancel every owner; identity loss under a stable basis cancels only
 * the affected owner. The pinned union is always emitted in complete preorder.
 */
export function reconcileViewportPinRegistry(input: Readonly<{
  basis: ViewportPinRegistryBasis;
  completePreorderNodeIds: readonly string[];
  state: ViewportPinRegistryState;
}>): ReconcileViewportPinRegistryResult {
  const invalidState = invalidRegistry(input.state);
  if (invalidState !== null) return existingFailure(invalidState);
  if (!validBasis(input.basis)) return failure("INVALID_EXPECTED_BASIS");
  const preorder = validateCompletePreorder(input.completePreorderNodeIds);
  if (!preorder.ok) return preorder;

  const basisInvalidation = invalidationForBasis(input.state.basis, input.basis);
  if (basisInvalidation !== null) {
    const invalidatedOwners = Object.freeze(input.state.leases.map(({ ownerId }) =>
      frozenInvalidation(ownerId, basisInvalidation)));
    const state = frozenState(
      frozenBasis(input.basis),
      Object.freeze([]),
      input.state.lastLeaseSerial,
    );
    return reconciliation(state, invalidatedOwners, Object.freeze([]));
  }

  const leases: ViewportPinLease[] = [];
  const invalidatedOwners: ViewportPinInvalidation[] = [];
  for (const lease of input.state.leases) {
    const missing = lease.ids.find((id) => !preorder.ids.has(id));
    if (missing !== undefined) {
      invalidatedOwners.push(frozenInvalidation(lease.ownerId, "UNKNOWN_PIN_ID", missing));
      continue;
    }
    leases.push(lease);
  }
  const frozenLeases = invalidatedOwners.length === 0
    ? input.state.leases
    : Object.freeze(leases);
  const state = invalidatedOwners.length === 0
    ? input.state
    : frozenState(input.state.basis, frozenLeases, input.state.lastLeaseSerial);
  return reconciliation(state, Object.freeze(invalidatedOwners), input.completePreorderNodeIds);
}

function reconciliation(
  state: ViewportPinRegistryState,
  invalidatedOwners: readonly ViewportPinInvalidation[],
  completePreorderNodeIds: readonly string[],
): ReconcileViewportPinRegistryResult {
  const pinned = new Set<string>();
  for (const lease of state.leases) {
    for (const id of lease.ids) pinned.add(id);
  }
  const orderedPinnedNodeIds = Object.freeze(
    completePreorderNodeIds.filter((id) => pinned.has(id)),
  );
  return Object.freeze({
    ok: true,
    reconciliation: Object.freeze({
      activeOwnerIds: Object.freeze(state.leases.map(({ ownerId }) => ownerId)),
      invalidatedOwners,
      leases: state.leases,
      orderedPinnedNodeIds,
      state,
    }),
  });
}

function validateCompletePreorder(nodeIds: readonly string[]):
  | Readonly<{ ids: ReadonlySet<string>; ok: true }>
  | ViewportPinRegistryFailure {
  if (!Array.isArray(nodeIds)) return failure("INVALID_COMPLETE_PREORDER");
  const ids = new Set<string>();
  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index];
    if (typeof nodeId !== "string" || nodeId.length === 0 || ids.has(nodeId)) {
      return failure("INVALID_COMPLETE_PREORDER", { index, nodeId });
    }
    ids.add(nodeId);
  }
  return Object.freeze({ ids, ok: true });
}

function validateLeaseIds(
  ids: readonly string[],
  completeIds: ReadonlySet<string>,
  ownerId: ViewportPinOwnerId,
): Readonly<{ ids: readonly string[]; ok: true }> | ViewportPinRegistryFailure {
  if (!Array.isArray(ids)) return failure("INVALID_PIN_IDS", { ownerId });
  if (ids.length === 0) return failure("EMPTY_PIN_IDS", { ownerId });
  const unique = new Set<string>();
  const validated: string[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (typeof id !== "string" || id.length === 0) {
      return failure("INVALID_PIN_ID", { index, nodeId: id, ownerId });
    }
    if (unique.has(id)) {
      return failure("DUPLICATE_PIN_ID", { index, nodeId: id, ownerId });
    }
    if (!completeIds.has(id)) {
      return failure("UNKNOWN_PIN_ID", { index, nodeId: id, ownerId });
    }
    unique.add(id);
    validated.push(id);
  }
  return Object.freeze({ ids: Object.freeze(validated), ok: true });
}

function invalidRegistry(state: ViewportPinRegistryState): ViewportPinRegistryError | null {
  if (state === null || typeof state !== "object" || !Object.isFrozen(state) ||
    !validBasis(state.basis) || !Object.isFrozen(state.basis) ||
    !Number.isSafeInteger(state.lastLeaseSerial) || state.lastLeaseSerial < 0 ||
    !Array.isArray(state.leases) || !Object.isFrozen(state.leases)) {
    return Object.freeze({ code: "INVALID_REGISTRY" });
  }
  const owners = new Set<ViewportPinOwnerId>();
  const serials = new Set<number>();
  let priorOrder = -1;
  for (const lease of state.leases) {
    if (lease === null || typeof lease !== "object" || !Object.isFrozen(lease) ||
      lease.basis !== state.basis || !isOwnerId(lease.ownerId) ||
      !Number.isSafeInteger(lease.serial) || lease.serial <= 0 ||
      lease.serial > state.lastLeaseSerial || serials.has(lease.serial) ||
      !Array.isArray(lease.ids) || !Object.isFrozen(lease.ids) || lease.ids.length === 0) {
      return Object.freeze({ code: "INVALID_REGISTRY" });
    }
    if (owners.has(lease.ownerId)) {
      return Object.freeze({ code: "DUPLICATE_OWNER", ownerId: lease.ownerId });
    }
    const order = OWNER_ORDER.get(lease.ownerId)!;
    if (order <= priorOrder) return Object.freeze({ code: "INVALID_REGISTRY" });
    priorOrder = order;
    owners.add(lease.ownerId);
    serials.add(lease.serial);
    const ids = new Set<string>();
    for (const id of lease.ids) {
      if (typeof id !== "string" || id.length === 0 || ids.has(id)) {
        return Object.freeze({ code: "INVALID_REGISTRY", ownerId: lease.ownerId });
      }
      ids.add(id);
    }
  }
  return null;
}

function invalidationForBasis(
  current: ViewportPinRegistryBasis,
  next: ViewportPinRegistryBasis,
): Exclude<ViewportPinInvalidationCode, "UNKNOWN_PIN_ID"> | null {
  if (current.documentEpoch !== next.documentEpoch) return "DOCUMENT_INVALIDATED";
  if (current.layoutEpoch !== next.layoutEpoch) return "LAYOUT_INVALIDATED";
  if (current.projectionEpoch !== next.projectionEpoch) return "PROJECTION_INVALIDATED";
  return null;
}

function frozenInvalidation(
  ownerId: ViewportPinOwnerId,
  code: ViewportPinInvalidationCode,
  nodeId?: string,
): ViewportPinInvalidation {
  return Object.freeze({ code, ...(nodeId === undefined ? {} : { nodeId }), ownerId });
}

function frozenBasis(basis: ViewportPinRegistryBasis): ViewportPinRegistryBasis {
  return Object.freeze({ ...basis });
}

function frozenState(
  basis: ViewportPinRegistryBasis,
  leases: readonly ViewportPinLease[],
  lastLeaseSerial: number,
): ViewportPinRegistryState {
  return Object.freeze({ basis, lastLeaseSerial, leases });
}

function equalBasis(a: ViewportPinRegistryBasis, b: ViewportPinRegistryBasis): boolean {
  return a.documentEpoch === b.documentEpoch &&
    a.layoutEpoch === b.layoutEpoch &&
    a.projectionEpoch === b.projectionEpoch;
}

function validBasis(value: ViewportPinRegistryBasis): boolean {
  return value !== null && typeof value === "object" &&
    validEpoch(value.documentEpoch) && validEpoch(value.layoutEpoch) &&
    validEpoch(value.projectionEpoch);
}

function validEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isOwnerId(value: unknown): value is ViewportPinOwnerId {
  return typeof value === "string" && OWNER_ORDER.has(value as ViewportPinOwnerId);
}

function compareLeaseOwner(a: ViewportPinLease, b: ViewportPinLease): number {
  return OWNER_ORDER.get(a.ownerId)! - OWNER_ORDER.get(b.ownerId)!;
}

function failure(
  code: ViewportPinRegistryErrorCode,
  detail: Omit<ViewportPinRegistryError, "code"> = {},
): ViewportPinRegistryFailure {
  return Object.freeze({
    error: Object.freeze({ code, ...detail }),
    ok: false,
  });
}

function existingFailure(error: ViewportPinRegistryError): ViewportPinRegistryFailure {
  return Object.freeze({ error, ok: false });
}
