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

  it("stays bounded, releasing unclaimed candidates before committed occurrences", () => {
    const registry = createWikiOccurrenceRegistry({
      maxEntries: 3,
      unclaimedTtlMs: 1_000,
      claimedTtlMs: 10_000,
    });
    registry.register("claimed_a", ATTRIBUTION, 0);
    registry.claim("claimed_a", 0);
    registry.register("unclaimed_b", ATTRIBUTION, 1);
    registry.register("claimed_c", ATTRIBUTION, 2);
    registry.claim("claimed_c", 2);

    registry.register("newest_d", ATTRIBUTION, 3);
    expect(registry.size()).toBe(3);
    registry.claim("newest_d", 3);
    expect(registry.take("unclaimed_b", 4)).toBeNull();

    registry.register("newest_e", ATTRIBUTION, 5);
    // With no unclaimed candidate left, the oldest committed entry leaves.
    expect(registry.take("claimed_a", 6)).toBeNull();
    expect(registry.take("claimed_c", 6)).toEqual(ATTRIBUTION);
    expect(registry.take("newest_d", 6)).toEqual(ATTRIBUTION);
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
    expect(() => createWikiOccurrenceRegistry({
      maxEntries: 0,
      unclaimedTtlMs: 1,
      claimedTtlMs: 1,
    })).toThrow(RangeError);
  });
});
