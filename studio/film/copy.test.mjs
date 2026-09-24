import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FILM_COPY, parseFilmCopy } from "./copy.mjs";

test("loads one frozen versioned film copy contract from Markdown", async () => {
  const markdown = await readFile(new URL("./copy.md", import.meta.url), "utf8");
  assert.deepEqual(parseFilmCopy(markdown), FILM_COPY);
  assert.ok(Object.isFrozen(FILM_COPY));
  assert.ok(Object.isFrozen(FILM_COPY.ui));
});

test("rejects a missing marker, duplicate marker, malformed JSON, and contract drift", () => {
  assert.throws(() => parseFilmCopy("# Missing"), /exactly one versioned marker/u);
  const valid = `<!-- matter-film-copy:v1 -->\n\n\`\`\`json\n${JSON.stringify(FILM_COPY)}\n\`\`\``;
  assert.throws(() => parseFilmCopy(`${valid}\n<!-- matter-film-copy:v1 -->`), /exactly one/u);
  assert.throws(
    () => parseFilmCopy("<!-- matter-film-copy:v1 -->\n\n```json\n{\n```"),
    /invalid JSON/u,
  );
  assert.throws(
    () => parseFilmCopy(valid.replace('"version":1', '"version":2')),
    /unsupported version/u,
  );
  assert.throws(
    () => parseFilmCopy(valid.replace('"title":', '"unexpected":"drift","title":')),
    /keys do not match/u,
  );
});
