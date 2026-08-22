import { describe, expect, it } from "vitest";
import {
  VIEWPORT_PIN_OWNER_IDS,
  acquireViewportPinLease,
  createViewportPinRegistry,
  reconcileViewportPinRegistry,
  releaseViewportPinLease,
  type ViewportPinLease,
  type ViewportPinOwnerId,
  type ViewportPinRegistryBasis,
  type ViewportPinRegistryState,
} from "./viewport-pin-registry";

const BASIS: ViewportPinRegistryBasis = Object.freeze({
  documentEpoch: 3,
  layoutEpoch: 5,
  projectionEpoch: 8,
});
const PREORDER = Object.freeze(["root", "a", "b", "c", "d"]);

function acquire(
  state: ViewportPinRegistryState,
  ownerId: ViewportPinOwnerId,
  ids: readonly string[],
  completePreorderNodeIds: readonly string[] = PREORDER,
) {
  return acquireViewportPinLease({
    completePreorderNodeIds,
    expectedBasis: BASIS,
    ids,
    ownerId,
    state,
  });
}

function requireAcquired(
  state: ViewportPinRegistryState,
  ownerId: ViewportPinOwnerId,
  ids: readonly string[],
): Readonly<{ lease: ViewportPinLease; state: ViewportPinRegistryState }> {
  const result = acquire(state, ownerId, ids);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

describe("viewport pin registry", () => {
  it("freezes the exact first C4 owner vocabulary", () => {
    expect(VIEWPORT_PIN_OWNER_IDS).toEqual([
      "selected",
      "focus",
      "dom-focus",
      "camera",
      "lasso",
      "stretch",
      "drag",
      "admission",
    ]);
    expect(Object.isFrozen(VIEWPORT_PIN_OWNER_IDS)).toBe(true);
  });

  it.each(VIEWPORT_PIN_OWNER_IDS)("acquires and releases the %s owner", (ownerId) => {
    const initial = createViewportPinRegistry(BASIS);
    const acquired = acquire(initial, ownerId, ["b"]);
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) throw new Error(acquired.error.code);
    expect(acquired.replaced).toBe(false);
    expect(acquired.lease).toMatchObject({ ownerId, ids: ["b"], serial: 1 });
    expect(acquired.lease.basis).toBe(acquired.state.basis);

    const released = releaseViewportPinLease({ lease: acquired.lease, state: acquired.state });
    expect(released.ok).toBe(true);
    if (!released.ok) throw new Error(released.error.code);
    expect(released.status).toBe("released");
    expect(released.state.leases).toEqual([]);
  });

  it("replaces duplicate owner acquisition and makes the older release harmless", () => {
    const first = requireAcquired(createViewportPinRegistry(BASIS), "camera", ["a"]);
    const secondResult = acquire(first.state, "camera", ["d"]);
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) throw new Error(secondResult.error.code);
    expect(secondResult.replaced).toBe(true);
    expect(secondResult.state.leases).toEqual([secondResult.lease]);

    const late = releaseViewportPinLease({ lease: first.lease, state: secondResult.state });
    expect(late).toEqual({ ok: true, state: secondResult.state, status: "late-release" });
    if (!late.ok) throw new Error(late.error.code);
    expect(late.state).toBe(secondResult.state);

    const current = releaseViewportPinLease({ lease: secondResult.lease, state: late.state });
    expect(current.ok).toBe(true);
    if (!current.ok) throw new Error(current.error.code);
    expect(current.status).toBe("released");
    expect(current.state.leases).toEqual([]);
  });

  it("does not let an equal copied lease release the current capability", () => {
    const acquired = requireAcquired(createViewportPinRegistry(BASIS), "dom-focus", ["c"]);
    const copied = Object.freeze({ ...acquired.lease });
    const result = releaseViewportPinLease({ lease: copied, state: acquired.state });
    expect(result).toEqual({ ok: true, state: acquired.state, status: "late-release" });
  });

  it("filters the pin union through complete preorder rather than acquisition order", () => {
    let state = createViewportPinRegistry(BASIS);
    state = requireAcquired(state, "drag", ["d", "b"]).state;
    state = requireAcquired(state, "selected", ["c"]).state;
    state = requireAcquired(state, "camera", ["a"]).state;

    const result = reconcileViewportPinRegistry({
      basis: BASIS,
      completePreorderNodeIds: PREORDER,
      state,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.reconciliation.activeOwnerIds).toEqual(["selected", "camera", "drag"]);
    expect(result.reconciliation.orderedPinnedNodeIds).toEqual(["a", "b", "c", "d"]);
    expect(result.reconciliation.invalidatedOwners).toEqual([]);
    expect(result.reconciliation.state).toBe(state);
  });

  it("returns the complete 2,000-id pinned preorder without a correctness cap", () => {
    const preorder = Object.freeze(Array.from({ length: 2_000 }, (_, index) => `node-${index}`));
    let state = createViewportPinRegistry(BASIS);
    for (let ownerIndex = 0; ownerIndex < VIEWPORT_PIN_OWNER_IDS.length; ownerIndex += 1) {
      const ids = preorder.filter((_, index) => index % VIEWPORT_PIN_OWNER_IDS.length === ownerIndex);
      const result = acquireViewportPinLease({
        completePreorderNodeIds: preorder,
        expectedBasis: BASIS,
        ids,
        ownerId: VIEWPORT_PIN_OWNER_IDS[ownerIndex]!,
        state,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.code);
      state = result.state;
    }
    const result = reconcileViewportPinRegistry({
      basis: BASIS,
      completePreorderNodeIds: preorder,
      state,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.reconciliation.orderedPinnedNodeIds).toEqual(preorder);
  });

  it.each([
    ["documentEpoch", "DOCUMENT_INVALIDATED"],
    ["layoutEpoch", "LAYOUT_INVALIDATED"],
    ["projectionEpoch", "PROJECTION_INVALIDATED"],
  ] as const)("cancels every owner after %s changes", (epoch, code) => {
    let state = createViewportPinRegistry(BASIS);
    const selected = requireAcquired(state, "selected", ["a"]);
    state = requireAcquired(selected.state, "lasso", ["b", "c"]).state;
    const nextBasis = Object.freeze({ ...BASIS, [epoch]: BASIS[epoch] + 1 });

    const result = reconcileViewportPinRegistry({
      basis: nextBasis,
      completePreorderNodeIds: PREORDER,
      state,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.reconciliation.invalidatedOwners).toEqual([
      { code, ownerId: "selected" },
      { code, ownerId: "lasso" },
    ]);
    expect(result.reconciliation.orderedPinnedNodeIds).toEqual([]);
    expect(result.reconciliation.state.basis).toEqual(nextBasis);
    expect(result.reconciliation.state.leases).toEqual([]);

    const late = releaseViewportPinLease({
      lease: selected.lease,
      state: result.reconciliation.state,
    });
    expect(late.ok).toBe(true);
    if (!late.ok) throw new Error(late.error.code);
    expect(late.status).toBe("late-release");
  });

  it("cancels only the owner whose complete-preorder identity disappeared", () => {
    let state = createViewportPinRegistry(BASIS);
    state = requireAcquired(state, "selected", ["a", "b"]).state;
    state = requireAcquired(state, "focus", ["c"]).state;

    const result = reconcileViewportPinRegistry({
      basis: BASIS,
      completePreorderNodeIds: Object.freeze(["root", "a", "c", "d"]),
      state,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.reconciliation.invalidatedOwners).toEqual([
      { code: "UNKNOWN_PIN_ID", nodeId: "b", ownerId: "selected" },
    ]);
    expect(result.reconciliation.activeOwnerIds).toEqual(["focus"]);
    expect(result.reconciliation.orderedPinnedNodeIds).toEqual(["c"]);
    expect(result.reconciliation.state.leases).toHaveLength(1);
  });

  it("rejects an unknown acquisition atomically and preserves a valid current lease", () => {
    const current = requireAcquired(createViewportPinRegistry(BASIS), "selected", ["a"]);
    const result = acquire(current.state, "selected", ["missing"]);
    expect(result).toEqual({
      error: { code: "UNKNOWN_PIN_ID", index: 0, nodeId: "missing", ownerId: "selected" },
      ok: false,
    });
    expect(current.state.leases).toEqual([current.lease]);
  });

  it("requires stale owners to reconcile before another acquisition", () => {
    const state = requireAcquired(createViewportPinRegistry(BASIS), "lasso", ["b"]).state;
    const result = acquire(state, "drag", ["a"], Object.freeze(["root", "a", "c", "d"]));
    expect(result).toEqual({
      error: { code: "UNRECONCILED_OWNER", nodeId: "b", ownerId: "lasso" },
      ok: false,
    });
  });

  it.each([
    [[], "EMPTY_PIN_IDS"],
    [[""], "INVALID_PIN_ID"],
    [["a", "a"], "DUPLICATE_PIN_ID"],
  ] as const)("rejects malformed lease ids without publishing a prefix: %s", (ids, code) => {
    const initial = createViewportPinRegistry(BASIS);
    const result = acquire(initial, "admission", ids);
    expect(result).toMatchObject({ error: { code, ownerId: "admission" }, ok: false });
    expect(initial.leases).toEqual([]);
  });

  it("fails closed when an externally forged state contains duplicate owners", () => {
    const first = requireAcquired(createViewportPinRegistry(BASIS), "focus", ["a"]);
    const second = acquire(first.state, "focus", ["b"]);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error.code);
    const forged = Object.freeze({
      basis: first.state.basis,
      lastLeaseSerial: second.state.lastLeaseSerial,
      leases: Object.freeze([first.lease, second.lease]),
    }) as ViewportPinRegistryState;

    expect(reconcileViewportPinRegistry({
      basis: BASIS,
      completePreorderNodeIds: PREORDER,
      state: forged,
    })).toEqual({
      error: { code: "DUPLICATE_OWNER", ownerId: "focus" },
      ok: false,
    });
  });

  it("rejects invalid basis, preorder and exhausted serial authority", () => {
    expect(() => createViewportPinRegistry({ ...BASIS, documentEpoch: -1 })).toThrow(TypeError);
    const state = createViewportPinRegistry(BASIS);
    expect(reconcileViewportPinRegistry({
      basis: { ...BASIS, projectionEpoch: Number.NaN },
      completePreorderNodeIds: PREORDER,
      state,
    })).toEqual({ error: { code: "INVALID_EXPECTED_BASIS" }, ok: false });
    expect(reconcileViewportPinRegistry({
      basis: BASIS,
      completePreorderNodeIds: Object.freeze(["root", "a", "a"]),
      state,
    })).toMatchObject({ error: { code: "INVALID_COMPLETE_PREORDER" }, ok: false });

    const exhausted = Object.freeze({ ...state, lastLeaseSerial: Number.MAX_SAFE_INTEGER });
    expect(acquire(exhausted, "focus", ["a"])).toEqual({
      error: { code: "LEASE_SERIAL_EXHAUSTED", ownerId: "focus" },
      ok: false,
    });
  });

  it("keeps inputs unchanged and freezes every published layer", () => {
    const basis = { ...BASIS };
    const preorder = ["root", "a"];
    const ids = ["a"];
    const state = createViewportPinRegistry(basis);
    const acquired = acquireViewportPinLease({
      completePreorderNodeIds: preorder,
      expectedBasis: basis,
      ids,
      ownerId: "stretch",
      state,
    });
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) throw new Error(acquired.error.code);
    expect(basis).toEqual(BASIS);
    expect(preorder).toEqual(["root", "a"]);
    expect(ids).toEqual(["a"]);
    expect(Object.isFrozen(acquired.state)).toBe(true);
    expect(Object.isFrozen(acquired.state.basis)).toBe(true);
    expect(Object.isFrozen(acquired.state.leases)).toBe(true);
    expect(Object.isFrozen(acquired.lease)).toBe(true);
    expect(Object.isFrozen(acquired.lease.ids)).toBe(true);

    const reconciled = reconcileViewportPinRegistry({
      basis,
      completePreorderNodeIds: preorder,
      state: acquired.state,
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) throw new Error(reconciled.error.code);
    expect(Object.isFrozen(reconciled)).toBe(true);
    expect(Object.isFrozen(reconciled.reconciliation)).toBe(true);
    expect(Object.isFrozen(reconciled.reconciliation.activeOwnerIds)).toBe(true);
    expect(Object.isFrozen(reconciled.reconciliation.invalidatedOwners)).toBe(true);
    expect(Object.isFrozen(reconciled.reconciliation.orderedPinnedNodeIds)).toBe(true);
  });
});
