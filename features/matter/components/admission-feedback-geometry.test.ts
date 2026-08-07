import { describe, expect, it } from "vitest";
import type { LayoutBox } from "../layout/model";
import {
  findAdmissionFeedbackParentBox,
  projectAdmissionFeedbackPresentation,
} from "./admission-feedback-geometry";

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

  it("uses the selected visible passage when the structural parent is not rendered", () => {
    expect(findAdmissionFeedbackParentBox({
      kind: "child",
      treeId: "tree",
      baseRevision: 1,
      parentNodeId: "document-root",
    }, [parent], "parent")).toBe(parent);
  });

  it("reserves the measured feedback below only a child admission parent", () => {
    const childAnchor = {
      kind: "child" as const,
      treeId: "tree",
      baseRevision: 1,
      parentNodeId: "parent",
    };
    expect(projectAdmissionFeedbackPresentation(childAnchor.parentNodeId, 40.2)).toEqual({
      nodeId: "parent",
      topExtent: 0,
      bottomExtent: 59,
    });
    expect(projectAdmissionFeedbackPresentation(childAnchor.parentNodeId, 0)).toBeNull();
    expect(projectAdmissionFeedbackPresentation(null, 40)).toBeNull();
  });
});
