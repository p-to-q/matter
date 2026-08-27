import type { ThoughtTree } from "../tree/model";
import {
  MAX_INQUIRY_CONTEXT_CODE_POINTS,
  MAX_INQUIRY_CONTEXT_NODES,
  MAX_INQUIRY_NODE_CODE_POINTS,
  type InquiryContextScope,
} from "../config/inquiry";
import type { SegmentSelection } from "./text-segments";
import type { WorkingContextNode } from "./working-context";

/**
 * The material an inquiry may carry: transient lasso passages or the bounded
 * active working projection. It is reference material, never instruction or
 * hidden memory.
 *
 * Projection and wire validation consume one neutral bound definition. Keeping
 * the values outside either implementation avoids a protocol→material or
 * material→protocol dependency while still preventing silent drift.
 */
export {
  MAX_INQUIRY_CONTEXT_CODE_POINTS,
  MAX_INQUIRY_CONTEXT_NODES,
  MAX_INQUIRY_NODE_CODE_POINTS,
} from "../config/inquiry";
export type { InquiryContextScope } from "../config/inquiry";

export type InquiryContextNode = Readonly<{
  nodeId: string;
  depth: number;
  text: string;
  truncated: boolean;
}>;

export type InquiryContext = Readonly<{
  treeId: string;
  revision: number;
  scope: InquiryContextScope;
  lineage: readonly InquiryContextNode[];
  thoughtCount: number;
  clipped: boolean;
}>;

export type InquiryContextLimits = Readonly<{
  maxNodeCodePoints?: number;
  maxContextCodePoints?: number;
}>;

export function projectInquiryContext(
  tree: ThoughtTree,
  workingNodes: readonly WorkingContextNode[],
  selectionsOrLimits: readonly SegmentSelection[] | InquiryContextLimits = [],
  limits: InquiryContextLimits = {},
): InquiryContext {
  const hasSelections = Array.isArray(selectionsOrLimits);
  const requestedSelections = hasSelections ? selectionsOrLimits : [];
  const appliedLimits: InquiryContextLimits = hasSelections
    ? limits
    : selectionsOrLimits as InquiryContextLimits;
  const maxNode = appliedLimits.maxNodeCodePoints ?? MAX_INQUIRY_NODE_CODE_POINTS;
  const maxContext = appliedLimits.maxContextCodePoints ?? MAX_INQUIRY_CONTEXT_CODE_POINTS;
  const activeNodeIds = new Set(workingNodes.map(({ nodeId }) => nodeId));
  const selections = requestedSelections.filter(({ nodeId }) => activeNodeIds.has(nodeId));
  // Preserve explicit selection authority even when its material was set aside
  // between gestures. Falling back to the tree here would silently widen scope.
  const scope: InquiryContextScope = requestedSelections.length > 0 ? "selection" : "tree";
  const nodes = scope === "selection"
    ? selections.map((selection, depth) => boundedNode(selection.nodeId, depth, selection.selectedText, maxNode))
    : workingNodes.map(({ nodeId, depth }) => boundedNode(nodeId, depth, tree.nodes[nodeId]?.text ?? "", maxNode));

  const kept = nodes.slice(0, MAX_INQUIRY_CONTEXT_NODES);
  let clipped = false;
  if (kept.length !== nodes.length) clipped = true;
  while (kept.length > 0 && weigh(kept) > maxContext) {
    const last = kept.at(-1);
    if (last === undefined) break;
    const points = Array.from(last.text);
    const remaining = Math.max(0, maxContext - weigh(kept.slice(0, -1)));
    kept[kept.length - 1] = Object.freeze({
      ...last,
      text: points.slice(0, Math.min(points.length, remaining)).join(""),
      truncated: true,
    });
    clipped = true;
    if (remaining === 0) kept.pop();
  }

  return Object.freeze({
    treeId: tree.id,
    revision: tree.revision,
    scope,
    lineage: Object.freeze(kept),
    thoughtCount: workingNodes.length,
    clipped,
  });
}

function boundedNode(nodeId: string, depth: number, text: string, maxNode: number): InquiryContextNode {
  const points = Array.from(text);
  const truncated = points.length > maxNode;
  return Object.freeze({
    nodeId,
    depth,
    text: truncated ? points.slice(0, maxNode).join("") : text,
    truncated,
  });
}

export function inquiryContextWeight(context: InquiryContext): number {
  return weigh(context.lineage);
}

function weigh(nodes: readonly InquiryContextNode[]): number {
  return nodes.reduce((total, node) => total + Array.from(node.text).length, 0);
}
