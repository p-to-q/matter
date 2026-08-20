import { describe, expect, it } from "vitest";
import {
  clientDepthToWorld,
  projectLanguageFlow,
  projectSelectionLocalLane,
} from "./language-flow";

const RECEIPT = {
  sourceHeight: 120,
  selectedTop: 36,
  afterNaturalTop: 72,
  afterHeight: 48,
  slotDepth: 60,
} as const;

describe("language flow projection", () => {
  it("places fixed and traveling controls before the projected suffix", () => {
    expect(projectSelectionLocalLane({
      selectedBottom: 96,
      afterNaturalTop: 72,
      beforeGap: 8,
      afterGap: 8,
      contentDepth: 60,
      fixedControlDepth: 120,
      travelingControlDepth: 52,
    })).toEqual({
      controlTop: 104,
      travelingControlTop: 164,
      laneBottom: 224,
      afterTop: 232,
      slotDepth: 160,
    });
  });

  it("keeps a rewrite lane local when the suffix already begins lower", () => {
    expect(projectSelectionLocalLane({
      selectedBottom: 96,
      afterNaturalTop: 160,
      beforeGap: 14,
      afterGap: 8,
      contentDepth: 0,
      fixedControlDepth: 60,
      travelingControlDepth: 0,
    }))?.toEqual({
      controlTop: 110,
      travelingControlTop: 110,
      laneBottom: 170,
      afterTop: 178,
      slotDepth: 18,
    });
  });

  it("rejects malformed selection-local lane inputs", () => {
    expect(projectSelectionLocalLane({
      selectedBottom: 10,
      afterNaturalTop: 10,
      beforeGap: -1,
      afterGap: 0,
      contentDepth: 0,
      fixedControlDepth: 40,
      travelingControlDepth: 0,
    })).toBeNull();
  });

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
    expect(projectLanguageFlow({ ...RECEIPT, sourceHeight: Number.NaN, handle: "bottom" })).toBeNull();
    expect(projectLanguageFlow({ ...RECEIPT, slotDepth: -1, handle: "bottom" })).toBeNull();
  });

  it("converts client travel to stable world space at canvas zoom", () => {
    expect(clientDepthToWorld(60, 1)).toBe(60);
    expect(clientDepthToWorld(60, 1.5)).toBe(40);
    expect(clientDepthToWorld(60, 0.75)).toBe(80);
    expect(clientDepthToWorld(60, 0)).toBeNull();
  });
});
