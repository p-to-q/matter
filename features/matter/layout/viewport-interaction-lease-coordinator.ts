import {
  VIEWPORT_PIN_OWNER_IDS,
  acquireViewportPinLease,
  createViewportPinRegistry,
  reconcileViewportPinRegistry,
  releaseViewportPinLease,
  type ViewportPinInvalidation,
  type ViewportPinLease,
  type ViewportPinOwnerId,
  type ViewportPinRegistryBasis,
  type ViewportPinRegistryError,
  type ViewportPinRegistryState,
} from "./viewport-pin-registry";

export type ViewportInteractionWindowAuthority = Readonly<{
  basis: ViewportPinRegistryBasis;
  nodeIds: readonly string[];
  stability: "transient" | "stable";
  windowEpoch: number;
}>;

export type ViewportInteractionMountAcknowledgement = Readonly<{
  lease: ViewportPinLease;
  window: ViewportInteractionWindowAuthority;
}>;

export type ViewportInteractionLeaseCoordinatorState = Readonly<{
  acknowledgements: readonly ViewportInteractionMountAcknowledgement[];
  registry: ViewportPinRegistryState;
  window: ViewportInteractionWindowAuthority | null;
}>;

export type ViewportInteractionActPermit = Readonly<{
  acknowledgement: ViewportInteractionMountAcknowledgement;
  basis: ViewportPinRegistryBasis;
  coordinator: ViewportInteractionLeaseCoordinatorState;
  lease: ViewportPinLease;
  window: ViewportInteractionWindowAuthority;
}>;

export type ViewportInteractionCoordinatorErrorCode =
  | "INVALID_COORDINATOR"
  | "PIN_REGISTRY_REJECTED"
  | "LATE_LEASE"
  | "INVALID_WINDOW_AUTHORITY"
  | "STALE_WINDOW_BASIS"
  | "INVALID_WINDOW_EPOCH"
  | "LATE_WINDOW_EPOCH"
  | "WINDOW_EPOCH_CONFLICT"
  | "MOUNT_CAPABILITY_MISMATCH"
  | "INVALID_COMPLETE_PREORDER"
  | "INVALID_WINDOW_NODE_IDS"
  | "WINDOW_NODE_ORDER_MISMATCH"
  | "INCOMPLETE_MOUNT_ACKNOWLEDGEMENT"
  | "MOUNT_NOT_ACKNOWLEDGED"
  | "LATE_ACKNOWLEDGEMENT"
  | "STALE_ACT_BASIS"
  | "STALE_ACT_WINDOW"
  | "RELEASE_BEFORE_STABLE_WINDOW";

export type ViewportInteractionCoordinatorError = Readonly<{
  code: ViewportInteractionCoordinatorErrorCode;
  index?: number;
  nodeId?: string;
  ownerId?: string;
  registryError?: ViewportPinRegistryError;
}>;

export type ViewportInteractionCoordinatorFailure = Readonly<{
  error: ViewportInteractionCoordinatorError;
  ok: false;
}>;

export type AcquireViewportInteractionLeaseResult =
  | Readonly<{
      lease: ViewportPinLease;
      ok: true;
      replaced: boolean;
      state: ViewportInteractionLeaseCoordinatorState;
    }>
  | ViewportInteractionCoordinatorFailure;

export type ReleaseViewportInteractionLeaseResult =
  | Readonly<{
      ok: true;
      state: ViewportInteractionLeaseCoordinatorState;
      status: "released" | "late-release";
    }>
  | ViewportInteractionCoordinatorFailure;

export type CancelViewportInteractionLeaseResult =
  | Readonly<{
      ok: true;
      state: ViewportInteractionLeaseCoordinatorState;
      status: "cancelled" | "late-cancel";
    }>
  | ViewportInteractionCoordinatorFailure;

export type ReconcileViewportInteractionLeasesResult =
  | Readonly<{
      invalidatedOwners: readonly ViewportPinInvalidation[];
      ok: true;
      orderedPinnedNodeIds: readonly string[];
      state: ViewportInteractionLeaseCoordinatorState;
    }>
  | ViewportInteractionCoordinatorFailure;

export type AcknowledgeViewportInteractionMountResult =
  | Readonly<{
      acknowledgement: ViewportInteractionMountAcknowledgement;
      ok: true;
      state: ViewportInteractionLeaseCoordinatorState;
    }>
  | ViewportInteractionCoordinatorFailure;

export type AuthorizeViewportInteractionActResult =
  | Readonly<{ ok: true; permit: ViewportInteractionActPermit }>
  | ViewportInteractionCoordinatorFailure;

const OWNER_ORDER = new Map<ViewportPinOwnerId, number>(
  VIEWPORT_PIN_OWNER_IDS.map((ownerId, index) => [ownerId, index]),
);

export function createViewportInteractionLeaseCoordinator(
  basis: ViewportPinRegistryBasis,
): ViewportInteractionLeaseCoordinatorState {
  return frozenCoordinator(createViewportPinRegistry(basis), null, Object.freeze([]));
}

export function acquireViewportInteractionLease(input: Readonly<{
  completePreorderNodeIds: readonly string[];
  expectedBasis: ViewportPinRegistryBasis;
  ids: readonly string[];
  ownerId: ViewportPinOwnerId;
  state: ViewportInteractionLeaseCoordinatorState;
}>): AcquireViewportInteractionLeaseResult {
  if (!validCoordinator(input.state)) return failure("INVALID_COORDINATOR");
  const result = acquireViewportPinLease({
    completePreorderNodeIds: input.completePreorderNodeIds,
    expectedBasis: input.expectedBasis,
    ids: input.ids,
    ownerId: input.ownerId,
    state: input.state.registry,
  });
  if (!result.ok) return registryFailure(result.error);
  // Any changed pin union must be acknowledged again, even if all ids happen
  // to be present in the last committed window.
  const state = frozenCoordinator(result.state, input.state.window, Object.freeze([]));
  return Object.freeze({
    lease: result.lease,
    ok: true,
    replaced: result.replaced,
    state,
  });
}

export function reconcileViewportInteractionLeases(input: Readonly<{
  basis: ViewportPinRegistryBasis;
  completePreorderNodeIds: readonly string[];
  state: ViewportInteractionLeaseCoordinatorState;
}>): ReconcileViewportInteractionLeasesResult {
  if (!validCoordinator(input.state)) return failure("INVALID_COORDINATOR");
  const result = reconcileViewportPinRegistry({
    basis: input.basis,
    completePreorderNodeIds: input.completePreorderNodeIds,
    state: input.state.registry,
  });
  if (!result.ok) return registryFailure(result.error);

  const registry = result.reconciliation.state;
  // Any registry change withdraws the prior DOM authority. Even when the
  // basis scalar is unchanged, an invalidated owner can remove an id from the
  // current preorder, so surviving leases must be acknowledged against a new
  // exact mounted-window capability before they act again.
  const registryChanged = registry !== input.state.registry;
  const window = registryChanged ? null : input.state.window;
  const acknowledgements = registryChanged
    ? Object.freeze([])
    : input.state.acknowledgements;
  const unchanged = registry === input.state.registry && window === input.state.window &&
    acknowledgements.length === input.state.acknowledgements.length;
  const state = unchanged
    ? input.state
    : frozenCoordinator(registry, window, acknowledgements);
  return Object.freeze({
    invalidatedOwners: result.reconciliation.invalidatedOwners,
    ok: true,
    orderedPinnedNodeIds: result.reconciliation.orderedPinnedNodeIds,
    state,
  });
}

/**
 * Accepts only the exact ordered node-id capability returned by the rendering
 * edge after it has independently verified connection, order and geometry.
 * This pure layer deliberately does not claim to inspect the DOM.
 */
export function acknowledgeViewportInteractionMount(input: Readonly<{
  completePreorderNodeIds: readonly string[];
  lease: ViewportPinLease;
  mountedNodeIds: readonly string[];
  state: ViewportInteractionLeaseCoordinatorState;
  window: ViewportInteractionWindowAuthority;
}>): AcknowledgeViewportInteractionMountResult {
  if (!validCoordinator(input.state)) return failure("INVALID_COORDINATOR");
  if (!currentLease(input.state, input.lease)) {
    return failure("LATE_LEASE", { ownerId: input.lease?.ownerId });
  }
  const windowError = validateWindowAuthority(
    input.state,
    input.window,
    input.mountedNodeIds,
    input.completePreorderNodeIds,
  );
  if (windowError !== null) return existingFailure(windowError);

  const currentWindow = input.state.window;
  if (currentWindow !== null) {
    if (input.window.windowEpoch < currentWindow.windowEpoch) {
      return failure("LATE_WINDOW_EPOCH", { ownerId: input.lease.ownerId });
    }
    if (input.window.windowEpoch === currentWindow.windowEpoch && input.window !== currentWindow) {
      return failure("WINDOW_EPOCH_CONFLICT", { ownerId: input.lease.ownerId });
    }
  }

  const sameWindow = input.window === currentWindow;
  const baseAcknowledgements = sameWindow ? input.state.acknowledgements : Object.freeze([]);
  const existing = baseAcknowledgements.find(({ lease }) => lease === input.lease);
  if (existing !== undefined) {
    return Object.freeze({ acknowledgement: existing, ok: true, state: input.state });
  }
  const acknowledgement: ViewportInteractionMountAcknowledgement = Object.freeze({
    lease: input.lease,
    window: input.window,
  });
  const acknowledgements = Object.freeze([...baseAcknowledgements, acknowledgement]
    .sort(compareAcknowledgementOwner));
  const state = frozenCoordinator(input.state.registry, input.window, acknowledgements);
  return Object.freeze({ acknowledgement, ok: true, state });
}

export function authorizeViewportInteractionAct(input: Readonly<{
  acknowledgement: ViewportInteractionMountAcknowledgement;
  expectedBasis: ViewportPinRegistryBasis;
  expectedWindow: ViewportInteractionWindowAuthority;
  lease: ViewportPinLease;
  state: ViewportInteractionLeaseCoordinatorState;
}>): AuthorizeViewportInteractionActResult {
  if (!validCoordinator(input.state)) return failure("INVALID_COORDINATOR");
  if (!validBasis(input.expectedBasis) || !equalBasis(input.expectedBasis, input.state.registry.basis)) {
    return failure("STALE_ACT_BASIS", { ownerId: input.lease?.ownerId });
  }
  if (!currentLease(input.state, input.lease)) {
    return failure("LATE_LEASE", { ownerId: input.lease?.ownerId });
  }
  const currentAcknowledgement = input.state.acknowledgements
    .find(({ lease }) => lease === input.lease);
  if (currentAcknowledgement === undefined) {
    return failure("MOUNT_NOT_ACKNOWLEDGED", { ownerId: input.lease.ownerId });
  }
  if (input.expectedWindow !== input.state.window) {
    return failure("STALE_ACT_WINDOW", { ownerId: input.lease.ownerId });
  }
  if (currentAcknowledgement !== input.acknowledgement) {
    return failure("LATE_ACKNOWLEDGEMENT", { ownerId: input.lease.ownerId });
  }
  const permit: ViewportInteractionActPermit = Object.freeze({
    acknowledgement: currentAcknowledgement,
    basis: input.state.registry.basis,
    coordinator: input.state,
    lease: input.lease,
    window: input.expectedWindow,
  });
  return Object.freeze({ ok: true, permit });
}

/** Must be called against the latest coordinator immediately before the side effect. */
export function isViewportInteractionActPermitCurrent(
  state: ViewportInteractionLeaseCoordinatorState,
  permit: ViewportInteractionActPermit,
): boolean {
  return validCoordinator(state) && permit?.coordinator === state &&
    permit.basis === state.registry.basis && permit.window === state.window &&
    currentLease(state, permit.lease) &&
    state.acknowledgements.some((acknowledgement) =>
      acknowledgement === permit.acknowledgement);
}

export function releaseViewportInteractionLease(input: Readonly<{
  lease: ViewportPinLease;
  state: ViewportInteractionLeaseCoordinatorState;
}>): ReleaseViewportInteractionLeaseResult {
  if (!validCoordinator(input.state)) return failure("INVALID_COORDINATOR");
  if (!currentLease(input.state, input.lease)) {
    return Object.freeze({ ok: true, state: input.state, status: "late-release" });
  }
  const acknowledgement = input.state.acknowledgements
    .find(({ lease }) => lease === input.lease);
  if (acknowledgement === undefined) {
    return failure("MOUNT_NOT_ACKNOWLEDGED", { ownerId: input.lease.ownerId });
  }
  if (acknowledgement.window.stability !== "stable") {
    return failure("RELEASE_BEFORE_STABLE_WINDOW", { ownerId: input.lease.ownerId });
  }
  const result = releaseViewportPinLease({ lease: input.lease, state: input.state.registry });
  if (!result.ok) return registryFailure(result.error);
  if (result.status !== "released") {
    return Object.freeze({ ok: true, state: input.state, status: "late-release" });
  }
  const acknowledgements = Object.freeze(input.state.acknowledgements
    .filter((current) => current !== acknowledgement));
  return Object.freeze({
    ok: true,
    state: frozenCoordinator(result.state, input.state.window, acknowledgements),
    status: "released",
  });
}

export function cancelViewportInteractionLease(input: Readonly<{
  lease: ViewportPinLease;
  state: ViewportInteractionLeaseCoordinatorState;
}>): CancelViewportInteractionLeaseResult {
  if (!validCoordinator(input.state)) return failure("INVALID_COORDINATOR");
  const result = releaseViewportPinLease({ lease: input.lease, state: input.state.registry });
  if (!result.ok) return registryFailure(result.error);
  if (result.status !== "released") {
    return Object.freeze({ ok: true, state: input.state, status: "late-cancel" });
  }
  const acknowledgements = Object.freeze(input.state.acknowledgements
    .filter(({ lease }) => lease !== input.lease));
  return Object.freeze({
    ok: true,
    state: frozenCoordinator(result.state, input.state.window, acknowledgements),
    status: "cancelled",
  });
}

function validateWindowAuthority(
  state: ViewportInteractionLeaseCoordinatorState,
  window: ViewportInteractionWindowAuthority,
  mountedNodeIds: readonly string[],
  completePreorderNodeIds: readonly string[],
): ViewportInteractionCoordinatorError | null {
  if (window === null || typeof window !== "object" || !Object.isFrozen(window) ||
    !Array.isArray(window.nodeIds) || !Object.isFrozen(window.nodeIds) ||
    (window.stability !== "transient" && window.stability !== "stable")) {
    return frozenError("INVALID_WINDOW_AUTHORITY");
  }
  if (window.basis !== state.registry.basis) return frozenError("STALE_WINDOW_BASIS");
  if (!Number.isSafeInteger(window.windowEpoch) || window.windowEpoch <= 0) {
    return frozenError("INVALID_WINDOW_EPOCH");
  }
  if (mountedNodeIds !== window.nodeIds) return frozenError("MOUNT_CAPABILITY_MISMATCH");
  const preorder = validatePreorder(completePreorderNodeIds);
  if (preorder.error !== null) return preorder.error;
  const mounted = new Set<string>();
  let priorIndex = -1;
  for (let index = 0; index < window.nodeIds.length; index += 1) {
    const nodeId = window.nodeIds[index];
    if (typeof nodeId !== "string" || nodeId.length === 0 || mounted.has(nodeId)) {
      return frozenError("INVALID_WINDOW_NODE_IDS", { index, nodeId });
    }
    const preorderIndex = preorder.indexById.get(nodeId);
    if (preorderIndex === undefined) {
      return frozenError("INVALID_WINDOW_NODE_IDS", { index, nodeId });
    }
    if (preorderIndex <= priorIndex) {
      return frozenError("WINDOW_NODE_ORDER_MISMATCH", { index, nodeId });
    }
    priorIndex = preorderIndex;
    mounted.add(nodeId);
  }
  for (const lease of state.registry.leases) {
    for (const nodeId of lease.ids) {
      if (!mounted.has(nodeId)) {
        return frozenError("INCOMPLETE_MOUNT_ACKNOWLEDGEMENT", {
          nodeId,
          ownerId: lease.ownerId,
        });
      }
    }
  }
  return null;
}

function validatePreorder(nodeIds: readonly string[]): Readonly<{
  error: ViewportInteractionCoordinatorError | null;
  indexById: ReadonlyMap<string, number>;
}> {
  if (!Array.isArray(nodeIds)) {
    return Object.freeze({
      error: frozenError("INVALID_COMPLETE_PREORDER"),
      indexById: new Map(),
    });
  }
  const indexById = new Map<string, number>();
  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index];
    if (typeof nodeId !== "string" || nodeId.length === 0 || indexById.has(nodeId)) {
      return Object.freeze({
        error: frozenError("INVALID_COMPLETE_PREORDER", { index, nodeId }),
        indexById,
      });
    }
    indexById.set(nodeId, index);
  }
  return Object.freeze({ error: null, indexById });
}

function validCoordinator(state: ViewportInteractionLeaseCoordinatorState): boolean {
  if (state === null || typeof state !== "object" || !Object.isFrozen(state) ||
    !Array.isArray(state.acknowledgements) || !Object.isFrozen(state.acknowledgements) ||
    state.registry === null || typeof state.registry !== "object" ||
    !Object.isFrozen(state.registry) || !Object.isFrozen(state.registry.basis) ||
    !validBasis(state.registry.basis) ||
    !Number.isSafeInteger(state.registry.lastLeaseSerial) ||
    state.registry.lastLeaseSerial < 0 ||
    !Array.isArray(state.registry.leases) || !Object.isFrozen(state.registry.leases)) {
    return false;
  }
  const windowNodeIds = new Set<string>();
  if (state.window === null) {
    if (state.acknowledgements.length !== 0) return false;
  } else {
    if (!Object.isFrozen(state.window) || state.window.basis !== state.registry.basis ||
      !Array.isArray(state.window.nodeIds) || !Object.isFrozen(state.window.nodeIds) ||
      !Number.isSafeInteger(state.window.windowEpoch) || state.window.windowEpoch <= 0 ||
      (state.window.stability !== "stable" && state.window.stability !== "transient")) {
      return false;
    }
    for (const id of state.window.nodeIds) {
      if (typeof id !== "string" || id.length === 0 || windowNodeIds.has(id)) return false;
      windowNodeIds.add(id);
    }
  }

  const leaseOwners = new Set<ViewportPinOwnerId>();
  const leaseSerials = new Set<number>();
  let priorLeaseOrder = -1;
  for (const lease of state.registry.leases) {
    if (lease === null || typeof lease !== "object" || !Object.isFrozen(lease) ||
      lease.basis !== state.registry.basis || !Array.isArray(lease.ids) ||
      !Object.isFrozen(lease.ids) ||
      !OWNER_ORDER.has(lease.ownerId) || !Number.isSafeInteger(lease.serial) ||
      lease.serial <= 0 || lease.serial > state.registry.lastLeaseSerial ||
      leaseSerials.has(lease.serial) || leaseOwners.has(lease.ownerId) ||
      lease.ids.length === 0) return false;
    const order = OWNER_ORDER.get(lease.ownerId)!;
    if (order <= priorLeaseOrder) return false;
    priorLeaseOrder = order;
    leaseOwners.add(lease.ownerId);
    leaseSerials.add(lease.serial);
    const ids = new Set<string>();
    for (const id of lease.ids) {
      if (typeof id !== "string" || id.length === 0 || ids.has(id)) return false;
      ids.add(id);
      if (state.acknowledgements.length > 0 && !windowNodeIds.has(id)) return false;
    }
  }

  const currentLeases = new Set(state.registry.leases);
  let priorOwnerOrder = -1;
  for (const acknowledgement of state.acknowledgements) {
    if (acknowledgement === null || typeof acknowledgement !== "object" ||
      !Object.isFrozen(acknowledgement) || acknowledgement.window !== state.window ||
      !currentLeases.has(acknowledgement.lease)) return false;
    const order = OWNER_ORDER.get(acknowledgement.lease.ownerId);
    if (order === undefined || order <= priorOwnerOrder) return false;
    priorOwnerOrder = order;
  }
  return true;
}

function currentLease(
  state: ViewportInteractionLeaseCoordinatorState,
  lease: ViewportPinLease,
): boolean {
  return state.registry.leases.some((current) => current === lease);
}

function frozenCoordinator(
  registry: ViewportPinRegistryState,
  window: ViewportInteractionWindowAuthority | null,
  acknowledgements: readonly ViewportInteractionMountAcknowledgement[],
): ViewportInteractionLeaseCoordinatorState {
  return Object.freeze({ acknowledgements, registry, window });
}

function compareAcknowledgementOwner(
  a: ViewportInteractionMountAcknowledgement,
  b: ViewportInteractionMountAcknowledgement,
): number {
  return OWNER_ORDER.get(a.lease.ownerId)! - OWNER_ORDER.get(b.lease.ownerId)!;
}

function validBasis(value: ViewportPinRegistryBasis): boolean {
  return value !== null && typeof value === "object" &&
    validEpoch(value.documentEpoch) && validEpoch(value.layoutEpoch) &&
    validEpoch(value.projectionEpoch);
}

function validEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function equalBasis(a: ViewportPinRegistryBasis, b: ViewportPinRegistryBasis): boolean {
  return a.documentEpoch === b.documentEpoch && a.layoutEpoch === b.layoutEpoch &&
    a.projectionEpoch === b.projectionEpoch;
}

function registryFailure(error: ViewportPinRegistryError): ViewportInteractionCoordinatorFailure {
  return failure("PIN_REGISTRY_REJECTED", { registryError: error });
}

function failure(
  code: ViewportInteractionCoordinatorErrorCode,
  detail: Omit<ViewportInteractionCoordinatorError, "code"> = {},
): ViewportInteractionCoordinatorFailure {
  return Object.freeze({ error: frozenError(code, detail), ok: false });
}

function existingFailure(
  error: ViewportInteractionCoordinatorError,
): ViewportInteractionCoordinatorFailure {
  return Object.freeze({ error, ok: false });
}

function frozenError(
  code: ViewportInteractionCoordinatorErrorCode,
  detail: Omit<ViewportInteractionCoordinatorError, "code"> = {},
): ViewportInteractionCoordinatorError {
  return Object.freeze({ code, ...detail });
}
