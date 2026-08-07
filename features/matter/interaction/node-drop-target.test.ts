import { describe, expect, it } from "vitest";
import type { NodeMovePolicy } from "../runtime/move";
import {
  resolveBlankNodeDropTarget,
  type NodeDropBounds,
  type NodeDropLane,
} from "./node-drop-target";

const BOUNDS: NodeDropBounds = { left: 0, top: 0, right: 1200, bottom: 800 };
const POLICY: NodeMovePolicy = {
  sourceId: "source",
  sourceDepth: 3,
  validTargetIds: new Set(["root", "branch"]),
};
const LANES: readonly NodeDropLane[] = [{
  depth: 2,
  left: 500,
  right: 700,
  maxHeight: 40,
  entries: [{ nodeId: "sibling", parentId: "branch", authoredIndex: 2, top: 200, bottom: 240 }],
}];

describe("blank node drop targeting", () => {
  it("inherits the nearby structural row instead of treating its gap as free space", () => {
    expect(resolve({ clientX: 600, clientY: 270 })).toEqual({
      targetId: "branch",
      targetIndex: 3,
      indicatorId: "sibling",
      mode: "after",
    });
  });

  it("returns unrelated paper to the root first level", () => {
    expect(resolve({ clientX: 100, clientY: 100 })).toEqual({
      targetId: "root",
      targetIndex: Number.MAX_SAFE_INTEGER,
      indicatorId: null,
      mode: "top-level",
    });
  });

  it("does not turn a small drag or outside release into a structural mutation", () => {
    expect(resolve({ clientX: 430, clientY: 400, startX: 400, startY: 400 })).toBeNull();
    expect(resolve({ clientX: -20, clientY: 100 })).toBeNull();
  });

  it("fails closed when neither the row parent nor root is legal", () => {
    expect(resolve({
      clientX: 600,
      clientY: 270,
      policy: { ...POLICY, validTargetIds: new Set<string>() },
    })).toBeNull();
  });
});

function resolve(overrides: Partial<Parameters<typeof resolveBlankNodeDropTarget>[0]>) {
  return resolveBlankNodeDropTarget({
    clientX: 600,
    clientY: 270,
    documentBounds: BOUNDS,
    lanes: LANES,
    policy: POLICY,
    rootId: "root",
    startX: 900,
    startY: 400,
    ...overrides,
  });
}
