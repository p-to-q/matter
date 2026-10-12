/**
 * At most one picture in flight for the person. The server admits three per
 * window and two concurrent per instance, but a person is one, and a second
 * generation is a second charge. The slot is taken in this tab synchronously,
 * and the same person's other tabs are excluded by a Web Lock where the
 * browser has one.
 */
export type PictureInFlightEntry = Readonly<{
  /** Idempotent, and frees the slot only for this entry, so a late release can never free a later holder. */
  release(): void;
  /**
   * Takes the cross-tab lock for this entry. `true` means nothing more is
   * needed: either this entry holds the lock, or the browser has no Web Locks
   * and the in-tab slot is all there is. A promise settles `true` when the lock
   * is held and `false` when another tab holds it, or when this entry was
   * released before the lock was granted.
   */
  shareAcrossTabs(): true | Promise<boolean>;
}>;

export type PictureInFlightGate = Readonly<{
  /** Takes the only slot in this tab for `owner`, or returns null when it is taken. */
  tryEnter(owner: string): PictureInFlightEntry | null;
  /** Who holds the slot now; null when it is free. */
  heldBy(): string | null;
}>;

/** The part of `navigator.locks` the gate uses. */
export type PictureLockManager = Readonly<{
  request(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}>;

export const PICTURE_IN_FLIGHT_LOCK = "matter-picture-in-flight";

function browserLocks(): PictureLockManager | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as { locks?: PictureLockManager }).locks;
}

export function createPictureInFlightGate(
  locks: () => PictureLockManager | undefined = browserLocks,
): PictureInFlightGate {
  let held: Readonly<{ owner: string }> | null = null;
  return Object.freeze({
    tryEnter(owner) {
      if (held !== null) return null;
      const mine = Object.freeze({ owner });
      held = mine;
      let released = false;
      let sharing: Promise<boolean> | null = null;
      let unlock: (() => void) | null = null;
      return Object.freeze({
        release() {
          released = true;
          unlock?.();
          unlock = null;
          if (held === mine) held = null;
        },
        shareAcrossTabs() {
          const manager = locks();
          if (manager === undefined) return true;
          if (released) return Promise.resolve(false);
          if (sharing !== null) return sharing;
          sharing = new Promise<boolean>((resolve) => {
            const granted = (lock: unknown): Promise<void> | void => {
              if (lock === null || released) {
                resolve(false);
                return;
              }
              // Held until the entry is released or the tab goes away.
              return new Promise<void>((hold) => {
                unlock = hold;
                resolve(true);
              });
            };
            try {
              manager.request(PICTURE_IN_FLIGHT_LOCK, { ifAvailable: true }, granted)
                // A browser that cannot answer the lock question leaves the
                // in-tab slot as the whole protection, as without Web Locks.
                .catch(() => resolve(true));
            } catch {
              resolve(true);
            }
          });
          return sharing;
        },
      });
    },
    heldBy: () => held?.owner ?? null,
  });
}
