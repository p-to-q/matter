import { describe, expect, it } from "vitest";
import { isCurrentLassoStroke, type LassoMeasurementEpoch } from "./lasso-stroke-epoch";

const epoch: LassoMeasurementEpoch = {
  treeRevision: 4,
  layoutEpoch: 7,
  viewportX: 0,
  viewportY: 0,
  viewportZoom: 1,
};

describe("lasso stroke epoch", () => {
  it("rejects a stroke from an exact same-id/revision material after document switch", () => {
    expect(isCurrentLassoStroke(epoch, epoch, 2, 3)).toBe(false);
  });

  it("accepts only an unchanged document and measurement epoch", () => {
    expect(isCurrentLassoStroke(epoch, epoch, 3, 3)).toBe(true);
    expect(isCurrentLassoStroke(epoch, { ...epoch, viewportX: 1 }, 3, 3)).toBe(false);
  });
});
