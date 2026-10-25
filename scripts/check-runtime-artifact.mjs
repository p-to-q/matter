import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";

// The pinned Next adapter uses source-owned route-cache keys for prerenders.
// Use its key function so the check reads the same artifact as the adapter.
const { getRouteCacheKey } = createRequire(import.meta.url)("next/dist/server/lib/route-cache-key.js");
const ts = createRequire(import.meta.url)("typescript");

const CAPABILITY_MANIFEST_PATH = "features/matter/runtime/capability-manifest.ts";
const CAPABILITY_TIERS = new Set(["core", "gesture", "on-use", "background", "asset"]);
const MAX_ENTRY_MANIFEST_BYTES = 2 * 1_024 * 1_024;
// This research renderer is not a released capability. Its one guarded caller
// remains covered by the separate viewport research qualification.
const FIXTURE_IMPORT_EXCLUSIONS = Object.freeze([
  Object.freeze({
    target: "features/matter/components/viewport-research-runtime.ts",
    caller: "features/matter/components/RootedMaterial.tsx",
    reason: "performance-viewport research only",
  }),
]);

export const RUNTIME_ARTIFACT_BUDGETS = Object.freeze({
  pageHtmlBytes: 48 * 1_024,
  initialRawBytes: 1_280 * 1_024,
  // Stated on the enforcing CI basis, which measures about 2,820 bytes
  // larger than macOS for the same commit, plus one release of headroom.
  initialGzipBytes: 396 * 1_024,
  staticBytes: 26 * 1_024 * 1_024,
  publicBytes: 512 * 1_024,
  wasmBytes: 24 * 1_024 * 1_024,
  fontBytes: 128 * 1_024,
  visualMediaBytes: 400 * 1_024,
  metadataImageBytes: 512 * 1_024,
});

const API_ROUTES = Object.freeze([
  "/api/health",
  // Costs real money per call, so a prerendered copy would be a surface served
  // without the gate. Omitting a route here passes silently.
  "/api/image",
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
const OFFLINE_WIKI_QUALIFICATION_SENTINELS = Object.freeze([
  "double-metaphone",
  "pinyin-pro",
  // Package names may disappear during bundling. These stable data/code
  // literals catch the corresponding offline engines after minification.
  "ORCHES|ARCHIT|ORCHID",
  "bǎng páng pāng",
]);

export function inspectRuntimeArtifact(metrics) {
  const failures = [];
  for (const failure of metrics.capabilitySourceFailures ?? ["Capability source coverage is missing."]) {
    failures.push(failure);
  }
  for (const failure of metrics.capabilityEntryFailures ?? ["Capability entry coverage is missing."]) {
    failures.push(failure);
  }
  for (const capability of metrics.capabilities ?? []) {
    if (capability.assets.length !== 1) {
      failures.push(`Capability ${capability.id} has ${capability.assets.length} emitted assets; expected exactly one.`);
    }
    for (const asset of capability.assets) {
      if (!isHashedJavaScriptAsset(asset.path)) {
        failures.push(`Capability ${capability.id} asset ${asset.path} is not content-hashed.`);
      }
      const initial = metrics.initialAssets.includes(asset.path);
      if (initial !== (capability.tier === "core")) {
        failures.push(`Capability ${capability.id} has the wrong initial tier through ${asset.path}.`);
      }
      if (asset.gzipBytes > capability.budgetGzip) {
        failures.push(`Capability ${capability.id} uses ${asset.gzipBytes} gzip bytes; budget is ${capability.budgetGzip}.`);
      }
    }
    if (!Number.isSafeInteger(capability.entryBudgetGzip) || capability.entryBudgetGzip < capability.budgetGzip) {
      failures.push(`Capability ${capability.id} has an invalid static entry budget.`);
    }
    const entries = capability.entries ?? [];
    if (entries.length === 0 && capability.tier !== "core" && capability.tier !== "asset") {
      failures.push(`Capability ${capability.id} has no emitted static entry group.`);
    }
    for (const entry of entries) {
      if (!capability.assets.every((asset) => entry.assets.some((carried) => carried.path === asset.path))) {
        failures.push(`Capability ${capability.id} entry ${entry.key} omits its owned chunk.`);
      }
      if (entry.coldGzipBytes > capability.entryBudgetGzip) {
        failures.push(`Capability ${capability.id} entry ${entry.key} uses ${entry.coldGzipBytes} cold gzip bytes; entry budget is ${capability.entryBudgetGzip}.`);
      }
    }
  }
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
  for (const file of metrics.browserFallbackNodeTraceFiles) {
    failures.push(`Server trace includes browser-fallback-only package ${file}.`);
  }
  for (const asset of metrics.offlineWikiQualificationAssets) {
    failures.push(`Browser artifact includes offline Wiki qualification metadata ${asset}.`);
  }
  if (metrics.productionSourceMaps > 0) {
    failures.push(`Production artifact contains ${metrics.productionSourceMaps} browser/server source map(s).`);
  }
  return Object.freeze({ failures: Object.freeze(failures), metrics: Object.freeze(metrics) });
}

export async function readRuntimeArtifact(root = process.cwd()) {
  const nextRoot = join(root, ".next");
  const prerenderPath = join(nextRoot, "prerender-manifest.json");
  const html = await readRootHtml(nextRoot);
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
  const browserJavaScript = staticFiles.filter((file) => extname(file) === ".js");
  const sourceCoverage = await readCapabilitySourceCoverage(root);
  const entryCoverage = await readCapabilityEntryCoverage(nextRoot, sourceCoverage.inventory);
  const capabilities = [];
  const contents = await Promise.all(browserJavaScript.map(async (file) => ({
    file,
    text: await readFile(file, "utf8"),
  })));
  const artifactAssets = contents.map((asset) => Object.freeze({
    path: relative(join(nextRoot, "static"), asset.file).split(sep).join("/"),
    sha256: createHash("sha256").update(asset.text).digest("hex"),
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const availableEntryAssets = new Set(staticFiles.map((file) => relative(nextRoot, file).split(sep).join("/")));
  const measuredEntryAssets = new Map();
  const measureEntryAsset = (file) => {
    if (!measuredEntryAssets.has(file)) {
      measuredEntryAssets.set(file, (async () => {
        const bytes = await readFile(join(nextRoot, file));
        return Object.freeze({
          path: file.slice("static/".length),
          rawBytes: bytes.byteLength,
          gzipBytes: await gzipBytes(join(nextRoot, file)),
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      })());
    }
    return measuredEntryAssets.get(file);
  };
  const entryFailures = [...entryCoverage.failures];
  for (const [key, record] of entryCoverage.entries) {
    for (const file of record.files) {
      if (!availableEntryAssets.has(file)) entryFailures.push(`Capability entry ${key} references missing asset ${file}.`);
    }
  }
  for (const capability of sourceCoverage.manifest) {
    const assets = [];
    for (const asset of contents.filter((asset) => asset.text.includes(capability.sentinel))) {
      assets.push(Object.freeze({
        path: relative(join(nextRoot, "static"), asset.file).split(sep).join("/"),
        rawBytes: Buffer.byteLength(asset.text),
        gzipBytes: await gzipBytes(asset.file),
        sha256: createHash("sha256").update(asset.text).digest("hex"),
      }));
    }
    const targets = sourceCoverage.owners.find((owner) => owner.id === capability.id)?.paths ?? [];
    const edges = new Map((sourceCoverage.inventory?.imports ?? [])
      .filter((edge) => targets.includes(edge.target)).map((edge) => [edge.entry, edge]));
    const entries = [];
    for (const [key, edge] of edges) {
      const record = entryCoverage.entries.get(key);
      if (record === undefined) continue;
      const carried = [];
      for (const file of record.files) {
        if (!availableEntryAssets.has(file)) {
          continue;
        }
        carried.push(await measureEntryAsset(file));
      }
      const incremental = carried.filter((asset) => !initialAssets.includes(asset.path));
      entries.push(Object.freeze({
        key, caller: edge.caller, target: edge.target,
        assets: Object.freeze(carried),
        coldRawBytes: carried.reduce((total, asset) => total + asset.rawBytes, 0),
        coldGzipBytes: carried.reduce((total, asset) => total + asset.gzipBytes, 0),
        incrementalRawBytes: incremental.reduce((total, asset) => total + asset.rawBytes, 0),
        incrementalGzipBytes: incremental.reduce((total, asset) => total + asset.gzipBytes, 0),
      }));
    }
    capabilities.push(Object.freeze({ ...capability, assets: Object.freeze(assets), entries: Object.freeze(entries) }));
  }
  const offlineWikiQualificationAssets = (
    await filesContainingAny(browserJavaScript, OFFLINE_WIKI_QUALIFICATION_SENTINELS)
  ).map((file) => relative(join(nextRoot, "static"), file).split(sep).join("/"));
  const prerendered = Object.keys(prerender.routes ?? {});
  const metadataImageAssets = serverFiles.filter((file) => (
    /\/(?:app|\$)\/(?:icon\d+|apple-icon)\.(?:ico|jpe?g|png|svg)\.body$/u.test(file)
  )).sort();

  return Object.freeze({
    artifactIdentity: Object.freeze({
      buildId: await readOptionalBuildId(nextRoot),
      browserAssetsDigest: createHash("sha256").update(JSON.stringify(artifactAssets)).digest("hex"),
      capabilityEntryManifestSha256: entryCoverage.sha256,
    }),
    capabilities: Object.freeze(capabilities),
    capabilitySourceFailures: sourceCoverage.failures,
    capabilityEntryFailures: Object.freeze([...new Set(entryFailures)]),
    capabilitySource: sourceCoverage.inventory,
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
    offlineWikiQualificationAssets: Object.freeze(offlineWikiQualificationAssets),
    metadataImageAssets: Object.freeze(
      metadataImageAssets.map((file) => relative(nextRoot, file).split(sep).join("/")),
    ),
    rootStatic: prerender.routes?.["/"]?.compute === "static" &&
      prerender.routes?.["/"]?.initialRevalidateSeconds === false,
    prerenderedApiRoutes: Object.freeze(API_ROUTES.filter((route) => prerendered.includes(route))),
    forbiddenTraceFiles: Object.freeze(normalizedTrace.filter(isRepositoryOnlyTrace)),
    browserFallbackNodeTraceFiles: Object.freeze(
      normalizedTrace.filter((file) =>
        /(?:^|\/)node_modules\/(?:adm-zip|onnxruntime-node)(?:\/|$)/u.test(file)
      ),
    ),
    productionSourceMaps: staticFiles.filter((file) => file.endsWith(".map")).length +
      serverFiles.filter((file) => file.endsWith(".map")).length,
  });
}

/** Next's entry groups describe static JS/CSS dependencies, not later imports or model downloads. */
export function parseCapabilityEntryManifest(text) {
  const failures = [];
  const entries = new Map();
  if (Buffer.byteLength(text) > MAX_ENTRY_MANIFEST_BYTES) {
    return Object.freeze({ entries, failures: Object.freeze(["Capability entry manifest exceeds its byte bound."]) });
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return Object.freeze({ entries, failures: Object.freeze(["Capability entry manifest is not strict JSON."]) });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 4_096) {
    return Object.freeze({ entries, failures: Object.freeze(["Capability entry manifest must be a bounded object."]) });
  }
  // JSON.parse discards duplicate keys; the existing compiler parser preserves
  // their syntax so a shadowed caller or files field cannot hide an entry.
  const source = ts.parseJsonText("react-loadable-manifest.json", text);
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set();
      for (const property of node.properties) {
        const name = property.name?.text;
        if (names.has(name)) failures.push("Capability entry manifest contains duplicate object keys.");
        names.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const [key, record] of Object.entries(value)) {
    if (!/^(?:app|features\/matter)\/[A-Za-z0-9_./-]+\.[cm]?[jt]sx? -> [^\s\\]{1,256}$/u.test(key) ||
        key.split(" -> ")[0].split("/").some((part) => part === "." || part === ".." || part === "")) {
      failures.push("Capability entry manifest has an invalid caller/import key.");
      continue;
    }
    if (record === null || typeof record !== "object" || Array.isArray(record) ||
        Object.keys(record).sort().join(",") !== "files,id" ||
        !((Number.isSafeInteger(record.id) && record.id >= 0) ||
          (typeof record.id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(record.id))) ||
        !Array.isArray(record.files) || record.files.length === 0 || record.files.length > 256) {
      failures.push(`Capability entry ${key} has invalid closed fields.`);
      continue;
    }
    if (record.files.some((file) => !isSafeEntryAsset(file))) {
      failures.push(`Capability entry ${key} has an unsafe, unhashed or unsupported asset path.`);
      continue;
    }
    entries.set(key, Object.freeze({ id: record.id, files: Object.freeze([...new Set(record.files)].sort()) }));
  }
  return Object.freeze({ entries, failures: Object.freeze(failures) });
}

async function readCapabilityEntryCoverage(nextRoot, inventory) {
  const file = join(nextRoot, "react-loadable-manifest.json");
  let parsed;
  let sha256 = null;
  try {
    const metadata = await stat(file);
    parsed = metadata.size > MAX_ENTRY_MANIFEST_BYTES
      ? { entries: new Map(), failures: ["Capability entry manifest exceeds its byte bound."] }
      : null;
    if (parsed === null) {
      const text = await readFile(file, "utf8");
      sha256 = createHash("sha256").update(text).digest("hex");
      parsed = parseCapabilityEntryManifest(text);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return Object.freeze({ entries: new Map(), failures: Object.freeze(["Capability entry manifest is missing."]), sha256 });
  }
  const failures = [...parsed.failures];
  const expected = new Set([...(inventory?.imports ?? []), ...(inventory?.exclusions ?? [])].map((edge) => edge.entry));
  for (const key of parsed.entries.keys()) {
    if (!expected.has(key)) failures.push(`Capability entry ${key} has no matching source caller/import.`);
  }
  for (const edge of inventory?.imports ?? []) {
    if (!parsed.entries.has(edge.entry)) failures.push(`Capability import ${edge.entry} has no emitted entry group.`);
  }
  return Object.freeze({ entries: parsed.entries, failures: Object.freeze(failures), sha256 });
}

function isSafeEntryAsset(file) {
  if (typeof file !== "string" || file.length > 512 || !/^[A-Za-z0-9_./-]+$/u.test(file) ||
      file.split("/").some((part) => part === "." || part === ".." || part === "")) return false;
  return (file.startsWith("static/chunks/") && isHashedJavaScriptAsset(file)) ||
    /^static\/css\/(?:[^/]*[.-])?[a-f0-9]{8,}\.css$/u.test(file);
}

/** Reads only literal build facts; a manifest is never executed as tooling. */
export function parseCapabilityManifest(text, path = CAPABILITY_MANIFEST_PATH) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const failures = [];
  const declarations = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "MATTER_CAPABILITIES") {
        declarations.push(declaration);
      }
    }
  }
  const declaration = declarations[0];
  let array = declaration?.initializer;
  while (array !== undefined && (ts.isAsExpression(array) || ts.isSatisfiesExpression(array))) {
    array = array.expression;
  }
  const statement = source.statements[0];
  if (source.parseDiagnostics.length > 0 || source.statements.length !== 1 ||
      statement === undefined || !ts.isVariableStatement(statement) ||
      statement.declarationList.declarations.length !== 1 ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
      !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
      declarations.length !== 1 ||
      array === undefined || !ts.isArrayLiteralExpression(array)) {
    return Object.freeze({ manifest: Object.freeze([]), failures: Object.freeze(["Capability manifest must declare one literal MATTER_CAPABILITIES array."]) });
  }
  const manifest = [];
  const ids = new Set();
  const sentinels = new Set();
  for (const element of array.elements) {
    const fields = new Map();
    if (ts.isObjectLiteralExpression(element)) {
      for (const property of element.properties) {
        if (!ts.isPropertyAssignment(property) ||
            !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) continue;
        const key = property.name.text;
        if (fields.has(key)) fields.set(key, null);
        else fields.set(key, property.initializer);
      }
    }
    const literal = (key) => {
      const value = fields.get(key);
      return value !== undefined && value !== null && ts.isStringLiteral(value) ? value.text : null;
    };
    const id = literal("id");
    const sentinel = literal("sentinel");
    const tier = literal("tier");
    const budget = fields.get("budgetGzip");
    const budgetGzip = budget !== undefined && budget !== null && ts.isNumericLiteral(budget)
      ? Number(budget.text) : null;
    const entryBudget = fields.get("entryBudgetGzip");
    const entryBudgetGzip = entryBudget !== undefined && entryBudget !== null && ts.isNumericLiteral(entryBudget)
      ? Number(entryBudget.text) : null;
    if (!ts.isObjectLiteralExpression(element) || element.properties.length !== 5 ||
        [...fields.keys()].sort().join(",") !== "budgetGzip,entryBudgetGzip,id,sentinel,tier" ||
        id === null || !/^[a-z][a-z0-9-]{0,63}$/u.test(id) || sentinel === null ||
        !/^[\x20-\x7e]{4,160}$/u.test(sentinel) || !CAPABILITY_TIERS.has(tier) ||
        !Number.isSafeInteger(budgetGzip) || budgetGzip < 1 ||
        !Number.isSafeInteger(entryBudgetGzip) || entryBudgetGzip < budgetGzip) {
      failures.push(`Capability manifest row ${id ?? manifest.length} has invalid closed fields, tier or budget.`);
    }
    if (id !== null && ids.has(id)) failures.push(`Capability id ${id} is duplicated.`);
    if (sentinel !== null && sentinels.has(sentinel)) failures.push(`Capability sentinel ${sentinel} is duplicated.`);
    if (id !== null) ids.add(id);
    if (sentinel !== null) sentinels.add(sentinel);
    if (id !== null && sentinel !== null && tier !== null && budgetGzip !== null && entryBudgetGzip !== null) {
      manifest.push(Object.freeze({ id, sentinel, tier, budgetGzip, entryBudgetGzip }));
    }
  }
  if (array.elements.length === 0) failures.push("Capability manifest is empty.");
  return Object.freeze({ manifest: Object.freeze(manifest), failures: Object.freeze(failures) });
}

/** ImportExpression nodes are runtime edges; ImportTypeNode queries are not. */
export function inspectCapabilitySource(manifest, modules, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const normalized = new Map(modules.map((module) => [
    resolve(root, module.path), module.text,
  ]));
  const failures = [];
  const imports = [];
  const markerOwners = new Map(manifest.map((capability) => [capability.id, new Set()]));
  const excluded = [];
  const compilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...options.compilerOptions };
  const host = {
    fileExists: (path) => normalized.has(resolve(path)),
    readFile: (path) => normalized.get(resolve(path)),
  };
  const pathInRoot = (path) => relative(root, path).split(sep).join("/");
  for (const [path, text] of normalized) {
    if (pathInRoot(path) === CAPABILITY_MANIFEST_PATH) continue;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length > 0) failures.push(`Capability source syntax is invalid in ${pathInRoot(path)}.`);
    const literals = new Set();
    const walk = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
          const resolved = ts.resolveModuleName(node.moduleSpecifier.text, path, compilerOptions, host).resolvedModule;
          if (resolved !== undefined && pathInRoot(resolved.resolvedFileName) === CAPABILITY_MANIFEST_PATH) {
            failures.push(`Build-only capability manifest entered product source through ${pathInRoot(path)}.`);
          }
        }
        return;
      }
      if (ts.isTypeNode(node)) return;
      if (ts.isStringLiteralLike(node)) literals.add(node.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (node.arguments.length !== 1 || argument === undefined || !ts.isStringLiteral(argument)) {
          failures.push(`Nonliteral dynamic import in ${pathInRoot(path)}.`);
        } else {
          const resolved = ts.resolveModuleName(argument.text, path, compilerOptions, host).resolvedModule;
          if (resolved === undefined) failures.push(`Unresolved dynamic import ${argument.text} in ${pathInRoot(path)}.`);
          else {
            const caller = pathInRoot(path);
            const edge = Object.freeze({ caller, target: pathInRoot(resolved.resolvedFileName), entry: `${caller} -> ${argument.text}` });
            const exclusion = FIXTURE_IMPORT_EXCLUSIONS.find((entry) =>
              entry.target === edge.target && entry.caller === edge.caller);
            if (exclusion !== undefined && guardedViewportResearchImport(node, source)) {
              excluded.push(Object.freeze({ ...edge, reason: exclusion.reason }));
            }
            else if (exclusion !== undefined) {
              failures.push(`Research dynamic import in ${edge.caller} lost its explicit viewport-research guard.`);
              imports.push(edge);
            }
            else imports.push(edge);
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
    for (const capability of manifest) {
      if (literals.has(capability.sentinel)) markerOwners.get(capability.id).add(pathInRoot(path));
    }
  }
  const targets = new Set(imports.map((edge) => edge.target));
  for (const capability of manifest) {
    const owners = [...markerOwners.get(capability.id)];
    if (owners.length !== 1) {
      failures.push(`Capability ${capability.id} has ${owners.length} source owners; expected exactly one.`);
    } else if (!targets.has(owners[0]) && capability.tier !== "core" && capability.tier !== "asset") {
      failures.push(`Capability ${capability.id} is orphaned from dynamic imports.`);
    }
  }
  for (const target of targets) {
    const capabilities = manifest.filter((capability) => markerOwners.get(capability.id).has(target));
    if (capabilities.length !== 1) {
      failures.push(`Dynamic target ${target} has ${capabilities.length} manifest identities; expected exactly one.`);
    }
  }
  const inventory = Object.freeze({
    sourceDigest: createHash("sha256").update(JSON.stringify([...normalized].map(([path, text]) => [
      pathInRoot(path), createHash("sha256").update(text).digest("hex"),
    ]).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))).digest("hex"),
    dynamicCalls: imports.length + excluded.length,
    dynamicTargets: targets.size,
    imports: Object.freeze(imports),
    exclusions: Object.freeze(excluded),
  });
  const owners = Object.freeze([...markerOwners].map(([id, paths]) => Object.freeze({ id, paths: Object.freeze([...paths]) })));
  return Object.freeze({ failures: Object.freeze(failures), inventory, owners });
}

async function readCapabilitySourceCoverage(root) {
  let parsed;
  try {
    parsed = parseCapabilityManifest(await readFile(join(root, CAPABILITY_MANIFEST_PATH), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return Object.freeze({ manifest: Object.freeze([]), failures: Object.freeze(["Capability manifest is missing."]), inventory: null, owners: Object.freeze([]) });
  }
  const modules = [];
  for (const directory of ["app", "features/matter"]) {
    for (const file of await filesBelow(join(root, directory))) {
      if (!/\.[cm]?[jt]sx?$/u.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) continue;
      modules.push({ path: relative(root, file), text: await readFile(file, "utf8") });
    }
  }
  const configFile = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config ?? {}, ts.sys, root);
  const result = inspectCapabilitySource(parsed.manifest, modules, { root, compilerOptions: config.options });
  const configFailures = configFile.error !== undefined || config.errors.length > 0
    ? ["Capability source compiler configuration is invalid."] : [];
  return Object.freeze({ manifest: parsed.manifest, failures: Object.freeze([...parsed.failures, ...configFailures, ...result.failures]), inventory: result.inventory, owners: result.owners });
}

function guardedViewportResearchImport(node, source) {
  let statement = node;
  while (statement.parent !== undefined && !ts.isBlock(statement.parent)) statement = statement.parent;
  if (statement.parent === undefined || !ts.isBlock(statement.parent)) return false;
  const preceding = statement.parent.statements.slice(0, statement.parent.statements.indexOf(statement));
  const guarded = preceding.some((entry) => ts.isIfStatement(entry) && entry.elseStatement === undefined &&
    ts.isPrefixUnaryExpression(entry.expression) && entry.expression.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isIdentifier(entry.expression.operand) && entry.expression.operand.text === "viewportRenderer" &&
    ts.isReturnStatement(entry.thenStatement));
  if (!guarded) return false;
  let explicitBasis = false;
  let bindings = 0;
  let mutated = false;
  const containsName = (entry) => {
    if (ts.isIdentifier(entry)) return entry.text === "viewportRenderer";
    let found = false;
    ts.forEachChild(entry, (child) => { found ||= containsName(child); });
    return found;
  };
  const bindingName = (entry) => ts.isVariableDeclaration(entry) || ts.isParameter(entry) ||
    ts.isFunctionDeclaration(entry) || ts.isFunctionExpression(entry) ||
    ts.isClassDeclaration(entry) || ts.isClassExpression(entry) ||
    ts.isImportSpecifier(entry) || ts.isImportClause(entry) || ts.isNamespaceImport(entry) ||
    ts.isBindingElement(entry);
  const findBasis = (entry) => {
    if (bindingName(entry) && entry.name !== undefined && ts.isIdentifier(entry.name) &&
        entry.name.text === "viewportRenderer") bindings += 1;
    if (ts.isBinaryExpression(entry) &&
        entry.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        entry.operatorToken.kind <= ts.SyntaxKind.LastAssignment && containsName(entry.left)) mutated = true;
    if ((ts.isPrefixUnaryExpression(entry) || ts.isPostfixUnaryExpression(entry)) &&
        (entry.operator === ts.SyntaxKind.PlusPlusToken || entry.operator === ts.SyntaxKind.MinusMinusToken) &&
        containsName(entry.operand)) mutated = true;
    if (ts.isVariableDeclaration(entry) && ts.isIdentifier(entry.name) && entry.name.text === "viewportRenderer") {
      const value = entry.initializer;
      const declarationList = entry.parent;
      const block = declarationList.parent?.parent;
      let enclosing = node.parent;
      while (enclosing !== undefined && enclosing !== block) enclosing = enclosing.parent;
      explicitBasis ||= value !== undefined && ts.isBinaryExpression(value) &&
        value.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isStringLiteral(value.right) && value.right.text === "viewport-research" &&
        value.left.getText(source) === "props.performanceViewport?.source" &&
        ts.isVariableDeclarationList(declarationList) &&
        (declarationList.flags & ts.NodeFlags.Const) !== 0 && enclosing !== undefined;
    }
    ts.forEachChild(entry, findBasis);
  };
  findBasis(source);
  return explicitBasis && bindings === 1 && !mutated;
}

async function readOptionalBuildId(nextRoot) {
  try {
    return (await readFile(join(nextRoot, "BUILD_ID"), "utf8")).trim();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function readRootHtml(nextRoot) {
  const adapterPath = join(nextRoot, "server", `${getRouteCacheKey("/", {
    kind: "APP_PAGE",
    sourceRoute: "/page",
  })}.html`);
  try {
    return await readFile(adapterPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return readFile(join(nextRoot, "server/app/index.html"), "utf8");
  }
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

async function filesContainingAny(files, needles) {
  const matching = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (needles.some((needle) => contents.includes(needle))) matching.push(file);
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
  return /(^|\/)(?:docs|e2e|archive|studio|tmp)\//u.test(file) ||
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
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }
  console.log(
    "runtime-artifact: static root; " +
    `initial ${formatKiB(metrics.initialRawBytes)} raw / ${formatKiB(metrics.initialGzipBytes)} gzip; ` +
    `lazy WASM ${formatKiB(metrics.wasmBytes)}; public ${formatKiB(metrics.publicBytes)}; ` +
    `visual media ${formatKiB(metrics.visualMediaBytes)}; ` +
    `metadata images ${formatKiB(metrics.metadataImageBytes)}; ` +
    `0 repository-only or browser-fallback Node trace files; ${metrics.capabilities.length} budgeted capabilities ` +
    `(${metrics.capabilities.reduce((total, capability) => total + capability.entries.length, 0)} static entry groups); ` +
    `${metrics.capabilitySource.dynamicCalls} runtime imports (${metrics.capabilitySource.exclusions.length} explicit research exclusion)`,
  );
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`runtime-artifact: ${error instanceof Error ? error.message : "inspection failed"}`);
    process.exitCode = 1;
  });
}
