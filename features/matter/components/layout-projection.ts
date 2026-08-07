import { selectLineage, selectVisiblePreorder } from "../tree/selectors";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { isDocumentRoot } from "../tree/document-root";

export type LayoutProjectionItem = Readonly<{
  node: ThoughtNode;
  depth: number;
  parentId: string | null;
}>;

/**
 * Only geometry-bearing navigation reaches the measured canvas. Selection is a
 * local handle concern: including it here would make an otherwise inert tap
 * synchronously remeasure every visible passage.
 */
export type LayoutProjectionInput =
  | Readonly<{
      tree: ThoughtTree;
      mode: "full";
      focusNodeId: null;
      foldedNodeIds: ReadonlySet<string>;
    }>
  | Readonly<{
      tree: ThoughtTree;
      mode: "focus";
      focusNodeId: string;
      foldedNodeIds: ReadonlySet<string>;
    }>;

export type LayoutNavigation =
  | Readonly<{
      mode: "full";
      focusNodeId: null;
      foldedNodeIds: ReadonlySet<string>;
    }>
  | Readonly<{
      mode: "focus";
      focusNodeId: string;
      foldedNodeIds: ReadonlySet<string>;
    }>;

export function createLayoutProjectionInput(
  tree: ThoughtTree,
  navigation: LayoutNavigation,
): LayoutProjectionInput {
  return navigation.mode === "focus"
    ? Object.freeze({
        tree,
        mode: navigation.mode,
        focusNodeId: navigation.focusNodeId,
        foldedNodeIds: navigation.foldedNodeIds,
      })
    : Object.freeze({
        tree,
        mode: navigation.mode,
        focusNodeId: null,
        foldedNodeIds: navigation.foldedNodeIds,
      });
}

export function projectLayoutProjection(
  input: LayoutProjectionInput,
): readonly LayoutProjectionItem[] {
  const nodes =
    input.mode === "focus"
      ? selectLineage(input.tree, input.focusNodeId) ?? []
      : selectVisiblePreorder(input.tree, input.foldedNodeIds);
  const depthById = new Map<string, number>();
  const projection = nodes.map((node, index) => {
    const parentIsDocumentRoot = isDocumentRoot(input.tree, node.parentId);
    const depth = input.mode === "focus"
      ? index
      : node.parentId === null || parentIsDocumentRoot
        ? 0
        : (depthById.get(node.parentId) ?? -1) + 1;
    depthById.set(node.id, depth);
    return Object.freeze({
      node,
      depth,
      parentId: index === 0 || parentIsDocumentRoot ? null : node.parentId,
    });
  });
  return Object.freeze(projection);
}

/**
 * This key is the publication boundary for measured coordinates. The tree
 * revision covers material changes while focus and fold state cover view shape;
 * transient selection and language geometry are intentionally absent.
 */
export function layoutProjectionKey(
  input: LayoutProjectionInput,
): string {
  const folds = Array.from(input.foldedNodeIds).sort().join(",");
  return `${input.tree.id}:${input.tree.revision}:${input.mode}:${input.focusNodeId ?? ""}:${folds}`;
}
