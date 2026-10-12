import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "../layout/columnar-layout";
import { operationLinePath } from "../layout/operation-line";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import { normalizeDocumentTree, documentRootId } from "../tree/document-root";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import { materialFileAncestorIds } from "./material-file-tree";
import { operationTargetNodeId } from "./operation-target";
import type { PictureHold } from "./picture-surface";
import { projectLayoutProjection } from "./layout-projection";

type Phase = TextSwapInteractionState["phase"];

function target(overrides: {
  elastic?: { phase: "idle" | "requesting"; nodeId: string | null };
  host?: string | null;
  presented?: boolean;
  phase?: Phase;
  hold?: PictureHold;
}) {
  return operationTargetNodeId({
    elastic: overrides.elastic ?? { phase: "idle", nodeId: null },
    pointTalk: {
      hostNodeId: overrides.host === undefined ? null : overrides.host,
      phase: overrides.phase ?? "idle",
      pictureHold: overrides.hold ?? "free",
      presented: overrides.presented ?? false,
    },
  });
}

describe("operationTargetNodeId", () => {
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
});

describe("the operation line in the composition", () => {
  const source = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");

  it("derives the target and the line in render and stores neither", () => {
    expect(source).toContain("const operationTargetId = operationTargetNodeId({");
    expect(source).toMatch(/const operationLineData = useMemo\(/u);
    expect(source).not.toMatch(/useState[^;]*operation(?:Target|Line)/iu);
    expect(source).not.toMatch(/operation(?:Target|Line)\w*Ref\b/u);
  });

  it("draws one dumb element, beneath the passages, from the current publication only", () => {
    expect(source).toMatch(/currentLayoutEpoch: completePublication\?\.layout\.layoutEpoch \?\? null/u);
    expect(source).toMatch(
      /\{operationLineData === null \? null : <OperationLine d=\{operationLineData\} \/>\}\s*\{viewportRenderer && renderedProjection\.length === 0/u,
    );
  });

  it("clips to the mounted window and ignores a turn from another document", () => {
    expect(source).toContain("mountedNodeIds: visiblyLaidOutNodeIds");
    expect(source).toMatch(
      /transformState\.basis\?\.documentEpoch === props\.documentEpoch\s*\? transformState\.basis\.selection\.nodeId\s*: null/u,
    );
    expect(source).toMatch(/presented: pointTalkPresented,/u);
    expect(source).toMatch(/hostNodeId: pointTalkHostNodeId,/u);
  });

  it("styles a quiet, still, non-interactive line", () => {
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
    const rule = /\.operation-line\s*\{([^}]*)\}/u.exec(css)?.[1] ?? "";
    expect(rule).toContain("pointer-events: none");
    expect(rule).toContain("position: absolute");
    const path = /\.operation-line__path\s*\{([^}]*)\}/u.exec(css)?.[1] ?? "";
    expect(path).toContain("stroke-width: 1px");
    expect(path).toContain("stroke-linecap: square");
    expect(path).toContain("var(--ink) 28%");
    // No draw-on, fade, or travel: it never animates, so reduced motion needs no exception.
    expect(path).toContain("animation: none");
    expect(path).toContain("transition: none");
    expect(`${rule}${path}`).not.toMatch(/@keyframes|transform:|opacity/u);
    expect(css).toMatch(/forced-colors: active\)\s*\{\s*\.operation-line__path\s*\{\s*stroke:\s*CanvasText;/u);
  });
});

describe("the operation line and the index ancestor mark", () => {
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

  it("underlines in the index exactly the ancestors the canvas line joins", () => {
    const projection = projectLayoutProjection({
      tree, mode: "full", focusNodeId: null, foldedNodeIds: new Set(),
    });
    const laid = layoutColumnarTree({
      nodes: projection.map(({ node, depth, parentId }) => ({
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
      const segments = operationLinePath(laid.layout.edges, lineage)!;
      const joined = new Set(segments.map(({ parentId }) => parentId));
      const indexMarked = new Set(materialFileAncestorIds(tree.nodes, targetId));
      // The synthetic document root is the index's outline, not a passage.
      indexMarked.delete(rootId);
      expect(joined).toEqual(indexMarked);
      expect(segments.at(-1)?.childId).toBe(targetId);
    }
  });
});
