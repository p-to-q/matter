import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "../layout/columnar-layout";
import { operationTrailNodes } from "../layout/operation-trail";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import { normalizeDocumentTree, documentRootId } from "../tree/document-root";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import { materialFileAncestorIds } from "./material-file-tree";
import { operationTarget, trailPresentation } from "./operation-target";
import type { PictureHold } from "./picture-surface";
import { projectLayoutProjection } from "./layout-projection";

type Phase = TextSwapInteractionState["phase"];

type Overrides = {
  elastic?: { phase: "idle" | "requesting"; nodeId: string | null };
  host?: string | null;
  presented?: boolean;
  phase?: Phase;
  hold?: PictureHold;
  selected?: string | null;
};

function input(overrides: Overrides) {
  return {
    elastic: overrides.elastic ?? { phase: "idle" as const, nodeId: null },
    pointTalk: {
      hostNodeId: overrides.host === undefined ? null : overrides.host,
      phase: overrides.phase ?? "idle",
      pictureHold: overrides.hold ?? "free",
      presented: overrides.presented ?? false,
    },
  };
}

function target(overrides: Overrides) {
  return operationTarget(input(overrides))?.nodeId ?? null;
}

describe("operationTarget", () => {
  it("is null when no operation owns a passage: selection and hover are not operations", () => {
    expect(target({})).toBeNull();
    expect(target({ host: "n", presented: false, phase: "idle" })).toBeNull();
  });

  it("is the host while a Point and Talk field is open, in every field phase", () => {
    const open: Phase[] = [
      "idle", "eligible", "permission", "recording", "transcribing", "ready", "pending", "error",
    ];
    for (const phase of open) {
      expect(target({ host: "n", presented: true, phase })).toBe("n");
    }
    for (const hold of ["engaged", "paid"] as const) {
      expect(target({ host: "n", presented: true, phase: "ready", hold })).toBe("n");
    }
  });

  it("keeps a submitted rewrite or a paid picture after the field has closed", () => {
    expect(target({ host: "n", presented: false, phase: "pending" })).toBe("n");
    expect(target({ host: "n", presented: false, phase: "idle", hold: "paid" })).toBe("n");
  });

  it("ends with the field when nothing was submitted: close, cancel, discard", () => {
    for (const phase of ["idle", "eligible", "permission", "recording", "transcribing", "ready", "error"] as const) {
      expect(target({ host: "n", presented: false, phase })).toBeNull();
    }
    expect(target({ host: "n", presented: false, phase: "ready", hold: "engaged" })).toBeNull();
  });

  it("ends when the operation settles or goes stale", () => {
    expect(target({ host: "n", presented: true, phase: "success" })).toBeNull();
    expect(target({ host: "n", presented: true, phase: "stale" })).toBeNull();
    expect(target({ host: "n", presented: false, phase: "success" })).toBeNull();
  });

  it("ends when the host is no longer a current passage or the document switched", () => {
    expect(target({ host: null, presented: true, phase: "pending" })).toBeNull();
    expect(target({ host: null, presented: false, phase: "pending", hold: "paid" })).toBeNull();
  });

  it("is the Elastic turn's target only while that turn is requesting", () => {
    expect(target({ elastic: { phase: "requesting", nodeId: "e" } })).toBe("e");
    expect(target({ elastic: { phase: "idle", nodeId: "e" } })).toBeNull();
    expect(target({ elastic: { phase: "requesting", nodeId: null } })).toBeNull();
  });

  it("names exactly one passage, preferring the open field", () => {
    expect(target({
      elastic: { phase: "requesting", nodeId: "e" },
      host: "n",
      presented: true,
      phase: "ready",
    })).toBe("n");
  });

  it("says whether the operation has taken work", () => {
    expect(operationTarget(input({ host: "n", presented: true, phase: "ready" }))?.working).toBe(false);
    expect(operationTarget(input({ host: "n", presented: true, phase: "pending" }))?.working).toBe(true);
    expect(operationTarget(input({ host: "n", presented: true, phase: "ready", hold: "paid" }))?.working).toBe(true);
    expect(operationTarget(input({ elastic: { phase: "requesting", nodeId: "e" } }))?.working).toBe(true);
  });
});

describe("trailPresentation: the state table", () => {
  type Facts = Partial<Parameters<typeof trailPresentation>[0]>;
  const present = (facts: Facts) => trailPresentation({
    selectedNodeId: null,
    operationTargetNodeId: null,
    operationWorking: false,
    inquiryNodeIds: [],
    viewMode: "full",
    lassoActive: false,
    layoutEpoch: 7,
    publishedEpoch: 7,
    nodeExists: () => true,
    ...facts,
  });
  const off = { targetIds: [], strength: "off", working: false, descendants: false };

  it("draws nothing when nothing is selected and no operation is open; hover and focus name nothing", () => {
    expect(present({})).toEqual(off);
  });

  it("draws the selected passage lightly, with its children", () => {
    expect(present({ selectedNodeId: "s" }))
      .toEqual({ targetIds: ["s"], strength: "selected", working: false, descendants: true });
  });

  it("lets an operation win over the selection, and says whether it has taken work", () => {
    expect(present({ selectedNodeId: "s", operationTargetNodeId: "o" }))
      .toEqual({ targetIds: ["o"], strength: "operating", working: false, descendants: true });
    expect(present({ selectedNodeId: "s", operationTargetNodeId: "o", operationWorking: true }))
      .toEqual({ targetIds: ["o"], strength: "operating", working: true, descendants: true });
  });

  it("returns to the selected strength when the operation ends on a still-selected passage", () => {
    const during = present({ selectedNodeId: "n", operationTargetNodeId: "n", operationWorking: true });
    const after = present({ selectedNodeId: "n", operationTargetNodeId: null });
    expect(during.targetIds).toEqual(after.targetIds);
    expect([during.strength, after.strength]).toEqual(["operating", "selected"]);
  });

  it("draws nothing in the focus view, which already is the lineage", () => {
    expect(present({ selectedNodeId: "s", viewMode: "focus" })).toEqual(off);
    expect(present({ selectedNodeId: "s", operationTargetNodeId: "o", viewMode: "focus" })).toEqual(off);
    expect(present({ inquiryNodeIds: ["a"], viewMode: "focus" })).toEqual(off);
  });

  it("draws nothing for a lasso that nothing has asked about, whatever is selected", () => {
    expect(present({ selectedNodeId: "s", lassoActive: true })).toEqual(off);
    // An operation that owns a passage keeps its own trail (an Elastic turn runs inside a lasso).
    expect(present({ selectedNodeId: "s", operationTargetNodeId: "o", operationWorking: true, lassoActive: true }).strength)
      .toBe("operating");
  });

  it("draws the union of the passages an open Ask Matter is addressed to, lightly, without their children", () => {
    expect(present({ inquiryNodeIds: ["a", "b"], lassoActive: true }))
      .toEqual({ targetIds: ["a", "b"], strength: "selected", working: false, descendants: false });
    expect(present({ inquiryNodeIds: ["a"], selectedNodeId: "s" }).targetIds).toEqual(["a"]);
    // One passage lassoed twice (two segments of it) is one target.
    expect(present({ inquiryNodeIds: ["a", "a", "b"] }).targetIds).toEqual(["a", "b"]);
    // A passage that is gone is not addressed; if none is left the trail is off.
    expect(present({ inquiryNodeIds: ["a", "gone"], nodeExists: (id) => id !== "gone" }).targetIds).toEqual(["a"]);
    expect(present({ inquiryNodeIds: ["gone"], nodeExists: () => false })).toEqual(off);
  });

  it("draws nothing for Ask Matter over the whole working tree, which names no passage", () => {
    expect(present({ inquiryNodeIds: [] })).toEqual(off);
  });

  it("lets an operation win over Ask Matter", () => {
    expect(present({ inquiryNodeIds: ["a", "b"], operationTargetNodeId: "o" }).targetIds).toEqual(["o"]);
  });

  it("draws nothing for a passage that is gone", () => {
    expect(present({ selectedNodeId: "s", nodeExists: () => false })).toEqual(off);
    expect(present({ operationTargetNodeId: "o", nodeExists: () => false })).toEqual(off);
    expect(present({ selectedNodeId: "s", operationTargetNodeId: "o", nodeExists: (id) => id === "s" })).toEqual(off);
  });

  it("never draws geometry from another layout epoch than the published one", () => {
    expect(present({ selectedNodeId: "s", layoutEpoch: 6 })).toEqual(off);
    expect(present({ selectedNodeId: "s", operationTargetNodeId: "o", publishedEpoch: 8 })).toEqual(off);
    expect(present({ inquiryNodeIds: ["a"], layoutEpoch: 6 })).toEqual(off);
    expect(present({ selectedNodeId: "s", layoutEpoch: null, publishedEpoch: null })).toEqual(off);
    expect(present({ selectedNodeId: "s", publishedEpoch: null })).toEqual(off);
  });
});

describe("the trail in the composition", () => {
  const source = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");

  it("derives the target in render and stores neither the target nor the trail", () => {
    expect(source).toContain("const operationTrailPresentation = trailPresentation({");
    expect(source).toContain("selectedNodeId: navigation.selectedNodeId,");
    expect(source).toContain("viewMode: navigation.mode === \"focus\" ? \"focus\" : \"full\",");
    expect(source).toContain("lassoActive: lasso.active,");
    // The one source of what Ask Matter is addressed to: the lassoed passages, while its bubble is open.
    expect(source).toContain(
      'inquiryNodeIds: canvasOverlay === "inquiry" ? lasso.selections.map(({ nodeId }) => nodeId) : EMPTY_NODE_ID_LIST,',
    );
    // The inquiry reads the same selections when it is asked.
    expect(source).toMatch(/projectInquiryContext\(\s*tree,\s*activeWorkingProjection,\s*lasso\.selections,/u);
    expect(source).not.toMatch(/useState[^;]*operation(?:Trail|Target|Line)/iu);
    expect(source).not.toMatch(/operation(?:Trail|Target|Line)\w*Ref\b/u);
  });

  it("draws one layer, beneath the passages, from the current publication only", () => {
    expect(source).toMatch(/currentLayoutEpoch=\{completePublication\?\.layout\.layoutEpoch \?\? null\}/u);
    expect(source).toMatch(/<OperationTrailLayer[\s\S]*?\/>\s*\{viewportRenderer && renderedProjection\.length === 0/u);
  });

  it("ignores an Elastic turn from another document and names the open field's host", () => {
    expect(source).toMatch(
      /transformState\.basis\?\.documentEpoch === props\.documentEpoch\s*\? transformState\.basis\.selection\.nodeId\s*: null/u,
    );
    expect(source).toMatch(/presented: pointTalkPresented,/u);
    expect(source).toMatch(/hostNodeId: pointTalkHostNodeId,/u);
  });
});

describe("the trail and the index ancestor mark", () => {
  const treeId = "operation_line_fixture";
  const rootId = documentRootId(treeId);
  const stamp = "2026-10-12T00:00:00.000Z";
  function passage(id: string, parentId: string, children: string[]): ThoughtNode {
    return { id, text: `Passage ${id}.`, parentId, children, createdAt: stamp, updatedAt: stamp };
  }
  const tree: ThoughtTree = normalizeDocumentTree({
    protocolVersion: "0.2",
    id: treeId,
    revision: 1,
    rootId,
    nodes: {
      [rootId]: {
        id: rootId, role: "document-root", text: "", parentId: null,
        children: ["a", "z"], createdAt: stamp, updatedAt: stamp,
      },
      a: passage("a", rootId, ["b", "b2"]),
      b: passage("b", "a", ["c"]),
      b2: passage("b2", "a", []),
      c: passage("c", "b", ["d"]),
      d: passage("d", "c", []),
      z: passage("z", rootId, []),
    },
  });

  it("puts a bead on exactly the passages the index underlines, and one more on the target", () => {
    const projection = projectLayoutProjection({
      tree, mode: "full", focusNodeId: null, foldedNodeIds: new Set(),
    });
    const laid = layoutColumnarTree({
      nodes: projection.map(({ node, depth, parentId }: { node: ThoughtNode; depth: number; parentId: string | null }) => ({
        id: node.id, parentId, depth, size: { width: 200, height: 40 },
      })),
      origin: { x: 0, y: 0 },
      layoutEpoch: 1,
      columnWidth: 200,
      columnGap: 40,
      siblingGap: 20,
    });
    if (!laid.ok) throw new Error(laid.error.code);

    for (const targetId of ["b", "c", "d"]) {
      const lineage = selectLineage(tree, targetId)!.map((node) => node.id);
      const anchors = operationTrailNodes(laid.layout, [lineage], null)!.nodes;
      const indexMarked = new Set(materialFileAncestorIds(tree.nodes, targetId));
      // The synthetic document root is the index's outline, not a passage.
      indexMarked.delete(rootId);
      expect(new Set(anchors.slice(0, -1).map(({ id }) => id))).toEqual(indexMarked);
      expect(anchors.at(-1)?.id).toBe(targetId);
    }
  });
});
