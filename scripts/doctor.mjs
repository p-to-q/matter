import { access, glob, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

const requiredFiles = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "AGENTS.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "docs/index.md",
  "docs/product.md",
  "docs/principles.md",
  "docs/material.md",
  "docs/architecture.md",
  "docs/protocol.md",
  "docs/engineering.md",
  "docs/workflow.md",
  "docs/surfaces.md",
  "docs/release-readiness.md",
  "docs/open.md",
  "docs/changes.md",
  "docs/reference/index.md",
  "plans/active-tree-material.md",
  "app/icon1.png",
  "app/icon2.png",
  "app/icon3.png",
  "app/icon4.png",
  "app/apple-icon.png",
  "features/matter/brand/assets/slate-bone-master-1024.png",
  "features/matter/brand/assets/brand-assets.json",
];

const missing = [];
for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    missing.push(file);
  }
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const config = await readFile("next.config.ts", "utf8");
const problems = [];

if (missing.length > 0) problems.push(`Missing files: ${missing.join(", ")}`);
if (packageJson.license !== "UNLICENSED") {
  problems.push("package.json license must match LICENSE.");
}
if (packageJson.private !== true) {
  problems.push("package.json must stay private to block accidental publication.");
}
if (!config.includes('?? "/matter"')) {
  problems.push("The default /matter base path is missing from next.config.ts.");
}
if (!config.includes("MATTER_BASE_PATH")) {
  problems.push("next.config.ts must expose the Matter-native base path name.");
}

const brandIconSizes = new Map([
  ["app/icon1.png", 16],
  ["app/icon2.png", 32],
  ["app/icon3.png", 192],
  ["app/icon4.png", 512],
  ["app/apple-icon.png", 180],
  ["features/matter/brand/assets/slate-bone-master-1024.png", 1024],
]);
let brandPlatformIconBytes = 0;
for (const [file, expectedSize] of brandIconSizes) {
  try {
    const bytes = await readFile(file);
    if (file.startsWith("app/")) brandPlatformIconBytes += bytes.length;
    const isPng = bytes.length >= 24
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const width = isPng ? bytes.readUInt32BE(16) : 0;
    const height = isPng ? bytes.readUInt32BE(20) : 0;
    if (!isPng || width !== expectedSize || height !== expectedSize) {
      problems.push(`${file} must be a ${expectedSize}x${expectedSize} PNG.`);
    }
  } catch {
    // The required-file check reports the missing asset once.
  }
}
if (brandPlatformIconBytes > 512 * 1_024) {
  problems.push(
    `Platform brand icons use ${brandPlatformIconBytes} bytes; budget is 524288.`,
  );
}
const unexpectedBrandIcons = [];
for (const pattern of ["app/icon*", "app/apple-icon*", "app/favicon.ico"]) {
  for await (const file of glob(pattern)) {
    if (!brandIconSizes.has(file) && await hasMaterialContent(file)) {
      unexpectedBrandIcons.push(file);
    }
  }
}
if (unexpectedBrandIcons.length > 0) {
  problems.push(
    `Unexpected Matter metadata icons found: ${[...new Set(unexpectedBrandIcons)].sort().join(", ")}.`,
  );
}
for (const file of [
  "app/icon.svg",
  "app/apple-icon.tsx",
  "app/icon-192.png",
  "app/icon-512.png",
  "features/matter/brand/icon-image.tsx",
  "features/matter/brand/icon-mark.ts",
]) {
  if (await hasMaterialContent(file)) {
    problems.push(`Provisional Matter brand asset returned: ${file}.`);
  }
}

async function hasMaterialContent(path) {
  try {
    const value = await stat(path);
    return value.isFile() || (value.isDirectory() && (await readdir(path)).length > 0);
  } catch {
    return false;
  }
}

try {
  const manifest = JSON.parse(
    await readFile("features/matter/brand/assets/brand-assets.json", "utf8"),
  );
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const assetsByFile = new Map(assets.map((asset) => [asset?.file, asset]));
  if (manifest.version !== 1 || assets.length !== brandIconSizes.size) {
    problems.push("Matter brand asset manifest must use version 1 and list every approved asset once.");
  }
  for (const [file, expectedSize] of brandIconSizes) {
    const asset = assetsByFile.get(file);
    if (
      asset?.size !== expectedSize
      || typeof asset?.profile !== "string"
      || !/^[a-f0-9]{64}$/u.test(asset?.sha256 ?? "")
      || !/^[a-f0-9]{64}$/u.test(asset?.pixelSha256 ?? "")
    ) {
      problems.push(`${file} has an invalid Matter brand asset manifest entry.`);
      continue;
    }
    const bytes = await readFile(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== asset.sha256) {
      problems.push(`${file} differs from the approved Matter brand asset digest.`);
    }
  }
} catch {
  // The required-file check reports a missing manifest; malformed JSON is separate.
  problems.push("Matter brand asset manifest must be valid JSON.");
}

const forbiddenRuntimeGlobs = [
  "features/arrow/**",
  "app/api/arrow/**",
];
const forbiddenRuntimeFiles = [];
for await (const file of glob(forbiddenRuntimeGlobs)) {
  forbiddenRuntimeFiles.push(file);
}
if (forbiddenRuntimeFiles.length > 0) {
  problems.push(`Retired Arrow runtime files found: ${forbiddenRuntimeFiles.join(", ")}`);
}

for (const file of ["next.config.ts", ".env.example"]) {
  const source = await readFile(file, "utf8");
  if (/ARROW_|NEXT_PUBLIC_ARROW|OPENAI_ARROW/.test(source)) {
    problems.push(`Retired Arrow configuration found in ${file}.`);
  }
}

// ADRs were retired in the 0.2 refresh; durable decisions go to docs/changes.md.
// Archived ADRs stay readable under archive/, but new ones must not reappear.
const strayAdrs = [];
for await (const file of glob("{docs,decisions,plans}/**/ADR-*.md")) {
  strayAdrs.push(file);
}
if (strayAdrs.length > 0) {
  problems.push(
    `ADRs are retired; record durable decisions in docs/changes.md: ${strayAdrs.join(", ")}`,
  );
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`doctor: ${requiredFiles.length} repository files present`);
}
