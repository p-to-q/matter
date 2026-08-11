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
      .toBe("i think this works.");
    expect(repairAdmittedTranscript("well, uh, i think", "en-US"))
      .toBe("well, i think.");
    expect(repairAdmittedTranscript("呃，我 我觉得可以", "zh-CN"))
      .toBe("我觉得可以。");
    expect(repairAdmittedTranscript("我觉得，呃，然后", "zh-CN"))
      .toBe("我觉得，然后。");
  });

  it("collapses all recognition echoes in one idempotent pass", () => {
    const english = repairAdmittedTranscript("the the the answer", "en-US");
    const chinese = repairAdmittedTranscript("我 我 我觉得可以", "zh-CN");
    expect(english).toBe("the answer.");
    expect(chinese).toBe("我觉得可以。");
    expect(repairAdmittedTranscript(english, "en-US")).toBe(english);
    expect(repairAdmittedTranscript(chinese, "zh-CN")).toBe(chinese);
  });

  it("keeps ambiguous discourse markers and meaningful repetition", () => {
    expect(repairAdmittedTranscript("like I really really mean it", "en-US"))
      .toBe("like I really really mean it.");
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
      .toBe("先停一下逗号然后继续。");
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
  });

  it("is idempotent across the destructive-negative corpus", () => {
    const corpus: ReadonlyArray<readonly [string, string]> = [
      ["the the the idea", "en-US"],
      ["我 我 我觉得", "zh-CN"],
      ["关于 逗号 的规则", "zh-CN"],
      ["There were 1,000 people", "en-US"],
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
