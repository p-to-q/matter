import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  RUNTIME_ARTIFACT_BUDGETS,
  inspectRuntimeArtifact,
  inspectCapabilitySource,
  parseCapabilityManifest,
  parseCapabilityEntryManifest,
  readRuntimeArtifact,
} from "./check-runtime-artifact.mjs";

function validMetrics() {
  return {
    capabilities: [{
      id: "test-capability",
      sentinel: "test-capability-marker",
      tier: "gesture",
      budgetGzip: 1_024,
      entryBudgetGzip: 2_048,
      assets: [{ path: "chunks/lazy.abcdef12.js", rawBytes: 100, gzipBytes: 80, sha256: "a".repeat(64) }],
      entries: [{
        key: "app/page.tsx -> ./lazy", caller: "app/page.tsx", target: "app/lazy.ts",
        assets: [{ path: "chunks/lazy.abcdef12.js", rawBytes: 100, gzipBytes: 80, sha256: "a".repeat(64) }],
        coldRawBytes: 100, coldGzipBytes: 80, incrementalRawBytes: 100, incrementalGzipBytes: 80,
      }],
    }],
    capabilitySourceFailures: [],
    capabilityEntryFailures: [],
    pageHtmlBytes: 32 * 1_024,
    initialRawBytes: 1_024 * 1_024,
    initialGzipBytes: 320 * 1_024,
    staticBytes: 25 * 1_024 * 1_024,
    publicBytes: 480 * 1_024,
    wasmBytes: 23 * 1_024 * 1_024,
    fontBytes: 108 * 1_024,
    visualMediaBytes: 360 * 1_024,
    metadataImageBytes: 480 * 1_024,
    initialAssets: ["chunks/app/page.12345678.js", "css/app.12345678.css"],
    wasmAssets: ["media/ort-wasm.12345678.wasm"],
    fontAssets: ["media/12345678-s.woff2", "media/abcdef12-s.p.woff2"],
    seedLocalizationAssets: ["chunks/seed-localization.12345678.js"],
    seedMaterialCopyAssets: ["chunks/seed-localization.12345678.js"],
    rootStatic: true,
    prerenderedApiRoutes: [],
    forbiddenTraceFiles: [],
    browserFallbackNodeTraceFiles: [],
    offlineWikiQualificationAssets: [],
    productionSourceMaps: 0,
  };
}

test("accepts a static shell with a separate bounded speech fallback", () => {
  assert.deepEqual(inspectRuntimeArtifact(validMetrics()).failures, []);
});

const capability = (overrides = {}) => ({
  id: "test-capability", sentinel: "matter-capability:test", tier: "gesture", budgetGzip: 1_024,
  entryBudgetGzip: 2_048,
  ...overrides,
});

test("parses only a closed literal capability manifest", () => {
  const parse = (rows) => parseCapabilityManifest(`export const MATTER_CAPABILITIES = ${JSON.stringify(rows)} as const;`);
  assert.deepEqual(parse([capability()]).failures, []);
  for (const rows of [
    [],
    [capability({ tier: "later" })],
    [capability({ budgetGzip: 0 })],
    [capability({ budgetGzip: 1.5 })],
    [capability({ entryBudgetGzip: 1_023 })],
    [capability({ entryBudgetGzip: 2_048.5 })],
    [capability({ path: "hidden-runtime-hook" })],
    [capability(), capability({ sentinel: "other-marker" })],
    [capability(), capability({ id: "other-id" })],
  ]) assert.ok(parse(rows).failures.length > 0, JSON.stringify(rows));
  assert.ok(parseCapabilityManifest("export const MATTER_CAPABILITIES = getRuntimeRegistry();").failures.length > 0);
  assert.ok(parseCapabilityManifest("export const MATTER_CAPABILITIES = [{id:'x', sentinel:'marker', tier:'core', budgetGzip:1+1}];").failures.length > 0);
  assert.ok(parseCapabilityManifest(`export const MATTER_CAPABILITIES=${JSON.stringify([capability()])}; initializeRuntime();`).failures.length > 0);
});

test("accounts runtime imports without counting type-only queries or comment examples", () => {
  const modules = [
    { path: "entry.ts", text: 'type Query = typeof import("./never"); /* import("./comment") */ export const load = () => import("./lazy");' },
    { path: "lazy.ts", text: 'export function run() {} Object.defineProperty(run, "matterCapability", {value:"matter-capability:test"});' },
  ];
  const result = inspectCapabilitySource([capability()], modules);
  assert.deepEqual(result.failures, []);
  assert.equal(result.inventory.dynamicCalls, 1);
  assert.equal(result.inventory.dynamicTargets, 1);
  assert.equal(result.inventory.imports[0].target, "lazy.ts");
  assert.match(result.inventory.sourceDigest, /^[a-f0-9]{64}$/u);
});

test("rejects missing, ambiguous, duplicate-source and orphan capability ownership", () => {
  const base = [
    { path: "entry.ts", text: 'export const load = () => import("./lazy");' },
    { path: "lazy.ts", text: 'export const marker="matter-capability:test";' },
  ];
  assert.match(inspectCapabilitySource([], base).failures.join("\n"), /has 0 manifest identities/u);
  const missing = [{ ...base[0] }, { path: "lazy.ts", text: "export const run=1;" }];
  assert.match(inspectCapabilitySource([capability()], missing).failures.join("\n"), /has 0 source owners/u);
  const duplicate = [...base, { path: "other.ts", text: 'export const marker="matter-capability:test";' }];
  assert.match(inspectCapabilitySource([capability()], duplicate).failures.join("\n"), /has 2 source owners/u);
  const ambiguous = [base[0], { path: "lazy.ts", text: 'export const a="matter-capability:test", b="second-marker";' }];
  assert.match(inspectCapabilitySource([capability(), capability({ id: "second", sentinel: "second-marker" })], ambiguous).failures.join("\n"), /has 2 manifest identities/u);
  assert.match(inspectCapabilitySource([capability()], [base[1]]).failures.join("\n"), /orphaned/u);
  assert.deepEqual(inspectCapabilitySource([capability({ tier: "core" })], [base[1]]).failures, []);
  assert.match(inspectCapabilitySource([capability()], [{ path: "entry.ts", text: "import(path);" }]).failures.join("\n"), /Nonliteral dynamic import/u);
  assert.match(inspectCapabilitySource([capability()], [{ path: "entry.ts", text: 'import("./absent");' }]).failures.join("\n"), /Unresolved dynamic import/u);
});

test("keeps the build-fact manifest outside every product import and re-export", () => {
  const path = "features/matter/runtime/capability-manifest.ts";
  for (const text of [
    'import {MATTER_CAPABILITIES} from "./capability-manifest";',
    'export {MATTER_CAPABILITIES} from "./capability-manifest";',
  ]) {
    const result = inspectCapabilitySource([], [
      { path, text: "export const MATTER_CAPABILITIES=[];" },
      { path: "features/matter/runtime/caller.ts", text },
    ]);
    assert.match(result.failures.join("\n"), /Build-only capability manifest entered product source/u);
  }
});

test("keeps the viewport research exclusion exact rather than exempting an arbitrary caller", () => {
  const target = { path: "features/matter/components/viewport-research-runtime.ts", text: "export const research = true;" };
  const source = { path: "features/matter/components/RootedMaterial.tsx", text: 'const viewportRenderer=props.performanceViewport?.source === "viewport-research"; export const load=()=>{if(!viewportRenderer)return; void import("./viewport-research-runtime");};' };
  const result = inspectCapabilitySource([], [source, target]);
  assert.deepEqual(result.failures, []);
  assert.equal(result.inventory.exclusions.length, 1);
  assert.match(result.inventory.exclusions[0].reason, /research/u);
  const other = { ...source, path: "features/matter/components/Other.tsx" };
  assert.match(inspectCapabilitySource([], [other, target]).failures.join("\n"), /has 0 manifest identities/u);
  const unguarded = { ...source, text: 'export const load=()=>import("./viewport-research-runtime");' };
  assert.match(inspectCapabilitySource([], [unguarded, target]).failures.join("\n"), /lost its explicit viewport-research guard/u);
  const unproved = { ...source, text: source.text.replace('props.performanceViewport?.source === "viewport-research"', "someOtherFlag") };
  assert.match(inspectCapabilitySource([], [unproved, target]).failures.join("\n"), /lost its explicit viewport-research guard/u);
  for (const text of [
    source.text.replace("if(!viewportRenderer)", "const viewportRenderer=true;if(!viewportRenderer)"),
    source.text.replace("()=>{", "(viewportRenderer)=>{"),
    source.text.replace("if(!viewportRenderer)", "const {viewportRenderer}=input;if(!viewportRenderer)"),
    source.text.replace("if(!viewportRenderer)", "viewportRenderer=true;if(!viewportRenderer)"),
    source.text.replace("if(!viewportRenderer)", "[viewportRenderer]=[true];if(!viewportRenderer)"),
    source.text.replace("const viewportRenderer", "let viewportRenderer"),
    'function other(){const viewportRenderer=props.performanceViewport?.source === "viewport-research";} export const load=()=>{if(!viewportRenderer)return; void import("./viewport-research-runtime");};',
  ]) {
    assert.match(inspectCapabilitySource([], [{ ...source, text }, target]).failures.join("\n"),
      /lost its explicit viewport-research guard/u, text);
  }
});

test("proves per-capability emitted identity, tier, hash and budget with planted violations", () => {
  for (const alter of [
    (metrics) => { metrics.capabilities[0].assets = []; },
    (metrics) => { metrics.capabilities[0].assets.push({ ...metrics.capabilities[0].assets[0], path: "chunks/duplicate.12345678.js" }); },
    (metrics) => { metrics.capabilities[0].assets[0].path = "chunks/unhashed.js"; },
    (metrics) => { metrics.initialAssets.push(metrics.capabilities[0].assets[0].path); },
    (metrics) => { metrics.capabilities[0].tier = "core"; },
    (metrics) => { metrics.capabilities[0].budgetGzip = 79; },
    (metrics) => { metrics.capabilities[0].entries = []; },
    (metrics) => { metrics.capabilities[0].entries[0].assets = []; },
    (metrics) => { metrics.capabilities[0].entryBudgetGzip = 1_023; },
    (metrics) => { metrics.capabilities[0].entries[0].coldGzipBytes = 2_049; },
    (metrics) => { metrics.capabilitySourceFailures.push("Missing source identity."); },
    (metrics) => { metrics.capabilityEntryFailures.push("Missing entry identity."); },
  ]) {
    const metrics = validMetrics();
    alter(metrics);
    assert.ok(inspectRuntimeArtifact(metrics).failures.length > 0);
  }
  const shared = validMetrics();
  shared.capabilities.push({ ...shared.capabilities[0], id: "second-capability", sentinel: "second-marker" });
  assert.deepEqual(inspectRuntimeArtifact(shared).failures, [], "sharing an emitted chunk is not duplicate identity");
});

test("rejects initial model work, dynamic shell drift, and forbidden traces", () => {
  const metrics = validMetrics();
  metrics.rootStatic = false;
  metrics.initialAssets.push("chunks/matter-local-transcription.12345678.js");
  metrics.prerenderedApiRoutes.push("/api/inquiry");
  metrics.forbiddenTraceFiles.push("../../docs/private.md", "../../studio/film/render.mjs");
  metrics.browserFallbackNodeTraceFiles.push("../../node_modules/onnxruntime-node/index.js");
  metrics.productionSourceMaps = 1;
  const failures = inspectRuntimeArtifact(metrics).failures.join("\n");
  assert.match(failures, /root is not a permanent static prerender/u);
  assert.match(failures, /local speech fallback entered the initial graph/u);
  assert.match(failures, /api\/inquiry was prerendered/u);
  assert.match(failures, /docs\/private\.md/u);
  assert.match(failures, /studio\/film\/render\.mjs/u);
  assert.match(failures, /browser-fallback-only package/u);
  assert.match(failures, /source map/u);
});

test("holds every transfer class to an explicit ceiling", () => {
  for (const [metric, budget] of Object.entries({
    pageHtmlBytes: RUNTIME_ARTIFACT_BUDGETS.pageHtmlBytes,
    initialRawBytes: RUNTIME_ARTIFACT_BUDGETS.initialRawBytes,
    initialGzipBytes: RUNTIME_ARTIFACT_BUDGETS.initialGzipBytes,
    staticBytes: RUNTIME_ARTIFACT_BUDGETS.staticBytes,
    publicBytes: RUNTIME_ARTIFACT_BUDGETS.publicBytes,
    wasmBytes: RUNTIME_ARTIFACT_BUDGETS.wasmBytes,
    fontBytes: RUNTIME_ARTIFACT_BUDGETS.fontBytes,
    visualMediaBytes: RUNTIME_ARTIFACT_BUDGETS.visualMediaBytes,
    metadataImageBytes: RUNTIME_ARTIFACT_BUDGETS.metadataImageBytes,
  })) {
    const metrics = validMetrics();
    metrics[metric] = budget + 1;
    assert.ok(
      inspectRuntimeArtifact(metrics).failures.some((failure) => failure.includes("budget is")),
      `${metric} had no failing budget`,
    );
  }
});

test("requires cache-safe hashed WASM and next/font output", () => {
  const metrics = validMetrics();
  metrics.wasmAssets = ["media/ort.wasm", "media/second.12345678.wasm"];
  metrics.fontAssets = ["media/plain.woff2"];
  const failures = inspectRuntimeArtifact(metrics).failures.join("\n");
  assert.match(failures, /Expected one lazy WASM runtime asset/u);
  assert.match(failures, /not content-hashed/u);
  assert.match(failures, /not emitted through next\/font/u);
});

test("keeps seed localization in exactly one lazy browser chunk", () => {
  const missing = validMetrics();
  missing.seedLocalizationAssets = [];
  assert.match(
    inspectRuntimeArtifact(missing).failures.join("\n"),
    /Expected one lazy seed-localization asset/u,
  );

  const initial = validMetrics();
  initial.initialAssets.push(initial.seedLocalizationAssets[0]);
  assert.match(
    inspectRuntimeArtifact(initial).failures.join("\n"),
    /Seed localization entered the initial graph/u,
  );

  const missingCopy = validMetrics();
  missingCopy.seedMaterialCopyAssets = [];
  assert.match(
    inspectRuntimeArtifact(missingCopy).failures.join("\n"),
    /Expected one lazy seed-material-copy asset/u,
  );

  const splitCopy = validMetrics();
  splitCopy.seedMaterialCopyAssets = ["chunks/seed-copy.abcdef12.js"];
  assert.match(
    inspectRuntimeArtifact(splitCopy).failures.join("\n"),
    /must share one lazy browser asset/u,
  );

  const unhashed = validMetrics();
  unhashed.seedLocalizationAssets = ["chunks/seed-localization.js"];
  unhashed.seedMaterialCopyAssets = ["chunks/seed-localization.js"];
  assert.match(
    inspectRuntimeArtifact(unhashed).failures.join("\n"),
    /not content-hashed for immutable caching/u,
  );
});

test("keeps offline Wiki qualification inventory out of browser artifacts", () => {
  const metrics = validMetrics();
  metrics.offlineWikiQualificationAssets = ["chunks/wiki-runtime.12345678.js"];
  assert.match(
    inspectRuntimeArtifact(metrics).failures.join("\n"),
    /offline Wiki qualification metadata/u,
  );
});

test("reports a prerendered image route, which would serve without its gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "matter-runtime-artifact-image-"));
  try {
    await Promise.all([
      mkdir(join(root, ".next/server/app"), { recursive: true }),
      mkdir(join(root, ".next/static"), { recursive: true }),
      mkdir(join(root, "public/matter-ui"), { recursive: true }),
    ]);
    // The reader budgets these four files by name, so they must exist.
    for (const asset of ["ptoq-logo.png", "shadows-loop.mp4", "shadows-loop.webm", "shadows-poster.jpg"]) {
      await writeFile(join(root, "public/matter-ui", asset), asset);
    }
    await writeFile(join(root, ".next/server/app/index.html"), "<html></html>");
    await writeFile(
      join(root, ".next/prerender-manifest.json"),
      JSON.stringify({
        routes: {
          "/": { compute: "static", initialRevalidateSeconds: false },
          "/api/image": { compute: "static", initialRevalidateSeconds: false },
        },
      }),
    );

    const metrics = await readRuntimeArtifact(root);
    assert.deepEqual(metrics.prerenderedApiRoutes, ["/api/image"]);
    assert.match(
      inspectRuntimeArtifact(metrics).failures.join("\n"),
      /\/api\/image was prerendered/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const adapter of [false, true]) {
  test(`reads ${adapter ? "adapter route-cache" : "standard"} root and server traces while budgeting every public asset`, async () => {
    const root = await mkdtemp(join(tmpdir(), "matter-runtime-artifact-"));
    const cachePath = (kind, source, pathname) =>
      `.next/server/route-cache/${kind}/${createHash("sha256").update(source).digest("hex")}/$/${pathname}`;
    const htmlPath = adapter
      ? cachePath("APP_PAGE", "/page", "index.html")
      : ".next/server/app/index.html";
    const iconPath = adapter
      ? cachePath("APP_ROUTE", "/icon1.png/route", "icon1.png.body")
      : ".next/server/app/icon1.png.body";
    const applePath = adapter
      ? cachePath("APP_ROUTE", "/apple-icon.png/route", "apple-icon.png.body")
      : ".next/server/app/apple-icon.png.body";
    try {
      await Promise.all([
        mkdir(join(root, ".next/cache"), { recursive: true }),
        mkdir(join(root, ".next/server/app"), { recursive: true }),
        mkdir(join(root, ".next/static/chunks"), { recursive: true }),
        mkdir(join(root, ".next/static/media"), { recursive: true }),
        mkdir(join(root, "public/matter-ui"), { recursive: true }),
      ]);
      for (const path of [htmlPath, iconPath, applePath]) {
        await mkdir(join(root, path, ".."), { recursive: true });
      }

      const publicAssets = new Map([
        ["public/matter-ui/DepartureMono-Regular.woff2", "departure-font"],
        ["public/matter-ui/OFL.txt", "font-license"],
        ["public/matter-ui/PlantinNow.woff2", "plantin-font"],
        ["public/matter-ui/ptoq-logo.png", "logo"],
        ["public/matter-ui/shadows-loop.mp4", "mp4"],
        ["public/matter-ui/shadows-loop.webm", "webm"],
        ["public/matter-ui/shadows-poster.jpg", "poster"],
      ]);
      const writes = [
        writeFile(
          join(root, htmlPath),
          '<script src="/_next/static/chunks/app.12345678.js"></script>',
        ),
        writeFile(join(root, ".next/static/chunks/app.12345678.js"), "console.log('matter')"),
        writeFile(
          join(root, ".next/static/chunks/offline-wiki.abcdef12.js"),
          "const pronunciationDictionary = 'bǎng páng pāng';",
        ),
        writeFile(
          join(root, ".next/static/chunks/seed-localization.12345678.js"),
          "matter-seeded-session-localization matter-seeded-material-copy",
        ),
        writeFile(join(root, ".next/static/media/ort.12345678.wasm"), "wasm"),
        writeFile(join(root, ".next/static/media/12345678-s.woff2"), "font"),
        writeFile(join(root, iconPath), "tab-icon"),
        writeFile(join(root, applePath), "touch-icon"),
        writeFile(
          join(root, ".next/prerender-manifest.json"),
          JSON.stringify({ routes: { "/": { compute: "static", initialRevalidateSeconds: false } } }),
        ),
        writeFile(
          join(root, ".next/next-server.js.nft.json"),
          JSON.stringify({ files: ["../docs/root.md", "../.env.local", "../features/root.test.ts"] }),
        ),
        writeFile(
          join(root, ".next/server/app/page.js.nft.json"),
          JSON.stringify({
            files: [
              "../../../e2e/browser.ts",
              "../../../node_modules/adm-zip/adm_zip.js",
            ],
          }),
        ),
        writeFile(
          join(root, ".next/cache/ignored.nft.json"),
          JSON.stringify({ files: ["../../docs/ignored.md"] }),
        ),
        ...[...publicAssets].map(([path, contents]) => writeFile(join(root, path), contents)),
      ];
      await Promise.all(writes);

      const metrics = await readRuntimeArtifact(root);
      assert.equal(
        metrics.publicBytes,
        [...publicAssets.values()].reduce((total, contents) => total + Buffer.byteLength(contents), 0),
      );
      assert.equal(metrics.metadataImageBytes, Buffer.byteLength("tab-icontouch-icon"));
      assert.deepEqual(metrics.metadataImageAssets, [
        applePath.slice(".next/".length),
        iconPath.slice(".next/".length),
      ].sort());
      assert.deepEqual([...metrics.forbiddenTraceFiles].sort(), [
        "../../../e2e/browser.ts",
        "../.env.local",
        "../docs/root.md",
        "../features/root.test.ts",
      ]);
      assert.equal(
        metrics.forbiddenTraceFiles.some((file) => file.includes("ignored")),
        false,
        ".next/cache must not become a runtime-trace input",
      );
      assert.deepEqual(metrics.browserFallbackNodeTraceFiles, [
        "../../../node_modules/adm-zip/adm_zip.js",
      ]);
      assert.deepEqual(metrics.seedLocalizationAssets, [
        "chunks/seed-localization.12345678.js",
      ]);
      assert.deepEqual(metrics.seedMaterialCopyAssets, metrics.seedLocalizationAssets);
      assert.deepEqual(metrics.offlineWikiQualificationAssets, [
        "chunks/offline-wiki.abcdef12.js",
      ]);
      const failures = inspectRuntimeArtifact(metrics).failures.join("\n");
      assert.match(failures, /docs\/root\.md/u);
      assert.match(failures, /\.env\.local/u);
      assert.match(failures, /root\.test\.ts/u);
      assert.match(failures, /adm-zip/u);
      assert.match(failures, /offline Wiki qualification metadata/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("fails closed when neither root artifact exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "matter-missing-artifact-"));
  try {
    await assert.rejects(readRuntimeArtifact(root), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reads source coverage and measured hashed asset identity together without executing the manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "matter-capability-artifact-"));
  try {
    for (const directory of [
      "app", "features/matter/interaction", "features/matter/runtime", ".next/server/app",
      ".next/static/chunks", "public/matter-ui",
    ]) await mkdir(join(root, directory), { recursive: true });
    const lazyBytes = 'const marker="matter-capability:test";console.log(marker,"matter-capability:test");';
    const writes = [
      writeFile(join(root, "tsconfig.json"), JSON.stringify({ include: ["app", "features"] })),
      writeFile(join(root, "app/page.tsx"), 'export const load=()=>import("../features/matter/interaction/lazy");'),
      writeFile(join(root, "features/matter/interaction/lazy.ts"), 'export const marker="matter-capability:test";'),
      writeFile(join(root, "features/matter/runtime/capability-manifest.ts"),
        `export const MATTER_CAPABILITIES=${JSON.stringify([capability()])} as const;`),
      writeFile(join(root, ".next/BUILD_ID"), "test-build-identity\n"),
      writeFile(join(root, ".next/server/app/index.html"), '<script src="/_next/static/chunks/app.12345678.js"></script>'),
      writeFile(join(root, ".next/static/chunks/app.12345678.js"), "console.log('core')"),
      writeFile(join(root, ".next/static/chunks/lazy.abcdef12.js"), lazyBytes),
      writeFile(join(root, ".next/react-loadable-manifest.json"), JSON.stringify({
        "app/page.tsx -> ../features/matter/interaction/lazy": { id: 123, files: ["static/chunks/lazy.abcdef12.js"] },
      })),
      writeFile(join(root, ".next/prerender-manifest.json"), JSON.stringify({ routes: {} })),
    ];
    for (const asset of ["ptoq-logo.png", "shadows-loop.mp4", "shadows-loop.webm", "shadows-poster.jpg"]) {
      writes.push(writeFile(join(root, "public/matter-ui", asset), asset));
    }
    await Promise.all(writes);
    const metrics = await readRuntimeArtifact(root);
    assert.deepEqual(metrics.capabilitySourceFailures, []);
    assert.deepEqual(metrics.capabilityEntryFailures, []);
    assert.equal(metrics.capabilitySource.dynamicCalls, 1);
    assert.equal(metrics.capabilities.length, 1);
    assert.equal(metrics.capabilities[0].assets.length, 1, "repeat use inside one chunk is not duplicate ownership");
    const asset = metrics.capabilities[0].assets[0];
    assert.equal(asset.path, "chunks/lazy.abcdef12.js");
    assert.equal(asset.rawBytes, Buffer.byteLength(lazyBytes));
    assert.ok(asset.gzipBytes > 0 && asset.gzipBytes <= capability().budgetGzip);
    assert.equal(asset.sha256, createHash("sha256").update(lazyBytes).digest("hex"));
    assert.equal(metrics.capabilities[0].entries[0].coldGzipBytes, asset.gzipBytes);
    assert.equal(metrics.artifactIdentity.buildId, "test-build-identity");
    assert.match(metrics.artifactIdentity.browserAssetsDigest, /^[a-f0-9]{64}$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const ENTRY_KEY = "app/page.tsx -> ../features/matter/interaction/lazy";
const ENTRY_FILES = ["static/chunks/lazy.abcdef12.js", "static/chunks/shared.12345678.js", "static/css/abcdef12.css"];
const entryRecord = (files = ENTRY_FILES) => ({ id: 123, files });

test("parses bounded closed entry JSON without executing it or discarding duplicate keys", () => {
  const parse = (value) => parseCapabilityEntryManifest(JSON.stringify(value));
  const result = parse({ [ENTRY_KEY]: entryRecord([...ENTRY_FILES, ENTRY_FILES[0]]) });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.entries.get(ENTRY_KEY).files, [...ENTRY_FILES].sort());
  for (const value of [null, [], { [ENTRY_KEY]: null }, { [ENTRY_KEY]: { ...entryRecord(), hidden: true } },
    { [ENTRY_KEY]: entryRecord([]) }, { [ENTRY_KEY]: entryRecord(Array(257).fill(ENTRY_FILES[0])) },
    { [ENTRY_KEY]: { ...entryRecord(), id: -1 } }, { [ENTRY_KEY]: { ...entryRecord(), id: {} } },
    { "app/../outside.ts -> ./lazy": entryRecord() }, { "app//page.tsx -> ./lazy": entryRecord() }]) {
    assert.ok(parse(value).failures.length > 0, JSON.stringify(value));
  }
  assert.match(parseCapabilityEntryManifest("globalThis.notAnEntryManifest = true").failures.join("\n"), /strict JSON/u);
  assert.match(parseCapabilityEntryManifest(`{"${ENTRY_KEY}":{"id":1,"files":[],"files":["${ENTRY_FILES[0]}"]}}`).failures.join("\n"), /duplicate object keys/u);
  assert.match(parseCapabilityEntryManifest(`{"${ENTRY_KEY}":${JSON.stringify(entryRecord())},"${ENTRY_KEY}":${JSON.stringify(entryRecord())}}`).failures.join("\n"), /duplicate object keys/u);
  assert.match(parseCapabilityEntryManifest(" ".repeat(2 * 1_024 * 1_024 + 1)).failures.join("\n"), /byte bound/u);
});

test("refuses entry paths before they can be used as filesystem or URL inputs", () => {
  for (const file of [
    "../outside.abcdef12.js", "/static/chunks/lazy.abcdef12.js", "static/chunks/../lazy.abcdef12.js",
    "static/chunks//lazy.abcdef12.js", "static\\chunks\\lazy.abcdef12.js", "static/chunks/%2e%2e/lazy.abcdef12.js",
    "static/chunks/lazy.abcdef12.js?dpl=other", "https://example.test/lazy.abcdef12.js",
    "static/chunks/unhashed.js", "static/css/unhashed.css", "static/media/model.abcdef12.wasm", null,
  ]) {
    const result = parseCapabilityEntryManifest(JSON.stringify({ [ENTRY_KEY]: entryRecord([file]) }));
    assert.match(result.failures.join("\n"), /unsafe, unhashed or unsupported/u, String(file));
    assert.equal(result.entries.size, 0);
  }
});

async function withEntryArtifact(run) {
  const root = await mkdtemp(join(tmpdir(), "matter-entry-artifact-"));
  try {
    for (const directory of [
      "app", "features/matter/interaction", "features/matter/runtime", ".next/server/app",
      ".next/static/chunks", ".next/static/css", ".next/static/media", "public/matter-ui",
    ]) await mkdir(join(root, directory), { recursive: true });
    const files = new Map([
      ["tsconfig.json", JSON.stringify({ include: ["app", "features"] })],
      ["app/page.tsx", 'export const load=()=>import("../features/matter/interaction/lazy");'],
      ["features/matter/interaction/lazy.ts", 'export const marker="matter-capability:test";'],
      ["features/matter/runtime/capability-manifest.ts", `export const MATTER_CAPABILITIES=${JSON.stringify([capability()])} as const;`],
      [".next/server/app/index.html", '<script src="/_next/static/chunks/app.12345678.js"></script><script src="/_next/static/chunks/shared.12345678.js"></script>'],
      [".next/static/chunks/app.12345678.js", "console.log('core')"],
      [".next/static/chunks/shared.12345678.js", "console.log('shared vendor')"],
      [".next/static/chunks/lazy.abcdef12.js", 'console.log("matter-capability:test")'],
      [".next/static/css/abcdef12.css", ".lazy{color:currentColor}"],
      [".next/static/chunks/seed.abcdef12.js", "matter-seeded-session-localization matter-seeded-material-copy"],
      [".next/static/media/ort.abcdef12.wasm", "wasm"],
      [".next/static/media/abcdef12-s.woff2", "font"],
      [".next/react-loadable-manifest.json", JSON.stringify({ [ENTRY_KEY]: entryRecord() })],
      [".next/prerender-manifest.json", JSON.stringify({ routes: { "/": { compute: "static", initialRevalidateSeconds: false } } })],
    ]);
    for (const file of ["ptoq-logo.png", "shadows-loop.mp4", "shadows-loop.webm", "shadows-poster.jpg"]) {
      files.set(`public/matter-ui/${file}`, file);
    }
    await Promise.all([...files].map(([path, text]) => writeFile(join(root, path), text)));
    await run(root, files);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("measures deduplicated static JS and CSS, with cold and initial-subtracted costs kept distinct", async () => {
  await withEntryArtifact(async (root, files) => {
    await writeFile(join(root, ".next/react-loadable-manifest.json"), JSON.stringify({
      [ENTRY_KEY]: entryRecord([...ENTRY_FILES, ENTRY_FILES[0], ENTRY_FILES[2]]),
    }));
    const metrics = await readRuntimeArtifact(root);
    assert.deepEqual(inspectRuntimeArtifact(metrics).failures, []);
    const entry = metrics.capabilities[0].entries[0];
    assert.equal(entry.key, ENTRY_KEY);
    assert.equal(entry.target, "features/matter/interaction/lazy.ts");
    assert.equal(entry.assets.length, 3);
    const sizes = (paths) => paths.reduce((sum, path) => sum + gzipSync(files.get(`.next/${path}`), { level: 9 }).byteLength, 0);
    assert.equal(entry.coldGzipBytes, sizes(ENTRY_FILES));
    assert.equal(entry.incrementalGzipBytes, sizes(ENTRY_FILES.filter((path) => !path.includes("shared"))));
    assert.ok(entry.coldGzipBytes > entry.incrementalGzipBytes);
    assert.equal(entry.coldRawBytes, ENTRY_FILES.reduce((sum, path) => sum + Buffer.byteLength(files.get(`.next/${path}`)), 0));
    const css = entry.assets.find((asset) => asset.path.endsWith(".css"));
    assert.equal(css.sha256, createHash("sha256").update(files.get(".next/static/css/abcdef12.css")).digest("hex"));
    assert.match(metrics.artifactIdentity.capabilityEntryManifestSha256, /^[a-f0-9]{64}$/u);
  });
});

test("keeps different callers separate even when their resolved target and shared dependencies coincide", async () => {
  await withEntryArtifact(async (root) => {
    const other = "app/other.tsx -> ../features/matter/interaction/lazy";
    await writeFile(join(root, "app/other.tsx"), 'export const load=()=>import("../features/matter/interaction/lazy");');
    await writeFile(join(root, "app/page.tsx"), 'export const load=()=>import("../features/matter/interaction/lazy");export const again=()=>import("../features/matter/interaction/lazy");');
    await writeFile(join(root, ".next/react-loadable-manifest.json"), JSON.stringify({
      [ENTRY_KEY]: entryRecord(), [other]: entryRecord([ENTRY_FILES[0], ENTRY_FILES[1]]),
    }));
    const metrics = await readRuntimeArtifact(root);
    assert.deepEqual(inspectRuntimeArtifact(metrics).failures, []);
    assert.equal(metrics.capabilitySource.dynamicCalls, 3);
    const entries = metrics.capabilities[0].entries;
    assert.equal(entries.length, 2, "repeated calls at one entry are one group, not two transfers");
    assert.deepEqual(new Set(entries.map((entry) => entry.caller)), new Set(["app/page.tsx", "app/other.tsx"]));
    assert.notEqual(entries[0].coldGzipBytes, entries[1].coldGzipBytes, "a caller's CSS must not be merged into another caller");
  });
});

test("refuses absent, unknown and caller/import-mismatched entry groups", async () => {
  await withEntryArtifact(async (root) => {
    const manifest = join(root, ".next/react-loadable-manifest.json");
    for (const value of [{}, { "app/other.tsx -> ../features/matter/interaction/lazy": entryRecord() },
      { "app/page.tsx -> ../features/matter/interaction/other": entryRecord() }]) {
      await writeFile(manifest, JSON.stringify(value));
      const metrics = await readRuntimeArtifact(root);
      assert.match(metrics.capabilityEntryFailures.join("\n"), /no emitted entry group/u);
      if (Object.keys(value).length > 0) assert.match(metrics.capabilityEntryFailures.join("\n"), /no matching source caller\/import/u);
      assert.ok(inspectRuntimeArtifact(metrics).failures.length > 0);
    }
    await rm(manifest);
    assert.match((await readRuntimeArtifact(root)).capabilityEntryFailures.join("\n"), /manifest is missing/u);
  });
});

test("refuses missing owned or CSS assets and does not infer a dependency group from chunk membership", async () => {
  await withEntryArtifact(async (root) => {
    const manifest = join(root, ".next/react-loadable-manifest.json");
    await writeFile(manifest, JSON.stringify({ [ENTRY_KEY]: entryRecord([ENTRY_FILES[1], ENTRY_FILES[2]]) }));
    assert.match(inspectRuntimeArtifact(await readRuntimeArtifact(root)).failures.join("\n"), /omits its owned chunk/u);
    await writeFile(manifest, JSON.stringify({ [ENTRY_KEY]: entryRecord() }));
    await rm(join(root, ".next/static/css/abcdef12.css"));
    assert.match((await readRuntimeArtifact(root)).capabilityEntryFailures.join("\n"), /missing asset static\/css\/abcdef12\.css/u);
  });
});

test("a shared or CSS dependency can exceed the cold-entry budget while the owned chunk stays small", async () => {
  for (const path of [".next/static/chunks/shared.12345678.js", ".next/static/css/abcdef12.css"]) {
    await withEntryArtifact(async (root) => {
      const heavy = Array.from({ length: 128 }, (_, index) => createHash("sha256").update(String(index)).digest("hex")).join("\n");
      await writeFile(join(root, path), heavy);
      const metrics = await readRuntimeArtifact(root);
      const row = metrics.capabilities[0];
      assert.ok(row.assets[0].gzipBytes < row.budgetGzip);
      assert.ok(row.entries[0].coldGzipBytes > row.entryBudgetGzip);
      assert.match(inspectRuntimeArtifact(metrics).failures.join("\n"), /cold gzip bytes; entry budget/u);
    });
  }
});
