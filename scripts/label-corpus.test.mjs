import assert from "node:assert/strict";
import test from "node:test";

import { corpus, CORPUS_VERSION, contentDigest } from "./label-corpus.mjs";

// The 12 required material classes (spec 5.1.1 rule 2). Each class maps to
// the corpus ids that cover it; coverage is ≥1 entry per class.
const CLASS_COVERAGE = {
  "probe-canary-sourced material": [
    "canary-sourced-absence",
    "canary-sourced-outline",
    "canary-sourced-footsteps",
  ],
  "chinese long contrast / self-correction": ["contrast-long", "self-correcting"],
  "spoken filler": ["spoken-contrast"],
  "parent-context dependent": ["context-dependent"],
  "sibling collision": ["sibling-collision"],
  "question": ["question"],
  "action item": ["task"],
  "already short": ["already-short"],
  "quotation": ["quote"],
  "list": ["list"],
  "mixed script with stable identifier": ["mixed-script"],
  "long english": ["latin-long"],
};

test("every corpus entry is well-formed", () => {
  for (const entry of corpus) {
    assert.ok(typeof entry.id === "string" && entry.id.length > 0, `id missing on entry`);
    assert.ok(typeof entry.text === "string" && entry.text.length > 0, `text missing: ${entry.id}`);
    assert.ok(typeof entry.expect === "string" && entry.expect.length > 0, `expect missing: ${entry.id}`);
    if (entry.context !== undefined) {
      assert.ok(typeof entry.context === "object", `context not object: ${entry.id}`);
    }
  }
});

test("corpus ids are unique", () => {
  const ids = corpus.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate corpus id");
});

test("every required material class has at least one entry", () => {
  const ids = new Set(corpus.map((entry) => entry.id));
  assert.equal(Object.keys(CLASS_COVERAGE).length, 12, "exactly 12 classes required");
  for (const [className, coveringIds] of Object.entries(CLASS_COVERAGE)) {
    const present = coveringIds.filter((id) => ids.has(id));
    assert.ok(
      present.length >= 1,
      `class "${className}" uncovered; expected ≥1 of ${coveringIds.join(", ")}`,
    );
  }
});

test("corpus version is advanced and content digest is locally reproducible", () => {
  assert.equal(CORPUS_VERSION, "label-corpus/2", "corpus version advanced to v2");
  const first = contentDigest();
  const second = contentDigest();
  assert.equal(first, second, "digest is deterministic across calls");
  assert.ok(/^[0-9a-f]{64}$/u.test(first), "digest is a sha256 hex string");
});