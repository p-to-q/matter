import { describe, expect, it } from "vitest";
import {
  MAX_WIKI_CANONICAL_CODE_POINTS,
  MAX_WIKI_FORM_CODE_POINTS,
  type WikiMatchRule,
} from "./wiki-model";
import {
  MAX_COMPILED_WIKI_CODE_POINTS,
  MAX_COMPILED_WIKI_RULES,
  compileWikiRules,
} from "./wiki-compiler";

function rule(
  form: string,
  canonical: string,
  overrides: Partial<WikiMatchRule> = {},
): WikiMatchRule {
  return {
    locale: "en-US",
    channel: "written",
    boundary: "literal",
    form,
    canonical,
    authority: "confirmed",
    provenance: "human-confirmed",
    score: 1,
    ...overrides,
  };
}

describe("compileWikiRules", () => {
  it("builds independent spoken and written views", () => {
    const compiled = compileWikiRules([
      rule("open eye", "OpenAI", { channel: "spoken" }),
      rule("open ai", "OpenAI", { channel: "written" }),
    ], 7);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.snapshot.generation).toBe(7);
    expect(compiled.snapshot.views["en-US"].spoken.ruleCount).toBe(1);
    expect(compiled.snapshot.views["en-US"].written.ruleCount).toBe(1);
    expect(compiled.snapshot.stats.ruleCount).toBe(2);
  });

  it("keeps identical forms isolated by locale", () => {
    const compiled = compileWikiRules([
      rule("gift", "present", { locale: "en-US" }),
      rule("gift", "poison", { locale: "de-DE" }),
    ], 8);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.snapshot.views["en-US"].written.ruleCount).toBe(1);
    expect(compiled.snapshot.views["de-DE"].written.ruleCount).toBe(1);
    expect(compiled.snapshot.views["ja-JP"].written.ruleCount).toBe(0);
  });

  it("deduplicates identical matching rules without consulting evidence metadata", () => {
    const compiled = compileWikiRules([
      rule("matter", "Matter"),
      rule("matter", "Matter", {
        authority: "provisional",
        provenance: "aggregate-evidence",
        score: 0.91,
      }),
    ], 1);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.snapshot.rules).toHaveLength(1);
    expect(compiled.snapshot.rules[0].sourceIndex).toBe(0);
  });

  it("rejects a channel-form conflict deterministically", () => {
    const compiled = compileWikiRules([
      rule("murmur", "Murmur"),
      rule("murmur", "MURMUR"),
      rule("other", "Other"),
    ], 2);

    expect(compiled).toEqual({
      ok: false,
      issues: [{
        code: "CONFLICT",
        ruleIndexes: [0, 1],
        message: "One Wiki locale, channel, and form cannot resolve to multiple boundaries or canonical forms.",
      }],
    });
  });

  it("treats two boundaries for one channel-form as a conflict", () => {
    const compiled = compileWikiRules([
      rule("AI", "A.I.", { boundary: "literal" }),
      rule("AI", "A.I.", { boundary: "word" }),
    ], 2);

    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.issues.map((candidate) => candidate.code)).toEqual(["CONFLICT"]);
  });

  it("rejects non-NFC and otherwise invalid descriptors", () => {
    const compiled = compileWikiRules([
      rule("e\u0301", "é"),
      rule("same", "same"),
    ], 3);

    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.issues).toMatchObject([
      { code: "INVALID_RULE", ruleIndexes: [0] },
      { code: "INVALID_RULE", ruleIndexes: [1] },
    ]);
    expect(compiled).not.toHaveProperty("snapshot");
  });

  it("fails before traversing a collection beyond the rule bound", () => {
    const repeated = Array.from(
      { length: MAX_COMPILED_WIKI_RULES + 1 },
      () => rule("alias", "Canonical"),
    );
    const compiled = compileWikiRules(repeated, 0);

    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.issues.map((candidate) => candidate.code)).toEqual(["TOO_MANY_RULES"]);
  });

  it("keeps the operational corpus below the theoretical collection maximum", () => {
    expect(MAX_COMPILED_WIKI_CODE_POINTS).toBeLessThan(
      MAX_COMPILED_WIKI_RULES *
      (MAX_WIKI_FORM_CODE_POINTS + MAX_WIKI_CANONICAL_CODE_POINTS),
    );
    const oversized = Array.from({ length: 1_334 }, (_, index) => {
      const prefix = `f${index.toString().padStart(4, "0")}`;
      return rule(
        prefix.padEnd(MAX_WIKI_FORM_CODE_POINTS, "x"),
        "C".repeat(MAX_WIKI_CANONICAL_CODE_POINTS),
      );
    });
    const compiled = compileWikiRules(oversized, 0);

    expect(compiled).toMatchObject({
      ok: false,
      issues: [{ code: "CORPUS_TOO_LARGE" }],
    });
  });

  it("rejects an invalid generation and freezes a valid compiled snapshot", () => {
    expect(compileWikiRules([], -1)).toMatchObject({
      ok: false,
      issues: [{ code: "INVALID_GENERATION" }],
    });

    const compiled = compileWikiRules([rule("wiki", "Wiki")], 4);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(Object.isFrozen(compiled.snapshot)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.rules)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.views)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.views["en-US"])).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.views["en-US"].written.nodes)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.views["en-US"].written.nodes[0].edges)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.stats)).toBe(true);
  });
});
