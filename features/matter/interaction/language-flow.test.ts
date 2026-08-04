import { describe, expect, it } from "vitest";
import { clientDepthToWorld, projectLanguageFlow } from "./language-flow";

const RECEIPT = {
  sourceHeight: 120,
  selectedTop: 36,
  afterNaturalTop: 72,
  afterHeight: 48,
  slotDepth: 60,
} as const;

describe("language flow projection", () => {
  it("moves only the suffix by the exact downward slot", () => {
    expect(projectLanguageFlow({ ...RECEIPT, handle: "bottom" })).toEqual({
      selectedTop: 36,
      slotTop: 72,
      afterTop: 132,
      topExtent: 0,
      bottomExtent: 60,
      presentationHeight: 180,
    });
  });

  it("keeps the same projection when the upper edge owns degree", () => {
    expect(projectLanguageFlow({ ...RECEIPT, handle: "top" }))
      .toEqual(projectLanguageFlow({ ...RECEIPT, handle: "bottom" }));
  });

  it("counts only real overflow beyond the unchanged source box", () => {
    expect(projectLanguageFlow({
      ...RECEIPT,
      afterNaturalTop: 60,
      afterHeight: 20,
      slotDepth: 10,
      handle: "bottom",
    })?.bottomExtent).toBe(0);
  });

  it("rejects impossible or malformed measurement receipts atomically", () => {
    expect(projectLanguageFlow({ ...RECEIPT, afterNaturalTop: 20, handle: "bottom" })).toBeNull();
    expect(projectLanguageFlow({ ...RECEIPT, sourceHeight: Number.NaN, handle: "top" })).toBeNull();
    expect(projectLanguageFlow({ ...RECEIPT, slotDepth: -1, handle: "bottom" })).toBeNull();
  });

  it("converts client travel to stable world space at canvas zoom", () => {
    expect(clientDepthToWorld(60, 1)).toBe(60);
    expect(clientDepthToWorld(60, 1.5)).toBe(40);
    expect(clientDepthToWorld(60, 0.75)).toBe(80);
    expect(clientDepthToWorld(60, 0)).toBeNull();
  });
});
