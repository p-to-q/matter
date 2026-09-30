/**
 * Tests for the wiki qualification check/update tooling.
 *
 * These tests exercise the pure helper functions (applyLearningPolicyUpdate,
 * applyProducerReleasesUpdate, diffLearningPolicy, diffProducerReleases) and
 * the validation guard (updateWikiQualification refuses to write when scenarios
 * or producer decisions fail) without running the full qualification corpus.
 *
 * Idempotence is proved by showing that applying an update with the currently
 * committed release values produces source bytes that are identical to the
 * existing file, so running --print-update twice is a no-op.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyLearningPolicyUpdate,
  applyProducerReleasesUpdate,
  assertQualificationPassed,
  diffLearningPolicy,
  diffProducerReleases,
} from "./qualify-wiki";
import { MATTER_WIKI_QUALIFIED_LEARNING_POLICY } from
  "../../../features/matter/wiki/wiki-qualified-learning-policy";
import type { WikiQualifiedLearningPolicyRelease } from
  "../../../features/matter/wiki/wiki-qualified-learning-policy";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "../../../features/matter/wiki/wiki-qualified-producer-releases";

const ROOT = resolve(import.meta.dirname, "../../..");

// ── diffLearningPolicy ────────────────────────────────────────────────────

describe("diffLearningPolicy", () => {
  it("returns no diffs when committed equals computed", () => {
    const diffs = diffLearningPolicy(
      MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
    );
    expect(diffs).toHaveLength(0);
  });

  it("detects a planted resultDigest drift", () => {
    const planted: WikiQualifiedLearningPolicyRelease = {
      ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      resultDigest: "sha256:" + "a".repeat(64),
    };
    const diffs = diffLearningPolicy(MATTER_WIKI_QUALIFIED_LEARNING_POLICY, planted);
    expect(diffs.map((d) => d.field)).toContain("resultDigest");
    const diff = diffs.find((d) => d.field === "resultDigest")!;
    expect(diff.committed).toBe(MATTER_WIKI_QUALIFIED_LEARNING_POLICY.resultDigest);
    expect(diff.computed).toBe("sha256:" + "a".repeat(64));
  });

  it("detects a planted policySourceDigest drift", () => {
    const planted: WikiQualifiedLearningPolicyRelease = {
      ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      policySourceDigest: "sha256:" + "b".repeat(64),
    };
    const diffs = diffLearningPolicy(MATTER_WIKI_QUALIFIED_LEARNING_POLICY, planted);
    expect(diffs.some((d) => d.field === "policySourceDigest")).toBe(true);
  });

  it("detects a planted corpus.corpusDigest drift", () => {
    const planted: WikiQualifiedLearningPolicyRelease = {
      ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      corpus: {
        ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY.corpus,
        corpusDigest: "sha256:" + "c".repeat(64),
      },
    };
    const diffs = diffLearningPolicy(MATTER_WIKI_QUALIFIED_LEARNING_POLICY, planted);
    expect(diffs.some((d) => d.field === "corpus.corpusDigest")).toBe(true);
  });

  it("detects a planted producerQualificationDigest drift", () => {
    const planted: WikiQualifiedLearningPolicyRelease = {
      ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      producerQualificationDigest: "sha256:" + "d".repeat(64),
    };
    const diffs = diffLearningPolicy(MATTER_WIKI_QUALIFIED_LEARNING_POLICY, planted);
    expect(diffs.some((d) => d.field === "producerQualificationDigest")).toBe(true);
  });

  it("reports multiple drifted fields when present", () => {
    const planted: WikiQualifiedLearningPolicyRelease = {
      ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      policySourceDigest: "sha256:" + "e".repeat(64),
      resultDigest: "sha256:" + "f".repeat(64),
    };
    const diffs = diffLearningPolicy(MATTER_WIKI_QUALIFIED_LEARNING_POLICY, planted);
    expect(diffs.length).toBeGreaterThanOrEqual(2);
  });
});

// ── diffProducerReleases ──────────────────────────────────────────────────

describe("diffProducerReleases", () => {
  it("returns no diffs when committed equals computed", () => {
    const diffs = diffProducerReleases(
      MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
      MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
    );
    expect(diffs).toHaveLength(0);
  });

  it("detects a planted producerDigest drift", () => {
    const planted = MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.map((r) =>
      r.identity.producerId === "en-metaphone-v1"
        ? {
            ...r,
            identity: { ...r.identity, producerDigest: "sha256:" + "a".repeat(64) },
          }
        : r,
    );
    const diffs = diffProducerReleases(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES, planted);
    expect(diffs.some((d) =>
      d.producerId === "en-metaphone-v1" && d.field === "producerDigest",
    )).toBe(true);
  });

  it("detects a planted corpusDigest drift", () => {
    const planted = MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.map((r) =>
      r.identity.producerId === "zh-final-pair-v1"
        ? {
            ...r,
            corpus: { ...r.corpus, corpusDigest: "sha256:" + "b".repeat(64) },
          }
        : r,
    );
    const diffs = diffProducerReleases(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES, planted);
    expect(diffs.some((d) =>
      d.producerId === "zh-final-pair-v1" && d.field === "corpusDigest",
    )).toBe(true);
  });
});

// ── applyLearningPolicyUpdate (pure) ─────────────────────────────────────

describe("applyLearningPolicyUpdate", () => {
  it("replaces all four digest fields in place", () => {
    const source = [
      "  policySourceDigest: \"sha256:aaaa" + "a".repeat(60) + "\",",
      "  corpus: Object.freeze({",
      "    corpusDigest: \"sha256:bbbb" + "b".repeat(60) + "\",",
      "  }),",
      "  resultDigest: \"sha256:cccc" + "c".repeat(60) + "\",",
      "  producerQualificationDigest: \"sha256:dddd" + "d".repeat(60) + "\",",
    ].join("\n");

    const newRelease: WikiQualifiedLearningPolicyRelease = {
      ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
      policySourceDigest: "sha256:" + "1".repeat(64),
      corpus: {
        ...MATTER_WIKI_QUALIFIED_LEARNING_POLICY.corpus,
        corpusDigest: "sha256:" + "2".repeat(64),
      },
      resultDigest: "sha256:" + "3".repeat(64),
      producerQualificationDigest: "sha256:" + "4".repeat(64),
    };

    const updated = applyLearningPolicyUpdate(source, newRelease);

    expect(updated).toContain(`policySourceDigest: "sha256:${"1".repeat(64)}"`);
    expect(updated).toContain(`corpusDigest: "sha256:${"2".repeat(64)}"`);
    expect(updated).toContain(`resultDigest: "sha256:${"3".repeat(64)}"`);
    expect(updated).toContain(`producerQualificationDigest: "sha256:${"4".repeat(64)}"`);
    // Old digests must be gone.
    expect(updated).not.toContain("sha256:aaaa");
    expect(updated).not.toContain("sha256:bbbb");
    expect(updated).not.toContain("sha256:cccc");
    expect(updated).not.toContain("sha256:dddd");
  });

  it("is idempotent: applying the committed release to the committed file is a no-op",
    async () => {
      const path = resolve(ROOT, "features/matter/wiki/wiki-qualified-learning-policy.ts");
      const source = await readFile(path, "utf8");
      const updated = applyLearningPolicyUpdate(source, MATTER_WIKI_QUALIFIED_LEARNING_POLICY);
      expect(updated).toBe(source);
    });
});

// ── applyProducerReleasesUpdate (pure) ───────────────────────────────────

describe("applyProducerReleasesUpdate", () => {
  it("replaces digests for each explicit release() call", () => {
    // Minimal source that mimics the file format for en-metaphone-v1.
    const source = [
      "export const MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES = Object.freeze([",
      "  release(",
      "    \"en-metaphone-v1\",",
      "    \"1.0.0\",",
      "    \"sha256:" + "a".repeat(64) + "\",",
      "    \"double-metaphone\",",
      "    \"2.0.1\",",
      "    \"sha256:" + "b".repeat(64) + "\",",
      "    \"en-metaphone-v1-corpus/1\",",
      "    \"sha256:" + "c".repeat(64) + "\",",
      "  ),",
      "]) satisfies readonly WikiQualifiedProducerRelease[];",
    ].join("\n");

    const updatedReleases = MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.map((r) =>
      r.identity.producerId === "en-metaphone-v1"
        ? {
            ...r,
            identity: {
              ...r.identity,
              producerDigest: "sha256:" + "1".repeat(64),
              resourceDigest: "sha256:" + "2".repeat(64),
            },
            corpus: { ...r.corpus, corpusDigest: "sha256:" + "3".repeat(64) },
          }
        : r,
    );

    const updated = applyProducerReleasesUpdate(source, updatedReleases);
    expect(updated).toContain(`"sha256:${"1".repeat(64)}"`);
    expect(updated).toContain(`"sha256:${"2".repeat(64)}"`);
    expect(updated).toContain(`"sha256:${"3".repeat(64)}"`);
    expect(updated).not.toContain(`"sha256:${"a".repeat(64)}"`);
    expect(updated).not.toContain(`"sha256:${"b".repeat(64)}"`);
    expect(updated).not.toContain(`"sha256:${"c".repeat(64)}"`);
  });

  it("does not touch producers that have no explicit release() call (runtime spread)", async () => {
    const path = resolve(ROOT, "features/matter/wiki/wiki-qualified-producer-releases.ts");
    const source = await readFile(path, "utf8");

    // runtime producers (locale-segment-v1 etc.) are spread in; they don't
    // have release() calls in this file so applyProducerReleasesUpdate must
    // leave their digest strings untouched.
    const before = source.match(/locale-segment-v1/g)?.length ?? 0;
    const updated = applyProducerReleasesUpdate(
      source,
      MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
    );
    const after = updated.match(/locale-segment-v1/g)?.length ?? 0;
    expect(after).toBe(before); // no change to lines mentioning locale-segment-v1
  });

  it("is idempotent: applying the committed releases to the committed file is a no-op",
    async () => {
      const path = resolve(ROOT, "features/matter/wiki/wiki-qualified-producer-releases.ts");
      const source = await readFile(path, "utf8");
      const updated = applyProducerReleasesUpdate(
        source,
        MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
      );
      expect(updated).toBe(source);
    });
});

// ── assertQualificationPassed: refuse path ────────────────────────────────

describe("assertQualificationPassed", () => {
  it("throws when a learning-policy scenario fails, naming the scenario", () => {
    expect(() =>
      assertQualificationPassed(
        { qualified: false, mismatchedScenarioIds: ["exact-three-turn-activation"] },
        [],
      ),
    ).toThrow(
      "update refused: learning-policy manifest scenarios failed: exact-three-turn-activation",
    );
  });

  it("throws when a producer decision fails, naming the producer", () => {
    expect(() =>
      assertQualificationPassed(
        { qualified: true, mismatchedScenarioIds: [] },
        [
          { producerId: "en-metaphone-v1", qualified: false },
          { producerId: "zh-final-pair-v1", qualified: true },
        ],
      ),
    ).toThrow(
      "update refused: producer qualification decisions failed: en-metaphone-v1",
    );
  });

  it("does not throw when all scenarios and decisions pass", () => {
    expect(() =>
      assertQualificationPassed(
        { qualified: true, mismatchedScenarioIds: [] },
        [
          { producerId: "en-metaphone-v1", qualified: true },
          { producerId: "zh-final-pair-v1", qualified: true },
        ],
      ),
    ).not.toThrow();
  });

  it("names all failing producers when multiple decisions fail", () => {
    expect(() =>
      assertQualificationPassed(
        { qualified: true, mismatchedScenarioIds: [] },
        [
          { producerId: "en-metaphone-v1", qualified: false },
          { producerId: "zh-exact-homophone-v1", qualified: false },
        ],
      ),
    ).toThrow("en-metaphone-v1, zh-exact-homophone-v1");
  });
});
