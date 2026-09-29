/**
 * Asks the browser to keep this origin's storage out of eviction. Persistence
 * is a safeguard, never a promise, and never a prompt Matter raises on its
 * own: `persisted()` only reads, and `request()` belongs inside an explicit
 * Export, Retry, or Replace gesture.
 *
 * `request()` calls `persist()` synchronously, before any await, because some
 * engines honour it only while the gesture's activation lasts. Most refusals
 * are silent heuristics (engagement, installation) rather than a person's
 * answer, so a refusal only quiets Retry and Replace for a cooldown; Export,
 * the gesture that most directly says "keep this", always asks again.
 */
export type StoragePersistenceGesture = "export" | "retry" | "replace";

export type StoragePersistence = Readonly<{
  /** `null` when the browser has no storage manager or the read failed. */
  persisted(): Promise<boolean | null>;
  request(gesture: StoragePersistenceGesture): Promise<boolean | null>;
}>;

export type StoragePersistenceEnvironment = Readonly<{
  storage?: Pick<StorageManager, "persist" | "persisted">;
  preferences?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  now?: () => number;
}>;

const DENIAL_KEY = "matter.storage-persistence-denied.v1";
/** How long a refusal quiets Retry and Replace on this device. */
export const PERSISTENCE_DENIAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;

export function createStoragePersistence(
  environment: StoragePersistenceEnvironment = browserEnvironment(),
): StoragePersistence {
  const now = environment.now ?? Date.now;
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
    request(gesture) {
      const storage = environment.storage;
      if (storage === undefined) return Promise.resolve(null);
      if (gesture !== "export" && deniedWithin(environment, now(), PERSISTENCE_DENIAL_COOLDOWN_MS)) {
        return persisted();
      }
      let asked: Promise<boolean>;
      try {
        // Already-persistent storage resolves true without a prompt.
        asked = storage.persist();
      } catch {
        return persisted();
      }
      return asked.then(
        (granted) => {
          if (granted) forgetDenial(environment);
          else rememberDenial(environment, now());
          return granted;
        },
        () => persisted(),
      );
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

function deniedWithin(environment: StoragePersistenceEnvironment, at: number, windowMs: number): boolean {
  try {
    const deniedAt = Number(environment.preferences?.getItem(DENIAL_KEY) ?? Number.NaN);
    // The first release stored "1"; read as a refusal long past its cooldown.
    return Number.isFinite(deniedAt) && deniedAt > 1 && at - deniedAt >= 0 && at - deniedAt < windowMs;
  } catch {
    return false;
  }
}

function rememberDenial(environment: StoragePersistenceEnvironment, at: number): void {
  try {
    environment.preferences?.setItem(DENIAL_KEY, String(at));
  } catch {
    // Without local preferences each gesture may ask again; still never unprompted.
  }
}

function forgetDenial(environment: StoragePersistenceEnvironment): void {
  try {
    environment.preferences?.removeItem(DENIAL_KEY);
  } catch {
    // Nothing to forget where preferences are unavailable.
  }
}
