import type { MatterLocale } from "../config/locales";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import {
  SEEDED_BOOTSTRAP_NODES,
  SEEDED_DOCUMENT_TREE_ID,
  SEEDED_ROOT_ONLY_TREE_ID,
  type BootstrapNode,
} from "./seeded-document";
import { seededNodeLabel } from "./seeded-label-copy";

const BOOTSTRAP_BY_ID = new Map(
  SEEDED_BOOTSTRAP_NODES.map((node) => [node.id, node] as const),
);

/**
 * Returns the seed identity only while the tree-owned seed revision marker is
 * intact. Every authored text command advances `updatedAt`; Undo restores the
 * original node snapshot and therefore restores product-copy ownership.
 */
function canonicalSeedNode(node: ThoughtNode): BootstrapNode | null {
  const spec = BOOTSTRAP_BY_ID.get(node.id);
  if (
    spec === undefined ||
    node.createdAt !== spec.createdAt ||
    node.updatedAt !== spec.updatedAt
  ) {
    return null;
  }
  return spec;
}

/** Fixed navigation names for exact built-in seed passages in this locale. */
export function seededFixedLabels(
  tree: ThoughtTree,
  locale: MatterLocale,
): ReadonlyMap<string, string> {
  if (tree.id !== SEEDED_DOCUMENT_TREE_ID && tree.id !== SEEDED_ROOT_ONLY_TREE_ID) {
    return new Map<string, string>();
  }
  const labels = new Map<string, string>();
  for (const node of Object.values(tree.nodes)) {
    const spec = canonicalSeedNode(node);
    if (spec !== null) labels.set(node.id, seededNodeLabel(locale, spec.copyKey));
  }
  return labels;
}
