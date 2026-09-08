import { describe, expect, it } from "vitest";
import { projectFocusedMaterialRevealField } from "./focused-material-visibility";

const visualViewport = { left: 0, top: 0, width: 320, height: 720 };
const paper = { left: 8, top: 64, width: 304, height: 648 };
const rail = { left: 248, top: 200, width: 60, height: 300 };

describe("focused material visibility", () => {
  it("does not move material that is already inside the unobscured paper", () => {
    expect(projectFocusedMaterialRevealField({
      target: { left: 8, top: 80, width: 236, height: 90 },
      paper,
      visualViewport,
      occluders: [rail],
    })).toBeNull();
  });

  it("does not move visible material outside a distant rail's largest remainder", () => {
    expect(projectFocusedMaterialRevealField({
      target: { left: 260, top: 80, width: 40, height: 90 },
      paper,
      visualViewport,
      occluders: [rail],
    })).toBeNull();
  });

  it("projects the largest readable field when material extends outside paper", () => {
    expect(projectFocusedMaterialRevealField({
      target: { left: 300, top: 80, width: 236, height: 90 },
      paper,
      visualViewport,
      occluders: [rail],
    })).toEqual({ x: 128, y: 388, width: 240, height: 648 });
  });

  it("projects the largest readable field when a rail obscures focused material", () => {
    expect(projectFocusedMaterialRevealField({
      target: { left: 260, top: 250, width: 40, height: 90 },
      paper,
      visualViewport,
      occluders: [rail],
    })).toEqual({ x: 128, y: 388, width: 240, height: 648 });
  });

  it("clips paper to the visual viewport and can remove a left drawer", () => {
    expect(projectFocusedMaterialRevealField({
      target: { left: 400, top: 100, width: 200, height: 80 },
      paper: { left: -20, top: 20, width: 440, height: 700 },
      visualViewport,
      occluders: [{ left: 0, top: 20, width: 96, height: 700 }],
    })).toEqual({ x: 208, y: 370, width: 224, height: 700 });
  });

  it("fails closed for malformed or completely occluded geometry", () => {
    expect(projectFocusedMaterialRevealField({
      target: { left: Number.NaN, top: 0, width: 10, height: 10 },
      paper,
      visualViewport,
      occluders: [],
    })).toBeNull();
    expect(projectFocusedMaterialRevealField({
      target: { left: 300, top: 80, width: 20, height: 20 },
      paper,
      visualViewport,
      occluders: [paper],
    })).toBeNull();
  });
});
