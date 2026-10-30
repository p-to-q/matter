import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Replays the production deployment build with the official Vercel Next.js
// builder. Hosted deployment failures expose no readable build log without
// Vercel account access, so the same builder and the vercel.json buildCommand
// run here instead; nothing is uploaded and no credentials are used. The
// builder streams the buildCommand output, which includes the exact
// runtime-artifact diagnostics the integration wrapper accepts or rejects.
// Install @vercel/next and @vercel/build-utils first (the CI workflow does
// `npm i --no-save @vercel/next@latest @vercel/build-utils@latest`); latest
// is deliberate, to track what the hosted pipeline currently runs.
const vercelJson = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
for (const [key, value] of Object.entries(vercelJson.build?.env ?? {})) {
  process.env[key] = value;
}
process.env.VERCEL = "1";
process.env.VERCEL_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.VERCEL_DEPLOYMENT_ID ??= `replay${Date.now()}`;

const require = createRequire(import.meta.url);
const { build } = require("@vercel/next");

try {
  const result = await build({
    workPath: root,
    files: {},
    entrypoint: "package.json",
    config: { buildCommand: vercelJson.buildCommand },
    meta: { isDev: false, skipDownload: true },
  });
  console.log(
    `replay: builder completed with ${Object.keys(result?.output ?? {}).length} output entries`,
  );
} catch (error) {
  console.error("replay: builder failed");
  console.error(error?.stack ?? String(error));
  process.exit(1);
}
