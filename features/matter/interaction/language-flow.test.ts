import { describe, expect, it } from "vitest";
import { clientDepthToWorld, projectLanguageFlow } from "./language-flow";

describe("language flow projection", () => {
  it("reports the growth a closed-slot projection gains from the open slot", () => {
    // Real flow decides its own positions, so damage only needs how tall the
    // partitions stand closed plus the depth that was opened.
    expect(projectLanguageFlow({
      naturalProjectedHeight: 120,
      slotDepth: 40,
      sourceHeight: 120,
    })).toEqual({ bottomExtent: 40, presentationHeight: 160, topExtent: 0 });
  });

  it("keeps the upper boundary fixed for either grip", () => {
    // Splitting the flow can make the projection taller than the source even
    // before the slot opens, and growth is still downward only.
    expect(projectLanguageFlow({
      naturalProjectedHeight: 160,
      slotDepth: 0,
      sourceHeight: 120,
    })).toEqual({ bottomExtent: 40, presentationHeight: 160, topExtent: 0 });
  });

  it("never reports negative growth for a projection shorter than its source", () => {
    expect(projectLanguageFlow({
      naturalProjectedHeight: 80,
      slotDepth: 10,
      sourceHeight: 120,
    })).toEqual({ bottomExtent: 0, presentationHeight: 90, topExtent: 0 });
  });

  it("fails closed on values it cannot trust", () => {
    for (const input of [
      { naturalProjectedHeight: -1, slotDepth: 0, sourceHeight: 10 },
      { naturalProjectedHeight: 10, slotDepth: -1, sourceHeight: 10 },
      { naturalProjectedHeight: 10, slotDepth: 0, sourceHeight: Number.NaN },
    ]) expect(projectLanguageFlow(input)).toBeNull();
  });

  it("converts client depth into canvas units", () => {
    expect(clientDepthToWorld(144, 2)).toBe(72);
    expect(clientDepthToWorld(144, 0)).toBeNull();
    expect(clientDepthToWorld(-1, 1)).toBeNull();
  });
});
