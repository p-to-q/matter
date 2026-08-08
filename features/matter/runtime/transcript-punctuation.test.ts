import { describe, expect, it } from "vitest";
import { normalizeAdmittedTranscript } from "./transcript-punctuation";

describe("normalizeAdmittedTranscript", () => {
  it("adds language-appropriate terminal punctuation", () => {
    expect(normalizeAdmittedTranscript("我记得那天")).toBe("我记得那天。");
    expect(normalizeAdmittedTranscript("I remember that day")).toBe("I remember that day.");
  });

  it("turns spoken CJK punctuation into punctuation marks", () => {
    expect(normalizeAdmittedTranscript("先停一下 逗号 然后继续 句号")).toBe("先停一下，然后继续。");
    expect(normalizeAdmittedTranscript("这样好吗 问号")).toBe("这样好吗？");
  });

  it("keeps a named CJK punctuation word as the person's wording", () => {
    // 句号 after a determiner is the noun, not a dictation command.
    expect(normalizeAdmittedTranscript("这个句号打错了")).toBe("这个句号打错了。");
    expect(normalizeAdmittedTranscript("那个逗号可以去掉")).toBe("那个逗号可以去掉。");
  });

  it("never rewrites English wording", () => {
    // The regression this guards: "period" and "comma" are ordinary nouns, and
    // no lexical rule can tell a dictated command from the word itself.
    expect(normalizeAdmittedTranscript("during that period we shipped"))
      .toBe("during that period we shipped.");
    expect(normalizeAdmittedTranscript("put a comma there"))
      .toBe("put a comma there.");
    expect(normalizeAdmittedTranscript("the Cretaceous period"))
      .toBe("the Cretaceous period.");
    expect(normalizeAdmittedTranscript("she asked a question mark my words"))
      .toBe("she asked a question mark my words.");
  });

  it("preserves existing terminal punctuation and wording", () => {
    expect(normalizeAdmittedTranscript("已经完成！")).toBe("已经完成！");
    expect(normalizeAdmittedTranscript("  hello   world?  ")).toBe("hello   world?");
  });

  it("drops a dangling trailing comma rather than ending on a seam", () => {
    expect(normalizeAdmittedTranscript("先停一下 逗号")).toBe("先停一下。");
  });
});
