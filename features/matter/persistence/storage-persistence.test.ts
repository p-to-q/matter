import { describe, expect, it, vi } from "vitest";
import { createStoragePersistence } from "./storage-persistence";

function preferences() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
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

  it("asks inside a gesture, and remembers a refusal so the person is not asked again", async () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => false) };
    const remembered = preferences();
    const persistence = createStoragePersistence({ storage, preferences: remembered });

    await expect(persistence.request()).resolves.toBe(false);
    await expect(persistence.request()).resolves.toBe(false);
    expect(storage.persist).toHaveBeenCalledOnce();
    await expect(createStoragePersistence({ storage, preferences: remembered }).request()).resolves.toBe(false);
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it("does not ask again once storage is already persistent", async () => {
    const storage = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) };
    const persistence = createStoragePersistence({ storage, preferences: preferences() });

    await expect(persistence.request()).resolves.toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("reports nothing where the storage manager is absent or throws, as in a private window", async () => {
    await expect(createStoragePersistence({}).persisted()).resolves.toBeNull();
    await expect(createStoragePersistence({}).request()).resolves.toBeNull();
    const failing = {
      persisted: vi.fn(async () => {
        throw new DOMException("denied", "SecurityError");
      }),
      persist: vi.fn(async () => {
        throw new DOMException("denied", "SecurityError");
      }),
    };
    const throwingPreferences = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    const persistence = createStoragePersistence({ storage: failing, preferences: throwingPreferences });
    await expect(persistence.persisted()).resolves.toBeNull();
    await expect(persistence.request()).resolves.toBeNull();
  });
});
