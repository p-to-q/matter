/**
 * At most one picture in flight across the whole app. The server admits three
 * per window and two concurrent per instance, but a person is one, and a second
 * generation is a second charge.
 */
export type PictureInFlightGate = Readonly<{
  /**
   * Takes the only slot for `owner`, or returns null when it is taken. The
   * returned release is idempotent and frees the slot only for this entry, so a
   * late release can never free a later holder.
   */
  tryEnter(owner: string): (() => void) | null;
  /** Who holds the slot now; null when it is free. */
  heldBy(): string | null;
}>;

export function createPictureInFlightGate(): PictureInFlightGate {
  let entry: Readonly<{ owner: string }> | null = null;
  return Object.freeze({
    tryEnter(owner) {
      if (entry !== null) return null;
      const mine = Object.freeze({ owner });
      entry = mine;
      return () => {
        if (entry === mine) entry = null;
      };
    },
    heldBy: () => entry?.owner ?? null,
  });
}
