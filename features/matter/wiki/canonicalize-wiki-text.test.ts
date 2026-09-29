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
    // A Latin word in a Japanese turn is routed by its script to the one
    // Latin ledger, en-US; it never falls back to any other locale.
    expect(apply(compiled, "written", "gift", "ja-JP").text).toBe("present");

    const german = snapshot([rule("gift", "poison", { locale: "de-DE" })]);
    for (const locale of ["en-US", "zh-CN", "zh-TW", "ja-JP"] as const) {
      expect(apply(german, "written", "gift", locale).text).toBe("gift");
    }
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

describe("canonicalizeWikiText script routing", () => {
  const LATIN = rule("Englebart", "Engelbart", {
    locale: "en-US",
    channel: "spoken",
    boundary: "word",
    authority: "provisional",
    provenance: "aggregate-evidence",
  });

  function spoken(compiled: CompiledWikiSnapshot, text: string, locale: MatterLocale = "zh-CN") {
    return canonicalizeWikiText(compiled, locale, "spoken", text);
  }

  it("applies the en-US ledger to Latin words inside Chinese and Japanese turns", () => {
    const compiled = snapshot([LATIN]);
    const text = "我读了Englebart的论文";
    const result = spoken(compiled, text);

    expect(result.text).toBe("我读了Engelbart的论文");
    expect(result.edits).toEqual([expect.objectContaining({
      start: text.indexOf("E"),
      end: text.indexOf("的"),
    })]);
    expect(compiled.rules[result.edits[0]!.ruleIndex]).toMatchObject({ locale: "en-US" });
    expect(spoken(compiled, "我讀了 Englebart 的論文", "zh-TW").text)
      .toBe("我讀了 Engelbart 的論文");
    expect(spoken(compiled, "Englebartの論文を読んだ", "ja-JP").text)
      .toBe("Engelbartの論文を読んだ");
    expect(spoken(compiled, "ｴﾝｹﾞﾙEnglebart", "ja-JP").text).toBe("ｴﾝｹﾞﾙEngelbart");
  });

  it("ends a routed word at punctuation, spacing, emoji, or a CJK letter only", () => {
    const compiled = snapshot([LATIN]);

    expect(spoken(compiled, "Englebart，Englebart！😀Englebart😀").text)
      .toBe("Engelbart，Engelbart！😀Engelbart😀");
    for (const text of [
      "Englebarts的论文",
      "Englebart2号",
      "Englebart's论文",
      "Englebart-style",
      "#Englebart",
      "Englebartα",
    ]) {
      expect(spoken(compiled, text).text).toBe(text);
    }
  });

  it("matches full-width Latin for matching only and replaces the span as written", () => {
    const compiled = snapshot([LATIN]);
    const text = "我读了Ｅｎｇｌｅｂａｒｔ的论文";
    const result = spoken(compiled, text);

    expect(result.text).toBe("我读了Engelbart的论文");
    expect(result.edits).toEqual([expect.objectContaining({
      start: text.indexOf("Ｅ"),
      end: text.indexOf("的"),
    })]);
    // Width is never normalized where no rule applies.
    expect(spoken(compiled, "我读了Ｍｏｒｐｈ的论文").text).toBe("我读了Ｍｏｒｐｈ的论文");
  });

  it("protects URLs, email, code, quotes, and full-width identifiers in routed spans", () => {
    const compiled = snapshot([
      LATIN,
      rule("EngleBart", "EngelBart", { locale: "en-US", channel: "spoken" }),
    ]);
    for (const text of [
      "看https://example.com/Englebart的页面",
      "邮箱Englebart@example.com",
      "代码`Englebart`里",
      "他说“Englebart”",
      "路径/docs/Englebart",
      "打开ＥｎｇｌｅＢａｒｔ模块",
    ]) {
      expect(spoken(compiled, text).text).toBe(text);
    }
  });

  it("never lets a CJK span, a digit-only form, or a German rule reach a routed turn", () => {
    const compiled = snapshot([
      rule("材料", "material", { locale: "en-US", channel: "spoken" }),
      rule("A股", "A-share", { locale: "en-US", channel: "spoken" }),
      rule("2", "two", { locale: "en-US", channel: "spoken" }),
      rule("Englebart", "Engelbart", { locale: "de-DE", channel: "spoken" }),
    ]);

    for (const text of ["这个材料", "A股", "我有2个", "我读了Englebart的论文"]) {
      expect(spoken(compiled, text).text).toBe(text);
    }
  });

  it("routes only out of CJK turns", () => {
    const compiled = snapshot([LATIN]);

    expect(spoken(compiled, "Englebart", "en-US").text).toBe("Engelbart");
    expect(spoken(compiled, "Englebart", "de-DE").text).toBe("Englebart");
    // An English turn does not fold width; only a routed span is matched folded.
    expect(spoken(compiled, "Ｅｎｇｌｅｂａｒｔ", "en-US").text).toBe("Ｅｎｇｌｅｂａｒｔ");
  });

  it("is additive: the turn's own rules keep every span they match", () => {
    const own = rule("P to Q", "[p → q]", {
      locale: "zh-CN",
      channel: "spoken",
      boundary: "word",
    });
    const compiled = snapshot([
      own,
      rule("Q", "queue", { locale: "en-US", channel: "spoken", boundary: "word" }),
      rule("to", "TO", { locale: "en-US", channel: "spoken", boundary: "word" }),
    ]);
    const ownOnly = snapshot([own]);
    const text = "P to Q and Q";

    expect(spoken(ownOnly, text).text).toBe("[p → q] and Q");
    expect(spoken(compiled, text).text).toBe("[p → q] and queue");
    expect(spoken(compiled, text).edits.map(({ start, end }) => [start, end]))
      .toEqual([[0, 6], [11, 12]]);
  });

  it("respects eligible ranges and the channel for routed spans", () => {
    const compiled = snapshot([LATIN]);
    const text = "Englebart说Englebart";

    expect(canonicalizeWikiText(compiled, "zh-CN", "spoken", text, {
      eligibleRanges: [{ start: 10, end: text.length }],
    }).text).toBe("Englebart说Engelbart");
    expect(canonicalizeWikiText(compiled, "zh-CN", "written", text).text).toBe(text);
  });

  it("bounds a routed turn by both views it walks", () => {
    const rules = Array.from({ length: 31 }, (_, index) =>
      rule(`${"a".repeat(index + 1)}b`, `replacement-${index + 1}`, { locale: "en-US" }));
    const compiled = snapshot([
      ...rules,
      rule("材料", "材料库", { locale: "zh-CN" }),
    ]);
    const text = `${"a".repeat(256)}材料`;
    const result = canonicalizeWikiText(compiled, "zh-CN", "written", text);
    const budget = wikiCanonicalizationOperationBudget(
      compiled.views["zh-CN"].written,
      result.graphemeCount,
      compiled.views["en-US"].written,
    );

    expect(result.text).toBe(`${"a".repeat(256)}材料库`);
    expect(result.transitionCount).toBeGreaterThan(4_000);
    expect(result.transitionCount).toBeLessThanOrEqual(budget);
    expect(budget).toBe(258 * (2 + 32));
  });
});
