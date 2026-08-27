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
  // Preserve explicit selection authority even when its material was set aside
  // between gestures. Falling back to the tree here would silently widen scope.
  const scope: InquiryContextScope = requestedSelections.length > 0 ? "selection" : "tree";
  const sources = scope === "selection"
    ? selectedSources(workingNodes, requestedSelections)
    : workingNodes;
  const { nodes: kept, clipped } = projectBoundedNodes(
    sources.length,
    (index) => {
      const source = sources[index];
      if (source === undefined) return null;
      if (scope === "selection") {
        const selection = source as SegmentSelection;
        return { nodeId: selection.nodeId, depth: index, text: selection.selectedText };
      }
      const workingNode = source as WorkingContextNode;
      return {
        nodeId: workingNode.nodeId,
        depth: workingNode.depth,
        text: tree.nodes[workingNode.nodeId]?.text ?? "",
      };
    },
    maxNode,
    maxContext,
  );

  return Object.freeze({
    treeId: tree.id,
    revision: tree.revision,
    scope,
    lineage: Object.freeze(kept),
    thoughtCount: workingNodes.length,
    clipped,
  });
}

function selectedSources(
  workingNodes: readonly WorkingContextNode[],
  requestedSelections: readonly SegmentSelection[],
): readonly SegmentSelection[] {
  const activeNodeIds = new Set(workingNodes.map(({ nodeId }) => nodeId));
  return requestedSelections.filter(({ nodeId }) => activeNodeIds.has(nodeId));
}

type InquirySource = Readonly<{ nodeId: string; depth: number; text: string }>;

/**
 * Bounds while projecting so the rendering edge never scans text that cannot
 * enter the wire payload. The source count remains explicit so clipping still
 * reports omitted nodes without materializing them.
 */
function projectBoundedNodes(
  sourceCount: number,
  sourceAt: (index: number) => InquirySource | null,
  maxNode: number,
  maxContext: number,
): Readonly<{ nodes: readonly InquiryContextNode[]; clipped: boolean }> {
  const kept: InquiryContextNode[] = [];
  const nodeLimit = Math.min(sourceCount, MAX_INQUIRY_CONTEXT_NODES);
  let remaining = Math.max(0, maxContext);
  let clipped = sourceCount > nodeLimit;

  for (let index = 0; index < nodeLimit; index += 1) {
    const source = sourceAt(index);
    if (source === null) continue;
    const nodeBudget = Math.min(Math.max(0, maxNode), remaining);
    const bounded = takeCodePoints(source.text, nodeBudget);
    const contextLimited = nodeBudget < Math.max(0, maxNode) && bounded.truncated;
    if (contextLimited) clipped = true;
    if (remaining === 0 && bounded.truncated) {
      clipped = true;
      break;
    }
    kept.push(Object.freeze({
      nodeId: source.nodeId,
      depth: source.depth,
      text: bounded.text,
      truncated: bounded.truncated,
    }));
    remaining -= bounded.count;
  }

  return Object.freeze({ nodes: Object.freeze(kept), clipped });
}

function takeCodePoints(
  text: string,
  limit: number,
): Readonly<{ text: string; count: number; truncated: boolean }> {
  let count = 0;
  let end = 0;
  for (const point of text) {
    if (count >= limit) {
      return Object.freeze({ text: text.slice(0, end), count, truncated: true });
    }
    count += 1;
    end += point.length;
  }
  return Object.freeze({ text, count, truncated: false });
}

export function inquiryContextWeight(context: InquiryContext): number {
  return weigh(context.lineage);
}

function weigh(nodes: readonly InquiryContextNode[]): number {
  return nodes.reduce((total, node) => total + Array.from(node.text).length, 0);
}
