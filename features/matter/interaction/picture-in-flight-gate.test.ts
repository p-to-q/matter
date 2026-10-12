import { describe, expect, it, vi } from "vitest";
import {
  PICTURE_IN_FLIGHT_LOCK,
  createPictureInFlightGate,
  type PictureLockManager,
} from "./picture-in-flight-gate";

/**
 * A lock manager shared by every fake tab built from it, with the semantics the
 * gate relies on: `ifAvailable` answers null at once when the lock is held, and
 * a granted lock is held until the callback's promise settles.
 */
function createFakeLocks() {
  const held = new Set<string>();
  const requests: Array<{ name: string; options: unknown }> = [];
  const manager: PictureLockManager = {
    async request(name, options, callback) {
      requests.push({ name, options });
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
  return { manager, held, requests };
}

const NO_LOCKS = () => undefined;

describe("picture in-flight gate", () => {
  it("admits one holder and refuses every other while the slot is taken", () => {
    const gate = createPictureInFlightGate(NO_LOCKS);
    const entry = gate.tryEnter("node-1");
    expect(entry).not.toBeNull();
    expect(gate.heldBy()).toBe("node-1");
    expect(gate.tryEnter("node-2")).toBeNull();
    expect(gate.tryEnter("node-1")).toBeNull();
    expect(gate.heldBy()).toBe("node-1");
  });

  it("frees the slot on release and admits the next holder", () => {
    const gate = createPictureInFlightGate(NO_LOCKS);
    gate.tryEnter("node-1")!.release();
    expect(gate.heldBy()).toBeNull();
    expect(gate.tryEnter("node-2")).not.toBeNull();
    expect(gate.heldBy()).toBe("node-2");
  });

  it("makes release idempotent and unable to free a later holder", () => {
    const gate = createPictureInFlightGate(NO_LOCKS);
    const first = gate.tryEnter("node-1")!;
    first.release();
    const second = gate.tryEnter("node-2")!;
    first.release();
    first.release();
    expect(gate.heldBy()).toBe("node-2");
    expect(gate.tryEnter("node-3")).toBeNull();
    second.release();
    expect(gate.heldBy()).toBeNull();
  });

  it("is independent per gate", () => {
    const left = createPictureInFlightGate(NO_LOCKS);
    const right = createPictureInFlightGate(NO_LOCKS);
    expect(left.tryEnter("node-1")).not.toBeNull();
    expect(right.tryEnter("node-1")).not.toBeNull();
  });
});

describe("picture in-flight gate across tabs", () => {
  it("needs nothing more where the browser has no Web Locks", () => {
    const gate = createPictureInFlightGate(NO_LOCKS);
    expect(gate.tryEnter("node-1")!.shareAcrossTabs()).toBe(true);
  });

  it("reads Web Locks from the browser when none is injected", () => {
    const fake = createFakeLocks();
    vi.stubGlobal("navigator", { locks: fake.manager });
    try {
      const gate = createPictureInFlightGate();
      return expect(gate.tryEnter("node-1")!.shareAcrossTabs()).resolves.toBe(true)
        .then(() => expect(fake.requests).toEqual([
          { name: PICTURE_IN_FLIGHT_LOCK, options: { ifAvailable: true } },
        ]));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("takes the named lock without waiting, and holds it until release", async () => {
    const fake = createFakeLocks();
    const gate = createPictureInFlightGate(() => fake.manager);
    const entry = gate.tryEnter("node-1")!;
    await expect(entry.shareAcrossTabs()).resolves.toBe(true);
    expect(fake.requests).toEqual([
      { name: "matter-picture-in-flight", options: { ifAvailable: true } },
    ]);
    expect(fake.held.has("matter-picture-in-flight")).toBe(true);
    entry.release();
    await vi.waitFor(() => expect(fake.held.size).toBe(0));
  });

  it("refuses an entry whose lock another tab holds, and keeps the other tab's lock", async () => {
    const fake = createFakeLocks();
    const first = createPictureInFlightGate(() => fake.manager);
    const second = createPictureInFlightGate(() => fake.manager);
    const holder = first.tryEnter("node-1")!;
    await expect(holder.shareAcrossTabs()).resolves.toBe(true);
    const refused = second.tryEnter("node-1")!;
    await expect(refused.shareAcrossTabs()).resolves.toBe(false);
    // The refused tab letting go must not free the lock the first tab holds.
    refused.release();
    await Promise.resolve();
    expect(fake.held.has("matter-picture-in-flight")).toBe(true);
    expect(second.heldBy()).toBeNull();
    holder.release();
    await vi.waitFor(() => expect(fake.held.size).toBe(0));
    const next = second.tryEnter("node-1")!;
    await expect(next.shareAcrossTabs()).resolves.toBe(true);
  });

  it("answers a repeated request from the same entry with the same outcome", async () => {
    const fake = createFakeLocks();
    const gate = createPictureInFlightGate(() => fake.manager);
    const entry = gate.tryEnter("node-1")!;
    const once = entry.shareAcrossTabs();
    const twice = entry.shareAcrossTabs();
    await expect(Promise.all([once, twice])).resolves.toEqual([true, true]);
    expect(fake.requests).toHaveLength(1);
    entry.release();
  });

  it("gives a lock back that is granted after the entry was already released", async () => {
    let callback!: Parameters<PictureLockManager["request"]>[2];
    const delayed: PictureLockManager = {
      request: (_name, _options, grantedTo) => {
        callback = grantedTo;
        return new Promise<void>(() => undefined);
      },
    };
    const gate = createPictureInFlightGate(() => delayed);
    const entry = gate.tryEnter("node-1")!;
    const outcome = entry.shareAcrossTabs();
    entry.release();
    const kept = callback({ name: "late" });
    await expect(outcome).resolves.toBe(false);
    // The callback returned at once, so the lock is not kept by a released entry.
    expect(kept).toBeUndefined();
  });

  it("refuses a released entry without asking the browser", async () => {
    const fake = createFakeLocks();
    const gate = createPictureInFlightGate(() => fake.manager);
    const entry = gate.tryEnter("node-1")!;
    entry.release();
    await expect(entry.shareAcrossTabs()).resolves.toBe(false);
    expect(fake.requests).toEqual([]);
  });

  it("falls back to the in-tab slot when the browser cannot answer the lock question", async () => {
    const throwing: PictureLockManager = {
      request: () => { throw new DOMException("denied", "SecurityError"); },
    };
    const rejecting: PictureLockManager = {
      request: () => Promise.reject(new DOMException("denied", "SecurityError")),
    };
    for (const manager of [throwing, rejecting]) {
      const gate = createPictureInFlightGate(() => manager);
      await expect(gate.tryEnter("node-1")!.shareAcrossTabs()).resolves.toBe(true);
      // The in-tab slot still excludes a second entry.
      expect(gate.tryEnter("node-2")).toBeNull();
    }
  });
});
