import type { NavigationState } from "../runtime/navigation";
import type { ThoughtTree } from "../tree/model";

/**
 * The context an inquiry is allowed to carry: the root-to-focus lineage that is
 * already on screen, and nothing else. This is the same boundary the privacy
 * copy states, expressed once, in code, so the promise and the payload cannot
 * drift apart.
 *
 * It is a projection, not a message. It never leaves this module shaped as a
 * prompt, and it carries no instruction — only material the person can see.
 */

/** One passage may be long; a context made of them must still be sendable. */
export const MAX_INQUIRY_NODE_CODE_POINTS = 480;
export const MAX_INQUIRY_CONTEXT_CODE_POINTS = 4_000;

export type InquiryContextNode = Readonly<{
  nodeId: string;
  depth: number;
  text: string;
  /** The passage was longer than one node's share of the budget. */
  truncated: boolean;
}>;

export type InquiryContext = Readonly<{
  treeId: string;
  revision: number;
  /** Root first, focus last. Empty only when there is no material at all. */
  lineage: readonly InquiryContextNode[];
  /** How much material exists, which is extent rather than content. */
  thoughtCount: number;
  /** Middle ancestors were dropped to stay inside the budget. */
  clipped: boolean;
}>;

export type InquiryContextLimits = Readonly<{
  maxNodeCodePoints?: number;
  maxContextCodePoints?: number;
}>;

export function projectInquiryContext(
  tree: ThoughtTree,
  navigation: NavigationState,
  limits: InquiryContextLimits = {},
): InquiryContext {
  const maxNode = limits.maxNodeCodePoints ?? MAX_INQUIRY_NODE_CODE_POINTS;
  const maxContext = limits.maxContextCodePoints ?? MAX_INQUIRY_CONTEXT_CODE_POINTS;
  const thoughtCount = Object.keys(tree.nodes).length;
  const focusId = navigation.mode === "focus"
    ? navigation.focusNodeId
    : navigation.selectedNodeId ?? tree.rootId;

  const chain = lineageIds(tree, focusId);
  if (chain.length === 0) {
    return Object.freeze({
      treeId: tree.id,
      revision: tree.revision,
      lineage: Object.freeze([]),
      thoughtCount,
      clipped: false,
    });
  }

  const nodes = chain.map((nodeId, depth) => {
    const text = tree.nodes[nodeId]?.text ?? "";
    const points = Array.from(text);
    const truncated = points.length > maxNode;
    return Object.freeze({
      nodeId,
      depth,
      text: truncated ? points.slice(0, maxNode).join("") : text,
      truncated,
    });
  });

  // The root states the document and the focus states the question's subject,
  // so when something has to go it is the middle that goes.
  const kept = [...nodes];
  let clipped = false;
  while (kept.length > 2 && weigh(kept) > maxContext) {
    kept.splice(Math.floor(kept.length / 2), 1);
    clipped = true;
  }

  return Object.freeze({
    treeId: tree.id,
    revision: tree.revision,
    lineage: Object.freeze(kept),
    thoughtCount,
    clipped,
  });
}

/** Total code points the context would carry. Used for the budget and the receipt. */
export function inquiryContextWeight(context: InquiryContext): number {
  return weigh(context.lineage);
}

function weigh(nodes: readonly InquiryContextNode[]): number {
  return nodes.reduce((total, node) => total + Array.from(node.text).length, 0);
}

function lineageIds(tree: ThoughtTree, focusId: string | null): readonly string[] {
  if (focusId === null || !Object.hasOwn(tree.nodes, focusId)) {
    return tree.rootId !== null && Object.hasOwn(tree.nodes, tree.rootId) ? [tree.rootId] : [];
  }
  const reversed: string[] = [];
  const seen = new Set<string>();
  let current: string | null = focusId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    reversed.push(current);
    current = tree.nodes[current]?.parentId ?? null;
  }
  return reversed.reverse();
}
