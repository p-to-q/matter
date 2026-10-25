/**
 * Qualifies an existing production Next artifact, not a deployment. Fixture and
 * oracle owners execute only in Node; the browser receives the shipped page.
 * No user origin, provider, storage clear, product hook or recovery.js is used.
 */
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, open, readFile, readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";
import { chromium, expect } from "@playwright/test";
import { acquireE2eRunLock, createProcessSignalTarget, createSignalTerminator } from "./e2e-runner.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const requireProof = (condition, code) => { if (!condition) throw new Error(code); };
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (value) => hash(JSON.stringify(canonical(value)));
const args = process.argv.slice(2);
let prepareOnly = false;
let sourceInventoryPath = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--prepare-only" && !prepareOnly) prepareOnly = true;
  else if (args[index] === "--source-inventory" && sourceInventoryPath === null && args[index + 1]) sourceInventoryPath = path.resolve(args[++index]);
  else throw new Error("Expected --prepare-only and/or --source-inventory PATH only.");
}

async function filesUnder(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    requireProof(!entry.isSymbolicLink(), "ARTIFACT_SYMLINK_REFUSED");
    const relative = `${prefix}/${entry.name}`;
    // Next's file-system response cache writes here at runtime; it is not
    // emitted executable code (next/dist/server/lib/route-cache-key.js).
    if (relative === ".next/server/route-cache") continue;
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push({ path: relative, sha256: hash(await readFile(path.join(directory, entry.name))) });
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function artifactInventory() {
  const groups = {};
  for (const name of [".next/static", ".next/server", "public"]) groups[name] = await filesUnder(path.join(root, name), name);
  const top = await readdir(path.join(root, ".next"), { withFileTypes: true });
  groups.metadata = await Promise.all(top.filter((entry) => entry.isFile() && (entry.name === "BUILD_ID" || /\.(?:json|js)$/u.test(entry.name)))
    .map(async (entry) => ({ path: `.next/${entry.name}`, sha256: hash(await readFile(path.join(root, ".next", entry.name))) })));
  groups.metadata.sort((left, right) => left.path < right.path ? -1 : 1);
  const buildId = (await readFile(path.join(root, ".next/BUILD_ID"), "utf8")).trim();
  requireProof(buildId.length > 0, "NEXT_BUILD_ID_MISSING");
  return { buildId, sha256: digest(groups), groups, groupDigests: Object.fromEntries(Object.entries(groups).map(([name, files]) => [name, { files: files.length, sha256: digest(files) }])) };
}

async function readSourceIdentity() {
  if (sourceInventoryPath === null) return { provided: false, sourceBuildAssociation: "not-established-by-runner" };
  const bytes = await readFile(sourceInventoryPath);
  const lines = bytes.toString("utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const seen = new Set();
  const sources = lines.map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    requireProof(match !== null && !path.isAbsolute(match[2]) && !match[2].includes("\\") && match[2] !== "." && path.posix.normalize(match[2]) === match[2] && !match[2].split("/").includes("..") && !/(?:^|\/)\.env(?:\.|$)/u.test(match[2]) && !seen.has(match[2]), "SOURCE_INVENTORY_INVALID");
    seen.add(match[2]);
    return { path: match[2], sha256: match[1] };
  });
  requireProof(sources.length > 0, "SOURCE_INVENTORY_EMPTY");
  for (const source of sources) requireProof(hash(await readFile(path.join(root, source.path))) === source.sha256, "SOURCE_INVENTORY_MISMATCH");
  return { provided: true, path: sourceInventoryPath, sha256: hash(bytes), files: sources.length, sources, sourceBuildAssociation: "external-owner-build-receipt-required" };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  requireProof(address !== null && typeof address !== "string", "LOOPBACK_PORT_MISSING");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

// This is native fixture setup, not a replacement implementation of recovery.
async function seedNative({ version, rows, keepOpen }) {
  if ((await indexedDB.databases()).some(({ name }) => name === "ptoq-matter")) throw new Error("PROOF_ORIGIN_NOT_FRESH");
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter", version);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("snapshots", { keyPath: "treeId" });
      const labels = db.createObjectStore("labels", { keyPath: "key" });
      labels.createIndex("treeId", "treeId");
      labels.createIndex("originUpdatedAt", ["origin", "updatedAt"]);
      db.createObjectStore("inquiryRecords", { keyPath: "treeId" });
      db.createObjectStore("wiki", { keyPath: "key" });
      db.createObjectStore("historyEntries", { keyPath: ["treeId", "epoch", "stack", "position"] });
      if (version === 7) db.createObjectStore("blobs", { keyPath: "contentHash" }).createIndex("storedAt", "storedAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const names = [...database.objectStoreNames];
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(names, "readwrite");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error ?? new Error("SEED_ABORTED"));
      tx.onerror = () => reject(tx.error);
      for (const name of names) for (const row of rows[name]) {
        tx.objectStore(name).put(name === "blobs" ? { ...row, bytes: Uint8Array.from(row.bytes).buffer } : row);
      }
    });
    if (keepOpen) window.__matterRecoveryNativeConnection = database;
  } finally { if (!keepOpen) database.close(); }
}

async function readNative() {
  if (!(await indexedDB.databases()).some(({ name }) => name === "ptoq-matter")) throw new Error("PROOF_DATABASE_MISSING");
  // A new open queues behind a blocked upgrade; its genuine old owner can read.
  const held = window.__matterRecoveryNativeConnection;
  const db = held ?? await new Promise((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const names = [...db.objectStoreNames].sort();
    const tx = db.transaction(names, "readonly");
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    const requestValue = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const stores = Object.fromEntries(await Promise.all(names.map(async (name) => {
      const store = tx.objectStore(name);
      const [keys, rows] = await Promise.all([requestValue(store.getAllKeys()), requestValue(store.getAll())]);
      return [name, {
        schema: { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: [...store.indexNames].map((name) => { const index = store.index(name); return { name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry }; }) },
        keys, rows: name === "blobs" ? rows.map((row) => ({ ...row, bytes: [...new Uint8Array(row.bytes)] })) : rows,
      }];
    })));
    await done;
    return { version: db.version, stores };
  } finally { if (db !== held) db.close(); }
}

function observeNative({ abortUpgrade }) {
  const originalCreate = IDBDatabase.prototype.createObjectStore;
  const originalOpen = IDBFactory.prototype.open;
  const evidence = { abortUpgrade: abortUpgrade && sessionStorage.getItem("matter-recovery-upgrade-fault") !== "removed", createdBlobs: 0, aborted: 0, upgrades: 0, blocked: 0, successfulUpgradeRequests: 0 };
  window.__matterRecoveryNativeEvidence = evidence;
  window.__matterRecoveryRemoveNativeFault = () => { evidence.abortUpgrade = false; sessionStorage.setItem("matter-recovery-upgrade-fault", "removed"); IDBDatabase.prototype.createObjectStore = originalCreate; };
  IDBDatabase.prototype.createObjectStore = function (...args) {
    const store = originalCreate.apply(this, args);
    if (this.name === "ptoq-matter" && args[0] === "blobs") {
      evidence.createdBlobs += 1;
      if (evidence.abortUpgrade) queueMicrotask(() => { store.transaction.abort(); evidence.aborted += 1; });
    }
    return store;
  };
  IDBFactory.prototype.open = function (...args) {
    const request = originalOpen.apply(this, args);
    if (args[0] === "ptoq-matter" && args[1] === 7) {
      let upgrading = false;
      request.addEventListener("upgradeneeded", () => { upgrading = true; evidence.upgrades += 1; });
      request.addEventListener("blocked", () => { evidence.blocked += 1; });
      request.addEventListener("success", () => { if (upgrading) evidence.successfulUpgradeRequests += 1; });
    }
    return request;
  };
}

async function main() {
  const releaseLock = await acquireE2eRunLock(path.join(root, ".next-e2e.lock"));
  let browser;
  let child;
  let terminator;
  let serverLog;
  let watchdog;
  let emit;
  const contexts = [];
  const failures = [];
  let receivedSignal = null;
  const onSignal = (signal) => { receivedSignal = signal; terminator?.request(signal); void browser?.close().catch(() => undefined); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    await mkdir(path.join(root, "test-results"), { recursive: true });
    const directory = await mkdtemp(path.join(root, "test-results/recovery-next-"));
    const receiptPath = path.join(directory, "receipt.jsonl");
    emit = async (value) => { const line = `${JSON.stringify(value)}\n`; await appendFile(receiptPath, line, { mode: 0o600 }); process.stdout.write(line); };
    const before = await artifactInventory();
    const sourceBefore = await readSourceIdentity();
    const config = JSON.parse(await readFile(path.join(root, ".next/required-server-files.json"), "utf8")).config;
    const variant = config.env?.NEXT_PUBLIC_MATTER_INITIAL_DOCUMENT;
    const treeIds = { expanded: "matter_fixture_rooted_01", root: "matter_fixture_rooted_02", empty: "matter_fixture_empty_01" };
    requireProof(Object.hasOwn(treeIds, variant) && config.basePath === config.env?.NEXT_PUBLIC_MATTER_BASE_PATH && typeof config.basePath === "string", "NEXT_FROZEN_CONFIGURATION_INVALID");
    requireProof(config.distDir === ".next", "NEXT_DIST_DIR_NOT_SUPPORTED");
    const bundled = await build({
      input: path.join(root, "scripts/prove-recovery-next.fixture.ts"), platform: "node", write: false,
      output: { format: "esm", codeSplitting: false }, resolve: { alias: { "@": root } },
      onwarn(warning) { process.stderr.write(`[rolldown:${warning.code}] ${warning.message}\n`); },
    });
    const chunks = bundled.output.filter((entry) => entry.type === "chunk");
    requireProof(chunks.length === 1, "NEXT_ORACLE_NOT_CLOSED");
    const oraclePath = path.join(directory, "fixture-oracle.mjs");
    await writeFile(oraclePath, chunks[0].code, { flag: "wx", mode: 0o600 });
    const oracleSources = [];
    for (const name of [...Object.keys(chunks[0].modules).filter((name) => path.isAbsolute(name) && !name.includes(`${path.sep}node_modules${path.sep}`)), path.join(root, "scripts/prove-recovery-next.mjs"), path.join(root, "scripts/e2e-runner.mjs"), path.join(root, "package.json"), path.join(root, "package-lock.json")].sort()) {
      requireProof(name.startsWith(`${root}${path.sep}`), "NEXT_ORACLE_ESCAPED_REPOSITORY");
      oracleSources.push({ path: path.relative(root, name), sha256: hash(await readFile(name)) });
    }
    const oracle = await import(pathToFileURL(oraclePath).href);
    const fixture = oracle.createNextRecoveryFixture(treeIds[variant]);
    const identity = {
      format: "matter-next-recovery-proof/1", artifactKind: "compiled-next-production-local",
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      buildId: before.buildId, artifactSha256: before.sha256, artifactGroups: before.groupDigests,
      initialDocument: variant, treeId: fixture.treeId, basePath: config.basePath, nodeVersion: process.version,
      sourceIdentity: { ...sourceBefore, sources: undefined }, oracleArtifactSha256: hash(chunks[0].code),
      oracleSourcesSha256: digest(oracleSources), oraclePath, directory, receiptPath,
      sourceBuildAssociationEstablishedByRunner: false, actualReleaseVehicleQualified: false, redeployQualified: false,
      redoEntry: "shipped keyboard only; pointer Undo is exercised", nativeOldVersionRefusalNotOldBinary: true,
    };
    await writeFile(path.join(directory, "artifact-before.json"), `${JSON.stringify(before, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await writeFile(path.join(directory, "identity.json"), `${JSON.stringify({ ...identity, oracleSources }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await emit({ identity, prepareOnly });
    if (prepareOnly) { await emit({ summary: { result: "prepared", browserProofRun: false, productionNextRecoveryQualified: false } }); return; }

    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const basePath = config.basePath;
    const appUrl = `${origin}${basePath || "/"}`;
    const childEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", MATTER_BASE_PATH: basePath, MATTER_INITIAL_DOCUMENT: variant };
    // Explicit empties/off values outrank .env.local without reading its secrets.
    for (const name of Object.keys(childEnv)) if (/^(?:MATTER_|NEXT_PUBLIC_MATTER_)/u.test(name)) delete childEnv[name];
    Object.assign(childEnv, {
      MATTER_BASE_PATH: basePath, MATTER_INITIAL_DOCUMENT: variant,
      MATTER_IMAGE_ADAPTER: "off", MATTER_LABEL_ADAPTER: "off", MATTER_REPAIR_ADAPTER: "off",
      MATTER_INQUIRY_ADAPTER: "off", MATTER_TRANSCRIPTION_ADAPTER: "off", MATTER_TEXT_SWAP_ADAPTER: "off", MATTER_TRANSFORM_ADAPTER: "off",
      MATTER_MODEL_POOL: "", MATTER_LABEL_POOL: "", MATTER_IMAGE_POOL: "", MATTER_PROVIDER_SESSION_KEYS: "",
      MATTER_TEXT_SWAP_SURFACE: "off", MATTER_TRANSFORM_SURFACE: "off",
    });
    const serverLogPath = path.join(directory, "next-server.log");
    serverLog = await open(serverLogPath, "wx", 0o600);
    child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root, env: childEnv, detached: process.platform !== "win32", stdio: ["ignore", serverLog.fd, serverLog.fd],
    });
    const exited = new Promise((resolve) => { child.once("exit", (code, signal) => resolve({ code, signal })); child.once("error", (error) => resolve({ error: error.message })); });
    terminator = createSignalTerminator(createProcessSignalTarget(child));
    watchdog = setTimeout(() => { failures.push("PROOF_DEADLINE_EXCEEDED"); onSignal("SIGTERM"); }, 300_000);
    watchdog.unref();
    let health;
    const readyUntil = Date.now() + 30_000;
    while (Date.now() < readyUntil && !receivedSignal) {
      requireProof(child.exitCode === null && child.signalCode === null, "NEXT_SERVER_EXITED_BEFORE_READY");
      try {
        const response = await fetch(`${origin}${basePath}/api/health`, { signal: AbortSignal.timeout(2_000), redirect: "error" });
        if (response.ok) { health = await response.json(); break; }
      } catch { /* A bounded startup retry has no material or provider side effect. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    requireProof(health?.status === "ok" && health.basePath === basePath, "NEXT_SERVER_NOT_READY");
    for (const name of ["voiceAdmission", "thoughtLabel", "transcriptRepair", "inquiry", "transformTurn", "textSwap", "imageGeneration"]) requireProof(health.surfaces[name] === "unavailable", "MANAGED_SURFACE_NOT_CLOSED");
    // This closed route refuses before adapter resolution/admission/body parsing.
    const refused = await fetch(`${origin}${basePath}/api/image`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5_000), redirect: "error" });
    const refusedBody = await refused.json();
    requireProof(refused.status === 503 && JSON.stringify(refusedBody).includes("IMAGE_UNAVAILABLE"), "IMAGE_ROUTE_NOT_CLOSED");
    browser = await chromium.launch({ headless: true });
    await emit({ runtime: { origin, serverPid: child.pid, serverLogPath, browserVersion: browser.version(), health, imageRefusalStatus: refused.status, imageRefusalCode: "IMAGE_UNAVAILABLE" } });
    const blockedRequests = [];
    const deniedApiRequests = [];
    const pageErrors = [];
    const files = fixture.copy.files;
    const rail = fixture.copy.rail;
    const newContext = async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: "block" });
      contexts.push(context);
      await context.addInitScript(() => {
        localStorage.setItem("matter.canvas-preferences.v1", JSON.stringify({ version: 1, language: "en-US", leafFx: false, appearance: "light" }));
      });
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) { blockedRequests.push({ protocol: url.protocol, resourceType: request.resourceType() }); await route.abort(); return; }
        if (url.pathname.startsWith(`${basePath}/api/`) && (url.pathname !== `${basePath}/api/health` || request.method() !== "GET")) {
          deniedApiRequests.push({ path: url.pathname, method: request.method() }); await route.abort(); return;
        }
        await route.continue();
      });
      await context.routeWebSocket("**/*", (route) => { blockedRequests.push({ protocol: "websocket", resourceType: "websocket" }); route.close(); });
      return context;
    };
    const pageIn = async (context) => {
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on("pageerror", (error) => pageErrors.push(error.message));
      return page;
    };
    const stage = async (context, version, rows, keepOpen = false) => {
      const page = await pageIn(context);
      const url = `${origin}/__matter_recovery_native_seed__`;
      await page.route(url, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Native synthetic storage setup</title>" }));
      await page.goto(url);
      await page.evaluate(seedNative, { version, rows, keepOpen });
      return page;
    };
    const openMatter = async (page) => {
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true", { timeout: 30_000 });
      await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved", { timeout: 30_000 });
    };
    const read = (page) => page.evaluate(readNative);
    const legacyDigest = (value) => digest(Object.fromEntries(Object.entries(value.stores).filter(([name]) => name !== "blobs")));
    const requireEmptyBlobSchema = (value) => requireProof(value.version === 7 && value.stores.blobs?.rows.length === 0 && digest(value.stores.blobs.schema) === digest({
      keyPath: "contentHash", autoIncrement: false,
      indexes: [{ name: "storedAt", keyPath: "storedAt", unique: false, multiEntry: false }],
    }), "NEXT_BLOB_SCHEMA_INVALID");
    const evidence = (value) => ({ version: value.version, digest: digest(value.stores), legacyDigest: legacyDigest(value), stores: Object.fromEntries(Object.entries(value.stores).map(([name, store]) => [name, { rows: store.rows.length, sha256: digest(store), schema: store.schema }])) });
    const inspect = (value) => {
      const row = value.stores.snapshots.rows.find((row) => row.treeId === fixture.treeId);
      requireProof(row !== undefined, "NEXT_ACTIVE_SNAPSHOT_MISSING");
      return oracle.inspectNextSnapshot(row, value.stores.historyEntries.rows);
    };
    const storedAs = async (page, tree) => {
      await expect.poll(async () => digest(inspect(await read(page)).tree), { timeout: 20_000 }).toBe(digest(tree));
      await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
      await expect(page.locator("main.matter-shell")).toHaveAttribute("data-tree-revision", String(tree.revision));
      for (const node of Object.values(tree.nodes).filter((node) => node.role !== "document-root")) {
        await expect(page.locator(`[data-thought-text-id="${node.id}"]`)).toHaveText(node.text);
      }
    };
    const renderedPicture = async (page, pointer) => {
      await expect.poll(() => page.locator('[data-thought-id="a"] .passage-picture img').evaluate(async (element) => {
        if (!element.complete || element.naturalWidth === 0) return null;
        const bytes = await (await fetch(element.src)).arrayBuffer();
        return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
      })).toBe(pointer.contentHash);
    };
    const replay = async (page, expected, image = false) => {
      await storedAs(page, expected.current);
      const initial = inspect(await read(page));
      requireProof(initial.undo > 0 && initial.redo > 0, "NEXT_HISTORY_STACK_MISSING");
      await page.getByRole("button", { name: rail.undoLastChange, exact: true }).click();
      await storedAs(page, expected.undone);
      if (image) await renderedPicture(page, expected.historyOnly.pointer);
      // Redo has no shipped pointer control; do not invent one for this proof.
      await page.keyboard.press("Control+Shift+Z");
      await storedAs(page, expected.replayed);
      if (image) await renderedPicture(page, expected.available.pointer);
      return { initialTreeSha256: digest(expected.current), undoneTreeSha256: digest(expected.undone), replayedTreeSha256: digest(expected.replayed), undoEntry: "pointer", redoEntry: "shipped keyboard", initialUndo: initial.undo, initialRedo: initial.redo };
    };
    const archivePanel = async (page) => {
      const sidebar = page.locator("aside.material-files");
      let panel = sidebar.getByRole("region", { name: files.archivePanel, exact: true });
      if (!await panel.isVisible()) await sidebar.getByRole("button", { name: files.archive, exact: true }).click();
      panel = sidebar.getByRole("region", { name: files.archivePanel, exact: true });
      await expect(panel).toBeVisible();
      return panel;
    };
    const completed = [];
    const run = async (name, work) => {
      try { const result = await work(); completed.push(name); await emit({ recovery: { name, result: "pass", ...result } }); return result; }
      catch (error) { failures.push(name); await emit({ recovery: { name, result: "fail", error: error instanceof Error ? error.message : "unknown" } }); return null; }
    };

    await run("N1", async () => {
      const context = await newContext();
      const setup = await stage(context, 6, fixture.legacy.rows);
      const before = await read(setup);
      const page = await pageIn(context);
      await openMatter(page);
      const after = await read(setup);
      requireEmptyBlobSchema(after);
      requireProof(legacyDigest(before) === legacyDigest(after), "NEXT_UPGRADE_CHANGED_LEGACY_STORES");
      return { before: evidence(before), after: evidence(after), replay: await replay(page, fixture.legacy) };
    });
    await run("N2", async () => {
      const context = await newContext();
      const setup = await stage(context, 6, fixture.legacy.rows, true);
      const before = await read(setup);
      const page = await pageIn(context);
      await page.addInitScript(observeNative, { abortUpgrade: false });
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator("aside.material-files .material-files__profile-meta")).toHaveText(files.durabilityUpgradeBlocked, { timeout: 30_000 });
      const blocked = await read(setup);
      requireProof(blocked.version === 6 && digest(blocked) === digest(before), "NEXT_BLOCKED_UPGRADE_MUTATED_STORAGE");
      await setup.evaluate(() => { window.__matterRecoveryNativeConnection.close(); delete window.__matterRecoveryNativeConnection; });
      await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved", { timeout: 30_000 });
      const observed = await page.evaluate(() => window.__matterRecoveryNativeEvidence);
      requireProof(observed.blocked > 0 && observed.createdBlobs === 1 && observed.upgrades === 1 && observed.successfulUpgradeRequests === 1, "NEXT_BLOCKED_UPGRADE_NOT_ONCE");
      const after = await read(setup);
      requireEmptyBlobSchema(after);
      requireProof(legacyDigest(after) === legacyDigest(before), "NEXT_BLOCKED_HANDOFF_CHANGED_DATA");
      return { before: evidence(before), blocked: evidence(blocked), after: evidence(after), observed, replay: await replay(page, fixture.legacy) };
    });
    await run("N3", async () => {
      const context = await newContext();
      const setup = await stage(context, 6, fixture.legacy.rows);
      const before = await read(setup);
      const page = await pageIn(context);
      await page.addInitScript(observeNative, { abortUpgrade: true });
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "error", { timeout: 30_000 });
      const afterAbort = await read(setup);
      const aborted = await page.evaluate(() => window.__matterRecoveryNativeEvidence);
      requireProof(aborted.aborted > 0 && aborted.createdBlobs === aborted.aborted && afterAbort.version === 6 && afterAbort.stores.blobs === undefined && digest(afterAbort) === digest(before), "NEXT_ABORT_LEFT_PARTIAL_UPGRADE");
      await page.evaluate(() => window.__matterRecoveryRemoveNativeFault());
      // A failed first load has no CAS basis. Retry Saving cannot adopt an
      // unread row; a genuine reload rehydrates it without overwriting it.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved", { timeout: 30_000 });
      const after = await read(setup);
      requireEmptyBlobSchema(after);
      requireProof(legacyDigest(after) === legacyDigest(before), "NEXT_ABORT_RETRY_CHANGED_DATA");
      return { before: evidence(before), afterAbort: evidence(afterAbort), after: evidence(after), aborted, recoveryEntry: "browser reload after removing upgrade fault", retrySavingQualified: false, replay: await replay(page, fixture.legacy) };
    });
    let imagePage;
    let imageSetup;
    await run("N4", async () => {
      const context = await newContext();
      imageSetup = await stage(context, 7, fixture.image.rows);
      const before = await read(imageSetup);
      const refusal = await imageSetup.evaluate(async () => {
        let opened = 0;
        const error = await new Promise((resolve) => {
          const request = indexedDB.open("ptoq-matter", 6);
          request.onsuccess = () => { opened += 1; request.result.close(); resolve("unexpected-success"); };
          request.onerror = () => resolve(request.error?.name);
        });
        return { error, opened };
      });
      const afterRefusal = await read(imageSetup);
      requireProof(refusal.error === "VersionError" && refusal.opened === 0 && digest(before) === digest(afterRefusal), "NEXT_V6_REFUSAL_CHANGED_DB7");
      imagePage = await pageIn(context);
      await openMatter(imagePage);
      await expect(imagePage.locator('[data-thought-id="m"] .passage-picture')).toHaveAttribute("data-picture-state", "absent");
      const replayed = await replay(imagePage, fixture.image, true);
      const after = await read(imageSetup);
      requireProof(digest(after.stores.blobs) === digest(before.stores.blobs), "NEXT_IMAGE_REPLAY_CHANGED_BYTES");
      return { before: evidence(before), afterRefusal: evidence(afterRefusal), refusal, replay: replayed, after: evidence(after), availableHash: fixture.image.available.pointer.contentHash, missingHash: fixture.image.missing.pointer.contentHash, historyOnlyHash: fixture.image.historyOnly.pointer.contentHash };
    });
    await run("N5", async () => {
      requireProof(completed.includes("N4") && imagePage && imageSetup, "NEXT_N4_REQUIRED");
      const beforeExport = await read(imageSetup);
      const panel = await archivePanel(imagePage);
      const downloading = imagePage.waitForEvent("download");
      await panel.getByRole("button", { name: files.archiveExportCopy, exact: true }).click();
      const download = await downloading;
      const archivePath = path.join(directory, "ui-export.matter.zip");
      await download.saveAs(archivePath);
      requireProof(await download.failure() === null, "NEXT_ARCHIVE_DOWNLOAD_FAILED");
      const archiveBytes = new Uint8Array(await readFile(archivePath));
      const exported = await oracle.inspectNextArchive(archiveBytes);
      requireProof(digest(exported.tree) === digest(fixture.image.replayed) && exported.blobs.length === 1 && exported.blobPaths.length === 1 && exported.blobPaths[0] === `matter/blobs/${fixture.image.available.pointer.contentHash}.png` && exported.blobs[0].contentHash === fixture.image.available.pointer.contentHash && digest(exported.blobs[0].bytes) === digest(fixture.image.available.bytes), "NEXT_ARCHIVE_PICTURE_SET_WRONG");
      await expect(panel.locator(".material-files__archive-status")).toHaveText(files.archivePicturesNotExported(1));
      requireProof(digest(await read(imageSetup)) === digest(beforeExport), "NEXT_EXPORT_MUTATED_STORAGE");
      const context = await newContext();
      const page = await pageIn(context);
      await openMatter(page);
      const importing = await archivePanel(page);
      await importing.getByLabel(files.archiveChooseMaterialArchive, { exact: true }).setInputFiles(archivePath);
      await expect(importing).toContainText(files.archiveConfirmReplace);
      await importing.getByRole("button", { name: files.archiveReplace, exact: true }).click();
      await expect(importing).toHaveCount(0);
      await storedAs(page, exported.tree);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
      await storedAs(page, exported.tree);
      const imported = await read(page);
      const state = inspect(imported);
      requireProof(state.undo === 0 && state.redo === 0 && imported.stores.blobs.rows.length === 1 && imported.stores.blobs.rows[0].contentHash === fixture.image.available.pointer.contentHash && digest(imported.stores.blobs.rows[0].bytes) === digest(fixture.image.available.bytes), "NEXT_IMPORT_RELOAD_NOT_EXACT");
      await expect(page.getByRole("button", { name: rail.undoLastChange, exact: true })).toBeDisabled();
      await expect(page.locator('[data-thought-id="a"] .passage-picture')).toHaveAttribute("data-picture-state", "resident");
      await expect(page.locator('[data-thought-id="m"] .passage-picture')).toHaveAttribute("data-picture-state", "absent");
      await renderedPicture(page, fixture.image.available.pointer);
      return { archivePath, archiveSha256: hash(archiveBytes), archiveBytes: archiveBytes.length, currentBlobCount: 1, missingImages: 1, historyOnlyExcluded: true, importedTreeSha256: digest(state.tree), undo: state.undo, redo: state.redo, afterReload: evidence(imported) };
    });
    await Promise.all(contexts.map((context) => context.close()));
    contexts.length = 0;
    terminator.request("SIGTERM");
    await exited;
    const after = await artifactInventory();
    const sourceAfter = await readSourceIdentity();
    const oracleStable = (await Promise.all(oracleSources.map(async (source) => hash(await readFile(path.join(root, source.path))) === source.sha256))).every(Boolean);
    await writeFile(path.join(directory, "artifact-after.json"), `${JSON.stringify(after, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const artifactStable = before.sha256 === after.sha256 && before.buildId === after.buildId;
    const sourceStable = digest(sourceBefore) === digest(sourceAfter) && oracleStable;
    if (!artifactStable || !sourceStable || blockedRequests.length || deniedApiRequests.length || pageErrors.length || receivedSignal) failures.push("STABILITY_OR_RUNTIME_FAILURE");
    await emit({ summary: {
      result: failures.length === 0 && completed.length === 5 ? "pass" : "fail", completed, failures,
      artifactStable, sourceStable, artifactSha256: after.sha256, buildId: after.buildId,
      externalRequests: blockedRequests.length, blockedRequests, deniedApiRequests, pageErrors,
      browserProductOwnerInjection: false, productionNextRecoveryQualified: failures.length === 0 && completed.length === 5,
      sourceBuildAssociationEstablishedByRunner: false, actualReleaseVehicleQualified: false, redeployQualified: false,
    } });
    if (failures.length || completed.length !== 5) process.exitCode = 1;
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : "unknown";
    if (emit) await emit({ summary: { result: "fail", error: message, productionNextRecoveryQualified: false, actualReleaseVehicleQualified: false, redeployQualified: false } });
    else process.stderr.write(`${message}\n`);
  } finally {
    if (watchdog) clearTimeout(watchdog);
    try {
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
      await browser?.close();
      if (child && child.exitCode === null && child.signalCode === null) {
        terminator.request("SIGTERM");
        await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 6_000).unref(); });
      }
    } finally {
      terminator?.clear();
      await serverLog?.close();
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      await releaseLock();
    }
  }
}

await main();
