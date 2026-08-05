import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkMarkdownLinks,
  findMarkdownLinks,
} from "./check-markdown-links.mjs";

test("finds balanced destinations and removes optional titles", () => {
  assert.deepEqual(
    findMarkdownLinks(
      '[parentheses](a_(b).md) and [titled](guide.md "Read this")',
    ),
    ["a_(b).md", "guide.md"],
  );
});

test("ignores links inside fenced and inline code", () => {
  const markdown = [
    "```markdown",
    "[fenced](missing-fenced.md)",
    "```",
    "`[inline](missing-inline.md)`",
    "[real](present.md)",
  ].join("\n");

  assert.deepEqual(findMarkdownLinks(markdown), ["present.md"]);
});

test("keeps escaped backticks and nested image targets visible", () => {
  assert.deepEqual(
    findMarkdownLinks(
      "\\` [actual](missing.md) \\` [![image](missing.png)](present.md)",
    ),
    ["missing.md", "missing.png", "present.md"],
  );
});

test("closes code spans after backslashes without scanning link titles", () => {
  assert.deepEqual(findMarkdownLinks("`[inside](missing.md)\\`"), []);
  assert.deepEqual(
    findMarkdownLinks('[outer](present.md "[fake](missing.md)")'),
    ["present.md"],
  );
});

test("checks parsed local destinations and still reports missing targets", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "matter-markdown-links-"));
  t.after(() => rm(directory, { force: true, recursive: true }));

  await writeFile(join(directory, "a_(b).md"), "# Parentheses\n");
  await writeFile(join(directory, "titled.md"), "# Titled\n");
  const source = join(directory, "README.md");
  await writeFile(
    source,
    [
      "[parentheses](a_(b).md)",
      '[title](titled.md "Optional title")',
      "```markdown",
      "[fenced](missing-fenced.md)",
      "```",
      "`[inline](missing-inline.md)`",
      "[missing](actually-missing.md)",
    ].join("\n"),
  );

  const { failures } = await checkMarkdownLinks(directory);

  assert.deepEqual(failures, [`${source}: actually-missing.md`]);
});
