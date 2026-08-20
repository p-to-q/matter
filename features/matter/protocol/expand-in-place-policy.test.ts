import { describe, expect, it } from "vitest";
import {
  countExtendedGraphemes,
  deriveExpandInPlaceLength,
  validateExpandInPlaceCandidate,
} from "./expand-in-place-policy";

function candidate(overrides: Partial<Parameters<typeof validateExpandInPlaceCandidate>[0]> = {}) {
  return {
    sourceText: "source",
    candidateText: "source more",
    beforeText: "",
    afterText: "",
    amount: .5,
    ...overrides,
  };
}

describe("expand-in-place policy", () => {
  it.each([
    ["e\u0301", 1],
    ["👨‍👩‍👧‍👦", 1],
    ["🇨🇳", 1],
    ["👍🏽", 1],
    ["क्ष", 1],
  ] as const)("counts %s as %s extended grapheme", (text, count) => {
    expect(countExtendedGraphemes(text)).toBe(count);
  });

  it("uses graphemes for degree and UTF-16 for physical capacity", () => {
    expect(countExtendedGraphemes("👨‍👩‍👧‍👦")).toBe(1);
    expect(deriveExpandInPlaceLength("👨‍👩‍👧‍👦", "", "", 1)).toMatchObject({
      sourceGraphemes: 1,
      replacementCodeUnits: "👨‍👩‍👧‍👦".length,
      requestedDeltaGraphemes: 2,
      targetGraphemes: 3,
    });
    expect(deriveExpandInPlaceLength("a", "x".repeat(1_999), "", 1)).toBeNull();
    expect(deriveExpandInPlaceLength("😀".repeat(100), "x".repeat(1_200), "", 1)).toMatchObject({
      sourceGraphemes: 100,
      replacementCodeUnits: 200,
      remainingReplacementCodeUnits: 800,
      maximumDeltaGraphemes: 200,
      targetGraphemes: 300,
    });
    expect(deriveExpandInPlaceLength("a", "", "", 1)).toMatchObject({
      sourceGraphemes: 1,
      requestedDeltaGraphemes: 2,
      targetGraphemes: 3,
    });
  });

  it("enforces no-op, growth, delta band, replacement, and composed-node bounds", () => {
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "" }))).toMatchObject({ ok: false, code: "EMPTY" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "source" }))).toMatchObject({ ok: false, code: "NO_CHANGE" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "short" }))).toMatchObject({ ok: false, code: "NOT_GROWING" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "source " + "x".repeat(900) }))).toMatchObject({ ok: false, code: "BOUND_EXCEEDED" });
    expect(validateExpandInPlaceCandidate(candidate())).toMatchObject({ ok: true });
  });

  it("rejects wrapped, multiline, and dangerous-control output while allowing local punctuation", () => {
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "source\nmore" }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "- source more" }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "source\u202Emore" }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "\"source more\"" }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "Sure: source more", amount: 1 }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({ candidateText: "source, detail now", amount: 1 }))).toMatchObject({ ok: true });
  });

  it("rejects newly duplicated outer seams while allowing punctuation already owned by the source", () => {
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "内容",
      candidateText: "内容更加具体。",
      afterText: "。下一句",
      amount: 1,
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "question",
      candidateText: "question with detail?",
      afterText: "? next",
      amount: 1,
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "source",
      candidateText: " source more",
      amount: .5,
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "\"source\"",
      candidateText: "\"source more\"",
      amount: .3,
    }))).toMatchObject({ ok: true });
  });

  it("rejects only newly introduced chat or markup wrappers", () => {
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "Sure: source",
      candidateText: "Sure: source with detail",
      amount: .4,
    }))).toMatchObject({ ok: true });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "Matter: source",
      candidateText: "Matter: source with detail",
      amount: .4,
    }))).toMatchObject({ ok: true });
  });

  it("rejects newly introduced prompt artifacts but preserves literal source material", () => {
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "source material",
      candidateText: "source material </x>",
      amount: amountForActualDelta("source material", "source material </x>"),
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "source material",
      candidateText: "source material with ```explanation```",
      amount: amountForActualDelta("source material", "source material with ```explanation```"),
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "source </passage>",
      candidateText: "source with detail </passage>",
      amount: amountForActualDelta("source </passage>", "source with detail </passage>"),
    }))).toMatchObject({ ok: true });
  });

  it.each(["\u200B", "\u2060", "\u00AD"])("rejects dangerous invisible U+%s", (invisible) => {
    const candidateText = `source more${invisible}`;
    expect(validateExpandInPlaceCandidate(candidate({
      candidateText,
      amount: amountForActualDelta("source", candidateText),
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
  });

  it("preserves joiners inside source emoji without allowing new invisible structure", () => {
    const sourceText = "family 👨‍👩‍👧‍👦";
    const candidateText = "family together 👨‍👩‍👧‍👦";
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText,
      candidateText,
      amount: amountForActualDelta(sourceText, candidateText),
    }))).toMatchObject({ ok: true });
    const extraEmoji = `${candidateText} 👨‍👩‍👧‍👦`;
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText,
      candidateText: extraEmoji,
      amount: amountForActualDelta(sourceText, extraEmoji),
    }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
  });

  it("preserves source lexical order, protected anchors, and script", () => {
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "alpha beta",
      candidateText: "beta and alpha detail now",
      amount: 1,
    }))).toMatchObject({ ok: false, code: "SOURCE_MATERIAL_CHANGED" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "ship 2026-08-20 not",
      candidateText: "ship 2026-08-21 not with more detail",
      amount: .4,
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText: "alpha beta",
      candidateText: "alpha beta with 中文 details",
      amount: 1,
    }))).toMatchObject({ ok: false, code: "SCRIPT_DRIFT" });
  });

  it.each([
    ["ship 17 kg", "ship 18 kg with more detail"],
    ["ship 2026-08-20", "ship 2026-08-21 with exact dated detail"],
    ["open https://example.com", "open https://example.org with more exact surrounding detail visible here"],
    ["use item_id", "use item-id with more exact context"],
    ["not final", "not final because context"],
    ["if ready", "if ready because context"],
  ] as const)("rejects protected-anchor drift in %s", (sourceText, candidateText) => {
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText,
      candidateText,
      amount: amountForActualDelta(sourceText, candidateText),
    })))
      .toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
  });

  it.each([
    ["zh-CN 否定", "这个版本不稳定", "这个版本已经稳定并包含更多细节"],
    ["zh-CN 模态", "这个版本可能稳定", "这个版本已经稳定并包含更多细节"],
    ["zh-CN 量词", "所有模块已检查", "模块已经完整检查并包含更多细节"],
    ["zh-CN 条件", "如果准备好就发布", "准备好以后直接发布并完成记录"],
    ["zh-CN 因果", "因为延迟所以等待", "延迟期间继续等待并补充更多说明"],
    ["zh-TW 否定", "這個版本沒有問題", "這個版本已經清楚完整並包含細節"],
    ["zh-TW 模态", "這個版本應該穩定", "這個版本已經穩定並包含更多細節"],
    ["zh-TW 量词", "每個模組已檢查", "模組已經完整檢查並包含更多細節"],
    ["zh-TW 条件", "除非準備好才發布", "準備完成以後直接發布並留下記錄"],
    ["zh-TW 因果", "因此我們繼續等待", "我們在這段時間繼續等待並補充說明"],
    ["ja-JP 否定", "この版は安定していない", "この版は十分に安定していて詳細も含む"],
    ["ja-JP 模态", "この版は安定するかもしれない", "この版は十分に安定していて詳細も含む"],
    ["ja-JP 量词", "すべての項目を確認した", "項目を丁寧に確認して詳細も記録した"],
    ["ja-JP 条件", "もし準備ができたら公開する", "準備ができた時点で公開して記録も残す"],
    ["ja-JP 因果", "遅延のため待つ", "遅延している間は待って詳細も記録する"],
    ["de-DE 否定", "Die Version ist nicht stabil", "Die Version ist vollständig stabil und genauer beschrieben"],
    ["de-DE 模态", "Die Version könnte stabil sein", "Die Version ist vollständig stabil und genauer beschrieben"],
    ["de-DE 量词", "Alle Module wurden geprüft", "Module wurden vollständig geprüft und genauer dokumentiert"],
    ["de-DE 条件", "Wenn alles bereit ist veröffentlichen wir", "Alles ist bereit und wir veröffentlichen mit genauer Dokumentation"],
    ["de-DE 因果", "Weil es spät ist warten wir", "Es ist spät und wir warten mit einer genaueren Dokumentation"],
    ["en-US negation", "The version is not stable", "The version is fully stable and described in more detail"],
    ["en-US modality", "The version might be stable", "The version is fully stable and described in more detail"],
    ["en-US quantifier", "All modules are ready", "Modules are completely ready with more documented detail"],
    ["en-US condition", "If it is ready we publish", "It is ready and we publish with more documented detail"],
    ["en-US cause", "Because it is late we wait", "It is late and we wait with more documented detail"],
  ] as const)("rejects %s marker drift", (_label, sourceText, candidateText) => {
    expect(validateExpandInPlaceCandidate(candidate({
      sourceText,
      candidateText,
      amount: amountForActualDelta(sourceText, candidateText),
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
  });
});

function amountForActualDelta(sourceText: string, candidateText: string): number {
  const source = countExtendedGraphemes(sourceText);
  const delta = countExtendedGraphemes(candidateText) - source;
  if (delta < 1) throw new Error("protected-marker fixture must grow");
  return Math.min(1, delta / (2 * source));
}
