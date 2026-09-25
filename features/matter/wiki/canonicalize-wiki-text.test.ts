import { describe, expect, it } from "vitest";
import type { WikiChannel, WikiMatchRule } from "./wiki-model";
import type { MatterLocale } from "../config/locales";
import { compileWikiRules, type CompiledWikiSnapshot } from "./wiki-compiler";
import {
  canonicalizeWikiText,
  wikiCanonicalizationOperationBudget,
} from "./canonicalize-wiki-text";

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

function snapshot(rules: readonly WikiMatchRule[]): CompiledWikiSnapshot {
  const compiled = compileWikiRules(rules, 11);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  return compiled.snapshot;
}

function apply(
  compiled: CompiledWikiSnapshot,
  channel: WikiChannel,
  text: string,
  locale: MatterLocale = "en-US",
) {
  return canonicalizeWikiText(compiled, locale, channel, text);
}

describe("canonicalizeWikiText", () => {
  it("keeps spoken and written rules in separate views", () => {
    const compiled = snapshot([
      rule("open eye", "OpenAI", { channel: "spoken" }),
      rule("open eye", "open-eye", { channel: "written" }),
    ]);

    expect(apply(compiled, "spoken", "open eye").text).toBe("OpenAI");
    expect(apply(compiled, "written", "open eye").text).toBe("open-eye");
  });

  it("never applies an identical form across locales", () => {
    const compiled = snapshot([
      rule("gift", "present", { locale: "en-US" }),
      rule("gift", "poison", { locale: "de-DE" }),
    ]);

    expect(apply(compiled, "written", "gift", "en-US").text).toBe("present");
    expect(apply(compiled, "written", "gift", "de-DE").text).toBe("poison");
    expect(apply(compiled, "written", "gift", "ja-JP").text).toBe("gift");
  });

  it("uses leftmost-longest matches and applies every disjoint occurrence", () => {
    const compiled = snapshot([
      rule("open", "OPEN"),
      rule("open ai", "OpenAI"),
    ]);
    const result = apply(compiled, "written", "open ai and open");

    expect(result.text).toBe("OpenAI and OPEN");
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]).toMatchObject({ start: 0, end: 7 });
    expect(result.edits[1]).toMatchObject({ start: 12, end: 16 });
  });

  it("never cascades a replacement through another rule", () => {
    const compiled = snapshot([
      rule("foo", "bar"),
      rule("bar", "baz"),
    ]);

    expect(apply(compiled, "written", "foo bar").text).toBe("bar baz");
  });

  it("applies matches only when the complete form is inside an eligible range", () => {
    const compiled = snapshot([rule("matter", "Matter")]);
    const text = "matter and matter";

    expect(canonicalizeWikiText(compiled, "en-US", "written", text, {
      eligibleRanges: [{ start: 11, end: 17 }],
    }).text).toBe("matter and Matter");
    expect(canonicalizeWikiText(compiled, "en-US", "written", text, {
      eligibleRanges: [{ start: 2, end: 17 }],
    }).text).toBe("matter and Matter");
    expect(canonicalizeWikiText(compiled, "en-US", "written", text, {
      eligibleRanges: [{ start: 8, end: 3 }],
    }).status).toBe("invalid-text");
  });

  it("honours explicit Unicode word boundaries", () => {
    const compiled = snapshot([
      rule("cat", "feline", { boundary: "word" }),
      rule("résumé", "CV", { boundary: "word" }),
    ]);

    expect(apply(compiled, "written", "cat scatter cat").text)
      .toBe("feline scatter feline");
    expect(apply(compiled, "written", "présumé résumé").text)
      .toBe("présumé CV");
  });

  it("allows an explicit literal rule inside continuous CJK text", () => {
    const compiled = snapshot([rule("智谱", "Wiki")]);
    expect(apply(compiled, "written", "本地智谱层").text).toBe("本地Wiki层");
  });

  it("matches NFC-equivalent graphemes without rewriting unmatched text", () => {
    const compiled = snapshot([
      rule("é", "E"),
      rule("👩‍💻", "developer"),
    ]);
    const text = `Cafe\u0301 x👩‍💻 y`;
    const result = apply(compiled, "written", text);

    expect(result.text).toBe("CafE xdeveloper y");
    expect(result.edits.map(({ start, end }) => [start, end])).toEqual([
      [3, 5],
      [7, 12],
    ]);
  });

  it("protects URLs, email, code, paths, versions, and quoted literals", () => {
    const compiled = snapshot([
      rule("matter", "Matter"),
      rule("1.2", "version-one-two"),
    ]);
    const text = [
      "matter",
      "\"matter\"",
      "“matter”",
      "`matter`",
      "```matter```",
      "https://matter.dev/matter",
      "person@matter.dev",
      "/matter/file",
      "C:\\matter\\file",
      "v1.2",
      "matter",
    ].join(" ");

    expect(apply(compiled, "written", text).text).toBe([
      "Matter",
      "\"matter\"",
      "“matter”",
      "`matter`",
      "```matter```",
      "https://matter.dev/matter",
      "person@matter.dev",
      "/matter/file",
      "C:\\matter\\file",
      "v1.2",
      "Matter",
    ].join(" "));
  });

  it("protects flags, IP addresses, and structured identifiers", () => {
    const compiled = snapshot([
      rule("feature", "Feature"),
      rule("127", "loopback"),
      rule("user", "User"),
      rule("config", "Config"),
      rule("camel", "Camel"),
      rule("Server", "Service"),
    ]);
    const text = [
      "feature --feature",
      "127 127.0.0.1",
      "user user_name",
      "config config.value",
      "camel camelCase",
      "Server HTTPServer",
    ].join("; ");

    expect(apply(compiled, "written", text).text).toBe([
      "Feature --feature",
      "loopback 127.0.0.1",
      "User user_name",
      "Config config.value",
      "Camel camelCase",
      "Service HTTPServer",
    ].join("; "));
  });

  it("does not treat lexical joiners as safe word boundaries", () => {
    const compiled = snapshot([
      rule("can", "CAN", { boundary: "word" }),
      rule("foo", "FOO", { boundary: "word" }),
    ]);
    const text = "can can't can’t can-do @can #can `can foo/bar \\\\server\\foo can";

    expect(apply(compiled, "written", text).text).toBe(`CAN${text.slice(3)}`);
  });

  it("protects relative and UNC paths as complete literals", () => {
    const compiled = snapshot([
      rule("foo", "FOO"),
      rule("bar", "BAR"),
    ]);
    const text = "foo foo/bar ./foo/bar ../foo/bar /foo/bar \\\\foo\\bar bar";

    expect(apply(compiled, "written", text).text)
      .toBe("FOO foo/bar ./foo/bar ../foo/bar /foo/bar \\\\foo\\bar BAR");
  });

  it("returns an explicit safe result for malformed Unicode", () => {
    const compiled = snapshot([rule("matter", "Matter")]);
    const malformed = "matter\uD800";
    const result = apply(compiled, "written", malformed);

    expect(result).toEqual({
      status: "invalid-text",
      text: malformed,
      changed: false,
      generation: 11,
      edits: [],
      graphemeCount: 0,
      transitionCount: 0,
    });
  });

  it("fails closed on invisible and bidi formatting controls in material", () => {
    const compiled = snapshot([rule("matter", "Matter")]);
    for (const text of ["mat\u200bter", "matter\u202e", "matter\u2066"]) {
      expect(apply(compiled, "written", text)).toMatchObject({
        status: "invalid-text",
        text,
        changed: false,
      });
    }
  });

  it("returns frozen unchanged and changed receipts", () => {
    const compiled = snapshot([rule("matter", "Matter")]);
    const unchanged = apply(compiled, "written", "quiet");
    const changed = apply(compiled, "written", "matter");

    expect(unchanged.status).toBe("unchanged");
    expect(Object.isFrozen(unchanged)).toBe(true);
    expect(Object.isFrozen(unchanged.edits)).toBe(true);
    expect(changed.status).toBe("changed");
    expect(Object.isFrozen(changed)).toBe(true);
    expect(Object.isFrozen(changed.edits)).toBe(true);
    expect(Object.isFrozen(changed.edits[0])).toBe(true);
  });

  it("holds an operation budget on a degenerate shared-prefix corpus", () => {
    const rules = Array.from({ length: 63 }, (_, index) =>
      rule(`${"a".repeat(index + 1)}b`, `replacement-${index + 1}`));
    const compiled = snapshot(rules);
    const text = "a".repeat(512);
    const result = apply(compiled, "written", text);
    const budget = wikiCanonicalizationOperationBudget(
      compiled.views["en-US"].written,
      result.graphemeCount,
    );

    expect(result.status).toBe("unchanged");
    expect(result.transitionCount).toBeGreaterThan(30_000);
    expect(result.transitionCount).toBeLessThanOrEqual(budget);
    expect(budget).toBe(512 * 64);
  });
});
