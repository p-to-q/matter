// CI guard: exits non-zero on any drift between committed constants and computed
// qualification digests.  Flags --check and --print-update extend that contract;
// the invariant that expectations are never silently overwritten is preserved in
// all three modes.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../..");

// Resolve vitest by walking node_modules from this file, which handles git
// worktrees where node_modules live in a parent directory.
const require = createRequire(import.meta.url);
const vitestPkg = require.resolve("vitest").replace(/[\\/]index\.cjs$/, "");
const vitestMjs = resolve(vitestPkg, "vitest.mjs");

const runnerConfig = resolve(
  dir,
  "qualification/qualify-wiki-runner.config.mts",
);

const mode = process.argv[2]; // '--check', '--print-update', or undefined

const baseEnv = {
  ...process.env,
  MATTER_RUN_WIKI_QUALIFICATION: "1",
};

function runVitest(extraArgs, extraEnv = {}) {
  execFileSync(process.execPath, [vitestMjs, ...extraArgs], {
    cwd: root,
    env: { ...baseEnv, ...extraEnv },
    stdio: "inherit",
  });
}

try {
  if (mode === "--check") {
    runVitest(
      [
        "run",
        "--config",
        runnerConfig,
        "--reporter=verbose",
        "--maxWorkers=1",
      ],
      { MATTER_WIKI_QUALIFY_MODE: "check" },
    );
  } else if (mode === "--print-update") {
    runVitest(
      [
        "run",
        "--config",
        runnerConfig,
        "--reporter=verbose",
        "--maxWorkers=1",
      ],
      { MATTER_WIKI_QUALIFY_MODE: "update" },
    );
  } else {
    // Default: existing CI behaviour — run committed receipts via vitest.
    runVitest([
      "run",
      "features/matter/wiki/wiki-qualified-producer-releases.test.ts",
      "features/matter/wiki/wiki-qualified-learning-policy.test.ts",
      "--reporter=verbose",
      "--maxWorkers=1",
    ]);
  }
} catch {
  process.exit(1);
}
