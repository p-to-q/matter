/**
 * Vitest entry point for `npm run qualify:wiki -- --check` and
 * `npm run qualify:wiki -- --print-update`.
 *
 * This file is NOT named *.test.ts so it is excluded from the normal
 * `vitest run` invocation (which uses `scripts/**\/*.test.ts`). It is
 * invoked explicitly by `scripts/wiki/qualify-wiki.mjs` with the
 * MATTER_WIKI_QUALIFY_MODE environment variable set to "check" or "update".
 *
 * Vitest is used as the TypeScript runner here so no new dependency is needed.
 */

import { test, expect } from "vitest";
import {
  checkWikiQualification,
  updateWikiQualification,
} from "./qualify-wiki";

const mode = process.env["MATTER_WIKI_QUALIFY_MODE"];

if (mode === "check") {
  test("wiki qualification check: committed constants match computed", async () => {
    const { diff, hasDrift } = await checkWikiQualification();

    if (hasDrift) {
      const lines: string[] = ["Drift detected — committed constants differ from computed:"];
      if (diff.learningPolicy.length > 0) {
        lines.push("  Learning policy:");
        for (const entry of diff.learningPolicy) {
          lines.push(`    ${entry.field}:`);
          lines.push(`      committed: ${entry.committed}`);
          lines.push(`      computed:  ${entry.computed}`);
        }
      }
      if (diff.producerReleases.length > 0) {
        lines.push("  Producer releases:");
        for (const entry of diff.producerReleases) {
          lines.push(`    ${entry.producerId} / ${entry.field}:`);
          lines.push(`      committed: ${entry.committed}`);
          lines.push(`      computed:  ${entry.computed}`);
        }
      }
      lines.push("");
      lines.push("Run `npm run qualify:wiki -- --print-update` to rewrite the constants.");
      console.error(lines.join("\n"));
    }

    expect(hasDrift, "committed qualification constants have drifted").toBe(false);
  }, 600_000);
} else if (mode === "update") {
  test("wiki qualification update: rewrite committed constants", async () => {
    // Throws with the failing scenario / producer IDs if any check fails.
    await updateWikiQualification();
    // If we reach here all checks passed and the files have been rewritten.
    expect(true).toBe(true);
  }, 600_000);
} else {
  test("wiki qualification runner: missing mode", () => {
    throw new Error(
      "MATTER_WIKI_QUALIFY_MODE must be 'check' or 'update'. " +
      "Use `npm run qualify:wiki -- --check` or `npm run qualify:wiki -- --print-update`.",
    );
  });
}
