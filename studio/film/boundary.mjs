import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const studioRoot = "studio/film";
const forbiddenMediaPattern = /\.(?:m4a|mov|mp3|mp4|wav|webm)$/iu;
const markdownPattern = /\.md$/iu;
const hanPattern = /\p{Script=Han}/u;
const attachmentPattern = /https:\/\/github\.com\/user-attachments\/assets\/[a-zA-Z0-9-]+/gu;
const requiredFiles = Object.freeze([
  "README.md",
  "boundary.mjs",
  "boundary.test.mjs",
  "capture.ts",
  "copy.d.mts",
  "copy.md",
  "copy.mjs",
  "copy.test.mjs",
  "fixture.test.ts",
  "fixture.ts",
  "playwright.config.ts",
  "receipt.md",
  "render.mjs",
  "render.test.mjs",
  "start-server.mjs",
]);

export function inspectFilmBoundary({ files, sources, packageJson, nextConfig, vercelIgnore, rootReadme }) {
  const failures = [];
  const studioFiles = files
    .filter((file) => file.startsWith(`${studioRoot}/`))
    .map((file) => file.slice(studioRoot.length + 1));
  for (const file of requiredFiles) {
    if (!studioFiles.includes(file)) failures.push(`Film studio is missing ${file}.`);
  }
  for (const file of studioFiles.filter((entry) => forbiddenMediaPattern.test(entry))) {
    failures.push(`Film media must be a reviewed Markdown attachment, not tracked source: ${file}.`);
  }
  for (const [file, source] of Object.entries(sources)) {
    if (!markdownPattern.test(file) && hanPattern.test(source)) {
      failures.push(`Film localized copy escaped Markdown into ${file}.`);
    }
  }
  if (packageJson?.scripts?.["film:capture"] !== "node studio/film/render.mjs") {
    failures.push("film:capture must enter through the isolated studio renderer.");
  }
  if (!/^studio\/$/mu.test(vercelIgnore)) {
    failures.push(".vercelignore must exclude the complete studio directory.");
  }
  if (!nextConfig.includes('"./studio/**/*"')) {
    failures.push("Next output tracing must exclude the complete studio directory.");
  }
  const attachments = rootReadme.match(attachmentPattern) ?? [];
  if (attachments.length !== 1) {
    failures.push("The root README must contain exactly one current film attachment.");
  } else if (!sources["receipt.md"]?.includes(attachments[0])) {
    failures.push("The film receipt must identify the current README attachment.");
  }
  return Object.freeze(failures);
}

export async function readFilmBoundary(root = process.cwd()) {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root },
  );
  const files = stdout.split(/\r?\n/u).filter(Boolean);
  const studioFiles = files.filter((file) => file.startsWith(`${studioRoot}/`));
  const sourceEntries = await Promise.all(studioFiles.map(async (file) => [
    file.slice(studioRoot.length + 1),
    await readFile(resolve(root, file), "utf8"),
  ]));
  return Object.freeze({
    files: Object.freeze(files),
    sources: Object.freeze(Object.fromEntries(sourceEntries)),
    packageJson: JSON.parse(await readFile(resolve(root, "package.json"), "utf8")),
    nextConfig: await readFile(resolve(root, "next.config.ts"), "utf8"),
    vercelIgnore: await readFile(resolve(root, ".vercelignore"), "utf8"),
    rootReadme: await readFile(resolve(root, "README.md"), "utf8"),
  });
}

async function main() {
  const failures = inspectFilmBoundary(await readFilmBoundary());
  if (failures.length > 0) {
    console.error(failures.map((failure) => `film-boundary: ${failure}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("film-boundary: source complete; copy Markdown-only; 0 tracked media; deployment excluded");
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`film-boundary: ${error instanceof Error ? error.message : "inspection failed"}`);
    process.exitCode = 1;
  });
}
