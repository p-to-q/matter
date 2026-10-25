/**
 * Runs R1–R5 on an identified image-generation-free bundle of the actual
 * product owners. This is native storage/Archive evidence, not qualification
 * of a deployable Next recovery build or authorization to deploy one.
 * All databases belong to fresh nonpersistent contexts at a random loopback
 * origin. The runner performs no storage clear and admits no external request.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--build-only")) throw new Error("Only --build-only is accepted.");
const buildOnly = args[0] === "--build-only";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bundled = await build({
  input: path.join(here, "prove-recovery-indexeddb.entry.ts"), platform: "browser", write: false,
  output: { format: "iife", codeSplitting: false }, resolve: { alias: { "@": root } },
  onwarn(warning) { process.stderr.write(`[rolldown:${warning.code}] ${warning.message}\n`); },
});
const chunks = bundled.output.filter((output) => output.type === "chunk");
if (chunks.length !== 1) throw new Error("Recovery qualification requires one closed artifact.");
const chunk = chunks[0];
const code = chunk.code;
const modulePaths = Object.keys(chunk.modules).filter((id) => path.isAbsolute(id) && !id.includes(`${path.sep}node_modules${path.sep}`)).sort();
if (modulePaths.some((id) => !id.startsWith(`${root}${path.sep}`))) throw new Error("Recovery artifact escaped the repository.");
const sources = await Promise.all(modulePaths.map(async (id) => ({ path: path.relative(root, id).split(path.sep).join("/"), sha256: hash(await readFile(id)) })));
for (const name of ["package.json", "package-lock.json", "scripts/prove-recovery-indexeddb.mjs"]) sources.push({ path: name, sha256: hash(await readFile(path.join(root, name))) });
sources.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const artifactDirectory = await mkdtemp("/private/tmp/matter-recovery-artifact-");
const artifactPath = path.join(artifactDirectory, "recovery.js");
const manifestPath = path.join(artifactDirectory, "manifest.json");
const identity = {
  format: "matter-recovery-proof/1", sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceInventorySha256: hash(JSON.stringify(sources)), artifactSha256: hash(code), artifactBytes: Buffer.byteLength(code),
  artifactKind: "source-bundled-product-owners", imageGeneration: "absent", nodeVersion: process.version,
  artifactPath, manifestPath, sources,
};
const manifest = JSON.stringify(identity, null, 2) + "\n";
await writeFile(artifactPath, code, { flag: "wx", mode: 0o600 });
await writeFile(manifestPath, manifest, { flag: "wx", mode: 0o600 });
if (buildOnly) {
  console.log(JSON.stringify({ identity: { ...identity, manifestSha256: hash(manifest) }, buildOnly: true, browserProofRun: false }));
  process.exit(0);
}
const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/recovery.js") { response.setHeader("Content-Type", "text/javascript"); response.end(code); return; }
  if (request.url !== "/") { response.statusCode = 404; response.end(); return; }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end("<!doctype html><meta charset=utf-8><title>Matter synthetic recovery qualification</title><script src=/recovery.js></script>");
});
let browser;
let failed = false;
try {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Recovery qualification has no local origin.");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const runtime = { ...identity, manifestSha256: hash(manifest), browserVersion: browser.version(), scope: "real Chromium IndexedDB and product Archive owners; not deployed Next recovery build" };
  console.log(JSON.stringify({ identity: runtime }));
  const contexts = [];
  const blockedRequests = [];
  const openPage = async () => {
    const context = await browser.newContext(); contexts.push(context);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin && ["/", "/recovery.js"].includes(url.pathname)) await route.continue();
      else { blockedRequests.push({ protocol: url.protocol, resourceType: route.request().resourceType() }); await route.abort(); }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(origin);
    await page.waitForFunction(() => window.__matterRecoveryProof !== undefined);
    return page;
  };
  let imagePage;
  const successful = [];
  for (const name of ["R1", "R2", "R3", "R4"]) {
    const page = await openPage();
    try {
      const receipt = await page.evaluate((key) => window.__matterRecoveryProof[key](), name);
      successful.push(receipt);
      console.log(JSON.stringify({ recovery: { ...receipt, sourceInventorySha256: identity.sourceInventorySha256, artifactSha256: identity.artifactSha256 } }));
      if (name === "R4") imagePage = page;
    } catch (error) { failed = true; console.error(JSON.stringify({ recovery: { name, result: "fail", error: error instanceof Error ? error.message : "unknown" } })); }
  }
  if (imagePage !== undefined) {
    try {
      const exported = await imagePage.evaluate(() => window.__matterRecoveryProof.exportArchive());
      const importPage = await openPage();
      const imported = await importPage.evaluate((input) => window.__matterRecoveryProof.importArchive(input), {
        archive: exported.archive, expectedTreeDigest: exported.expectedTreeDigest, expectedImages: exported.expectedImages,
      });
      console.log(JSON.stringify({ recovery: { name: "R5", result: "pass", export: exported.receipt, import: imported,
        sourceInventorySha256: identity.sourceInventorySha256, artifactSha256: identity.artifactSha256 } }));
      successful.push({ name: "R5", result: "pass" });
    } catch (error) { failed = true; console.error(JSON.stringify({ recovery: { name: "R5", result: "fail", error: error instanceof Error ? error.message : "unknown" } })); }
  } else { failed = true; console.error(JSON.stringify({ recovery: { name: "R5", result: "not-run", reason: "R4 did not complete" } })); }
  const sameLegacyFixture = successful.filter(({ name }) => ["R1", "R2", "R3"].includes(name));
  const baseline = sameLegacyFixture[0]?.before.legacyDigest;
  const comparable = sameLegacyFixture.length === 3 && sameLegacyFixture.every((receipt) => receipt.before.legacyDigest === baseline && receipt.after.legacyDigest === baseline);
  const sourceStable = (await Promise.all(sources.map(async (source) => hash(await readFile(path.join(root, source.path))) === source.sha256))).every(Boolean);
  failed ||= !comparable || !sourceStable || blockedRequests.length !== 0 || successful.length !== 5;
  console.log(JSON.stringify({ summary: { result: failed ? "fail" : "pass", completed: successful.map(({ name }) => name),
    sameLegacyFixture: comparable, sourceStableDuringProof: sourceStable, externalRequests: blockedRequests.length,
    deployableNextRecoveryBuildQualified: false, releaseOrRedeployAuthorized: false } }));
  await Promise.all(contexts.map((context) => context.close()));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
if (failed) process.exitCode = 1;
