import { describe, expect, it } from "vitest";
import {
  collectCommittedWikiTerms,
  collectCommittedWikiTermsResult,
  wikiTermSegmenterConforms,
} from "./wiki-term-collection";

describe("Wiki automatic term collection", () => {
  it("proves the host segmenter before collecting locale words", () => {
    expect(wikiTermSegmenterConforms()).toBe(true);
  });

  it("keeps distinctive and broad lexical evidence separate within one turn", () => {
    const events = collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text: "We remember OpenAI and material",
    });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({
      canonical: "OpenAI",
      producer: "shape-specific-v1",
      source: "recent-material",
    }), expect.objectContaining({
      canonical: "material",
      producer: "locale-segment-v1",
    })]));
  });

  it("admits regional lexical segments while filtering grammatical glue", () => {
    const events = collectCommittedWikiTerms({
      locale: "zh-CN",
      channel: "spoken",
      text: "我们记得青色原野，因为这个材料属于青色原野",
    });
    expect(events.map((event) => event.canonical)).toEqual([
      "材料", "记得", "青色", "原野",
    ]);
    expect(events).toEqual(events.map(() => expect.objectContaining({
      producer: "locale-segment-v1",
    })));
  });

  it("never learns protected or generated material", () => {
    const text = "We saw `Engelbart` and later Morphogenesis";
    const humanStart = text.indexOf("and");
    const generatedStart = text.indexOf("Morphogenesis");
    expect(collectCommittedWikiTerms({
      locale: "en-US",
      channel: "written",
      text,
      eligibleRanges: [{ start: humanStart, end: generatedStart - 1 }],
    }).map((event) => event.canonical)).toEqual(["later"]);
  });

  it("keeps identifiers eligible as terms but still protects code and URLs", () => {
    expect(collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text: "OpenAI KFC `GraphQL` https://example.com Morphogenesis",
    }).map((event) => event.canonical)).toEqual([
      "KFC", "Morphogenesis", "OpenAI",
    ]);
  });

  it("can release-gate broad and distinctive producers independently", () => {
    expect(collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text: "Matter remembers material",
    }, new Set(["locale-segment-v1"])).map((event) => event.canonical)).toEqual([
      "material", "Matter", "remembers",
    ]);
  });

  it("does not treat ordinary title case as one-turn confidence", () => {
    const events = collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text: "Matter OpenAI GitHub KFC",
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonical: "Matter", producer: "locale-segment-v1" }),
      expect.objectContaining({ canonical: "OpenAI", producer: "shape-specific-v1" }),
      expect.objectContaining({ canonical: "GitHub", producer: "shape-specific-v1" }),
      expect.objectContaining({ canonical: "KFC", producer: "shape-specific-v1" }),
    ]));
  });

  it("rejects malformed ranges as one atomic observation batch", () => {
    expect(collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text: "We remember Engelbart",
      eligibleRanges: [{ start: 20, end: 3 }],
    })).toEqual([]);
  });

  it("collects terms from every disjoint eligible range", () => {
    const text = "OpenAI ignored Morphogenesis";
    const second = text.indexOf("Morphogenesis");
    const events = collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text,
      eligibleRanges: [
        { start: 0, end: "OpenAI".length },
        { start: second, end: text.length },
      ],
    });

    expect(events.map((event) => event.canonical)).toEqual([
      "Morphogenesis",
      "OpenAI",
    ]);
  });

  it("scores a partial scan in text order and reports only the scripts it scanned", () => {
    const words = Array.from({ length: 33 }, (_, index) =>
      `material${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
    const result = collectCommittedWikiTermsResult({
      locale: "en-US",
      channel: "spoken",
      text: [...words, "材料"].join(" "),
    });

    expect(result.status).toBe("partial");
    expect(result.events.map((event) => event.canonical)).toEqual(words.slice(0, 32));
    expect(result.scannedScripts).toEqual(["latin"]);
  });

  it("reports eligible unprotected scripts as the comparable opportunity", () => {
    expect(collectCommittedWikiTermsResult({
      locale: "en-US",
      channel: "spoken",
      text: "Morphogenesis 材料 `カタカナ`",
    })).toMatchObject({ status: "ok", scannedScripts: ["latin", "han"] });
    expect(collectCommittedWikiTermsResult({
      locale: "en-US",
      channel: "spoken",
      text: "Morphogenesis 材料",
      eligibleRanges: [{ start: 14, end: 16 }],
    })).toMatchObject({ status: "ok", events: [], scannedScripts: ["han"] });
    expect(collectCommittedWikiTermsResult({
      locale: "en-US",
      channel: "spoken",
      text: "",
    })).toEqual({ status: "censored", events: [], scannedScripts: [] });
  });
});
