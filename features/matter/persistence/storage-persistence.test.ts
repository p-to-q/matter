import { describe, expect, it, vi } from "vitest";
import { createStoragePersistence, PERSISTENCE_DENIAL_COOLDOWN_MS } from "./storage-persistence";

const DENIAL_KEY = "matter.storage-persistence-denied.v1";

function preferences(initial: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe("storage persistence", () => {
  it("reads persistence without ever asking for it", async () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    const persistence = createStoragePersistence({ storage, preferences: preferences() });

    await expect(persistence.persisted()).resolves.toBe(false);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("asks synchronously inside the gesture, before any await", () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    const persistence = createStoragePersistence({ storage, preferences: preferences() });

    void persistence.request("retry");
    // No microtask has run: the request still carries the gesture's activation.
    expect(storage.persist).toHaveBeenCalledOnce();
    expect(storage.persisted).not.toHaveBeenCalled();
  });

  it("quiets Retry and Replace for a cooldown after a refusal, but Export always asks", async () => {
    let now = 1_000_000;
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => false) };
    const remembered = preferences();
    const persistence = createStoragePersistence({ storage, preferences: remembered, now: () => now });

    await expect(persistence.request("retry")).resolves.toBe(false);
    expect(remembered.values.get(DENIAL_KEY)).toBe(String(now));
    await expect(persistence.request("replace")).resolves.toBe(false);
    await expect(persistence.request("retry")).resolves.toBe(false);
    expect(storage.persist).toHaveBeenCalledOnce();

    await expect(persistence.request("export")).resolves.toBe(false);
    expect(storage.persist).toHaveBeenCalledTimes(2);

    now += PERSISTENCE_DENIAL_COOLDOWN_MS;
    await expect(persistence.request("retry")).resolves.toBe(false);
    expect(storage.persist).toHaveBeenCalledTimes(3);
  });

  it("never treats the first release's permanent refusal marker as current", async () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    const remembered = preferences({ [DENIAL_KEY]: "1" });
    const persistence = createStoragePersistence({ storage, preferences: remembered, now: () => 5_000 });

    await expect(persistence.request("retry")).resolves.toBe(true);
    expect(storage.persist).toHaveBeenCalledOnce();
    expect(remembered.values.has(DENIAL_KEY)).toBe(false);
  });

  it("forgets a refusal once the browser grants persistence", async () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    const remembered = preferences({ [DENIAL_KEY]: "900" });
    const persistence = createStoragePersistence({ storage, preferences: remembered, now: () => 1_000 });

    await expect(persistence.request("export")).resolves.toBe(true);
    expect(remembered.removeItem).toHaveBeenCalledWith(DENIAL_KEY);
  });

  it("reports nothing where the storage manager is absent or throws, as in a private window", async () => {
    await expect(createStoragePersistence({}).persisted()).resolves.toBeNull();
    await expect(createStoragePersistence({}).request("export")).resolves.toBeNull();
    const failing = {
      persisted: vi.fn(async () => {
        throw new DOMException("denied", "SecurityError");
      }),
      persist: vi.fn(() => {
        throw new DOMException("denied", "SecurityError");
      }),
    };
    const throwing = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const persistence = createStoragePersistence({
      storage: failing,
      preferences: { getItem: throwing, setItem: throwing, removeItem: throwing },
    });
    await expect(persistence.persisted()).resolves.toBeNull();
    await expect(persistence.request("retry")).resolves.toBeNull();
    await expect(persistence.request("export")).resolves.toBeNull();
  });
});
