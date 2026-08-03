import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "AGENTS.md",
  "PROMPT.md",
  "WORKFLOW.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "docs/index.md",
  "docs/project-brief.md",
  "docs/engineering-discipline.md",
  "docs/surfaces.md",
  "docs/verification.md",
  "docs/source-ledger.md",
  "decisions/ADR-0001-standalone-base-path-app.md",
  "decisions/ADR-0002-public-actions-private-mutations.md",
  "decisions/ADR-0003-dom-material-and-local-feedback.md",
  "decisions/ADR-0004-discriminate-create-and-transform-turns.md",
  "decisions/ADR-0005-rename-product-to-matter.md",
  "plans/active-elastic-language.md",
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

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`doctor: ${requiredFiles.length} repository contracts present`);
}
