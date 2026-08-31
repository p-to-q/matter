import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  lassoSelectionsRemainValid,
  planLassoMaterialTransition,
} from "./lasso-material-validity";

const TIME = "2026-08-28T00:00:00.000Z";
const SELECTION = Object.freeze({
  type: "segment-range" as const,
  nodeId: "selected",
  start: 0,
  end: 5,
  selectedText: "Alpha",
});

describe("lasso material validity", () => {
  it("keeps an addressed selection through an unrelated branch revision", () => {
    const current = tree();
    current.revision += 1;
    current.nodes.unrelated!.text = "A changed sibling.";

    expect(lassoSelectionsRemainValid(current, [SELECTION])).toBe(true);
  });

  it("revokes a selection when its addressed range is no longer current", () => {
    const current = tree();
    current.revision += 1;
    current.nodes.selected!.text = "Changed selection.";

    expect(lassoSelectionsRemainValid(current, [SELECTION])).toBe(false);
  });

  it("revokes the whole semantic set when any selected passage disappears", () => {
    const current = tree();
    delete current.nodes.selected;

    expect(lassoSelectionsRemainValid(current, [SELECTION])).toBe(false);
  });

  it.each([
    { name: "valid revision", ownerChanged: false, mutate: () => undefined, retain: true },
    {
      name: "invalid target",
      ownerChanged: false,
      mutate: (current: ThoughtTree) => { current.nodes.selected!.text = "Changed selection."; },
      retain: false,
    },
    { name: "document owner switch", ownerChanged: true, mutate: () => undefined, retain: false },
  ])("releases an active pointer before planning a $name transition", ({ ownerChanged, mutate, retain }) => {
    const current = tree();
    mutate(current);

    expect(planLassoMaterialTransition({
      tree: current,
      selections: [SELECTION],
      ownerChanged,
      drawingPointerId: 17,
    })).toEqual({ releasePointerId: 17, retainSelections: retain });
  });

  it("does not release pointer ownership from a completed selection", () => {
    expect(planLassoMaterialTransition({
      tree: tree(),
      selections: [SELECTION],
      ownerChanged: false,
      drawingPointerId: null,
    })).toEqual({ releasePointerId: null, retainSelections: true });
  });
});

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_lasso",
    rootId: "document",
    revision: 4,
    nodes: {
      document: {
        id: "document",
        role: "document-root",
        text: "",
        parentId: null,
        children: ["selected", "unrelated"],
        createdAt: TIME,
        updatedAt: TIME,
      },
      selected: {
        id: "selected",
        text: "Alpha. Beta.",
        parentId: "document",
        children: [],
        createdAt: TIME,
        updatedAt: TIME,
      },
      unrelated: {
        id: "unrelated",
        text: "A sibling.",
        parentId: "document",
        children: [],
        createdAt: TIME,
        updatedAt: TIME,
      },
    },
  };
}
