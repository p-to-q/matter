import { describe, expect, it } from "vitest";
import {
  applySpokenTranscriptPunctuation,
  isSpokenTranscriptQuestion,
  normalizeSpokenTranscript,
  planSpokenTranscriptPunctuation,
} from "./spoken-transcript";

describe("spoken transcript punctuation", () => {
  it.each([
    ["zh-CN", "这个方案可以但是还需要测试", "这个方案可以，但是还需要测试。"],
    ["zh-TW", "這個方案可以但是還需要測試", "這個方案可以，但是還需要測試。"],
    ["en-US", "this works but it still needs testing", "this works, but it still needs testing."],
    ["ja-JP", "この案は必要だしかしまだ確認がいる", "この案は必要だ、しかしまだ確認がいる。"],
    ["de-DE", "Wir testen das weil die Grenze wichtig ist", "Wir testen das, weil die Grenze wichtig ist."],
  ])("uses high-confidence %s connective seams", (locale, text, expected) => {
    expect(normalizeSpokenTranscript({ text, locale })).toBe(expected);
  });

  it("handles paired clauses and direct questions without a language model", () => {
    expect(normalizeSpokenTranscript({
      text: "如果我们先检查边界那么发布会更稳妥",
      locale: "zh-CN",
    })).toBe("如果我们先检查边界，那么发布会更稳妥。");
    expect(normalizeSpokenTranscript({
      text: "为什么这个还没有准备好",
      locale: "zh-CN",
    })).toBe("为什么这个还没有准备好？");
    expect(normalizeSpokenTranscript({
      text: "can we try this again",
      locale: "en-US",
    })).toBe("can we try this again?");
    expect(normalizeSpokenTranscript({
      text: "なぜこれは必要ですか",
      locale: "ja-JP",
    })).toBe("なぜこれは必要ですか？");
    expect(normalizeSpokenTranscript({
      text: "Warum ist das wichtig",
      locale: "de-DE",
    })).toBe("Warum ist das wichtig?");
    expect(normalizeSpokenTranscript({
      text: "所以呢我们继续测试",
      locale: "zh-CN",
    })).toBe("所以呢，我们继续测试。");
    expect(normalizeSpokenTranscript({
      text: "话又说回来风险仍然存在",
      locale: "zh-CN",
    })).toBe("话又说回来，风险仍然存在。");
  });

  it("uses a balanced pair around an internal however clause", () => {
    expect(normalizeSpokenTranscript({
      text: "we tried carefully however it still failed",
      locale: "en-US",
    })).toBe("we tried carefully; however, it still failed.");
  });

  it("keeps one locale pack primary while allowing an English bridge", () => {
    expect(normalizeSpokenTranscript({
      text: "this works but it still needs testing",
      locale: "zh-CN",
    })).toBe("this works, but it still needs testing。");
    expect(normalizeSpokenTranscript({
      text: "this works but it still needs testing",
      locale: "ja-JP",
    })).toBe("this works, but it still needs testing。");
    expect(normalizeSpokenTranscript({
      text: "这个方案 works but it still needs testing",
      locale: "zh-CN",
    })).toBe("这个方案 works, but it still needs testing。");
    expect(normalizeSpokenTranscript({
      text: "Wir testen das weil die Grenze wichtig ist",
      locale: "und",
    })).toBe("Wir testen das, weil die Grenze wichtig ist.");
    expect(normalizeSpokenTranscript({
      text: "この案は必要だしかしまだ確認がいる",
      locale: "und",
    })).toBe("この案は必要だ、しかしまだ確認がいる。");
    expect(normalizeSpokenTranscript({
      text: "𠮷野家然后继续测试",
      locale: "und",
    })).toBe("𠮷野家，然后继续测试。");
  });

  it("understands longer spoken discourse phrases before their shorter words", () => {
    expect(normalizeSpokenTranscript({
      text: "我们看完了然后呢我们继续测试",
      locale: "zh-CN",
    })).toBe("我们看完了，然后呢，我们继续测试。");
    expect(normalizeSpokenTranscript({
      text: "前面没有问题话又说回来风险仍然存在",
      locale: "zh-CN",
    })).toBe("前面没有问题。话又说回来，风险仍然存在。");
    expect(normalizeSpokenTranscript({
      text: "首先我们把方向确定下来然后呢开始做但是中间还有几个问题最后我们再收尾",
      locale: "zh-CN",
    })).toBe("首先，我们把方向确定下来，然后呢，开始做，但是中间还有几个问题，最后，我们再收尾。");
    expect(normalizeSpokenTranscript({
      text: "so we finished this part但是接下来还有两个问题",
      locale: "zh-CN",
    })).toBe("so we finished this part，但是接下来还有两个问题。");
  });

  it("structures an explicit three-part Chinese enumeration", () => {
    expect(normalizeSpokenTranscript({
      text: "接下来有三个事情第一确认方向第二完成实现第三验证结果",
      locale: "zh-CN",
    })).toBe("接下来，有三个事情：第一，确认方向；第二，完成实现；第三，验证结果。");
    expect(normalizeSpokenTranscript({
      text: "这是第三次测试所以我们继续",
      locale: "zh-CN",
    })).toBe("这是第三次测试，所以我们继续。");
  });

  it.each([
    [
      "我觉得这个问题其实没有那么复杂我们只要先把核心部分做完剩下的问题就会容易很多",
      "我觉得，这个问题，其实没有那么复杂，我们只要先把核心部分做完，剩下的问题就会容易很多。",
    ],
    [
      "我们先把框架搭好再补接口然后跑一遍测试最后确认发布",
      "我们先把框架搭好，再补接口，然后跑一遍测试，最后，确认发布。",
    ],
    [
      "如果今天有时间的话我们先做第一版没有时间的话我们就把范围缩小",
      "如果今天有时间的话，我们先做第一版，没有时间的话，我们就把范围缩小。",
    ],
    [
      "前面的工作已经完成了我们现在开始验证缓存然后再检查边界情况",
      "前面的工作已经完成了，我们现在开始验证缓存，然后再检查边界情况。",
    ],
    [
      "从产品体验来看这个入口现在还是太隐蔽我们需要把反馈做得更明确",
      "从产品体验来看，这个入口现在还是太隐蔽，我们需要把反馈做得更明确。",
    ],
    [
      "在网络不稳定的情况下我们需要保留原始文字",
      "在网络不稳定的情况下，我们需要保留原始文字。",
    ],
    [
      "我们一方面要提高召回另一方面也要避免误切",
      "我们一方面要提高召回，另一方面也要避免误切。",
    ],
    [
      "这不但是技术问题也是产品问题",
      "这不但是技术问题，也是产品问题。",
    ],
  ] as const)("recovers high-confidence comma seams in continuous Mandarin: %s", (text, expected) => {
    const normalized = normalizeSpokenTranscript({ text, locale: "zh-CN" });
    expect(normalized).toBe(expected);
    expect(normalizeSpokenTranscript({ text: normalized, locale: "zh-CN" })).toBe(normalized);
    const plan = planSpokenTranscriptPunctuation({ text, locale: "zh-CN" });
    let restored = applySpokenTranscriptPunctuation(text, plan);
    for (const insertion of plan) {
      restored = `${restored.slice(0, insertion.atCodeUnit)}${restored.slice(
        insertion.atCodeUnit + insertion.mark.length,
      )}`;
    }
    expect(restored).toBe(text);
  });

  it("keeps the stronger Chinese cadence in traditional and mixed speech", () => {
    expect(normalizeSpokenTranscript({
      text: "我們看完了之後我們繼續測試但是這一次我們終於成功了",
      locale: "zh-TW",
    })).toBe("我們看完了之後，我們繼續測試，但是這一次我們終於成功了。");
    expect(normalizeSpokenTranscript({
      text: "從產品體驗來看這個入口還是太隱蔽我們需要把回饋做得更明確",
      locale: "zh-TW",
    })).toBe("從產品體驗來看，這個入口還是太隱蔽，我們需要把回饋做得更明確。");
    expect(normalizeSpokenTranscript({
      text: "如果今天有時間的話我們先做第一版沒有時間的話我們就縮小範圍",
      locale: "zh-TW",
    })).toBe("如果今天有時間的話，我們先做第一版，沒有時間的話，我們就縮小範圍。");
    expect(normalizeSpokenTranscript({
      text: "我觉得 this is ready but we still need testing 然后我们再发布",
      locale: "zh-CN",
    })).toBe("我觉得，this is ready, but we still need testing，然后我们再发布。");
  });

  it("adds a colon only when a list cue and its first item agree", () => {
    expect(normalizeSpokenTranscript({
      text: "计划具体如下第一先测试第二再发布",
      locale: "zh-CN",
    })).toBe("计划具体如下：第一先测试第二再发布。");
    expect(normalizeSpokenTranscript({
      text: "the plan is as follows first test locally second verify the build",
      locale: "en-US",
    })).toBe("the plan is as follows: first test locally second verify the build.");
    expect(normalizeSpokenTranscript({
      text: "Der Plan ist wie folgt erstens lokal testen zweitens prüfen",
      locale: "de-DE",
    })).toBe("Der Plan ist wie folgt: erstens lokal testen zweitens prüfen.");
    expect(normalizeSpokenTranscript({
      text: "計画は次のとおり一つ目は確認する",
      locale: "ja-JP",
    })).toBe("計画は次のとおり：一つ目は確認する。");
    expect(normalizeSpokenTranscript({
      text: "the plan is as follows we should test it",
      locale: "en-US",
    })).toBe("the plan is as follows we should test it.");
  });

  it("recognizes additional direct-question shapes without guessing statements", () => {
    expect(normalizeSpokenTranscript({ text: "这个方案能不能上线", locale: "zh-CN" }))
      .toBe("这个方案能不能上线？");
    expect(normalizeSpokenTranscript({ text: "然后呢", locale: "zh-CN" }))
      .toBe("然后呢？");
    expect(normalizeSpokenTranscript({ text: "what about the release", locale: "en-US" }))
      .toBe("what about the release?");
    expect(normalizeSpokenTranscript({ text: "どうする", locale: "ja-JP" }))
      .toBe("どうする？");
    expect(normalizeSpokenTranscript({ text: "Hast du das geprüft", locale: "de-DE" }))
      .toBe("Hast du das geprüft?");
    expect(isSpokenTranscriptQuestion("I am really happy?", "en-US")).toBe(true);
    expect(isSpokenTranscriptQuestion("我真的很开心？", "zh-CN")).toBe(true);
    expect(normalizeSpokenTranscript({
      text: "我们讨论能不能发布这个问题",
      locale: "zh-CN",
    })).toBe("我们讨论能不能发布这个问题。");
    expect(normalizeSpokenTranscript({
      text: "能不能发布还不确定",
      locale: "zh-CN",
    })).toBe("能不能发布还不确定。");
  });

  it("does not derive a clause from a rule spanning a protected literal", () => {
    expect(normalizeSpokenTranscript({
      text: "如果我们读取 `http://a` 那么继续测试",
      locale: "zh-CN",
    })).toBe("如果我们读取 `http://a` 那么继续测试。");
    expect(normalizeSpokenTranscript({
      text: "Wir prüfen das ohne dass wir Daten verlieren",
      locale: "de-DE",
    })).toBe("Wir prüfen das, ohne dass wir Daten verlieren.");
    expect(normalizeSpokenTranscript({
      text: "从产品体验来看 keep `a,b` exactly 我们需要继续",
      locale: "zh-CN",
    })).toBe("从产品体验来看，keep `a,b` exactly 我们需要继续。");
  });

  it("combines trustworthy pause duration with complete-clause evidence", () => {
    const text = "we finished the first careful review now we start the second careful review";
    const at = text.indexOf(" now");
    expect(normalizeSpokenTranscript({
      text,
      locale: "en-US",
      pauses: [{ afterCodeUnit: at, durationMs: 500, source: "word-timestamp" }],
    })).toBe("we finished the first careful review, now we start the second careful review.");
    expect(normalizeSpokenTranscript({
      text,
      locale: "en-US",
      pauses: [{ afterCodeUnit: at, durationMs: 1_000, source: "word-timestamp" }],
    })).toBe("we finished the first careful review. now we start the second careful review.");
    const questionFirst = "can we safely ship this release now we start the next careful review";
    expect(normalizeSpokenTranscript({
      text: questionFirst,
      locale: "en-US",
      pauses: [{
        afterCodeUnit: questionFirst.indexOf(" now"),
        durationMs: 1_000,
        source: "word-timestamp",
      }],
    })).toBe("can we safely ship this release? now we start the next careful review.");
    const questionLast = "we finished the first careful review can we safely ship this release";
    expect(normalizeSpokenTranscript({
      text: questionLast,
      locale: "en-US",
      pauses: [{
        afterCodeUnit: questionLast.indexOf(" can"),
        durationMs: 1_000,
        source: "word-timestamp",
      }],
    })).toBe("we finished the first careful review. can we safely ship this release?");
    const threeClauses = "can we safely ship this release now we start the next careful review later they finish another careful review";
    expect(normalizeSpokenTranscript({
      text: threeClauses,
      locale: "en-US",
      pauses: [
        {
          afterCodeUnit: threeClauses.indexOf(" now"),
          durationMs: 1_000,
          source: "word-timestamp",
        },
        {
          afterCodeUnit: threeClauses.indexOf(" later"),
          durationMs: 1_000,
          source: "word-timestamp",
        },
      ],
    })).toBe("can we safely ship this release? now we start the next careful review. later they finish another careful review.");
  });

  it.each([
    ["en-US", "we carefully considered all options for the next release tomorrow morning", " for", "we carefully considered all options, for the next release tomorrow morning."],
    ["de-DE", "wir haben alle Optionen sorgfältig geprüft für die nächste Veröffentlichung morgen", " für", "wir haben alle Optionen sorgfältig geprüft, für die nächste Veröffentlichung morgen."],
    ["zh-CN", "我们认真考虑了所有方案并且需要继续测试", "并且", "我们认真考虑了所有方案，并且需要继续测试。"],
  ] as const)("does not promote an incomplete %s right side to a sentence", (locale, text, seam, expected) => {
    const at = text.indexOf(seam);
    expect(normalizeSpokenTranscript({
      text,
      locale,
      pauses: [{ afterCodeUnit: at, durationMs: 1_000, source: "word-timestamp" }],
    })).toBe(expected);
  });

  it("uses a robust utterance-relative pause threshold when enough gaps exist", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve";
    const boundaries = [...text.matchAll(/ /gu)].map((match) => match.index);
    const pauses = boundaries.slice(0, 6).map((afterCodeUnit, index) => ({
      afterCodeUnit,
      durationMs: [70, 80, 90, 100, 110, 500][index]!,
      source: "word-timestamp" as const,
    }));
    expect(normalizeSpokenTranscript({ text, locale: "en-US", pauses }))
      .toBe("one two three four five six, seven eight nine ten eleven twelve.");
  });

  it("never lets inferred marks exceed the receiving consumer's capacity", () => {
    expect(normalizeSpokenTranscript({
      text: "test",
      locale: "en-US",
      maxOutputCodePoints: 4,
    })).toBe("test");
    expect(normalizeSpokenTranscript({
      text: "测试",
      locale: "zh-CN",
      maxOutputCodeUnits: 2,
    })).toBe("测试");
    const denseExistingPunctuation = "a,b".repeat(80);
    expect(normalizeSpokenTranscript({
      text: denseExistingPunctuation,
      locale: "en-US",
      maxOutputCodePoints: 240,
    })).toBe(denseExistingPunctuation);
  });

  it("keeps dense maximum-length punctuation planning bounded", { timeout: 2_500 }, () => {
    const text = "我们然后".repeat(500);
    const plan = planSpokenTranscriptPunctuation({ text, locale: "zh-CN" });
    expect(plan.filter(({ reason }) => reason === "connective").length).toBeGreaterThan(400);
    const normalized = normalizeSpokenTranscript({ text, locale: "zh-CN" });
    for (let pass = 0; pass < 8; pass += 1) {
      expect(normalizeSpokenTranscript({ text, locale: "zh-CN" })).toBe(normalized);
    }
  });

  it("lets a known locale own punctuation in mixed-script speech", () => {
    expect(normalizeSpokenTranscript({ text: "I use 東京 every day", locale: "en-US" }))
      .toBe("I use 東京 every day.");
    expect(normalizeSpokenTranscript({ text: "Wir nutzen 東京 jeden Tag", locale: "de-DE" }))
      .toBe("Wir nutzen 東京 jeden Tag.");
  });

  it("rejects a malformed timing set as a whole and never splits protected literals", () => {
    const malformed = normalizeSpokenTranscript({
      text: "we keep this phrase together",
      locale: "en-US",
      pauses: [
        { afterCodeUnit: 12, durationMs: 1_000, source: "word-timestamp" },
        { afterCodeUnit: 8, durationMs: 1_000, source: "word-timestamp" },
      ],
    });
    expect(malformed).toBe("we keep this phrase together.");

    const literal = "open https://example.com/v2.0 now and continue carefully";
    expect(normalizeSpokenTranscript({
      text: literal,
      locale: "en-US",
      pauses: [{
        afterCodeUnit: literal.indexOf(".com") + 1,
        durationMs: 2_000,
        source: "word-timestamp",
      }],
    })).toBe(`${literal}.`);
    expect(normalizeSpokenTranscript({
      text: "open https://example.com/a,b now",
      locale: "en-US",
    })).toBe("open https://example.com/a,b now.");
    expect(normalizeSpokenTranscript({
      text: "keep `a,b` exactly",
      locale: "en-US",
    })).toBe("keep `a,b` exactly.");
    expect(normalizeSpokenTranscript({
      text: "keep `a ,b` exactly",
      locale: "en-US",
    })).toBe("keep `a ,b` exactly.");
    expect(normalizeSpokenTranscript({
      text: "say \"a , b\" exactly",
      locale: "en-US",
    })).toBe("say \"a , b\" exactly.");
    expect(normalizeSpokenTranscript({
      text: "他说“a， b”就是原文",
      locale: "zh-CN",
    })).toBe("他说“a， b”就是原文。");
    expect(normalizeSpokenTranscript({
      text: "他说“a ， b”就是原文",
      locale: "zh-CN",
    })).toBe("他说“a ， b”就是原文。");
    expect(normalizeSpokenTranscript({
      text: "前面的内容需要保留 所以_mode还在这里",
      locale: "zh-CN",
    })).toBe("前面的内容需要保留 所以_mode还在这里。");
  });

  it("accepts acoustic evidence only at grapheme-safe lexical seams", () => {
    const combining = "we say e\u0301 carefully and keep enough words here";
    expect(normalizeSpokenTranscript({
      text: combining,
      locale: "en-US",
      pauses: [{
        afterCodeUnit: combining.indexOf("\u0301"),
        durationMs: 1_000,
        source: "word-timestamp",
      }],
    })).toBe(`${combining}.`);

    const emoji = "we have many words 👩‍💻 and enough words after this";
    expect(normalizeSpokenTranscript({
      text: emoji,
      locale: "en-US",
      pauses: [{
        afterCodeUnit: emoji.indexOf("‍"),
        durationMs: 1_000,
        source: "word-timestamp",
      }],
    })).toBe(`${emoji}.`);

    const subword = "we have many sentence parts and enough words after this";
    expect(normalizeSpokenTranscript({
      text: subword,
      locale: "en-US",
      pauses: [{
        afterCodeUnit: subword.indexOf("sentence") + 4,
        durationMs: 1_000,
        source: "word-timestamp",
      }],
    })).toBe(`${subword}.`);

    for (const [text, at] of [
      ["we have many high-quality examples and enough words after this", "we have many high".length],
      ["we have many don't examples and enough words after this", "we have many don".length],
    ] as const) {
      expect(normalizeSpokenTranscript({
        text,
        locale: "en-US",
        pauses: [{ afterCodeUnit: at, durationMs: 1_000, source: "word-timestamp" }],
      })).toBe(`${text}.`);
    }

    const unknownLatin = "one two three four sentenceparts and enough words after this";
    expect(normalizeSpokenTranscript({
      text: unknownLatin,
      locale: "und",
      pauses: [{
        afterCodeUnit: unknownLatin.indexOf("sentenceparts") + "sentence".length,
        durationMs: 1_000,
        source: "word-timestamp",
      }],
    })).toBe(`${unknownLatin}.`);
  });

  it("uses full-width colon spacing for a spoken CJK list", () => {
    expect(normalizeSpokenTranscript({
      text: "理由如下 第一要安全 第二要稳定",
      locale: "zh-CN",
    })).toBe("理由如下：第一要安全 第二要稳定。");
  });

  it("keeps ambiguous connective vocabulary as prose", () => {
    expect(normalizeSpokenTranscript({ text: "first class matters", locale: "en-US" }))
      .toBe("first class matters.");
    expect(normalizeSpokenTranscript({ text: "what a good day", locale: "en-US" }))
      .toBe("what a good day.");
    expect(normalizeSpokenTranscript({ text: "what matters is trust", locale: "en-US" }))
      .toBe("what matters is trust.");
    expect(normalizeSpokenTranscript({ text: "we discussed everything but it", locale: "en-US" }))
      .toBe("we discussed everything but it.");
    expect(normalizeSpokenTranscript({ text: "我不知道为什么他没来", locale: "zh-CN" }))
      .toBe("我不知道为什么他没来。");
    expect(normalizeSpokenTranscript({ text: "本来就是这样嘛", locale: "zh-CN" }))
      .toBe("本来就是这样嘛。");
    expect(normalizeSpokenTranscript({
      text: "这就是我之所以这样做的原因",
      locale: "zh-CN",
    })).toBe("这就是我之所以这样做的原因。");
    expect(normalizeSpokenTranscript({
      text: "這就是我之所以這樣做的原因",
      locale: "zh-TW",
    })).toBe("這就是我之所以這樣做的原因。");
    expect(normalizeSpokenTranscript({
      text: "我不知道其中的所以然究竟是什么",
      locale: "zh-CN",
    })).toBe("我不知道其中的所以然究竟是什么。");
    expect(normalizeSpokenTranscript({
      text: "这属于同时代的作品需要认真保存",
      locale: "zh-CN",
    })).toBe("这属于同时代的作品需要认真保存。");
    for (const text of [
      "这个游戏不过瘾还需要继续调整",
      "这次测试不过关还要重新处理",
      "这根线连接着两个重要模块",
      "任务承接着前一阶段继续推进",
      "结果是偶然而非必然",
      "过程自然而然形成了共识",
      "这等于是什么还不清楚",
      "先祖留下的经验再重要也不能直接照搬",
      "为了我们共同的目标现在需要继续努力",
      "这是我们已经完成的版本现在可以发布",
      "我觉得这个方案可以",
    ]) {
      const normalized = normalizeSpokenTranscript({ text, locale: "zh-CN" });
      expect(normalized.slice(0, -1)).toBe(text);
    }
    expect(normalizeSpokenTranscript({ text: "几年以后我们会再看", locale: "zh-CN" }))
      .toBe("几年以后，我们会再看。");
    expect(normalizeSpokenTranscript({ text: "何かを買う", locale: "ja-JP" }))
      .toBe("何かを買う。" );
    expect(normalizeSpokenTranscript({ text: "何より大切だ", locale: "ja-JP" }))
      .toBe("何より大切だ。" );
    expect(normalizeSpokenTranscript({ text: "行くかどうか", locale: "ja-JP" }))
      .toBe("行くかどうか。" );
    expect(normalizeSpokenTranscript({ text: "またいつか", locale: "ja-JP" }))
      .toBe("またいつか。" );
    expect(normalizeSpokenTranscript({ text: "理由はなぜか", locale: "ja-JP" }))
      .toBe("理由はなぜか。" );
    expect(normalizeSpokenTranscript({ text: "しかしながら確認が必要だ", locale: "ja-JP" }))
      .toBe("しかしながら確認が必要だ。" );
    expect(normalizeSpokenTranscript({ text: "ただし書きが必要だ", locale: "ja-JP" }))
      .toBe("ただし書きが必要だ。" );
    expect(normalizeSpokenTranscript({ text: "契約のただし書きが必要だ", locale: "ja-JP" }))
      .toBe("契約のただし書きが必要だ。" );
    expect(normalizeSpokenTranscript({ text: "Was für ein Tag", locale: "de-DE" }))
      .toBe("Was für ein Tag.");
    expect(normalizeSpokenTranscript({
      text: "Warum das wichtig ist bleibt offen",
      locale: "de-DE",
    })).toBe("Warum das wichtig ist bleibt offen.");
    expect(normalizeSpokenTranscript({
      text: "Das ist aber wirklich sehr wichtig",
      locale: "de-DE",
    })).toBe("Das ist aber wirklich sehr wichtig.");
  });

  it("returns an insertion-only, idempotent plan", () => {
    const text = "this works but it needs another careful pass";
    const plan = planSpokenTranscriptPunctuation({ text, locale: "en-US" });
    const output = applySpokenTranscriptPunctuation(text, plan);
    let restored = output;
    for (const insertion of plan) {
      const at = insertion.atCodeUnit;
      expect(restored.slice(at, at + insertion.mark.length)).toBe(insertion.mark);
      restored = `${restored.slice(0, at)}${restored.slice(at + insertion.mark.length)}`;
    }
    expect(restored).toBe(text);
    const normalized = normalizeSpokenTranscript({ text, locale: "en-US" });
    expect(normalizeSpokenTranscript({ text: normalized, locale: "en-US" })).toBe(normalized);
    for (const duplicate of ["hello;,", "hello,,"]) {
      const once = normalizeSpokenTranscript({ text: duplicate, locale: "en-US" });
      expect(normalizeSpokenTranscript({ text: once, locale: "en-US" })).toBe(once);
    }
    expect(normalizeSpokenTranscript({ text: "hello. 🇨🇳", locale: "en-US" }))
      .toBe("hello. 🇨🇳");
  });

  it("places a missing terminal before existing human expression", () => {
    expect(normalizeSpokenTranscript({ text: "hello 😄", locale: "en-US" }))
      .toBe("hello. 😄");
    expect(normalizeSpokenTranscript({ text: "好开心😄", locale: "zh-CN" }))
      .toBe("好开心。😄");
    expect(normalizeSpokenTranscript({ text: "“可以” 😄", locale: "zh-CN" }))
      .toBe("“可以。” 😄");
    expect(normalizeSpokenTranscript({ text: "can we continue 😄", locale: "en-US" }))
      .toBe("can we continue? 😄");
    expect(isSpokenTranscriptQuestion("can we continue? 😄", "en-US"))
      .toBe(true);
  });

});
