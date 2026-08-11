import { describe, expect, it } from "vitest";
import { normalizeAdmittedTranscript, repairAdmittedTranscript } from "./transcript-punctuation";

describe("normalizeAdmittedTranscript", () => {
  it("publishes a formatting-only language-appropriate floor", () => {
    expect(normalizeAdmittedTranscript("我记得那天")).toBe("我记得那天。");
    expect(normalizeAdmittedTranscript("I remember that day")).toBe("I remember that day.");
    expect(normalizeAdmittedTranscript("先停一下 逗号 然后继续 句号"))
      .toBe("先停一下 逗号 然后继续 句号。");
  });

  it("preserves terminal ellipses, quotes, and full-width brackets", () => {
    expect(normalizeAdmittedTranscript("我也不知道……")).toBe("我也不知道……");
    expect(normalizeAdmittedTranscript("（完成。）")).toBe("（完成。）");
    expect(normalizeAdmittedTranscript("She said “done.”")).toBe("She said “done.”");
  });

  it("does not add spaces inside numeric separators", () => {
    expect(normalizeAdmittedTranscript("The total is 1,000")).toBe("The total is 1,000.");
    expect(normalizeAdmittedTranscript("Der Wert ist 3,14")).toBe("Der Wert ist 3,14.");
    expect(normalizeAdmittedTranscript("first,next")).toBe("first, next.");
  });

  it("uses CJK punctuation for Japanese", () => {
    expect(normalizeAdmittedTranscript("ありがとう")).toBe("ありがとう。");
  });
});

describe("repairAdmittedTranscript", () => {
  it("removes only low-ambiguity fillers and recognition echoes", () => {
    expect(repairAdmittedTranscript("uh, i i think this works", "en-US"))
      .toBe("I think this works.");
    expect(repairAdmittedTranscript("well, uh, i think", "en-US"))
      .toBe("Well, I think.");
    expect(repairAdmittedTranscript("呃，我 我觉得可以", "zh-CN"))
      .toBe("我觉得可以。");
    expect(repairAdmittedTranscript("我觉得，呃，然后", "zh-CN"))
      .toBe("我觉得，然后。");
  });

  it("collapses all recognition echoes in one idempotent pass", () => {
    const english = repairAdmittedTranscript("the the the answer", "en-US");
    const chinese = repairAdmittedTranscript("我 我 我觉得可以", "zh-CN");
    expect(english).toBe("The answer.");
    expect(chinese).toBe("我觉得可以。");
    expect(repairAdmittedTranscript(english, "en-US")).toBe(english);
    expect(repairAdmittedTranscript(chinese, "zh-CN")).toBe(chinese);
  });

  it("keeps ambiguous discourse markers and meaningful repetition", () => {
    expect(repairAdmittedTranscript("like I really really mean it", "en-US"))
      .toBe("Like I really really mean it.");
    expect(repairAdmittedTranscript("嗯，我就是想想看", "zh-CN"))
      .toBe("嗯，我就是想想看。");
    expect(repairAdmittedTranscript("唔，我不同意", "zh-TW"))
      .toBe("唔，我不同意。");
  });

  it("does not collapse adjacent CJK characters without a token boundary", () => {
    expect(repairAdmittedTranscript("这是是非题", "zh-CN")).toBe("这是是非题。");
    expect(repairAdmittedTranscript("目的的确如此", "zh-CN")).toBe("目的的确如此。");
  });

  it("converts only explicitly delimited or trailing spoken punctuation", () => {
    expect(repairAdmittedTranscript("先停一下 逗點 然後繼續 句點", "zh-TW"))
      .toBe("先停一下，然後繼續。");
    expect(repairAdmittedTranscript("这样好吗 问号", "zh-CN")).toBe("这样好吗？");
  });

  it("preserves named punctuation in prose and quotes", () => {
    expect(repairAdmittedTranscript("句号通常放在句末", "zh-CN"))
      .toBe("句号通常放在句末。");
    expect(repairAdmittedTranscript("关于逗号的规则", "zh-CN"))
      .toBe("关于逗号的规则。");
    expect(repairAdmittedTranscript("他说“逗号”", "zh-CN"))
      .toBe("他说“逗号”。");
    expect(repairAdmittedTranscript("先停一下逗号然后继续", "zh-CN"))
      .toBe("先停一下，然后继续。");
  });

  it("restores direct questions and high-confidence clause boundaries", () => {
    expect(repairAdmittedTranscript("所以我们先试一次", "zh-CN"))
      .toBe("所以，我们先试一次。");
    expect(repairAdmittedTranscript("这个方案可以但是还需要测试", "zh-CN"))
      .toBe("这个方案可以，但是还需要测试。");
    expect(repairAdmittedTranscript("这样真的可以吗", "zh-CN"))
      .toBe("这样真的可以吗？");
    expect(repairAdmittedTranscript("can we try this again", "en-US"))
      .toBe("Can we try this again?");
    expect(repairAdmittedTranscript("this works but it still needs testing", "en-US"))
      .toBe("This works, but it still needs testing.");
  });

  it("handles spoken English punctuation and more obvious ASR echoes", () => {
    expect(repairAdmittedTranscript(
      "uh i i think this works comma but we should test it period",
      "en-US",
    )).toBe("I think this works, but we should test it.");
    expect(repairAdmittedTranscript("this this this should stay once", "en-US"))
      .toBe("This should stay once.");
    expect(repairAdmittedTranscript("我我觉得这个 这个 这个 可以", "zh-CN"))
      .toBe("我觉得这个可以。");
  });

  it("repairs partial stutters and exact multi-word sentence restarts", () => {
    expect(repairAdmittedTranscript(
      "um i th- i think we need to we need to ship this",
      "en-US",
    )).toBe("I think we need to ship this.");
    expect(repairAdmittedTranscript(
      "i think i think this can work",
      "en-US",
    )).toBe("I think this can work.");
    expect(repairAdmittedTranscript("我觉得我觉得这个方案可以", "zh-CN"))
      .toBe("我觉得这个方案可以。");
  });

  it("keeps one-word emphasis and hyphenated words that are not stutters", () => {
    expect(repairAdmittedTranscript("this is very very important", "en-US"))
      .toBe("This is very very important.");
    expect(repairAdmittedTranscript("the co-op is member owned", "en-US"))
      .toBe("The co-op is member owned.");
  });

  it("settles explicit spoken corrections when the replacement is exact", () => {
    expect(repairAdmittedTranscript(
      "meet on Tuesday sorry Wednesday",
      "en-US",
    )).toBe("Meet on Wednesday.");
    expect(repairAdmittedTranscript("我想周三不对周四去", "zh-CN"))
      .toBe("我想周四去。");
    expect(repairAdmittedTranscript("下午三点不對下午四點開始", "zh-TW"))
      .toBe("下午四點開始。");
    expect(repairAdmittedTranscript("meet Tuesday no Wednesday", "en-US"))
      .toBe("Meet Wednesday.");
    expect(repairAdmittedTranscript("set it to 20 no 30 percent", "en-US"))
      .toBe("Set it to 30%.");
    expect(repairAdmittedTranscript("我们下周二不对下周三再看", "zh-CN"))
      .toBe("我们下周三再看。");
    expect(repairAdmittedTranscript("我要二十个不对三十个", "zh-CN"))
      .toBe("我要三十个。");
  });

  it("does not mistake apologies, preferences, or edit instructions for corrections", () => {
    expect(repairAdmittedTranscript("i am sorry this happened", "en-US"))
      .toBe("I am sorry this happened.");
    expect(repairAdmittedTranscript("i would rather stay here", "en-US"))
      .toBe("I would rather stay here.");
    expect(repairAdmittedTranscript("把周三改成周四", "zh-CN"))
      .toBe("把周三改成周四。");
    expect(repairAdmittedTranscript("send it to Alex sorry Sam called", "en-US"))
      .toBe("Send it to Alex sorry Sam called.");
    expect(repairAdmittedTranscript("he was tired, rather hungry", "en-US"))
      .toBe("He was tired, rather hungry.");
  });

  it("adds multiple high-confidence discourse boundaries in one pass", () => {
    expect(repairAdmittedTranscript(
      "first we test it then we ship it",
      "en-US",
    )).toBe("First, we test it, then we ship it.");
    expect(repairAdmittedTranscript(
      "如果这个可行那么我们测试然后我们发布",
      "zh-CN",
    )).toBe("如果这个可行，那么我们测试，然后我们发布。");
    expect(repairAdmittedTranscript("why isn't this ready", "en-US"))
      .toBe("Why isn't this ready?");
  });

  it("recovers strongly signalled web addresses without editing literals", () => {
    expect(repairAdmittedTranscript(
      "my email is jane dot doe at example dot com",
      "en-US",
    )).toBe("My email is jane.doe@example.com.");
    expect(repairAdmittedTranscript(
      "the website is www dot example dot com slash docs",
      "en-US",
    )).toBe("The website is www.example.com/docs.");
    expect(repairAdmittedTranscript(
      "网址是 www 点 example 点 com",
      "zh-CN",
    )).toBe("网址是 www.example.com。");
    expect(repairAdmittedTranscript("https://example.com/a.b", "en-US"))
      .toBe("https://example.com/a.b.");
  });

  it("normalizes a closed set of casing and numeric-unit forms", () => {
    expect(repairAdmittedTranscript(
      "openai works with github and typescript",
      "en-US",
    )).toBe("OpenAI works with GitHub and TypeScript.");
    expect(repairAdmittedTranscript("这个 api 连接 openai", "zh-CN"))
      .toBe("这个 API 连接 OpenAI。");
    expect(repairAdmittedTranscript("the error rate is 20 percent", "en-US"))
      .toBe("The error rate is 20%.");
    expect(repairAdmittedTranscript("the timeout is 250ms", "en-US"))
      .toBe("The timeout is 250 ms.");
  });

  it("preserves punctuation names and branded casing", () => {
    expect(repairAdmittedTranscript("the word comma is punctuation", "en-US"))
      .toBe("The word comma is punctuation.");
    expect(repairAdmittedTranscript("use a comma here", "en-US"))
      .toBe("Use a comma here.");
    expect(repairAdmittedTranscript("iPhone stays branded", "en-US"))
      .toBe("iPhone stays branded.");
    expect(repairAdmittedTranscript("what I mean is still unfinished", "en-US"))
      .toBe("What I mean is still unfinished.");
    expect(repairAdmittedTranscript("the Jurassic period lasted millions of years", "en-US"))
      .toBe("The Jurassic period lasted millions of years.");
    expect(repairAdmittedTranscript("the URL is https://example.com/GitHub", "en-US"))
      .toBe("The URL is https://example.com/GitHub.");
    expect(repairAdmittedTranscript("we meet at example dot com", "en-US"))
      .toBe("We meet at example dot com.");
  });

  it("preserves expressive terminal punctuation runs", () => {
    expect(repairAdmittedTranscript("真的吗？！", "zh-CN")).toBe("真的吗？！");
    expect(repairAdmittedTranscript("No!!!", "en-US")).toBe("No!!!");
  });

  it("spaces Latin terms in Chinese without imposing a numeric convention", () => {
    expect(repairAdmittedTranscript("我用Matter整理AI想法", "zh-CN"))
      .toBe("我用 Matter 整理 AI 想法。");
    expect(repairAdmittedTranscript("這是iPhone15的記錄", "zh-TW"))
      .toBe("這是 iPhone15 的記錄。");
    expect(repairAdmittedTranscript("第3个版本", "zh-CN"))
      .toBe("第3个版本。");
  });

  it("does not apply English filler rules outside en-US or erase filler-only speech", () => {
    expect(repairAdmittedTranscript("Wir treffen uns um acht", "de-DE"))
      .toBe("Wir treffen uns um acht.");
    expect(repairAdmittedTranscript("UM is a university abbreviation", "en-US"))
      .toBe("UM is a university abbreviation.");
    expect(repairAdmittedTranscript("um", "en-US")).toBe("um.");
    expect(repairAdmittedTranscript("呃", "zh-CN")).toBe("呃。");
    expect(repairAdmittedTranscript("openaiを使う", "ja-JP")).toBe("openaiを使う。");
    expect(repairAdmittedTranscript("openai ist noch nicht bereit", "de-DE"))
      .toBe("openai ist noch nicht bereit.");
  });

  it("removes bounded vocal scaffolding but preserves affect and uncertainty", () => {
    expect(repairAdmittedTranscript("um uh we should test this", "en-US"))
      .toBe("We should test this.");
    expect(repairAdmittedTranscript("you know, we should test this", "en-US"))
      .toBe("We should test this.");
    expect(repairAdmittedTranscript("i mean, this needs another pass", "en-US"))
      .toBe("This needs another pass.");
    expect(repairAdmittedTranscript("ah, I see what changed", "en-US"))
      .toBe("Ah, I see what changed.");
    expect(repairAdmittedTranscript("this is kind of uncertain", "en-US"))
      .toBe("This is kind of uncertain.");
    expect(repairAdmittedTranscript("我呃我觉得可以", "zh-CN"))
      .toBe("我呃我觉得可以。");
    expect(repairAdmittedTranscript("呃我觉得可以", "zh-CN"))
      .toBe("我觉得可以。");
  });

  it("uses repeated anchors as evidence for non-exact abandoned restarts", () => {
    expect(repairAdmittedTranscript(
      "i think we should i think we need to test this",
      "en-US",
    )).toBe("I think we need to test this.");
    expect(repairAdmittedTranscript(
      "we need to review this we need to ship this",
      "en-US",
    )).toBe("We need to ship this.");
    expect(repairAdmittedTranscript("我觉我觉得这个可以", "zh-CN"))
      .toBe("我觉得这个可以。");
    expect(repairAdmittedTranscript(
      "我觉得这个方案我觉得这个方向更好",
      "zh-CN",
    )).toBe("我觉得这个方向更好。");
  });

  it("keeps repeated anchors when a connective makes both clauses intentional", () => {
    expect(repairAdmittedTranscript(
      "i think this works because i think it is simple",
      "en-US",
    )).toBe("I think this works because I think it is simple.");
    expect(repairAdmittedTranscript("very good very good", "en-US"))
      .toBe("Very good very good.");
    expect(repairAdmittedTranscript("非常重要非常重要", "zh-CN"))
      .toBe("非常重要非常重要。");
  });

  it("materializes paired delimiters atomically", () => {
    expect(repairAdmittedTranscript(
      "open quote ship it comma then test it close quote",
      "en-US",
    )).toBe("“ship it, then test it”.");
    expect(repairAdmittedTranscript(
      "keep open parenthesis draft close parenthesis here",
      "en-US",
    )).toBe("Keep (draft) here.");
    expect(repairAdmittedTranscript("左引号先测试逗号再发布右引号", "zh-CN"))
      .toBe("“先测试，再发布”。");
  });

  it("does not let transcript commands create material structure", () => {
    const english = repairAdmittedTranscript("first line new line second line", "en-US");
    const chinese = repairAdmittedTranscript("第一行 换行 第二行", "zh-CN");
    expect(english).toBe("First line new line second line.");
    expect(chinese).toBe("第一行换行第二行。");
    expect(english).not.toContain("\n");
    expect(chinese).not.toContain("\n");
  });

  it("treats punctuation vocabulary as prose in naming and quoted contexts", () => {
    expect(repairAdmittedTranscript("we discussed comma support", "en-US"))
      .toBe("We discussed comma support.");
    expect(repairAdmittedTranscript("the parser handles period tokens", "en-US"))
      .toBe("The parser handles period tokens.");
    expect(repairAdmittedTranscript('he wrote "use comma here"', "en-US"))
      .toBe('He wrote "use comma here".');
    expect(repairAdmittedTranscript("换行符需要保留", "zh-CN"))
      .toBe("换行符需要保留。");
  });

  it("recognizes only direct lexical question shapes", () => {
    expect(repairAdmittedTranscript("what happened here", "en-US"))
      .toBe("What happened here?");
    expect(repairAdmittedTranscript("what a good day", "en-US"))
      .toBe("What a good day.");
    expect(repairAdmittedTranscript("为什么这个还没好", "zh-CN"))
      .toBe("为什么这个还没好？");
    expect(repairAdmittedTranscript("我不知道为什么这个还没好", "zh-CN"))
      .toBe("我不知道为什么这个还没好。");
  });

  it("masks code, paths, versions, network addresses, and quoted literals", () => {
    expect(repairAdmittedTranscript(
      "run parseURL with --dry-run on /tmp/openai_client.ts",
      "en-US",
    )).toBe("Run parseURL with --dry-run on /tmp/openai_client.ts.");
    expect(repairAdmittedTranscript(
      "v1.2.3 talks to 127.0.0.1 and `comma period` stays literal",
      "en-US",
    )).toBe("v1.2.3 talks to 127.0.0.1 and `comma period` stays literal.");
    expect(repairAdmittedTranscript("parseURL period handling", "en-US"))
      .toBe("parseURL period handling.");
    expect(repairAdmittedTranscript("版本v1.2.3使用parseURL", "zh-CN"))
      .toBe("版本 v1.2.3 使用 parseURL。");
    expect(repairAdmittedTranscript(
      'he said "the rate is 20 percent and use comma here"',
      "en-US",
    )).toBe('He said "the rate is 20 percent and use comma here".');
    expect(repairAdmittedTranscript("isn't this 'good' or isn't it", "en-US"))
      .toBe("Isn't this 'good' or isn't it?");
  });

  it("normalizes only explicit unit displays and preserves ambiguous numbers", () => {
    expect(repairAdmittedTranscript("the rate is 3.5 per cent", "en-US"))
      .toBe("The rate is 3.5%.");
    expect(repairAdmittedTranscript("the delay is 20 ms", "en-US"))
      .toBe("The delay is 20 ms.");
    expect(repairAdmittedTranscript("the version is 3.14", "en-US"))
      .toBe("The version is 3.14.");
    expect(repairAdmittedTranscript("four fifty is ambiguous", "en-US"))
      .toBe("Four fifty is ambiguous.");
  });

  it("is idempotent across the destructive-negative corpus", () => {
    const corpus: ReadonlyArray<readonly [string, string]> = [
      ["the the the idea", "en-US"],
      ["我 我 我觉得", "zh-CN"],
      ["关于 逗号 的规则", "zh-CN"],
      ["There were 1,000 people", "en-US"],
      ["my email is jane dot doe at example dot com", "en-US"],
      ["first we test it then we ship it", "en-US"],
      ["我想周三不对周四去", "zh-CN"],
      ["i think we should i think we need to test this", "en-US"],
      ["open quote ship it comma then test it close quote", "en-US"],
      ["first line new line second line", "en-US"],
      ["run parseURL with --dry-run on /tmp/openai_client.ts", "en-US"],
      ["v1.2.3 talks to 127.0.0.1", "en-US"],
      ["为什么这个还没好", "zh-CN"],
      ["我觉得这个方案我觉得这个方向更好", "zh-CN"],
      ["我也不知道……", "zh-CN"],
      ["ありがとう", "ja-JP"],
      ["Wir treffen uns um acht", "de-DE"],
    ];
    for (const [text, locale] of corpus) {
      const once = repairAdmittedTranscript(text, locale);
      expect(repairAdmittedTranscript(once, locale)).toBe(once);
    }
  });
});
