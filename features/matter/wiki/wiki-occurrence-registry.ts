import type { WikiOccurrenceOrigin } from "./wiki-learning-policy";
import { MAX_WIKI_OCCURRENCE_ID_LENGTH, type WikiAppliedRule } from "./wiki-model";

// The same shape `wiki-invariants` enforces for a settled id; kept local so the
// eager material graph does not load the complete state validator.
const OCCURRENCE_ID = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_WIKI_OCCURRENCE_ID_LENGTH}}$`, "u");

/**
 * What Wiki remembers about one applied occurrence between the edit that
 * minted its token and the one settlement that consumes it. It holds the rule
 * identity and its application basis, never the surrounding material.
 */
export type WikiOccurrenceAttribution = Readonly<{
  rule: WikiAppliedRule;
  origin: WikiOccurrenceOrigin;
}>;

export type WikiOccurrenceRegistryBounds = Readonly<{
  /**
   * Committed occurrences that may wait for settlement at once: the browser
   * driver keeps at most this many live and censors (and so takes) the rest.
   */
  maxClaimed: number;
  /** Room beyond that for tokens minted for candidates not yet committed. */
  unclaimedHeadroom: number;
  /** A token minted for a candidate that never committed is released quickly. */
  unclaimedTtlMs: number;
  /** A committed occurrence may wait this long for its one settlement. */
  claimedTtlMs: number;
}>;

export const WIKI_OCCURRENCE_REGISTRY_BOUNDS: WikiOccurrenceRegistryBounds = Object.freeze({
  maxClaimed: 64,
  unclaimedHeadroom: 64,
  unclaimedTtlMs: 10_000,
  claimedTtlMs: 5 * 60_000,
});

/**
 * A bounded, in-memory attribution cache. Owner: the Wiki runtime. Key: the
 * opaque random occurrence id. Bound: `maxClaimed + unclaimedHeadroom`
 * entries. Only an unclaimed candidate is ever evicted, oldest first: a
 * claimed entry backs a mark the person may be looking at, so it leaves only
 * by `take` or its TTL. A registry full of claimed entries refuses a new mint,
 * and that edit is applied without attribution or mark, exactly as an edit
 * beyond the driver's live bound is. Invalidation: TTL, and `take`, which
 * consumes an entry so one occurrence can settle at most once. Failure: an
 * unknown, expired, or evicted id attributes nothing, which settles to
 * nothing. Nothing is persisted, and no entry outlives the page.
 */
export type WikiOccurrenceRegistry = Readonly<{
  register(occurrenceId: string, attribution: WikiOccurrenceAttribution, nowMs: number): boolean;
  /**
   * Marks a token that reached committed material. False for an unknown,
   * evicted, or expired id: its edit must not be offered as an occurrence.
   */
  claim(occurrenceId: string, nowMs: number): boolean;
  /** Consumes one claimed, unexpired attribution. */
  take(occurrenceId: string, nowMs: number): WikiOccurrenceAttribution | null;
  size(): number;
  clear(): void;
}>;

type Entry = {
  attribution: WikiOccurrenceAttribution;
  registeredAtMs: number;
  claimedAtMs: number | null;
};

export function createWikiOccurrenceRegistry(
  bounds: WikiOccurrenceRegistryBounds = WIKI_OCCURRENCE_REGISTRY_BOUNDS,
): WikiOccurrenceRegistry {
  if (
    !Number.isSafeInteger(bounds.maxClaimed) || bounds.maxClaimed < 1 ||
    !Number.isSafeInteger(bounds.unclaimedHeadroom) || bounds.unclaimedHeadroom < 1 ||
    !isDuration(bounds.unclaimedTtlMs) || !isDuration(bounds.claimedTtlMs)
  ) throw new RangeError("Wiki occurrence registry bounds are invalid.");
  const capacity = bounds.maxClaimed + bounds.unclaimedHeadroom;
  // Insertion order is age order; claiming does not reorder an entry.
  const entries = new Map<string, Entry>();

  const expired = (entry: Entry, nowMs: number) => entry.claimedAtMs === null
    ? nowMs - entry.registeredAtMs > bounds.unclaimedTtlMs
    : nowMs - entry.claimedAtMs > bounds.claimedTtlMs;
  const prune = (nowMs: number) => {
    for (const [id, entry] of entries) if (expired(entry, nowMs)) entries.delete(id);
  };
  /** Releases the oldest unclaimed candidate; never a claimed entry. */
  const evictUnclaimed = (): boolean => {
    for (const [id, entry] of entries) {
      if (entry.claimedAtMs === null) {
        entries.delete(id);
        return true;
      }
    }
    return false;
  };

  return Object.freeze({
    register(occurrenceId, attribution, nowMs) {
      if (!OCCURRENCE_ID.test(occurrenceId) || !Number.isFinite(nowMs) ||
          entries.has(occurrenceId)) return false;
      prune(nowMs);
      while (entries.size >= capacity) {
        if (!evictUnclaimed()) return false;
      }
      entries.set(occurrenceId, {
        attribution: Object.freeze({
          rule: Object.freeze({ ...attribution.rule }),
          origin: attribution.origin,
        }),
        registeredAtMs: nowMs,
        claimedAtMs: null,
      });
      return true;
    },
    claim(occurrenceId, nowMs) {
      const entry = entries.get(occurrenceId);
      if (entry === undefined || !Number.isFinite(nowMs)) return false;
      if (expired(entry, nowMs)) {
        entries.delete(occurrenceId);
        return false;
      }
      entry.claimedAtMs ??= nowMs;
      return true;
    },
    take(occurrenceId, nowMs) {
      const entry = entries.get(occurrenceId);
      if (entry === undefined) return null;
      entries.delete(occurrenceId);
      return entry.claimedAtMs === null || !Number.isFinite(nowMs) || expired(entry, nowMs)
        ? null
        : entry.attribution;
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  });
}

function isDuration(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
