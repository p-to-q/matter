import { isCanonicalTimestamp } from "../tree/invariants";
import type { DetachedSubtree, ThoughtTree, TreeCommand } from "../tree/model";
import type { NavigationState } from "./navigation";

export type HumanRemovalValues = Readonly<{
  commandId: string;
  createdAt: string;
}>;

export type HumanRemovalResult =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; error: { code: "INVALID_INTERACTION"; message: string } }>;

/**
 * Turns the currently held thought into one private subtree removal command.
 * The UI cannot construct detached mementos, and the tree engine remains the
 * sole durable mutator and inverse owner.
 */
export function selectedNodeToRemovalCommand(
  tree: ThoughtTree,
  navigation: NavigationState,
  values: HumanRemovalValues,
): HumanRemovalResult {
  if (navigation.mode !== "full" || navigation.selectedNodeId === null) {
    return invalid("Select a thought before removing it.");
  }
  const node = tree.nodes[navigation.selectedNodeId];
  if (node === undefined || node.parentId === null || tree.rootId === node.id) {
    return invalid("The root thought cannot be removed.");
  }
  const parent = tree.nodes[node.parentId];
  const index = parent?.children.indexOf(node.id) ?? -1;
  if (parent === undefined || index < 0) return invalid("The selected thought is no longer attached.");
  if (!isNonEmptyString(values.commandId) || !isCanonicalTimestamp(values.createdAt)) {
    return invalid("Removal values are invalid.");
  }

  const detached = snapshotDetachedSubtree(tree, node.id, parent.id, index);
  if (detached === null) return invalid("The selected thought cannot be removed.");
  return {
    ok: true,
    command: {
      id: values.commandId,
      source: "human",
      expectedTreeId: tree.id,
      expectedRevision: tree.revision,
      createdAt: values.createdAt,
      mutation: { type: "remove-subtree", detached },
    },
  };
}

function snapshotDetachedSubtree(
  tree: ThoughtTree,
  rootId: string,
  parentId: string,
  index: number,
): DetachedSubtree | null {
  const nodes: Record<string, ThoughtTree["nodes"][string]> = {};
  const visiting = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId) || Object.hasOwn(nodes, nodeId)) return false;
    const node = tree.nodes[nodeId];
    if (node === undefined) return false;
    visiting.add(nodeId);
    nodes[nodeId] = { ...node, children: [...node.children] };
    for (const childId of node.children) {
      if (!visit(childId)) return false;
    }
    visiting.delete(nodeId);
    return true;
  };
  if (!visit(rootId)) return null;
  const parent = tree.nodes[parentId];
  if (parent === undefined) return null;
  return {
    rootId,
    nodes,
    parentId,
    index,
    parentChildrenBeforeDetach: [...parent.children],
  };
}

function invalid(message: string): HumanRemovalResult {
  return { ok: false, error: { code: "INVALID_INTERACTION", message } };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
