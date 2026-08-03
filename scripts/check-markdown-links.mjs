import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ignoredDirectories = new Set([".git", ".next", "node_modules", "test-results"]);

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }

  return files;
}

const failures = [];
const files = await markdownFiles(process.cwd());

for (const file of files) {
  const markdown = await readFile(file, "utf8");
  const links = [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(
    (match) => match[1],
  );

  for (const link of links) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const path = resolve(dirname(file), decodeURI(link.split("#")[0]));
    try {
      await stat(path);
    } catch {
      failures.push(`${file}: ${link}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Broken local Markdown links:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`docs: ${files.length} Markdown files have valid local links`);
}
