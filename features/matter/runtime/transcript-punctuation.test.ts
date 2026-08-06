import { describe, expect, it } from "vitest";
import { normalizeAdmittedTranscript } from "./transcript-punctuation";

describe("normalizeAdmittedTranscript", () => {
  it("adds language-appropriate terminal punctuation", () => {
    expect(normalizeAdmittedTranscript("我记得那天")).toBe("我记得那天。");
    expect(normalizeAdmittedTranscript("I remember that day")).toBe("I remember that day.");
  });
  it("turns spoken punctuation into punctuation marks", () => {
    expect(normalizeAdmittedTranscript("先停一下 逗号 然后继续 句号")).toBe("先停一下，然后继续。");
    expect(normalizeAdmittedTranscript("wait comma then go period")).toBe("wait, then go.");
  });
  it("preserves existing terminal punctuation and wording", () => {
    expect(normalizeAdmittedTranscript("已经完成！")).toBe("已经完成！");
    expect(normalizeAdmittedTranscript("  hello   world?  ")).toBe("hello   world?");
    expect(normalizeAdmittedTranscript("comma begin period")).toBe(", begin.");
  });
});
