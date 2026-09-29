import { describe, expect, it } from "vitest";
import {
  createWikiOccurrenceRegistry,
  WIKI_OCCURRENCE_REGISTRY_BOUNDS,
  type WikiOccurrenceAttribution,
} from "./wiki-occurrence-registry";

const ATTRIBUTION: WikiOccurrenceAttribution = Object.freeze({
  rule: Object.freeze({
    locale: "zh-CN" as const,
    channel: "spoken" as const,
    boundary: "word" as const,
    form: "P to Q",
    canonical: "[p → q]",
    appliedAtRevision: 3,
  }),
  origin: "human-admission" as const,
});

describe("Wiki occurrence registry", () => {
  it("settles a claimed occurrence at most once", () => {
    const registry = createWikiOccurrenceRegistry();
    expect(registry.register("occ_1", ATTRIBUTION, 0)).toBe(true);
    expect(registry.claim("occ_1", 5)).toBe(true);

    expect(registry.take("occ_1", 10)).toEqual(ATTRIBUTION);
    expect(registry.take("occ_1", 11)).toBeNull();
    expect(registry.size()).toBe(0);
  });

  it("attributes nothing for an unknown, unclaimed, or malformed id", () => {
    const registry = createWikiOccurrenceRegistry();
    expect(registry.take("never_minted", 0)).toBeNull();
    expect(registry.register("not a token", ATTRIBUTION, 0)).toBe(false);
    expect(registry.register("x".repeat(65), ATTRIBUTION, 0)).toBe(false);
    registry.register("occ_unclaimed", ATTRIBUTION, 0);
    // A token whose candidate never committed cannot be settled.
    expect(registry.take("occ_unclaimed", 1)).toBeNull();
    expect(registry.register("occ_repeat", ATTRIBUTION, 0)).toBe(true);
    expect(registry.register("occ_repeat", ATTRIBUTION, 0)).toBe(false);
  });

  it("expires unclaimed and claimed entries on their own clocks", () => {
    const bounds = WIKI_OCCURRENCE_REGISTRY_BOUNDS;
    const registry = createWikiOccurrenceRegistry();
    registry.register("occ_late_claim", ATTRIBUTION, 0);
    expect(registry.claim("occ_late_claim", bounds.unclaimedTtlMs + 1)).toBe(false);
    expect(registry.size()).toBe(0);

    registry.register("occ_claimed", ATTRIBUTION, 0);
    registry.claim("occ_claimed", 100);
    expect(registry.take("occ_claimed", 100 + bounds.claimedTtlMs + 1)).toBeNull();

    registry.register("occ_in_time", ATTRIBUTION, 0);
    registry.claim("occ_in_time", 100);
    expect(registry.take("occ_in_time", 100 + bounds.claimedTtlMs)).toEqual(ATTRIBUTION);
  });

  it("stays bounded by releasing unclaimed candidates only, and refuses a mint when full of claimed", () => {
    const registry = createWikiOccurrenceRegistry({
      maxClaimed: 2,
      unclaimedHeadroom: 1,
      unclaimedTtlMs: 1_000,
      claimedTtlMs: 10_000,
    });
    registry.register("claimed_a", ATTRIBUTION, 0);
    registry.claim("claimed_a", 0);
    registry.register("unclaimed_b", ATTRIBUTION, 1);
    registry.register("claimed_c", ATTRIBUTION, 2);
    registry.claim("claimed_c", 2);

    expect(registry.register("newest_d", ATTRIBUTION, 3)).toBe(true);
    expect(registry.size()).toBe(3);
    expect(registry.claim("newest_d", 3)).toBe(true);
    // The unclaimed candidate made room; it can no longer be claimed.
    expect(registry.claim("unclaimed_b", 3)).toBe(false);

    // Every entry is a committed occurrence: none is evicted for a newcomer.
    expect(registry.register("newest_e", ATTRIBUTION, 5)).toBe(false);
    expect(registry.claim("newest_e", 5)).toBe(false);
    expect(registry.take("claimed_a", 6)).toEqual(ATTRIBUTION);
    expect(registry.take("claimed_c", 6)).toEqual(ATTRIBUTION);
    expect(registry.take("newest_d", 6)).toEqual(ATTRIBUTION);
  });

  it("never lets a candidate that does not commit cost a marked occurrence its attribution", () => {
    const registry = createWikiOccurrenceRegistry();
    const { maxClaimed, unclaimedHeadroom } = WIKI_OCCURRENCE_REGISTRY_BOUNDS;
    for (let index = 0; index < maxClaimed; index += 1) {
      registry.register(`live_${index}`, ATTRIBUTION, index);
      registry.claim(`live_${index}`, index);
    }
    // A burst of repair candidates that never commit, beyond all headroom.
    for (let index = 0; index < unclaimedHeadroom * 3; index += 1) {
      expect(registry.register(`candidate_${index}`, ATTRIBUTION, 100 + index)).toBe(true);
    }
    expect(registry.size()).toBe(maxClaimed + unclaimedHeadroom);
    for (let index = 0; index < maxClaimed; index += 1) {
      expect(registry.take(`live_${index}`, 1_000)).toEqual(ATTRIBUTION);
    }
  });

  it("keeps the newest attributions of a turn with more edits than the live bound", () => {
    const registry = createWikiOccurrenceRegistry();
    const { maxClaimed, unclaimedHeadroom } = WIKI_OCCURRENCE_REGISTRY_BOUNDS;
    // A full set of live occurrences from earlier turns.
    const earlier = Array.from({ length: maxClaimed }, (_, index) => `earlier_${index}`);
    for (const id of earlier) {
      registry.register(id, ATTRIBUTION, 0);
      registry.claim(id, 0);
    }
    // One long dictation mints more edits than the headroom holds.
    const turn = Array.from({ length: unclaimedHeadroom + 36 }, (_, index) => `turn_${index}`);
    for (const id of turn) expect(registry.register(id, ATTRIBUTION, 10)).toBe(true);
    // Its earliest edits made room for its latest; the earlier live set is intact.
    const claimed = turn.filter((id) => registry.claim(id, 20));
    expect(claimed).toEqual(turn.slice(36));
    // The driver keeps the newest live occurrences and censors the rest, which
    // takes them: exactly the earlier set, since it is the oldest.
    for (const id of earlier) expect(registry.take(id, 30)).toEqual(ATTRIBUTION);
    expect(registry.size()).toBe(maxClaimed);
    for (const id of claimed) expect(registry.take(id, 40)).toEqual(ATTRIBUTION);
  });

  it("renews only a claimed, unexpired attribution, and never revives one", () => {
    const registry = createWikiOccurrenceRegistry();
    const bounds = WIKI_OCCURRENCE_REGISTRY_BOUNDS;
    registry.register("occ_open", ATTRIBUTION, 0);
    registry.claim("occ_open", 0);
    // The person opened the takeover late in the wait, then consulted Wiki.
    expect(registry.renew("occ_open", bounds.claimedTtlMs - 1)).toBe(true);
    expect(registry.renew("occ_open", 2 * bounds.claimedTtlMs - 2)).toBe(true);
    expect(registry.take("occ_open", 3 * bounds.claimedTtlMs - 2)).toEqual(ATTRIBUTION);

    registry.register("occ_unclaimed", ATTRIBUTION, 0);
    expect(registry.renew("occ_unclaimed", 1)).toBe(false);
    expect(registry.renew("occ_unknown", 1)).toBe(false);
    registry.register("occ_expired", ATTRIBUTION, 0);
    registry.claim("occ_expired", 0);
    expect(registry.renew("occ_expired", bounds.claimedTtlMs + 1)).toBe(false);
    expect(registry.take("occ_expired", bounds.claimedTtlMs + 1)).toBeNull();
  });

  it("owns an immutable copy of the attribution", () => {
    const registry = createWikiOccurrenceRegistry();
    const mutable = { rule: { ...ATTRIBUTION.rule }, origin: ATTRIBUTION.origin };
    registry.register("occ_copy", mutable, 0);
    registry.claim("occ_copy", 0);
    mutable.rule.canonical = "changed";
    const taken = registry.take("occ_copy", 1);
    expect(taken?.rule.canonical).toBe("[p → q]");
    expect(Object.isFrozen(taken)).toBe(true);
    expect(Object.isFrozen(taken?.rule)).toBe(true);
  });

  it("rejects invalid bounds", () => {
    for (const bounds of [
      { maxClaimed: 0, unclaimedHeadroom: 1 },
      { maxClaimed: 1, unclaimedHeadroom: 0 },
      { maxClaimed: 1.5, unclaimedHeadroom: 1 },
    ]) {
      expect(() => createWikiOccurrenceRegistry({ ...bounds, unclaimedTtlMs: 1, claimedTtlMs: 1 }))
        .toThrow(RangeError);
    }
  });
});
