import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// `archive` is excluded on purpose: archived documents are preserved as they
// were written, including links to the sibling paths they had at the time.
// Editing them to satisfy a link checker would falsify the trace they exist for.
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "test-results",
  "archive",
]);

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

function maskRange(characters, start, end) {
  for (let index = start; index < end; index += 1) {
    if (characters[index] !== "\n" && characters[index] !== "\r") {
      characters[index] = " ";
    }
  }
}

function maskFencedCode(markdown) {
  const characters = markdown.split("");
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let fence = null;
  let offset = 0;

  for (const lineWithEnding of lines) {
    const line = lineWithEnding.endsWith("\n")
      ? lineWithEnding.slice(0, -1)
      : lineWithEnding;

    if (fence) {
      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*\r?$/);
      maskRange(characters, offset, offset + lineWithEnding.length);
      if (
        closing &&
        closing[1][0] === fence.marker &&
        closing[1].length >= fence.length
      ) {
        fence = null;
      }
    } else {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (opening) {
        fence = { marker: opening[1][0], length: opening[1].length };
        maskRange(characters, offset, offset + lineWithEnding.length);
      }
    }

    offset += lineWithEnding.length;
  }

  return characters.join("");
}

function isEscaped(markdown, index) {
  let backslashes = 0;
  for (let cursor = index - 1; markdown[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function maskInlineCode(markdown) {
  const characters = markdown.split("");
  let index = 0;

  while (index < markdown.length) {
    if (markdown[index] !== "`" || isEscaped(markdown, index)) {
      index += 1;
      continue;
    }

    let openingEnd = index + 1;
    while (markdown[openingEnd] === "`") openingEnd += 1;
    const delimiterLength = openingEnd - index;
    let cursor = openingEnd;
    let closingEnd = -1;

    while (cursor < markdown.length) {
      if (markdown[cursor] !== "`") {
        cursor += 1;
        continue;
      }

      let runEnd = cursor + 1;
      while (markdown[runEnd] === "`") runEnd += 1;
      if (runEnd - cursor === delimiterLength) {
        closingEnd = runEnd;
        break;
      }
      cursor = runEnd;
    }

    if (closingEnd === -1) {
      index = openingEnd;
      continue;
    }

    maskRange(characters, index, closingEnd);
    index = closingEnd;
  }

  return characters.join("");
}

function maskCode(markdown) {
  return maskInlineCode(maskFencedCode(markdown));
}

function findLabelEnd(markdown, start) {
  let depth = 1;

  for (let index = start; index < markdown.length; index += 1) {
    if (markdown[index] === "\\") {
      index += 1;
      continue;
    }
    if (markdown[index] === "[") depth += 1;
    if (markdown[index] !== "]") continue;
    depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function skipWhitespace(markdown, start) {
  let index = start;
  while (index < markdown.length && /\s/.test(markdown[index])) index += 1;
  return index;
}

function findDelimitedEnd(markdown, start, delimiter) {
  for (let index = start; index < markdown.length; index += 1) {
    if (markdown[index] === "\\") {
      index += 1;
      continue;
    }
    if (markdown[index] === delimiter) return index;
  }

  return -1;
}

function parseLinkDestination(markdown, start) {
  let index = skipWhitespace(markdown, start);
  let destination;

  if (markdown[index] === "<") {
    const destinationEnd = findDelimitedEnd(markdown, index + 1, ">");
    if (destinationEnd === -1) return null;
    destination = markdown.slice(index + 1, destinationEnd);
    index = destinationEnd + 1;
  } else {
    const destinationStart = index;
    let parenthesisDepth = 0;

    while (index < markdown.length) {
      if (markdown[index] === "\\") {
        index += 2;
        continue;
      }
      if (/\s/.test(markdown[index])) break;
      if (markdown[index] === "(") {
        parenthesisDepth += 1;
        index += 1;
        continue;
      }
      if (markdown[index] === ")") {
        if (parenthesisDepth === 0) break;
        parenthesisDepth -= 1;
      }
      index += 1;
    }

    if (index === destinationStart || parenthesisDepth !== 0) return null;
    destination = markdown.slice(destinationStart, index);
  }

  const suffixStart = index;
  index = skipWhitespace(markdown, index);
  if (markdown[index] === ")") {
    return { destination, end: index + 1 };
  }
  if (index === suffixStart) return null;

  const titleOpening = markdown[index];
  const titleClosing = titleOpening === "(" ? ")" : titleOpening;
  if (titleOpening !== '"' && titleOpening !== "'" && titleOpening !== "(") {
    return null;
  }

  const titleEnd = findDelimitedEnd(markdown, index + 1, titleClosing);
  if (titleEnd === -1) return null;
  index = skipWhitespace(markdown, titleEnd + 1);
  if (markdown[index] !== ")") return null;

  return { destination, end: index + 1 };
}

function findLinksInSource(source) {
  const links = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[") continue;
    const labelEnd = findLabelEnd(source, index + 1);
    if (labelEnd === -1 || source[labelEnd + 1] !== "(") continue;

    const parsed = parseLinkDestination(source, labelEnd + 2);
    if (!parsed) continue;
    links.push(...findLinksInSource(source.slice(index + 1, labelEnd)));
    links.push(parsed.destination);
    index = parsed.end - 1;
  }

  return links;
}

export function findMarkdownLinks(markdown) {
  return findLinksInSource(maskCode(markdown));
}

export async function checkMarkdownLinks(directory) {
  const failures = [];
  const files = await markdownFiles(directory);

  for (const file of files) {
    const markdown = await readFile(file, "utf8");

    for (const link of findMarkdownLinks(markdown)) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const path = resolve(dirname(file), decodeURI(link.split("#")[0]));
      try {
        await stat(path);
      } catch {
        failures.push(`${file}: ${link}`);
      }
    }
  }

  return { failures, files };
}

async function main() {
  const { failures, files } = await checkMarkdownLinks(process.cwd());

  if (failures.length > 0) {
    console.error(`Broken local Markdown links:\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`docs: ${files.length} Markdown files have valid local links`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
