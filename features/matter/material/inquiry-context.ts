import type { NavigationState } from "../runtime/navigation";
import type { ThoughtTree } from "../tree/model";
import type { SegmentSelection } from "./text-segments";

/**
 * The material an inquiry may carry: transient lasso passages or the bounded
 * virtual tree. It is reference material, never instruction or hidden memory.
 */
export const MAX_INQUIRY_NODE_CODE_POINTS = 480;
export const MAX_INQUIRY_CONTEXT_CODE_POINTS = 4_000;
export const MAX_INQUIRY_CONTEXT_NODES = 64;

export type InquiryContextNode = Readonly<{
  nodeId: string;
  depth: number;
  text: string;
  truncated: boolean;
}>;

export type InquiryContextScope = "selection" | "tree";

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
  navigation: NavigationState,
  selectionsOrLimits: readonly SegmentSelection[] | InquiryContextLimits = [],
  limits: InquiryContextLimits = {},
): InquiryContext {
  void navigation;
  const hasSelections = Array.isArray(selectionsOrLimits);
  const selections = hasSelections ? selectionsOrLimits : [];
  const appliedLimits: InquiryContextLimits = hasSelections
    ? limits
    : selectionsOrLimits as InquiryContextLimits;
  const maxNode = appliedLimits.maxNodeCodePoints ?? MAX_INQUIRY_NODE_CODE_POINTS;
  const maxContext = appliedLimits.maxContextCodePoints ?? MAX_INQUIRY_CONTEXT_CODE_POINTS;
  const thoughtCount = Object.keys(tree.nodes).length;
  const scope: InquiryContextScope = selections.length > 0 ? "selection" : "tree";
  const nodes = scope === "selection"
    ? selections.map((selection, depth) => boundedNode(selection.nodeId, depth, selection.selectedText, maxNode))
    : treeOrder(tree).map(({ nodeId, depth }) => boundedNode(nodeId, depth, tree.nodes[nodeId]?.text ?? "", maxNode));

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
    thoughtCount,
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

function treeOrder(tree: ThoughtTree): readonly { nodeId: string; depth: number }[] {
  if (tree.rootId === null || tree.nodes[tree.rootId] === undefined) return [];
  const ordered: { nodeId: string; depth: number }[] = [];
  const stack = [{ nodeId: tree.rootId, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || tree.nodes[current.nodeId] === undefined) continue;
    ordered.push(current);
    const children = tree.nodes[current.nodeId]!.children;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ nodeId: children[index]!, depth: current.depth + 1 });
    }
  }
  return ordered;
}

export function inquiryContextWeight(context: InquiryContext): number {
  return weigh(context.lineage);
}

function weigh(nodes: readonly InquiryContextNode[]): number {
  return nodes.reduce((total, node) => total + Array.from(node.text).length, 0);
}
