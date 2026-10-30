import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Owner-approved main integration only. Changing the package version expires
// this exception; the normal build/check commands remain strict throughout.
// The initial gzip assets line is the sixth recorded debt: the unchanged
// bundle's Linux gzip output crosses the frozen 396 KiB cap by ~0.1% (first
// measured 406893/405504 by the hosted replay, 2026-10-30, after the
// deployment-version observer left the initial graph), while macOS and CI
// builds stay under. Restore blocking and repay it alongside the Wiki debts
// before the next prerelease.
export function acceptsIntegrationBudgetDebt(version, status, output) {
  if (version !== "0.2.0-preview.64" || status !== 1) return false;
  const lines = output.trim().split(/\r?\n/u);
  return lines.length > 0 && lines.every((line) =>
    /^runtime-artifact: Capability wiki-runtime uses [0-9]+ gzip bytes; budget is 27648\.$/u.test(line) ||
    /^runtime-artifact: Capability wiki-runtime entry features\/matter\/persistence\/(?:use-wiki-authority|wiki-runtime-bridge)\.ts -> \.\/wiki-runtime-core uses [0-9]+ cold gzip bytes; entry budget is 34816\.$/u.test(line) ||
    /^runtime-artifact: Capability wiki-settings uses [0-9]+ gzip bytes; budget is 10752\.$/u.test(line) ||
    /^runtime-artifact: Capability wiki-settings entry features\/matter\/components\/CanvasChrome\.tsx -> \.\/WikiSettingsSection uses [0-9]+ cold gzip bytes; entry budget is 49152\.$/u.test(line) ||
    /^runtime-artifact: initial gzip assets uses [0-9]+ bytes; budget is 405504\.$/u.test(line));
}

function main() {
  const build = spawnSync(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
    cwd: root, env: process.env, stdio: "inherit",
  });
  if (build.error || build.status !== 0) return build.status || 1;
  const budget = spawnSync(process.execPath, [resolve(root, "scripts/check-runtime-artifact.mjs")], {
    cwd: root, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(budget.stdout ?? "");
  process.stderr.write(budget.stderr ?? "");
  if (!budget.error && budget.status === 0) return 0;
  const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (!budget.error && acceptsIntegrationBudgetDebt(version, budget.status, `${budget.stdout ?? ""}${budget.stderr ?? ""}`)) {
    console.warn("Runtime budget: FAILED. Owner-approved integration debts for main integration only; restore strict deployment build before the next prerelease.");
    return 0;
  }
  return budget.status || 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
