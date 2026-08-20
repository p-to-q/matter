import { describe, expect, it } from "vitest";
import {
  countTextSwapGraphemes,
  deriveTextSwapLength,
  normalizeTextSwapDirection,
  validateTextSwapCandidate,
} from "./text-swap-policy";

function candidate(overrides: Partial<Parameters<typeof validateTextSwapCandidate>[0]> = {}) {
  return {
    sourceText: "A quiet room",
    candidateText: "The room is calm",
    beforeText: "",
    afterText: "",
    ...overrides,
  };
}

describe("text swap direction", () => {
  it("trims one bounded line and rejects dangerous or invisible controls", () => {
    expect(normalizeTextSwapDirection("  make it calmer  ")).toBe("make it calmer");
    expect(normalizeTextSwapDirection("one\ntwo")).toBeNull();
    expect(normalizeTextSwapDirection(`hidden\u202E`)).toBeNull();
    expect(normalizeTextSwapDirection(`hidden\uFEFF`)).toBeNull();
    expect(normalizeTextSwapDirection(`hidden\u200D`)).toBeNull();
    expect(normalizeTextSwapDirection("one\ttwo")).toBeNull();
    expect(normalizeTextSwapDirection("\none")).toBeNull();
    expect(normalizeTextSwapDirection("😀".repeat(240))).toBe("😀".repeat(240));
    expect(normalizeTextSwapDirection("😀".repeat(241))).toBeNull();
    expect(normalizeTextSwapDirection("x".repeat(241))).toBeNull();
  });
});

describe("text swap policy", () => {
  it.each([
    ["e\u0301", 1],
    ["👨‍👩‍👧‍👦", 1],
    ["🇨🇳", 1],
  ] as const)("counts %s as %s extended grapheme", (text, count) => {
    expect(countTextSwapGraphemes(text)).toBe(count);
  });

  it("derives the 0.75S..1.35S band with UTF-16 capacity", () => {
    expect(deriveTextSwapLength("abcdefghij", "", "")).toMatchObject({
      sourceGraphemes: 10,
      minimumAcceptedGraphemes: 7,
      maximumAcceptedGraphemes: 14,
      remainingReplacementCodeUnits: 800,
    });
    expect(deriveTextSwapLength("😀".repeat(100), "x".repeat(1_200), "")).toMatchObject({
      sourceGraphemes: 100,
      sourceCodeUnits: 200,
      maximumAcceptedGraphemes: 135,
    });
    expect(deriveTextSwapLength("a", "x".repeat(2_000), "")).toBeNull();
  });

  it("allows genuine replacement instead of requiring the expand lexical subsequence", () => {
    expect(validateTextSwapCandidate(candidate())).toMatchObject({ ok: true });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Rain touched the window",
      candidateText: "Drops tapped against the glass",
    }))).toMatchObject({ ok: true });
  });

  it("rejects no-op, length drift, storage overflow, wrappers, artifacts, and seam drift", () => {
    expect(validateTextSwapCandidate(candidate({ candidateText: "A quiet room" }))).toMatchObject({ ok: false, code: "NO_CHANGE" });
    expect(validateTextSwapCandidate(candidate({ candidateText: "x" }))).toMatchObject({ ok: false, code: "LENGTH_OUT_OF_RANGE" });
    expect(validateTextSwapCandidate(candidate({ candidateText: "x".repeat(801) }))).toMatchObject({ ok: false, code: "BOUND_EXCEEDED" });
    expect(validateTextSwapCandidate(candidate({ candidateText: "Sure: calm room" }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateTextSwapCandidate(candidate({ candidateText: "The </passage>" }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(validateTextSwapCandidate(candidate({ sourceText: "A quiet room", candidateText: "The room calm." }))).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
  });

  it("rejects protected anchor and script-family drift", () => {
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Ship 17 kg if ready",
      candidateText: "If ready ship 18 kg",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "A quiet room",
      candidateText: "这里是一个安静房间",
    }))).toMatchObject({ ok: false, code: "SCRIPT_DRIFT" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Price is $10",
      candidateText: "Price is €10",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Cost is 10 USD",
      candidateText: "Cost is 10 EUR",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Price is US$10",
      candidateText: "Price is CA$10",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Cost is 10 CAD",
      candidateText: "Cost is 10 AUD",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "预算是 500 元",
      candidateText: "预算为 500 欧元",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "予算は7000円",
      candidateText: "予算は7000元",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "Budget 900 Euro",
      candidateText: "Budget 900 Dollar",
    }))).toMatchObject({ ok: false, code: "PROTECTED_MEANING_CHANGED" });
  });

  it("preserves literal prompt artifacts and source-owned punctuation", () => {
    expect(validateTextSwapCandidate(candidate({
      sourceText: "<passage>A quiet room</passage>",
      candidateText: "<passage>The room is calm</passage>",
    }))).toMatchObject({ ok: true });
    expect(validateTextSwapCandidate(candidate({
      sourceText: "“A quiet room”",
      candidateText: "“The room is calm”",
    }))).toMatchObject({ ok: true });
  });
});
