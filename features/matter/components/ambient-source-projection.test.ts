import { describe, expect, it } from "vitest";
import { projectCoverSourceRect } from "./ambient-source-projection";

describe("ambient source projection", () => {
  it("uses the same centered cover crop as the paper media", () => {
    expect(projectCoverSourceRect({ width: 1920, height: 1080 }, { width: 1000, height: 1000 }))
      .toEqual({ left: 420, top: 0, width: 1080, height: 1080 });
    expect(projectCoverSourceRect({ width: 1000, height: 1000 }, { width: 2000, height: 1000 }))
      .toEqual({ left: 0, top: 250, width: 1000, height: 500 });
  });

  it("fails closed for invalid media or paper bounds", () => {
    expect(projectCoverSourceRect({ width: 0, height: 100 }, { width: 100, height: 100 })).toBeNull();
    expect(projectCoverSourceRect({ width: 100, height: 100 }, { width: Number.NaN, height: 100 })).toBeNull();
  });
});
