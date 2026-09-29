/**
 * Asks the browser to keep this origin's storage out of eviction. Persistence
 * is a safeguard, never a promise, and never a prompt Matter raises on its
 * own: `persisted()` only reads, and `request()` belongs inside an explicit
 * Export, Retry, or Replace gesture. A refusal is remembered on this device so
 * the person is not asked again.
 */
export type StoragePersistence = Readonly<{
  /** `null` when the browser has no storage manager or the read failed. */
  persisted(): Promise<boolean | null>;
  request(): Promise<boolean | null>;
}>;

export type StoragePersistenceEnvironment = Readonly<{
  storage?: Pick<StorageManager, "persist" | "persisted">;
  preferences?: Pick<Storage, "getItem" | "setItem">;
}>;

const DENIAL_KEY = "matter.storage-persistence-denied.v1";

export function createStoragePersistence(
  environment: StoragePersistenceEnvironment = browserEnvironment(),
): StoragePersistence {
  const persisted = async (): Promise<boolean | null> => {
    if (environment.storage === undefined) return null;
    try {
      return await environment.storage.persisted();
    } catch {
      return null;
    }
  };
  return Object.freeze({
    persisted,
    async request() {
      if (environment.storage === undefined) return null;
      const current = await persisted();
      if (current === true || readDenial(environment)) return current;
      try {
        const granted = await environment.storage.persist();
        if (!granted) rememberDenial(environment);
        return granted;
      } catch {
        return current;
      }
    },
  });
}

function browserEnvironment(): StoragePersistenceEnvironment {
  if (typeof navigator === "undefined") return {};
  let preferences: StoragePersistenceEnvironment["preferences"];
  try {
    preferences = typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    // Some privacy modes throw on access to localStorage itself.
    preferences = undefined;
  }
  const storage = navigator.storage;
  return {
    ...(typeof storage?.persist === "function" && typeof storage.persisted === "function" ? { storage } : {}),
    ...(preferences === undefined ? {} : { preferences }),
  };
}

function readDenial(environment: StoragePersistenceEnvironment): boolean {
  try {
    return environment.preferences?.getItem(DENIAL_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDenial(environment: StoragePersistenceEnvironment): void {
  try {
    environment.preferences?.setItem(DENIAL_KEY, "1");
  } catch {
    // Without local preferences the browser may be asked again; still no prompt loop.
  }
}
