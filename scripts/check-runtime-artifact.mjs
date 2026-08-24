import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";

export const RUNTIME_ARTIFACT_BUDGETS = Object.freeze({
  pageHtmlBytes: 48 * 1_024,
  initialRawBytes: 1_280 * 1_024,
  initialGzipBytes: 384 * 1_024,
  staticBytes: 26 * 1_024 * 1_024,
  publicBytes: 512 * 1_024,
  wasmBytes: 24 * 1_024 * 1_024,
  fontBytes: 128 * 1_024,
  visualMediaBytes: 400 * 1_024,
  metadataImageBytes: 512 * 1_024,
});

const API_ROUTES = Object.freeze([
  "/api/health",
  "/api/inquiry",
  "/api/label",
  "/api/repair",
  "/api/text-swap",
  "/api/transcribe",
  "/api/turn",
]);
const VISUAL_MEDIA = Object.freeze([
  "public/matter-ui/ptoq-logo.png",
  "public/matter-ui/shadows-loop.mp4",
  "public/matter-ui/shadows-loop.webm",
  "public/matter-ui/shadows-poster.jpg",
]);
const SEED_LOCALIZATION_CHUNK_SENTINEL = "matter-seeded-session-localization";
const SEED_MATERIAL_COPY_CHUNK_SENTINEL = "matter-seeded-material-copy";

export function inspectRuntimeArtifact(metrics) {
  const failures = [];
  if (!metrics.rootStatic) failures.push("The product root is not a permanent static prerender.");
  for (const route of metrics.prerenderedApiRoutes) {
    failures.push(`${route} was prerendered; request and capability routes must execute at request time.`);
  }
  for (const [name, value, ceiling] of [
    ["root HTML", metrics.pageHtmlBytes, RUNTIME_ARTIFACT_BUDGETS.pageHtmlBytes],
    ["initial raw assets", metrics.initialRawBytes, RUNTIME_ARTIFACT_BUDGETS.initialRawBytes],
    ["initial gzip assets", metrics.initialGzipBytes, RUNTIME_ARTIFACT_BUDGETS.initialGzipBytes],
    ["content-hashed Next static assets", metrics.staticBytes, RUNTIME_ARTIFACT_BUDGETS.staticBytes],
    ["stable-name public assets", metrics.publicBytes, RUNTIME_ARTIFACT_BUDGETS.publicBytes],
    ["local-transcription WASM", metrics.wasmBytes, RUNTIME_ARTIFACT_BUDGETS.wasmBytes],
    ["hashed fonts", metrics.fontBytes, RUNTIME_ARTIFACT_BUDGETS.fontBytes],
    ["visual media", metrics.visualMediaBytes, RUNTIME_ARTIFACT_BUDGETS.visualMediaBytes],
    ["metadata images", metrics.metadataImageBytes, RUNTIME_ARTIFACT_BUDGETS.metadataImageBytes],
  ]) {
    if (value > ceiling) failures.push(`${name} uses ${value} bytes; budget is ${ceiling}.`);
  }
  if (metrics.initialAssets.length === 0) failures.push("The root HTML publishes no initial asset graph.");
  for (const asset of metrics.initialAssets) {
    if (/matter-local-transcription|\.wasm(?:$|\?)/u.test(asset)) {
      failures.push(`The local speech fallback entered the initial graph through ${asset}.`);
    }
  }
  if (metrics.seedLocalizationAssets.length !== 1) {
    failures.push(
      `Expected one lazy seed-localization asset; found ${metrics.seedLocalizationAssets.length}.`,
    );
  }
  for (const asset of metrics.seedLocalizationAssets) {
    if (metrics.initialAssets.includes(asset)) {
      failures.push(`Seed localization entered the initial graph through ${asset}.`);
    }
    if (!isHashedJavaScriptAsset(asset)) {
      failures.push(`Seed localization asset ${asset} is not content-hashed for immutable caching.`);
    }
  }
  if (metrics.seedMaterialCopyAssets.length !== 1) {
    failures.push(
      `Expected one lazy seed-material-copy asset; found ${metrics.seedMaterialCopyAssets.length}.`,
    );
  }
  for (const asset of metrics.seedMaterialCopyAssets) {
    if (metrics.initialAssets.includes(asset)) {
      failures.push(`Seed material copy entered the initial graph through ${asset}.`);
    }
    if (!isHashedJavaScriptAsset(asset)) {
      failures.push(`Seed material copy asset ${asset} is not content-hashed for immutable caching.`);
    }
  }
  if (
    metrics.seedLocalizationAssets.length === 1 &&
    metrics.seedMaterialCopyAssets.length === 1 &&
    metrics.seedLocalizationAssets[0] !== metrics.seedMaterialCopyAssets[0]
  ) {
    failures.push("Seed material copy and its relocalizer must share one lazy browser asset.");
  }
  if (metrics.wasmAssets.length !== 1) {
    failures.push(`Expected one lazy WASM runtime asset; found ${metrics.wasmAssets.length}.`);
  }
  for (const asset of metrics.wasmAssets) {
    if (!/\.[a-f0-9]{8,}\.wasm$/u.test(asset)) {
      failures.push(`WASM asset ${asset} is not content-hashed for immutable caching.`);
    }
  }
  for (const asset of metrics.fontAssets) {
    if (!/(?:^|\/)[a-f0-9]{8,}-s(?:\.p)?\.woff2$/u.test(asset)) {
      failures.push(`Font asset ${asset} is not emitted through next/font with a content hash.`);
    }
  }
  for (const file of metrics.forbiddenTraceFiles) {
    failures.push(`Runtime trace includes repository-only file ${file}.`);
  }
  if (metrics.productionSourceMaps > 0) {
    failures.push(`Production artifact contains ${metrics.productionSourceMaps} browser/server source map(s).`);
  }
  return Object.freeze({ failures: Object.freeze(failures), metrics: Object.freeze(metrics) });
}

export async function readRuntimeArtifact(root = process.cwd()) {
  const nextRoot = join(root, ".next");
  const htmlPath = join(nextRoot, "server/app/index.html");
  const prerenderPath = join(nextRoot, "prerender-manifest.json");
  const html = await readFile(htmlPath, "utf8");
  const prerender = JSON.parse(await readFile(prerenderPath, "utf8"));
  const initialAssets = Object.freeze([
    ...new Set(
      [...html.matchAll(/\/_next\/static\/[^"\\<\s]+/gu)]
        .map((match) => match[0].slice("/_next/static/".length)),
    ),
  ]);
  const initialPaths = initialAssets.map((asset) => join(nextRoot, "static", asset));
  const staticFiles = await filesBelow(join(nextRoot, "static"));
  const serverFiles = await filesBelow(join(nextRoot, "server"));
  const nextRootEntries = await readdir(nextRoot, { withFileTypes: true });
  const traceManifests = [
    ...nextRootEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".nft.json"))
      .map((entry) => join(nextRoot, entry.name)),
    ...serverFiles.filter((file) => file.endsWith(".nft.json")),
  ];
  const publicFiles = await filesBelow(join(root, "public"));
  const traced = [];
  for (const manifest of traceManifests) {
    const parsed = JSON.parse(await readFile(manifest, "utf8"));
    if (Array.isArray(parsed.files)) traced.push(...parsed.files.map(String));
  }
  const normalizedTrace = traced.map((file) => file.split(sep).join("/"));
  const wasmAssets = staticFiles
    .filter((file) => extname(file) === ".wasm")
    .map((file) => relative(join(nextRoot, "static"), file).split(sep).join("/"));
  const fontAssets = staticFiles
    .filter((file) => extname(file) === ".woff2")
    .map((file) => relative(join(nextRoot, "static"), file).split(sep).join("/"));
  const seedLocalizationAssets = (
    await filesContaining(
      staticFiles.filter((file) => extname(file) === ".js"),
      SEED_LOCALIZATION_CHUNK_SENTINEL,
    )
  ).map((file) => relative(join(nextRoot, "static"), file).split(sep).join("/"));
  const seedMaterialCopyAssets = (
    await filesContaining(
      staticFiles.filter((file) => extname(file) === ".js"),
      SEED_MATERIAL_COPY_CHUNK_SENTINEL,
    )
  ).map((file) => relative(join(nextRoot, "static"), file).split(sep).join("/"));
  const prerendered = Object.keys(prerender.routes ?? {});
  const metadataImageAssets = serverFiles.filter((file) => (
    /\/app\/(?:icon\d+|apple-icon)\.(?:ico|jpe?g|png|svg)\.body$/u.test(file)
  )).sort();

  return Object.freeze({
    pageHtmlBytes: Buffer.byteLength(html),
    initialRawBytes: await totalBytes(initialPaths),
    initialGzipBytes: await totalGzipBytes(initialPaths),
    staticBytes: await totalBytes(staticFiles),
    publicBytes: await totalBytes(publicFiles),
    wasmBytes: await totalBytes(staticFiles.filter((file) => extname(file) === ".wasm")),
    fontBytes: await totalBytes(staticFiles.filter((file) => extname(file) === ".woff2")),
    visualMediaBytes: await totalBytes(VISUAL_MEDIA.map((file) => join(root, file))),
    metadataImageBytes: await totalBytes(metadataImageAssets),
    initialAssets,
    wasmAssets: Object.freeze(wasmAssets),
    fontAssets: Object.freeze(fontAssets),
    seedLocalizationAssets: Object.freeze(seedLocalizationAssets),
    seedMaterialCopyAssets: Object.freeze(seedMaterialCopyAssets),
    metadataImageAssets: Object.freeze(
      metadataImageAssets.map((file) => relative(nextRoot, file).split(sep).join("/")),
    ),
    rootStatic: prerender.routes?.["/"]?.compute === "static" &&
      prerender.routes?.["/"]?.initialRevalidateSeconds === false,
    prerenderedApiRoutes: Object.freeze(API_ROUTES.filter((route) => prerendered.includes(route))),
    forbiddenTraceFiles: Object.freeze(normalizedTrace.filter(isRepositoryOnlyTrace)),
    productionSourceMaps: staticFiles.filter((file) => file.endsWith(".map")).length +
      serverFiles.filter((file) => file.endsWith(".map")).length,
  });
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function totalBytes(files) {
  let total = 0;
  for (const file of files) total += (await stat(file)).size;
  return total;
}

async function filesContaining(files, needle) {
  const matching = [];
  for (const file of files) {
    if ((await readFile(file, "utf8")).includes(needle)) matching.push(file);
  }
  return matching;
}

async function totalGzipBytes(files) {
  let total = 0;
  for (const file of files) total += await gzipBytes(file);
  return total;
}

function gzipBytes(file) {
  return new Promise((resolveBytes, reject) => {
    let total = 0;
    const input = createReadStream(file);
    const gzip = createGzip({ level: 9 });
    input.on("error", reject);
    gzip.on("data", (chunk) => {
      total += chunk.length;
    });
    gzip.on("error", reject);
    gzip.on("end", () => resolveBytes(total));
    input.pipe(gzip);
  });
}

function isRepositoryOnlyTrace(file) {
  return /(^|\/)(?:docs|e2e|archive|tmp)\//u.test(file) ||
    /(^|\/)\.env(?:\.|$)/u.test(file) ||
    /\.test\.[cm]?[jt]sx?$/u.test(file);
}

function isHashedJavaScriptAsset(file) {
  return /(?:^|\/)[^/]*[.-][a-f0-9]{8,}\.js$/u.test(file);
}

function formatKiB(value) {
  return `${(value / 1_024).toFixed(1)} KiB`;
}

async function main() {
  const metrics = await readRuntimeArtifact();
  const result = inspectRuntimeArtifact(metrics);
  if (result.failures.length > 0) {
    console.error(result.failures.map((failure) => `runtime-artifact: ${failure}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(
    "runtime-artifact: static root; " +
    `initial ${formatKiB(metrics.initialRawBytes)} raw / ${formatKiB(metrics.initialGzipBytes)} gzip; ` +
    `lazy WASM ${formatKiB(metrics.wasmBytes)}; public ${formatKiB(metrics.publicBytes)}; ` +
    `visual media ${formatKiB(metrics.visualMediaBytes)}; ` +
    `metadata images ${formatKiB(metrics.metadataImageBytes)}; ` +
    "0 repository-only trace files",
  );
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`runtime-artifact: ${error instanceof Error ? error.message : "inspection failed"}`);
    process.exitCode = 1;
  });
}
