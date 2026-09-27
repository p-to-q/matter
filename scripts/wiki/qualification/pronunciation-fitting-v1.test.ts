import { describe, expect, it } from "vitest";
import { applyWikiEvent, createEmptyWikiState } from
  "../../../features/matter/wiki/wiki-evidence";
import type { WikiState } from "../../../features/matter/wiki/wiki-model";
import {
  compileQualificationPronunciationSnapshot,
  fitQualificationPronunciationText,
  type QualificationPronunciationProducer,
} from "./pronunciation-fitting-v1";

describe("offline Wiki pronunciation qualification", () => {
  it("requires an explicit producer before building or fitting an index", () => {
    const disabled = compileQualificationPronunciationSnapshot(
      withLexemes("en-US", "Knightfall"),
      new Set(),
    );
    expect(disabled.stats["en-metaphone-v1"].eligibleLexemeCount).toBe(0);
    expect(fitQualificationPronunciationText(disabled, {
      locale: "en-US",
      channel: "spoken",
      text: "Nightfall",
    }, "en-metaphone-v1")).toEqual([]);
  });

  it("recognizes a bounded English sound-alike and rejects a distant collision", () => {
    const snapshot = pronunciationSnapshot("en-metaphone-v1", "en-US",
      "Knightfall", "Matter");

    expect(fitQualificationPronunciationText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Nightfall",
    }, "en-metaphone-v1")).toEqual([
      expect.objectContaining({
        form: "Nightfall",
        canonical: "Knightfall",
        producer: "en-metaphone-v1",
      }),
    ]);
    expect(fitQualificationPronunciationText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Material",
    }, "en-metaphone-v1")).toEqual([]);
  });

  it("emits exact Mandarin homophone evidence with locale isolation", () => {
    const snapshot = pronunciationSnapshot(
      "zh-exact-homophone-v1",
      "zh-CN",
      "青色原野",
    );

    expect(fitQualificationPronunciationText(snapshot, {
      locale: "zh-CN",
      channel: "spoken",
      text: "青涩原野",
    }, "zh-exact-homophone-v1")).toEqual([
      expect.objectContaining({
        form: "青涩原野",
        canonical: "青色原野",
        producer: "zh-exact-homophone-v1",
      }),
    ]);
    expect(fitQualificationPronunciationText(snapshot, {
      locale: "zh-TW",
      channel: "spoken",
      text: "青澀原野",
    }, "zh-exact-homophone-v1")).toEqual([]);
  });

  it("limits Mandarin near-sound fitting to the declared final pairs", () => {
    const snapshot = pronunciationSnapshot("zh-final-pair-v1", "zh-CN", "商河");

    expect(fitQualificationPronunciationText(snapshot, {
      locale: "zh-CN",
      channel: "spoken",
      text: "山河",
    }, "zh-final-pair-v1")).toEqual([
      expect.objectContaining({
        form: "山河",
        canonical: "商河",
        producer: "zh-final-pair-v1",
      }),
    ]);
    expect(fitQualificationPronunciationText(snapshot, {
      locale: "zh-CN",
      channel: "spoken",
      text: "三合",
    }, "zh-final-pair-v1")).toEqual([]);
  });

  it("abstains for an observed canonical and an ambiguous pronunciation bucket", () => {
    const noOp = pronunciationSnapshot("en-metaphone-v1", "en-US", "Write", "Right");
    expect(fitQualificationPronunciationText(noOp, {
      locale: "en-US",
      channel: "spoken",
      text: "Write",
    }, "en-metaphone-v1")).toEqual([]);

    const ambiguous = pronunciationSnapshot(
      "en-metaphone-v1",
      "en-US",
      "Night",
      "Knight",
    );
    expect(fitQualificationPronunciationText(ambiguous, {
      locale: "en-US",
      channel: "spoken",
      text: "Nite",
    }, "en-metaphone-v1")).toEqual([]);
  });
});

function pronunciationSnapshot(
  producer: QualificationPronunciationProducer,
  locale: "en-US" | "zh-CN" | "zh-TW",
  ...canonicals: string[]
) {
  return compileQualificationPronunciationSnapshot(
    withLexemes(locale, ...canonicals),
    new Set([producer]),
  );
}

function withLexemes(
  locale: "en-US" | "zh-CN" | "zh-TW",
  ...canonicals: string[]
): WikiState {
  let state = createEmptyWikiState();
  for (const canonical of canonicals) {
    const result = applyWikiEvent(state, {
      type: "create-lexeme",
      locale,
      canonical,
      scope: "both",
    });
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  return state;
}
