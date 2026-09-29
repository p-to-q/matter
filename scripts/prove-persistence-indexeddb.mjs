/**
 * A scripted receipt for the per-step undo journal against Chromium's real
 * IndexedDB: randomized round trip with exact compaction, two racing
 * connections, a put that throws mid-transaction, the v5 to v6 upgrade, an
 * older build's VersionError, and quota shedding at two quotas.
 *
 * The Vitest suites use an in-memory double for speed and fault injection;
 * this receipt proves the same repository on the engine it ships to. It is not
 * part of `npm test` because it needs a browser. `rolldown` bundles the entry:
 * it is already installed as the bundler Vite uses under Vitest, and a browser
 * bundle of TypeScript modules has no platform or local alternative. If it is
 * ever missing, this script fails loudly rather than skipping.
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = await build({
  input: path.join(here, "prove-persistence-indexeddb.entry.ts"),
  platform: "browser",
  write: false,
  output: { format: "iife" },
  resolve: { alias: { "@": path.join(here, "..") } },
});
const code = bundled.output[0].code;

const server = http.createServer((request, response) => {
  if (request.url === "/prove.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(code);
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end("<!doctype html><title>Matter persistence proof</title><script src=/prove.js></script>");
});

let browser;
let failed = false;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The proof has no local port.");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });

  const page = await browser.newPage();
  await page.goto(origin);
  const journal = await page.evaluate(() => window.__proveJournal());
  console.log(JSON.stringify({ journal }));
  failed ||= Object.values(journal).some((value) => value !== "pass");

  for (const [expectation, quotaSize] of [["shed", 1_500_000], ["full", 20_000]]) {
    const context = await browser.newContext();
    const quotaPage = await context.newPage();
    const cdp = await context.newCDPSession(quotaPage);
    await quotaPage.goto(origin);
    await cdp.send("Storage.overrideQuotaForOrigin", { origin, quotaSize });
    const quota = await quotaPage.evaluate((kind) => window.__proveQuota(kind), expectation);
    console.log(JSON.stringify({ quota: { expectation, quotaSize, ...quota } }));
    failed ||= quota.result !== "pass";
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
if (failed) {
  console.error("persistence proof failed");
  process.exitCode = 1;
}
