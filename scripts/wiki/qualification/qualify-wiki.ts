/**
 * Wiki qualification check and update tooling.
 *
 * `checkWikiQualification` computes the current release identities and diffs
 * them against the committed constants, returning a structured diff.
 *
 * `updateWikiQualification` re-runs the same computation, refuses to write
 * if any manifest scenario or producer decision fails (no laundering of
 * regressions), and then rewrites the digest constants in all three
 * constants files in place, preserving formatting:
 *   - `features/matter/wiki/wiki-qualified-learning-policy.ts`
 *   - `features/matter/wiki/wiki-qualified-producer-releases.ts`
 *   - `features/matter/wiki/wiki-runtime-producer-releases.ts`
 *
 * Both pure helper functions (`applyLearningPolicyUpdate`,
 * `applyProducerReleasesUpdate`) are exported for deterministic unit tests
 * that do not run the full qualification corpus.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  runWikiLearningPolicyQualification,
} from "./learning-policy-v4";
import {
  runLocalLanguageQualifications,
} from "./local-language-v1";
import { MATTER_WIKI_QUALIFIED_LEARNING_POLICY } from
  "../../../features/matter/wiki/wiki-qualified-learning-policy";
import type { WikiQualifiedLearningPolicyRelease } from
  "../../../features/matter/wiki/wiki-qualified-learning-policy";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from
  "../../../features/matter/wiki/wiki-qualified-producer-releases";
import type { WikiQualifiedProducerRelease } from
  "../../../features/matter/wiki/wiki-producer-qualification";

const ROOT = resolve(import.meta.dirname, "../../..");

const LEARNING_POLICY_FILE =
  "features/matter/wiki/wiki-qualified-learning-policy.ts";
const PRODUCER_RELEASES_FILE =
  "features/matter/wiki/wiki-qualified-producer-releases.ts";
const RUNTIME_PRODUCER_RELEASES_FILE =
  "features/matter/wiki/wiki-runtime-producer-releases.ts";

// ---------------------------------------------------------------------------
// Diff types
// ---------------------------------------------------------------------------

export type WikiLearnedPolicyDiff = Readonly<{
  field: string;
  committed: string;
  computed: string;
}>;

export type WikiProducerReleaseDiff = Readonly<{
  producerId: string;
  field: string;
  committed: string;
  computed: string;
}>;

export type WikiQualificationDiff = Readonly<{
  learningPolicy: readonly WikiLearnedPolicyDiff[];
  producerReleases: readonly WikiProducerReleaseDiff[];
}>;

// ---------------------------------------------------------------------------
// Diff helpers (pure)
// ---------------------------------------------------------------------------

/** Returns field-level diffs for the learning policy release. */
export function diffLearningPolicy(
  committed: WikiQualifiedLearningPolicyRelease,
  computed: WikiQualifiedLearningPolicyRelease,
): readonly WikiLearnedPolicyDiff[] {
  const fields: Array<{ field: string; committed: string; computed: string }> = [
    {
      field: "policySourceDigest",
      committed: committed.policySourceDigest,
      computed: computed.policySourceDigest,
    },
    {
      field: "corpus.corpusVersion",
      committed: committed.corpus.corpusVersion,
      computed: computed.corpus.corpusVersion,
    },
    {
      field: "corpus.corpusDigest",
      committed: committed.corpus.corpusDigest,
      computed: computed.corpus.corpusDigest,
    },
    {
      field: "corpus.scenarioCount",
      committed: String(committed.corpus.scenarioCount),
      computed: String(computed.corpus.scenarioCount),
    },
    {
      field: "resultDigest",
      committed: committed.resultDigest,
      computed: computed.resultDigest,
    },
    {
      field: "producerQualificationDigest",
      committed: committed.producerQualificationDigest,
      computed: computed.producerQualificationDigest,
    },
  ];
  return Object.freeze(fields.filter((entry) => entry.committed !== entry.computed));
}

/** Returns producer-level digest diffs. Includes all producers in the
 * committed allow-list so drift in the runtime producer file is visible. */
export function diffProducerReleases(
  committed: readonly WikiQualifiedProducerRelease[],
  computed: readonly WikiQualifiedProducerRelease[],
): readonly WikiProducerReleaseDiff[] {
  const computedById = new Map(computed.map((r) => [r.identity.producerId, r]));
  const diffs: WikiProducerReleaseDiff[] = [];

  for (const committedRelease of committed) {
    const pid = committedRelease.identity.producerId;
    const computedRelease = computedById.get(pid);
    if (computedRelease === undefined) {
      diffs.push({
        producerId: pid,
        field: "*",
        committed: "(present)",
        computed: "(absent)",
      });
      continue;
    }
    for (const field of [
      "producerDigest",
      "resourceDigest",
    ] as const) {
      if (committedRelease.identity[field] !== computedRelease.identity[field]) {
        diffs.push({
          producerId: pid,
          field,
          committed: committedRelease.identity[field],
          computed: computedRelease.identity[field],
        });
      }
    }
    if (committedRelease.corpus.corpusDigest !== computedRelease.corpus.corpusDigest) {
      diffs.push({
        producerId: pid,
        field: "corpusDigest",
        committed: committedRelease.corpus.corpusDigest,
        computed: computedRelease.corpus.corpusDigest,
      });
    }
  }

  // New producers not in the committed list yet
  const committedIds = new Set(committed.map((r) => r.identity.producerId));
  for (const computedRelease of computed) {
    if (!committedIds.has(computedRelease.identity.producerId)) {
      diffs.push({
        producerId: computedRelease.identity.producerId,
        field: "*",
        committed: "(absent)",
        computed: "(present)",
      });
    }
  }

  return Object.freeze(diffs);
}

// ---------------------------------------------------------------------------
// File-update helpers (pure string transformers)
// ---------------------------------------------------------------------------

/**
 * Replaces the four digest fields in the learning-policy constants file source
 * with values from `release`. All other content is preserved unchanged.
 *
 * Throws if any expected field pattern is not found in the source.
 */
export function applyLearningPolicyUpdate(
  source: string,
  release: WikiQualifiedLearningPolicyRelease,
): string {
  let result = source;
  result = replaceField(result, "policySourceDigest", release.policySourceDigest);
  result = replaceField(result, "corpusDigest", release.corpus.corpusDigest);
  result = replaceField(result, "resultDigest", release.resultDigest);
  result = replaceField(result, "producerQualificationDigest",
    release.producerQualificationDigest);
  return result;
}

/**
 * Replaces digest arguments within each explicit `release(...)` call in the
 * producer-releases file source. Producer entries that are not represented as
 * explicit `release()` calls (e.g. those contributed via the runtime spread)
 * are not touched. All other content is preserved unchanged.
 */
export function applyProducerReleasesUpdate(
  source: string,
  qualifiedProducers: readonly WikiQualifiedProducerRelease[],
): string {
  let result = source;
  for (const producer of qualifiedProducers) {
    result = replaceProducerDigests(
      result,
      producer.identity.producerId,
      producer.identity.producerDigest,
      producer.identity.resourceDigest,
      producer.corpus.corpusDigest,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// High-level check / update
// ---------------------------------------------------------------------------

/** Runs both qualifications and returns a structured diff vs committed constants. */
export async function checkWikiQualification(): Promise<Readonly<{
  diff: WikiQualificationDiff;
  hasDrift: boolean;
}>> {
  const [policyRun, producerRun] = await Promise.all([
    runWikiLearningPolicyQualification(),
    runLocalLanguageQualifications(true),
  ]);

  const policyDiffs = diffLearningPolicy(
    MATTER_WIKI_QUALIFIED_LEARNING_POLICY,
    policyRun.release,
  );
  const producerDiffs = diffProducerReleases(
    MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
    producerRun.qualification.qualifiedProducers,
  );

  const diff: WikiQualificationDiff = Object.freeze({
    learningPolicy: policyDiffs,
    producerReleases: producerDiffs,
  });
  return Object.freeze({ diff, hasDrift: policyDiffs.length > 0 || producerDiffs.length > 0 });
}

/**
 * Validates that neither the learning-policy run nor the producer run
 * contains failures. Throws with the failing scenario or producer IDs
 * so the caller can refuse to write without laundering a regression.
 *
 * Exported for direct testing with controlled inputs.
 */
export function assertQualificationPassed(
  policyRun: Readonly<{
    qualified: boolean;
    mismatchedScenarioIds: readonly string[];
  }>,
  producerDecisions: readonly Readonly<{
    producerId: string | null;
    qualified: boolean;
  }>[],
): void {
  if (!policyRun.qualified) {
    throw new Error(
      `update refused: learning-policy manifest scenarios failed: ${
        policyRun.mismatchedScenarioIds.join(", ")
      }`,
    );
  }
  const failedDecisions = producerDecisions.filter((d) => !d.qualified);
  if (failedDecisions.length > 0) {
    const ids = failedDecisions
      .map((d) => d.producerId ?? "(unknown)")
      .join(", ");
    throw new Error(
      `update refused: producer qualification decisions failed: ${ids}`,
    );
  }
}

/**
 * Re-runs both qualifications and rewrites the digest constants in all three
 * constants files. Throws with the failing scenario or producer IDs if any
 * check fails, refusing to launder a behaviour regression into new digests.
 *
 * Files written:
 *   - `wiki-qualified-learning-policy.ts`
 *   - `wiki-qualified-producer-releases.ts`
 *   - `wiki-runtime-producer-releases.ts`
 */
export async function updateWikiQualification(): Promise<void> {
  const [policyRun, producerRun] = await Promise.all([
    runWikiLearningPolicyQualification(),
    runLocalLanguageQualifications(true),
  ]);

  assertQualificationPassed(policyRun, producerRun.qualification.decisions);

  await Promise.all([
    (async () => {
      const path = resolve(ROOT, LEARNING_POLICY_FILE);
      const source = await readFile(path, "utf8");
      const updated = applyLearningPolicyUpdate(source, policyRun.release);
      await writeFile(path, updated, "utf8");
    })(),
    (async () => {
      const path = resolve(ROOT, PRODUCER_RELEASES_FILE);
      const source = await readFile(path, "utf8");
      const updated = applyProducerReleasesUpdate(
        source,
        producerRun.qualification.qualifiedProducers,
      );
      await writeFile(path, updated, "utf8");
    })(),
    (async () => {
      const path = resolve(ROOT, RUNTIME_PRODUCER_RELEASES_FILE);
      const source = await readFile(path, "utf8");
      const updated = applyProducerReleasesUpdate(
        source,
        producerRun.qualification.qualifiedProducers,
      );
      await writeFile(path, updated, "utf8");
    })(),
  ]);
}

// ---------------------------------------------------------------------------
// Internal string-replacement utilities
// ---------------------------------------------------------------------------

const SHA256_PATTERN = `sha256:[a-f0-9]{64}`;

/** Replaces the quoted sha256 value on a `field: "sha256:..."` line.
 * The field name must appear exactly once in the source. */
function replaceField(source: string, field: string, newDigest: string): string {
  const pattern = new RegExp(`(\\b${escapeRegex(field)}: )"${SHA256_PATTERN}"`);
  const next = source.replace(pattern, `$1"${newDigest}"`);
  if (next === source && !source.includes(`${field}: "${newDigest}"`)) {
    throw new Error(
      `qualify-wiki: could not find field "${field}" in source file`,
    );
  }
  return next;
}

/**
 * Replaces the producerDigest, resourceDigest, and corpusDigest arguments
 * within the `release("producerId", ...)` call for this producer. If the
 * pattern is absent (e.g. the producer lives in the runtime releases file and
 * is spread in rather than called directly), the source is returned unchanged.
 */
function replaceProducerDigests(
  source: string,
  producerId: string,
  producerDigest: string,
  resourceDigest: string,
  corpusDigest: string,
): string {
  // The release() call format (4-space-indented arguments):
  //   release(
  //     "producerId",
  //     "producerVersion",
  //     "sha256:...",       <- producerDigest (arg 3)
  //     "resourceId",
  //     "resourceVersion",
  //     "sha256:...",       <- resourceDigest (arg 6)
  //     "corpusVersion",
  //     "sha256:...",       <- corpusDigest   (arg 8)
  //   )
  const STR = `"[^"]+"`;
  const SHA = `"${SHA256_PATTERN}"`;
  const NL = `\\n    `;       // newline + 4-space indent for args
  const pattern = new RegExp(
    `(release\\(${NL}"${escapeRegex(producerId)}",${NL}${STR},${NL})${SHA}` +
    `(,${NL}${STR},${NL}${STR},${NL})${SHA}` +
    `(,${NL}${STR},${NL})${SHA}`,
  );
  return source.replace(
    pattern,
    `$1"${producerDigest}"$2"${resourceDigest}"$3"${corpusDigest}"`,
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
