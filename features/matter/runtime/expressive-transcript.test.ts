import { describe, expect, it } from "vitest";
import {
  canonicalSpokenExpressionBase,
  decorateSpokenExpression,
  planSpokenExpression,
} from "./expressive-transcript";

describe("spoken expression decoration", () => {
  it.each([
    ["zh-CN", "我们终于成功了。", "我们终于成功了。🎉"],
    ["zh-TW", "我真的非常開心。", "我真的非常開心。😄"],
    ["en-US", "I am really furious.", "I am really furious.😠"],
    ["ja-JP", "ついに成功した。", "ついに成功した。🎉"],
    ["de-DE", "Ich bin wirklich traurig.", "Ich bin wirklich traurig.😢"],
  ])("adds one high-confidence %s sentence-final emoji", (locale, text, expected) => {
    expect(decorateSpokenExpression({ text, locale })).toBe(expected);
  });

  it("keeps English as the code-switch bridge", () => {
    expect(decorateSpokenExpression({
      text: "这一次 we finally did it。",
      locale: "zh-CN",
    })).toBe("这一次 we finally did it。🎉");
  });

  it.each([
    ["我没有生气。", "zh-CN"],
    ["如果我很生气就会离开。", "zh-CN"],
    ["他说我们终于成功了。", "zh-CN"],
    ["你真的很生气吗？", "zh-CN"],
    ["the word \"furious\" is useful.", "en-US"],
    ["If I were angry I would leave.", "en-US"],
    ["行くかどうか。", "ja-JP"],
    ["Wenn ich wütend bin gehe ich.", "de-DE"],
    ["You said we finally did it.", "en-US"],
    ["你说我真的很开心。", "zh-CN"],
    ["Unless I am really happy, I stay home.", "en-US"],
    ["只要我很开心就会唱歌。", "zh-CN"],
    ["I am really happy?", "en-US"],
    ["Alex said I am really happy.", "en-US"],
    ["小王说我真的很开心。", "zh-CN"],
  ])("does not assert affect in negated, reported, conditional, quoted, or question text", (text, locale) => {
    expect(decorateSpokenExpression({ text, locale })).toBe(text);
  });

  it("rejects conflicting affect, existing emoji, and does not decorate every noun", () => {
    for (const text of [
      "I am very happy but I am also furious.",
      "We finally did it. 🎉",
      "I am really happy. 🇨🇳",
      "We finally did it. 1️⃣",
      "我们坐飞机去上海。",
    ]) {
      expect(decorateSpokenExpression({ text, locale: "und" })).toBe(text);
    }
  });

  it.each([
    ["zh-CN", "我们坐飞机去上海。", "我们坐飞机✈️去上海。"],
    ["en-US", "we drink coffee every morning.", "we drink coffee☕ every morning."],
    ["ja-JP", "飛行機で東京に行く。", "飛行機✈️で東京に行く。"],
    ["de-DE", "Wir trinken morgens Kaffee.", "Wir trinken morgens Kaffee☕."],
  ])("samples an appropriate %s entity icon reproducibly", (locale, text, decorated) => {
    const outcomes = new Set(
      Array.from({ length: 96 }, (_, index) => decorateSpokenExpression({
        text,
        locale,
        sampleSeed: `admission-${index}`,
      })),
    );
    expect(outcomes).toEqual(new Set([text, decorated]));
    const chosenSeed = Array.from({ length: 96 }, (_, index) => `admission-${index}`)
      .find((sampleSeed) => decorateSpokenExpression({ text, locale, sampleSeed }) === decorated);
    expect(chosenSeed).toBeDefined();
    expect(decorateSpokenExpression({ text, locale, sampleSeed: chosenSeed })).toBe(decorated);
    expect(canonicalSpokenExpressionBase({
      text: decorated,
      locale,
      sampleSeed: chosenSeed,
    })).toBe(text);
  });

  it.each([
    ["zh-CN", "我们去飞机场接人。"],
    ["zh-CN", "咖啡因需要适量。"],
    ["ja-JP", "月曜日に会う。"],
    ["en-US", "this is a sun-dried tomato."],
    ["en-US", "naïvecoffee is not an English word."],
    ["de-DE", "Kaffeeöl ist ein zusammengesetztes Wort."],
    ["ja-JP", "月に一度会う。"],
    ["en-US", "coffee.config is loaded."],
    ["en-US", "object.coffee is loaded."],
    ["zh-CN", "咖啡_mode需要保留。"],
  ])("never splits a compound or hyphenated %s word", (locale, text) => {
    for (let index = 0; index < 96; index += 1) {
      expect(decorateSpokenExpression({
        text,
        locale,
        sampleSeed: `admission-${index}`,
      })).toBe(text);
    }
  });

  it("samples the admission once rather than once per entity candidate", () => {
    const text = "coffee and music belong in the same sentence.";
    const decorated = Array.from({ length: 2_048 }, (_, index) =>
      decorateSpokenExpression({ text, locale: "en-US", sampleSeed: `sample-${index}` }))
      .filter((candidate) => candidate !== text).length;
    expect(decorated).toBeGreaterThan(360);
    expect(decorated).toBeLessThan(630);
  });

  it("requires an admission identity before sampling an ordinary noun", () => {
    for (const [locale, text] of [
      ["zh-CN", "我们坐飞机去上海。"],
      ["en-US", "we drink coffee every morning."],
      ["ja-JP", "飛行機で東京に行く。"],
      ["de-DE", "Wir trinken morgens Kaffee."],
    ] as const) {
      expect(decorateSpokenExpression({ text, locale })).toBe(text);
    }
  });

  it("keeps one primary entity dictionary plus the English bridge", () => {
    for (let index = 0; index < 96; index += 1) {
      const sampleSeed = `admission-${index}`;
      expect(decorateSpokenExpression({
        text: "Kaffee is written here.",
        locale: "en-US",
        sampleSeed,
      })).toBe("Kaffee is written here.");
      expect(decorateSpokenExpression({
        text: "咖啡と書いた。",
        locale: "ja-JP",
        sampleSeed,
      })).toBe("咖啡と書いた。");
    }

    const text = "我喝coffee然后继续工作。";
    const outcomes = new Set(
      Array.from({ length: 96 }, (_, index) => decorateSpokenExpression({
        text,
        locale: "zh-CN",
        sampleSeed: `bridge-${index}`,
      })),
    );
    expect(outcomes).toEqual(new Set([text, "我喝coffee☕然后继续工作。"]));
  });

  it("keeps insertion offsets valid around surrounding whitespace", () => {
    expect(decorateSpokenExpression({
      text: "  We finally did it.  ",
      locale: "en-US",
    })).toBe("  We finally did it.🎉  ");
  });

  it("does not canonicalize a forged or misplaced expression", () => {
    expect(canonicalSpokenExpressionBase({
      text: "We finally did it.😠",
      locale: "en-US",
    })).toBeUndefined();
    expect(canonicalSpokenExpressionBase({
      text: "ordinary text.👍",
      locale: "en-US",
    })).toBeUndefined();
  });

  it("is insertion-only, capacity-safe, and idempotent", () => {
    const text = "We finally did it.";
    const plan = planSpokenExpression({ text, locale: "en-US" });
    expect(plan).toEqual({ atCodeUnit: text.length, emoji: "🎉", reason: "celebration" });
    const once = decorateSpokenExpression({ text, locale: "en-US" });
    expect(decorateSpokenExpression({ text: once, locale: "en-US" })).toBe(once);
    expect(decorateSpokenExpression({
      text,
      locale: "en-US",
      maxOutputCodeUnits: text.length,
    })).toBe(text);
  });
});
