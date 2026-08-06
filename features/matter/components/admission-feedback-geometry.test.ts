import { describe, expect, it } from "vitest";
import type { LayoutBox } from "../layout/model";
import { findAdmissionFeedbackParentBox } from "./admission-feedback-geometry";

const parent: LayoutBox = {
  nodeId: "parent",
  parentId: null,
  depth: 0,
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  subtreeHeight: 40,
};

describe("admission feedback geometry", () => {
  it("does not read a layout receipt while feedback has no child anchor", () => {
    const unreadable = new Proxy([] as LayoutBox[], {
      get() {
        throw new Error("idle feedback must not scan layout boxes");
      },
    });
    expect(findAdmissionFeedbackParentBox(null, unreadable)).toBeNull();
    expect(findAdmissionFeedbackParentBox({
      kind: "root",
      treeId: "tree",
      baseRevision: 1,
    }, unreadable)).toBeNull();
  });

  it("finds only the active child admission parent", () => {
    expect(findAdmissionFeedbackParentBox({
      kind: "child",
      treeId: "tree",
      baseRevision: 1,
      parentNodeId: "parent",
    }, [parent])).toBe(parent);
  });
});
