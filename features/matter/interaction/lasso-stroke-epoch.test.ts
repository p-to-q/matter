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
    for (const changed of [
      { ...epoch, treeRevision: epoch.treeRevision + 1 },
      { ...epoch, layoutEpoch: epoch.layoutEpoch + 1 },
      { ...epoch, viewportX: epoch.viewportX + 1 },
      { ...epoch, viewportY: epoch.viewportY + 1 },
      { ...epoch, viewportZoom: epoch.viewportZoom + 0.1 },
    ]) {
      expect(isCurrentLassoStroke(epoch, changed, 3, 3)).toBe(false);
    }
    expect(isCurrentLassoStroke(null, epoch, 3, 3)).toBe(false);
  });
});
