import { describe, expect, it } from "vitest";
import {
  acknowledgeViewportInteractionMount,
  acquireViewportInteractionLease,
  authorizeViewportInteractionAct,
  cancelViewportInteractionLease,
  createViewportInteractionLeaseCoordinator,
  isViewportInteractionActPermitCurrent,
  reconcileViewportInteractionLeases,
  releaseViewportInteractionLease,
  type ViewportInteractionLeaseCoordinatorState,
  type ViewportInteractionMountAcknowledgement,
  type ViewportInteractionWindowAuthority,
} from "./viewport-interaction-lease-coordinator";
import {
  VIEWPORT_PIN_OWNER_IDS,
  type ViewportPinLease,
  type ViewportPinOwnerId,
  type ViewportPinRegistryBasis,
} from "./viewport-pin-registry";

const BASIS: ViewportPinRegistryBasis = Object.freeze({
  documentEpoch: 4,
  layoutEpoch: 7,
  projectionEpoch: 9,
});
const PREORDER = Object.freeze(["root", "a", "b", "c", "d"]);

function acquire(
  state: ViewportInteractionLeaseCoordinatorState,
  ownerId: ViewportPinOwnerId,
  ids: readonly string[],
  basis: ViewportPinRegistryBasis = state.registry.basis,
  completePreorderNodeIds: readonly string[] = PREORDER,
) {
  return acquireViewportInteractionLease({
    completePreorderNodeIds,
    expectedBasis: basis,
    ids,
    ownerId,
    state,
  });
}

function requireAcquired(
  state: ViewportInteractionLeaseCoordinatorState,
  ownerId: ViewportPinOwnerId,
  ids: readonly string[],
): Readonly<{ lease: ViewportPinLease; state: ViewportInteractionLeaseCoordinatorState }> {
  const result = acquire(state, ownerId, ids);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

function windowAuthority(
  state: ViewportInteractionLeaseCoordinatorState,
  nodeIds: readonly string[],
  windowEpoch: number,
  stability: "transient" | "stable" = "stable",
): ViewportInteractionWindowAuthority {
  return Object.freeze({
    basis: state.registry.basis,
    nodeIds: Object.freeze([...nodeIds]),
    stability,
    windowEpoch,
  });
}

function acknowledge(
  state: ViewportInteractionLeaseCoordinatorState,
  lease: ViewportPinLease,
  window: ViewportInteractionWindowAuthority,
  completePreorderNodeIds: readonly string[] = PREORDER,
) {
  return acknowledgeViewportInteractionMount({
    completePreorderNodeIds,
    lease,
    mountedNodeIds: window.nodeIds,
    state,
    window,
  });
}

function requireAcknowledged(
  state: ViewportInteractionLeaseCoordinatorState,
  lease: ViewportPinLease,
  window: ViewportInteractionWindowAuthority,
): Readonly<{
  acknowledgement: ViewportInteractionMountAcknowledgement;
  state: ViewportInteractionLeaseCoordinatorState;
}> {
  const result = acknowledge(state, lease, window);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

describe("viewport interaction lease coordinator", () => {
  it.each(VIEWPORT_PIN_OWNER_IDS)(
    "acquires, replaces, mounts before act and stably releases the %s owner",
    (ownerId) => {
      const first = requireAcquired(
        createViewportInteractionLeaseCoordinator(BASIS),
        ownerId,
        ["a"],
      );
      const acquiredResult = acquire(first.state, ownerId, ["b"]);
      expect(acquiredResult.ok).toBe(true);
      if (!acquiredResult.ok) throw new Error(acquiredResult.error.code);
      expect(acquiredResult.replaced).toBe(true);
      const acquired = acquiredResult;
      expect(releaseViewportInteractionLease({
        lease: first.lease,
        state: acquired.state,
      })).toEqual({ ok: true, state: acquired.state, status: "late-release" });
      const window = windowAuthority(acquired.state, ["a", "b", "c"], 1);
      const acknowledged = requireAcknowledged(acquired.state, acquired.lease, window);
      const authorized = authorizeViewportInteractionAct({
        acknowledgement: acknowledged.acknowledgement,
        expectedBasis: BASIS,
        expectedWindow: window,
        lease: acquired.lease,
        state: acknowledged.state,
      });
      expect(authorized.ok).toBe(true);
      if (!authorized.ok) throw new Error(authorized.error.code);
      expect(isViewportInteractionActPermitCurrent(acknowledged.state, authorized.permit)).toBe(true);

      const released = releaseViewportInteractionLease({
        lease: acquired.lease,
        state: acknowledged.state,
      });
      expect(released.ok).toBe(true);
      if (!released.ok) throw new Error(released.error.code);
      expect(released.status).toBe("released");
      expect(released.state.registry.leases).toEqual([]);
      expect(released.state.acknowledgements).toEqual([]);
      expect(isViewportInteractionActPermitCurrent(released.state, authorized.permit)).toBe(false);
    },
  );

  it("refuses act and ordinary release before mount acknowledgement", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "camera",
      ["d"],
    );
    const window = windowAuthority(acquired.state, ["d"], 1);
    const fakeAcknowledgement = Object.freeze({ lease: acquired.lease, window });
    expect(authorizeViewportInteractionAct({
      acknowledgement: fakeAcknowledgement,
      expectedBasis: BASIS,
      expectedWindow: window,
      lease: acquired.lease,
      state: acquired.state,
    })).toEqual({
      error: { code: "MOUNT_NOT_ACKNOWLEDGED", ownerId: "camera" },
      ok: false,
    });
    expect(releaseViewportInteractionLease({
      lease: acquired.lease,
      state: acquired.state,
    })).toEqual({
      error: { code: "MOUNT_NOT_ACKNOWLEDGED", ownerId: "camera" },
      ok: false,
    });
  });

  it("requires the rendering edge's exact mounted node-id capability", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "dom-focus",
      ["c"],
    );
    const window = windowAuthority(acquired.state, ["a", "c"], 1);
    const result = acknowledgeViewportInteractionMount({
      completePreorderNodeIds: PREORDER,
      lease: acquired.lease,
      mountedNodeIds: Object.freeze([...window.nodeIds]),
      state: acquired.state,
      window,
    });
    expect(result).toEqual({ error: { code: "MOUNT_CAPABILITY_MISMATCH" }, ok: false });
  });

  it("requires one ordered acknowledged window to contain every active owner's pins", () => {
    let state = createViewportInteractionLeaseCoordinator(BASIS);
    const selected = requireAcquired(state, "selected", ["a"]);
    const focus = requireAcquired(selected.state, "focus", ["c"]);
    state = focus.state;

    const incomplete = windowAuthority(state, ["c"], 1);
    expect(acknowledge(state, focus.lease, incomplete)).toEqual({
      error: {
        code: "INCOMPLETE_MOUNT_ACKNOWLEDGEMENT",
        nodeId: "a",
        ownerId: "selected",
      },
      ok: false,
    });
    const reordered = windowAuthority(state, ["c", "a"], 1);
    expect(acknowledge(state, focus.lease, reordered)).toEqual({
      error: { code: "WINDOW_NODE_ORDER_MISMATCH", index: 1, nodeId: "a" },
      ok: false,
    });

    const complete = windowAuthority(state, ["a", "c"], 1);
    const selectedAck = requireAcknowledged(state, selected.lease, complete);
    const focusAck = requireAcknowledged(selectedAck.state, focus.lease, complete);
    expect(focusAck.state.acknowledgements.map(({ lease }) => lease.ownerId)).toEqual([
      "selected",
      "focus",
    ]);
  });

  it("same-owner replacement revokes old acknowledgement, permit and release authority", () => {
    const first = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "camera",
      ["a"],
    );
    const firstWindow = windowAuthority(first.state, ["a"], 1);
    const firstAck = requireAcknowledged(first.state, first.lease, firstWindow);
    const firstPermit = authorizeViewportInteractionAct({
      acknowledgement: firstAck.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: firstWindow,
      lease: first.lease,
      state: firstAck.state,
    });
    expect(firstPermit.ok).toBe(true);
    if (!firstPermit.ok) throw new Error(firstPermit.error.code);

    const replacement = acquire(firstAck.state, "camera", ["d"]);
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) throw new Error(replacement.error.code);
    expect(replacement.replaced).toBe(true);
    expect(replacement.state.acknowledgements).toEqual([]);
    expect(isViewportInteractionActPermitCurrent(replacement.state, firstPermit.permit)).toBe(false);
    expect(acknowledge(replacement.state, first.lease, firstWindow)).toEqual({
      error: { code: "LATE_LEASE", ownerId: "camera" },
      ok: false,
    });
    expect(releaseViewportInteractionLease({
      lease: first.lease,
      state: replacement.state,
    })).toEqual({ ok: true, state: replacement.state, status: "late-release" });
  });

  it.each([
    ["documentEpoch", "DOCUMENT_INVALIDATED"],
    ["layoutEpoch", "LAYOUT_INVALIDATED"],
    ["projectionEpoch", "PROJECTION_INVALIDATED"],
  ] as const)("revokes window, acknowledgement and permit after %s changes", (epoch, code) => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "focus",
      ["b"],
    );
    const window = windowAuthority(acquired.state, ["b"], 1);
    const acknowledged = requireAcknowledged(acquired.state, acquired.lease, window);
    const authorized = authorizeViewportInteractionAct({
      acknowledgement: acknowledged.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: window,
      lease: acquired.lease,
      state: acknowledged.state,
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) throw new Error(authorized.error.code);
    const nextBasis = Object.freeze({ ...BASIS, [epoch]: BASIS[epoch] + 1 });
    const result = reconcileViewportInteractionLeases({
      basis: nextBasis,
      completePreorderNodeIds: PREORDER,
      state: acknowledged.state,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.invalidatedOwners).toEqual([{ code, ownerId: "focus" }]);
    expect(result.state.registry.basis).toEqual(nextBasis);
    expect(result.state.registry.leases).toEqual([]);
    expect(result.state.acknowledgements).toEqual([]);
    expect(result.state.window).toBeNull();
    expect(isViewportInteractionActPermitCurrent(result.state, authorized.permit)).toBe(false);
    expect(cancelViewportInteractionLease({
      lease: acquired.lease,
      state: result.state,
    })).toEqual({ ok: true, state: result.state, status: "late-cancel" });
  });

  it("newer windows revoke older acknowledgements and reject epoch replay or conflict", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "lasso",
      ["a", "b"],
    );
    const firstWindow = windowAuthority(acquired.state, ["a", "b"], 2, "transient");
    const first = requireAcknowledged(acquired.state, acquired.lease, firstWindow);
    const secondWindow = windowAuthority(first.state, ["a", "b", "c"], 3, "transient");
    const second = requireAcknowledged(first.state, acquired.lease, secondWindow);
    expect(second.state.acknowledgements).toEqual([second.acknowledgement]);
    expect(acknowledge(second.state, acquired.lease, firstWindow)).toEqual({
      error: { code: "LATE_WINDOW_EPOCH", ownerId: "lasso" },
      ok: false,
    });
    const conflicting = windowAuthority(second.state, ["a", "b"], 3, "stable");
    expect(acknowledge(second.state, acquired.lease, conflicting)).toEqual({
      error: { code: "WINDOW_EPOCH_CONFLICT", ownerId: "lasso" },
      ok: false,
    });
  });

  it("authorizes transient-window work but requires a stable destination before release", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "drag",
      ["b", "c"],
    );
    const transient = windowAuthority(acquired.state, ["b", "c"], 1, "transient");
    const acknowledged = requireAcknowledged(acquired.state, acquired.lease, transient);
    const authorized = authorizeViewportInteractionAct({
      acknowledgement: acknowledged.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: transient,
      lease: acquired.lease,
      state: acknowledged.state,
    });
    expect(authorized.ok).toBe(true);
    expect(releaseViewportInteractionLease({
      lease: acquired.lease,
      state: acknowledged.state,
    })).toEqual({
      error: { code: "RELEASE_BEFORE_STABLE_WINDOW", ownerId: "drag" },
      ok: false,
    });
    const cancelled = cancelViewportInteractionLease({
      lease: acquired.lease,
      state: acknowledged.state,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) throw new Error(cancelled.error.code);
    expect(cancelled.status).toBe("cancelled");
  });

  it("allows explicit cancellation before any mount and makes a repeated cancel late", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "stretch",
      ["c"],
    );
    const cancelled = cancelViewportInteractionLease({
      lease: acquired.lease,
      state: acquired.state,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) throw new Error(cancelled.error.code);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelViewportInteractionLease({
      lease: acquired.lease,
      state: cancelled.state,
    })).toEqual({ ok: true, state: cancelled.state, status: "late-cancel" });
  });

  it("withdraws the old window when one owner disappears and re-acknowledges survivors", () => {
    const selected = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "selected",
      ["a"],
    );
    const focus = requireAcquired(selected.state, "focus", ["c"]);
    const window = windowAuthority(focus.state, ["a", "c"], 1);
    const selectedAck = requireAcknowledged(focus.state, selected.lease, window);
    const focusAck = requireAcknowledged(selectedAck.state, focus.lease, window);
    const focusPermit = authorizeViewportInteractionAct({
      acknowledgement: focusAck.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: window,
      lease: focus.lease,
      state: focusAck.state,
    });
    expect(focusPermit.ok).toBe(true);
    if (!focusPermit.ok) throw new Error(focusPermit.error.code);

    const survivingPreorder = Object.freeze(["root", "c", "d"]);
    const reconciled = reconcileViewportInteractionLeases({
      basis: BASIS,
      completePreorderNodeIds: survivingPreorder,
      state: focusAck.state,
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) throw new Error(reconciled.error.code);
    expect(reconciled.invalidatedOwners).toEqual([
      { code: "UNKNOWN_PIN_ID", nodeId: "a", ownerId: "selected" },
    ]);
    expect(reconciled.state.registry.leases).toEqual([focus.lease]);
    expect(reconciled.state.acknowledgements).toEqual([]);
    expect(reconciled.state.window).toBeNull();
    expect(isViewportInteractionActPermitCurrent(reconciled.state, focusPermit.permit)).toBe(false);
    expect(authorizeViewportInteractionAct({
      acknowledgement: focusAck.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: window,
      lease: focus.lease,
      state: reconciled.state,
    })).toEqual({
      error: { code: "MOUNT_NOT_ACKNOWLEDGED", ownerId: "focus" },
      ok: false,
    });

    const nextWindow = windowAuthority(reconciled.state, ["c"], 2);
    const nextAck = acknowledge(
      reconciled.state,
      focus.lease,
      nextWindow,
      survivingPreorder,
    );
    expect(nextAck.ok).toBe(true);
    if (!nextAck.ok) throw new Error(nextAck.error.code);
    expect(authorizeViewportInteractionAct({
      acknowledgement: nextAck.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: nextWindow,
      lease: focus.lease,
      state: nextAck.state,
    }).ok).toBe(true);

    expect(releaseViewportInteractionLease({
      lease: selected.lease,
      state: nextAck.state,
    })).toEqual({ ok: true, state: nextAck.state, status: "late-release" });
    expect(cancelViewportInteractionLease({
      lease: selected.lease,
      state: nextAck.state,
    })).toEqual({ ok: true, state: nextAck.state, status: "late-cancel" });
    const released = releaseViewportInteractionLease({
      lease: focus.lease,
      state: nextAck.state,
    });
    expect(released.ok).toBe(true);
    if (!released.ok) throw new Error(released.error.code);
    expect(released.status).toBe("released");
  });

  it("keeps exact coordinator authority when same-basis reconciliation changes nothing", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "focus",
      ["c"],
    );
    const window = windowAuthority(acquired.state, ["c"], 1);
    const acknowledged = requireAcknowledged(acquired.state, acquired.lease, window);
    const reconciled = reconcileViewportInteractionLeases({
      basis: BASIS,
      completePreorderNodeIds: PREORDER,
      state: acknowledged.state,
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) throw new Error(reconciled.error.code);
    expect(reconciled.invalidatedOwners).toEqual([]);
    expect(reconciled.state).toBe(acknowledged.state);
    expect(reconciled.state.window).toBe(window);
    expect(reconciled.state.acknowledgements[0]).toBe(acknowledged.acknowledgement);
  });

  it("rejects copied basis, invalid window ids and unknown acquisition through one closed error", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "admission",
      ["d"],
    );
    const copiedBasisWindow = Object.freeze({
      basis: Object.freeze({ ...acquired.state.registry.basis }),
      nodeIds: Object.freeze(["d"]),
      stability: "stable" as const,
      windowEpoch: 1,
    });
    expect(acknowledge(acquired.state, acquired.lease, copiedBasisWindow)).toEqual({
      error: { code: "STALE_WINDOW_BASIS" },
      ok: false,
    });
    const unknownWindow = windowAuthority(acquired.state, ["missing"], 1);
    expect(acknowledge(acquired.state, acquired.lease, unknownWindow)).toEqual({
      error: { code: "INVALID_WINDOW_NODE_IDS", index: 0, nodeId: "missing" },
      ok: false,
    });
    const unknownLease = acquire(acquired.state, "camera", ["missing"]);
    expect(unknownLease).toEqual({
      error: {
        code: "PIN_REGISTRY_REJECTED",
        registryError: {
          code: "UNKNOWN_PIN_ID",
          index: 0,
          nodeId: "missing",
          ownerId: "camera",
        },
      },
      ok: false,
    });
  });

  it("requires current act basis, current window and current acknowledgement identities", () => {
    const acquired = requireAcquired(
      createViewportInteractionLeaseCoordinator(BASIS),
      "selected",
      ["a"],
    );
    const firstWindow = windowAuthority(acquired.state, ["a"], 1);
    const first = requireAcknowledged(acquired.state, acquired.lease, firstWindow);
    expect(authorizeViewportInteractionAct({
      acknowledgement: first.acknowledgement,
      expectedBasis: { ...BASIS, projectionEpoch: BASIS.projectionEpoch + 1 },
      expectedWindow: firstWindow,
      lease: acquired.lease,
      state: first.state,
    })).toEqual({
      error: { code: "STALE_ACT_BASIS", ownerId: "selected" },
      ok: false,
    });

    const nextWindow = windowAuthority(first.state, ["a", "b"], 2);
    const next = requireAcknowledged(first.state, acquired.lease, nextWindow);
    expect(authorizeViewportInteractionAct({
      acknowledgement: first.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: nextWindow,
      lease: acquired.lease,
      state: next.state,
    })).toEqual({
      error: { code: "LATE_ACKNOWLEDGEMENT", ownerId: "selected" },
      ok: false,
    });
    expect(authorizeViewportInteractionAct({
      acknowledgement: next.acknowledgement,
      expectedBasis: BASIS,
      expectedWindow: firstWindow,
      lease: acquired.lease,
      state: next.state,
    })).toEqual({
      error: { code: "STALE_ACT_WINDOW", ownerId: "selected" },
      ok: false,
    });
  });

  it("acknowledges every owner over 2,000 ordered pins without a hidden cap", () => {
    const preorder = Object.freeze(Array.from({ length: 2_000 }, (_, index) => `node-${index}`));
    let state = createViewportInteractionLeaseCoordinator(BASIS);
    const leases: ViewportPinLease[] = [];
    for (const ownerId of VIEWPORT_PIN_OWNER_IDS) {
      const acquired = acquireViewportInteractionLease({
        completePreorderNodeIds: preorder,
        expectedBasis: BASIS,
        ids: preorder,
        ownerId,
        state,
      });
      expect(acquired.ok).toBe(true);
      if (!acquired.ok) throw new Error(acquired.error.code);
      leases.push(acquired.lease);
      state = acquired.state;
    }
    const window = windowAuthority(state, preorder, 1);
    for (const lease of leases) {
      const acknowledged = acknowledge(state, lease, window, preorder);
      expect(acknowledged.ok).toBe(true);
      if (!acknowledged.ok) throw new Error(acknowledged.error.code);
      state = acknowledged.state;
    }
    expect(state.registry.leases).toHaveLength(VIEWPORT_PIN_OWNER_IDS.length);
    expect(state.registry.leases.every(({ ids }) => ids.length === 2_000)).toBe(true);
    expect(state.acknowledgements).toHaveLength(VIEWPORT_PIN_OWNER_IDS.length);
    expect(state.window?.nodeIds).toHaveLength(2_000);
  });

  it("leaves no lease or acknowledgement residue across 500 window and 200 projection cycles", () => {
    let state = createViewportInteractionLeaseCoordinator(BASIS);
    for (let index = 0; index < 500; index += 1) {
      const acquired = acquire(state, "camera", ["a"]);
      expect(acquired.ok).toBe(true);
      if (!acquired.ok) throw new Error(acquired.error.code);
      const window = windowAuthority(acquired.state, ["a"], index + 1);
      const acknowledged = requireAcknowledged(acquired.state, acquired.lease, window);
      const released = releaseViewportInteractionLease({
        lease: acquired.lease,
        state: acknowledged.state,
      });
      expect(released.ok).toBe(true);
      if (!released.ok) throw new Error(released.error.code);
      state = released.state;
    }
    let basis = state.registry.basis;
    for (let index = 0; index < 200; index += 1) {
      const acquired = acquire(state, "focus", ["a"], basis);
      expect(acquired.ok).toBe(true);
      if (!acquired.ok) throw new Error(acquired.error.code);
      basis = Object.freeze({ ...basis, projectionEpoch: basis.projectionEpoch + 1 });
      const reconciled = reconcileViewportInteractionLeases({
        basis,
        completePreorderNodeIds: PREORDER,
        state: acquired.state,
      });
      expect(reconciled.ok).toBe(true);
      if (!reconciled.ok) throw new Error(reconciled.error.code);
      state = reconciled.state;
    }
    expect(state.registry.lastLeaseSerial).toBe(700);
    expect(state.registry.leases).toEqual([]);
    expect(state.acknowledgements).toEqual([]);
    expect(state.window).toBeNull();
  });

  it("keeps inputs unchanged and freezes all coordinator publications", () => {
    const ids = ["b"];
    const preorder = [...PREORDER];
    const state = createViewportInteractionLeaseCoordinator(BASIS);
    const acquired = acquireViewportInteractionLease({
      completePreorderNodeIds: preorder,
      expectedBasis: BASIS,
      ids,
      ownerId: "drag",
      state,
    });
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) throw new Error(acquired.error.code);
    const window = windowAuthority(acquired.state, ["b"], 1);
    const acknowledged = requireAcknowledged(acquired.state, acquired.lease, window);
    expect(ids).toEqual(["b"]);
    expect(preorder).toEqual(PREORDER);
    for (const value of [
      acquired.state,
      acquired.state.acknowledgements,
      window,
      window.nodeIds,
      acknowledged.state,
      acknowledged.state.acknowledgements,
      acknowledged.acknowledgement,
    ]) expect(Object.isFrozen(value)).toBe(true);
  });
});
