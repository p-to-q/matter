import { describe, expect, it } from "vitest";
import { projectCanvasGeometryPublication } from "./canvas-geometry-publication";

describe("canvas geometry publication", () => {
  it("keeps layout authority intact while producing only rendering-edge properties", () => {
    const publication = projectCanvasGeometryPublication({
      bounds: { x: 0, y: 0, width: 1_240, height: 880 },
      boxes: [
        { nodeId: "root", x: 0, y: 0, width: 520, height: 84 },
        { nodeId: "child", x: 636, y: 126, width: 520, height: 96 },
      ],
    });

    expect(publication).toEqual({
      width: 1_240,
      height: 880,
      nodes: [
        { nodeId: "root", transform: "translate3d(0px, 0px, 0)" },
        { nodeId: "child", transform: "translate3d(636px, 126px, 0)" },
      ],
    });
    expect(Object.isFrozen(publication)).toBe(true);
    expect(Object.isFrozen(publication.nodes)).toBe(true);
    expect(Object.isFrozen(publication.nodes[0])).toBe(true);
  });
});
