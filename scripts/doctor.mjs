import { access, glob, readFile } from "node:fs/promises";

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
  "docs/open.md",
  "docs/changes.md",
  "docs/reference/index.md",
  "plans/active-tree-material.md",
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
if (packageJson.license !== "Apache-2.0") {
  problems.push("package.json license must match LICENSE.");
}
if (!config.includes('?? "/matter"')) {
  problems.push("The default /matter base path is missing from next.config.ts.");
}
if (!config.includes("MATTER_BASE_PATH")) {
  problems.push("next.config.ts must expose the Matter-native base path name.");
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
