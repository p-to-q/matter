import { describe, expect, it } from "vitest";
import {
  MAX_VOCABULARY_TERMS,
  collectVocabulary,
} from "./material-vocabulary";

describe("collectVocabulary", () => {
  it("keeps the terms a person used more than once, most-used first", () => {
    const terms = collectVocabulary(
      [
        "这次改版的关键是留白，留白不是空着不用",
        "留白决定了整页的呼吸，改版之后更明显",
      ],
      "zh-CN",
    );
    expect(terms[0]).toBe("留白");
    expect(terms).toContain("改版");
  });

  it("reads Latin material through the same path", () => {
    const terms = collectVocabulary(
      [
        "the retrieval pipeline keeps timing out",
        "retrieval is the slow part of that pipeline",
      ],
      "en-US",
    );
    expect(terms).toContain("retrieval");
    expect(terms).toContain("pipeline");
  });

  it("drops grammar, single characters, and bare numbers", () => {
    const terms = collectVocabulary(
      ["我的这个东西是 3 个，我的那个也是 3 个"],
      "zh-CN",
    );
    expect(terms).not.toContain("的");
    expect(terms).not.toContain("3");
  });

  it("says nothing about a term used only once", () => {
    expect(collectVocabulary(["只出现一次的专有名词叫做栖流"], "zh-CN")).toEqual([]);
  });

  it("is deterministic for the same material", () => {
    const material = ["留白和呼吸", "留白和呼吸，还有留白"];
    expect(collectVocabulary(material, "zh-CN")).toEqual(collectVocabulary(material, "zh-CN"));
  });

  it("stays inside its count and length bounds", () => {
    const material = Array.from({ length: 80 }, (_, index) => `术语${index} 术语${index}`);
    const terms = collectVocabulary(material, "zh-CN");
    expect(terms.length).toBeLessThanOrEqual(MAX_VOCABULARY_TERMS);
    expect(terms.every((term) => term.length <= 32)).toBe(true);
  });

  it("drops an over-long token rather than truncating it into a different word", () => {
    // Truncation would invent a term the person never used, which is worse than
    // having no hint: it would be offered as one of their own words.
    const long = "supercalifragilisticexpialidocious".repeat(2);
    expect(collectVocabulary([`${long} and ${long}`], "en-US")).toEqual([]);
  });

  it("degrades to a shorter hint rather than throwing on an unusable locale", () => {
    expect(() => collectVocabulary(["留白和留白"], "not-a-locale")).not.toThrow();
  });

  it("returns nothing when asked for nothing", () => {
    expect(collectVocabulary(["留白和留白"], "zh-CN", { maxTerms: 0 })).toEqual([]);
  });
});
