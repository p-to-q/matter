import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  RUNTIME_ARTIFACT_BUDGETS,
  inspectRuntimeArtifact,
  readRuntimeArtifact,
} from "./check-runtime-artifact.mjs";

function validMetrics() {
  return {
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
    rootStatic: true,
    prerenderedApiRoutes: [],
    forbiddenTraceFiles: [],
    productionSourceMaps: 0,
  };
}

test("accepts a static shell with a separate bounded speech fallback", () => {
  assert.deepEqual(inspectRuntimeArtifact(validMetrics()).failures, []);
});

test("rejects initial model work, dynamic shell drift, and repository-only traces", () => {
  const metrics = validMetrics();
  metrics.rootStatic = false;
  metrics.initialAssets.push("chunks/matter-local-transcription.12345678.js");
  metrics.prerenderedApiRoutes.push("/api/inquiry");
  metrics.forbiddenTraceFiles.push("../../docs/private.md");
  metrics.productionSourceMaps = 1;
  const failures = inspectRuntimeArtifact(metrics).failures.join("\n");
  assert.match(failures, /root is not a permanent static prerender/u);
  assert.match(failures, /local speech fallback entered the initial graph/u);
  assert.match(failures, /api\/inquiry was prerendered/u);
  assert.match(failures, /docs\/private\.md/u);
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

test("reads root and server traces while budgeting every public asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "matter-runtime-artifact-"));
  try {
    await Promise.all([
      mkdir(join(root, ".next/cache"), { recursive: true }),
      mkdir(join(root, ".next/server/app"), { recursive: true }),
      mkdir(join(root, ".next/static/chunks"), { recursive: true }),
      mkdir(join(root, ".next/static/media"), { recursive: true }),
      mkdir(join(root, "public/matter-ui"), { recursive: true }),
    ]);

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
        join(root, ".next/server/app/index.html"),
        '<script src="/_next/static/chunks/app.12345678.js"></script>',
      ),
      writeFile(join(root, ".next/static/chunks/app.12345678.js"), "console.log('matter')"),
      writeFile(join(root, ".next/static/media/ort.12345678.wasm"), "wasm"),
      writeFile(join(root, ".next/static/media/12345678-s.woff2"), "font"),
      writeFile(join(root, ".next/server/app/icon1.png.body"), "tab-icon"),
      writeFile(join(root, ".next/server/app/apple-icon.png.body"), "touch-icon"),
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
        JSON.stringify({ files: ["../../../e2e/browser.ts"] }),
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
      "server/app/apple-icon.png.body",
      "server/app/icon1.png.body",
    ]);
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
    const failures = inspectRuntimeArtifact(metrics).failures.join("\n");
    assert.match(failures, /docs\/root\.md/u);
    assert.match(failures, /\.env\.local/u);
    assert.match(failures, /root\.test\.ts/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
