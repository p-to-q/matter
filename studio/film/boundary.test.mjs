import assert from "node:assert/strict";
import test from "node:test";
import { inspectFilmBoundary } from "./boundary.mjs";

const required = [
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
].map((file) => `studio/film/${file}`);

function validBoundary() {
  const attachment = "https://github.com/user-attachments/assets/current-film";
  return {
    files: [...required],
    sources: Object.fromEntries(required.map((file) => [
      file.slice("studio/film/".length),
      file === "studio/film/receipt.md"
        ? `# Receipt\n\n${attachment}`
        : file.endsWith(".md")
          ? `# Material\n\n${"\u6587\u5b57"}`
          : "export const material = true;",
    ])),
    packageJson: { scripts: { "film:capture": "node studio/film/render.mjs" } },
    nextConfig: 'outputFileTracingExcludes: { "/*": ["./studio/**/*"] }',
    vercelIgnore: "studio/\n",
    rootReadme: `# Matter\n\n${attachment}\n`,
  };
}

test("accepts one complete source-only film studio outside deployment", () => {
  assert.deepEqual(inspectFilmBoundary(validBoundary()), []);
});

test("rejects incomplete source, tracked media, localized code, and packaging drift", () => {
  const value = validBoundary();
  value.files = value.files.filter((file) => !file.endsWith("capture.ts"));
  value.files.push("studio/film/old-take.mp4");
  value.sources["fixture.ts"] = `export const material = '${"\u6587\u5b57"}';`;
  value.packageJson.scripts["film:capture"] = "node scripts/capture.mjs";
  value.nextConfig = "export default {}";
  value.vercelIgnore = "tmp/\n";
  value.rootReadme = "# Matter\n";
  const failures = inspectFilmBoundary(value).join("\n");
  assert.match(failures, /missing capture\.ts/u);
  assert.match(failures, /old-take\.mp4/u);
  assert.match(failures, /localized copy escaped Markdown/u);
  assert.match(failures, /isolated studio renderer/u);
  assert.match(failures, /\.vercelignore/u);
  assert.match(failures, /output tracing/u);
  assert.match(failures, /exactly one current film attachment/u);
});
