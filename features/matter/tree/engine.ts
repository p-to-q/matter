import {
  type CommandErrorCode,
  type CommandFailure,
  type CommandResult,
  type DetachedSubtree,
  type ThoughtNode,
  type ThoughtTree,
  type TreeCommand,
  type TreeMutation,
} from "./model";
import {
  isCanonicalTimestamp,
  isTimestampBefore,
  MAX_NODES_PER_TREE,
  MAX_TREE_DEPTH,
  validateThoughtNode,
  validateThoughtTree,
} from "./invariants";

type MutationApplication = {
  tree: ThoughtTree;
  inverse: TreeMutation;
  affectedNodeIds: string[];
};

function failure(code: CommandErrorCode, message: string): CommandFailure {
  return { ok: false, error: { code, message } };
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function equalNode(left: ThoughtNode, right: ThoughtNode): boolean {
  return (
    left.id === right.id &&
    left.text === right.text &&
    left.parentId === right.parentId &&
    equalStrings(left.children, right.children) &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function commandFailure(message: string): CommandFailure {
  return failure("INVALID_COMMAND", message);
}

function cloneNode(node: ThoughtNode): ThoughtNode {
  return { ...node, children: [...node.children] };
}

function cloneDetachedSubtree(detached: DetachedSubtree): DetachedSubtree {
  const nodes: Record<string, ThoughtNode> = {};
  for (const [id, node] of Object.entries(detached.nodes)) {
    nodes[id] = cloneNode(node);
  }
  return {
    ...detached,
    nodes,
    parentChildrenBeforeDetach: [...detached.parentChildrenBeforeDetach],
  };
}

function replaceNodes(
  tree: ThoughtTree,
  updates: Record<string, ThoughtNode>,
  removals: readonly string[] = [],
): Record<string, ThoughtNode> {
  const nodes = { ...tree.nodes, ...updates };
  for (const id of removals) delete nodes[id];
  return nodes;
}

function detachedPreorder(detached: unknown): string[] | null {
  if (
    !detached ||
    typeof detached !== "object" ||
    Array.isArray(detached) ||
    !("rootId" in detached) ||
    !("parentId" in detached) ||
    !("index" in detached) ||
    !("parentChildrenBeforeDetach" in detached) ||
    !("nodes" in detached) ||
    typeof detached.rootId !== "string" ||
    typeof detached.parentId !== "string" ||
    !Number.isInteger(detached.index) ||
    !Array.isArray(detached.parentChildrenBeforeDetach) ||
    !detached.nodes ||
    typeof detached.nodes !== "object" ||
    Array.isArray(detached.nodes)
  ) {
    return null;
  }
  const nodes = detached.nodes as Record<string, ThoughtNode>;
  const root = nodes[detached.rootId];
  if (!root || root.parentId !== detached.parentId || Object.hasOwn(nodes, detached.parentId)) {
    return null;
  }

  const ids = Object.keys(nodes);
  const visited = new Set<string>();
  const active = new Set<string>();
  const order: string[] = [];
  // A memento matching a valid tree can never exceed the tree depth or node
  // bound, so a hostile or corrupt memento fails fast here instead of
  // overflowing the call stack during recursion.
  const visit = (id: string, depth: number): boolean => {
    if (depth > MAX_TREE_DEPTH || visited.size >= MAX_NODES_PER_TREE) return false;
    const node = nodes[id];
    if (!node || active.has(id) || visited.has(id)) return false;
    const validation = validateThoughtNode(node);
    if (!validation.ok || node.id !== id) return false;
    active.add(id);
    visited.add(id);
    order.push(id);
    for (const childId of node.children) {
      const child = nodes[childId];
      if (!child || child.parentId !== id || !visit(childId, depth + 1)) return false;
    }
    active.delete(id);
    return true;
  };

  if (!visit(detached.rootId, 1) || visited.size !== ids.length) return null;
  return order;
}

function currentSubtreePreorder(tree: ThoughtTree, rootId: string): string[] {
  const order: string[] = [];
  const visit = (id: string) => {
    order.push(id);
    for (const childId of tree.nodes[id].children) visit(childId);
  };
  visit(rootId);
  return order;
}

function validateDetachedAgainstCurrent(
  tree: ThoughtTree,
  detachedValue: unknown,
): { ok: true; ids: string[]; parent: ThoughtNode } | CommandFailure {
  const detachedIds = detachedPreorder(detachedValue);
  if (!detachedIds) return commandFailure("The detached subtree memento is invalid.");
  const detached = detachedValue as DetachedSubtree;
  const parent = tree.nodes[detached.parentId];
  const root = tree.nodes[detached.rootId];
  if (!parent || !root || detached.rootId === tree.rootId) {
    return commandFailure("The detached subtree is not attached at the declared parent.");
  }
  if (!equalStrings(parent.children, detached.parentChildrenBeforeDetach)) {
    return commandFailure("The parent child-order memento does not match the tree.");
  }
  if (
    detached.index < 0 ||
    detached.index >= parent.children.length ||
    parent.children[detached.index] !== detached.rootId
  ) {
    return commandFailure("The detached subtree index is not exact.");
  }
  const currentIds = currentSubtreePreorder(tree, detached.rootId);
  if (!equalStrings(currentIds, detachedIds)) {
    return commandFailure("The detached subtree does not describe the complete current subtree.");
  }
  for (const id of detachedIds) {
    if (!equalNode(tree.nodes[id], detached.nodes[id])) {
      return commandFailure(`The detached node ${id} does not match the tree.`);
    }
  }
  return { ok: true, ids: detachedIds, parent };
}

function applyMutation(tree: ThoughtTree, mutation: TreeMutation): MutationApplication | CommandFailure {
  if (!mutation || typeof mutation !== "object" || typeof mutation.type !== "string") {
    return commandFailure("A command requires one recognized mutation.");
  }

  if (mutation.type === "initialize-root") {
    if (tree.rootId !== null || Object.keys(tree.nodes).length !== 0) {
      return commandFailure("Only an empty tree can initialize a root.");
    }
    const validation = validateThoughtNode(mutation.root);
    if (!validation.ok) return failure(validation.error.code, validation.error.message);
    if (mutation.root.parentId !== null || mutation.root.children.length !== 0) {
      return commandFailure("An initialized root must be a parentless leaf.");
    }
    const root = cloneNode(mutation.root);
    return {
      tree: { ...tree, rootId: root.id, nodes: { [root.id]: root } },
      inverse: { type: "clear-root", expectedRoot: cloneNode(root) },
      affectedNodeIds: [root.id],
    };
  }

  if (mutation.type === "clear-root") {
    if (tree.rootId === null || Object.keys(tree.nodes).length !== 1) {
      return commandFailure("Only a one-node tree can clear its root.");
    }
    const root = tree.nodes[tree.rootId];
    const validation = validateThoughtNode(mutation.expectedRoot);
    if (!validation.ok || !equalNode(root, mutation.expectedRoot)) {
      return commandFailure("The expected root does not match the current root.");
    }
    return {
      tree: { ...tree, rootId: null, nodes: {} },
      inverse: { type: "initialize-root", root: cloneNode(root) },
      affectedNodeIds: [root.id],
    };
  }

  if (mutation.type === "insert-node") {
    const parent = tree.nodes[mutation.parentId];
    const validation = validateThoughtNode(mutation.node);
    if (!validation.ok) return failure(validation.error.code, validation.error.message);
    if (!parent || Object.hasOwn(tree.nodes, mutation.node.id)) {
      return commandFailure("The insertion parent must exist and the node id must be unused.");
    }
    if (mutation.node.parentId !== parent.id || mutation.node.children.length !== 0) {
      return commandFailure("An inserted node must be a leaf attached to its declared parent.");
    }
    if (!Array.isArray(mutation.expectedParentChildren) || !equalStrings(parent.children, mutation.expectedParentChildren)) {
      return commandFailure("The expected parent child order does not match the tree.");
    }
    if (!Number.isInteger(mutation.index) || mutation.index < 0 || mutation.index > parent.children.length) {
      return commandFailure("The insertion index must be exact and in range.");
    }
    const parentChildrenAfterInsert = [...parent.children];
    parentChildrenAfterInsert.splice(mutation.index, 0, mutation.node.id);
    const nextParent = { ...parent, children: parentChildrenAfterInsert };
    const insertedNode = cloneNode(mutation.node);
    return {
      tree: {
        ...tree,
        nodes: replaceNodes(tree, { [parent.id]: nextParent, [insertedNode.id]: insertedNode }),
      },
      inverse: {
        type: "remove-subtree",
        detached: {
          rootId: insertedNode.id,
          nodes: { [insertedNode.id]: cloneNode(insertedNode) },
          parentId: parent.id,
          index: mutation.index,
          parentChildrenBeforeDetach: [...parentChildrenAfterInsert],
        },
      },
      affectedNodeIds: [insertedNode.id, parent.id],
    };
  }

  if (mutation.type === "remove-subtree") {
    if (!("detached" in mutation)) {
      return commandFailure("A subtree removal requires a complete memento.");
    }
    const validated = validateDetachedAgainstCurrent(tree, mutation.detached);
    if (!validated.ok) return validated;
    const children = [...validated.parent.children];
    children.splice(mutation.detached.index, 1);
    return {
      tree: {
        ...tree,
        nodes: replaceNodes(
          tree,
          { [validated.parent.id]: { ...validated.parent, children } },
          validated.ids,
        ),
      },
      inverse: {
        type: "restore-subtree",
        detached: cloneDetachedSubtree(mutation.detached),
      },
      affectedNodeIds: [...validated.ids, validated.parent.id],
    };
  }

  if (mutation.type === "restore-subtree") {
    if (!("detached" in mutation)) {
      return commandFailure("A subtree restoration requires a complete memento.");
    }
    const detachedIds = detachedPreorder(mutation.detached);
    if (!detachedIds) {
      return commandFailure("The detached subtree memento or attachment parent is invalid.");
    }
    const detached = mutation.detached as DetachedSubtree;
    const parent = tree.nodes[detached.parentId];
    if (!parent) {
      return commandFailure("The detached subtree memento or attachment parent is invalid.");
    }
    if (detachedIds.some((id) => Object.hasOwn(tree.nodes, id))) {
      return commandFailure("A restored subtree id already exists in the tree.");
    }
    if (
      detached.index < 0 ||
      detached.index >= detached.parentChildrenBeforeDetach.length ||
      detached.parentChildrenBeforeDetach[detached.index] !== detached.rootId
    ) {
      return commandFailure("The restored subtree index is not exact.");
    }
    const expectedChildrenWhileDetached = [...detached.parentChildrenBeforeDetach];
    expectedChildrenWhileDetached.splice(detached.index, 1);
    if (!equalStrings(parent.children, expectedChildrenWhileDetached)) {
      return commandFailure("The attachment parent changed while the subtree was detached.");
    }
    const restored = cloneDetachedSubtree(detached);
    const restoredNodes = { ...restored.nodes };
    restoredNodes[parent.id] = {
      ...parent,
      children: [...restored.parentChildrenBeforeDetach],
    };
    return {
      tree: { ...tree, nodes: replaceNodes(tree, restoredNodes) },
      inverse: { type: "remove-subtree", detached: cloneDetachedSubtree(restored) },
      affectedNodeIds: [...detachedIds, parent.id],
    };
  }

  if (mutation.type === "move-node") {
    const node = tree.nodes[mutation.nodeId];
    const fromParent = tree.nodes[mutation.fromParentId];
    const toParent = tree.nodes[mutation.toParentId];
    if (!node || !fromParent || !toParent || node.parentId !== fromParent.id) {
      return commandFailure("The moved node and both parents must exist.");
    }
    if (tree.rootId === node.id || node.id === mutation.toParentId) {
      return commandFailure("The root cannot move and a node cannot become its own parent.");
    }
    const expectedNodeValidation = validateThoughtNode(mutation.expectedNode);
    if (!expectedNodeValidation.ok || !equalNode(node, mutation.expectedNode)) {
      return commandFailure("The expected moved node does not match the tree.");
    }
    if (!Array.isArray(mutation.fromParentChildrenBefore) || !equalStrings(fromParent.children, mutation.fromParentChildrenBefore)) {
      return commandFailure("The source parent child order does not match the tree.");
    }
    if (!Array.isArray(mutation.toParentChildrenBefore) || !equalStrings(toParent.children, mutation.toParentChildrenBefore)) {
      return commandFailure("The target parent child order does not match the tree.");
    }
    if (!Number.isInteger(mutation.fromIndex) || mutation.fromIndex < 0 || fromParent.children[mutation.fromIndex] !== node.id) {
      return commandFailure("The source index is not exact.");
    }
    const sameParent = fromParent.id === toParent.id;
    const targetLengthAfterRemoval = toParent.children.length - (sameParent ? 1 : 0);
    if (!Number.isInteger(mutation.toIndex) || mutation.toIndex < 0 || mutation.toIndex > targetLengthAfterRemoval) {
      return commandFailure("The target index is out of range.");
    }
    const subtree = new Set(currentSubtreePreorder(tree, node.id));
    if (subtree.has(toParent.id)) return commandFailure("A node cannot move into its own subtree.");
    if (sameParent) {
      const children = [...fromParent.children];
      children.splice(mutation.fromIndex, 1);
      children.splice(mutation.toIndex, 0, node.id);
      if (equalStrings(children, fromParent.children)) {
        return commandFailure("A same-parent move must change the child order.");
      }
      const movedNode = cloneNode(node);
      return {
        tree: { ...tree, nodes: replaceNodes(tree, {
          [fromParent.id]: { ...fromParent, children },
          [node.id]: movedNode,
        }) },
        inverse: {
          type: "move-node",
          nodeId: node.id,
          expectedNode: cloneNode(movedNode),
          fromParentId: fromParent.id,
          fromIndex: mutation.toIndex,
          fromParentChildrenBefore: [...children],
          toParentId: fromParent.id,
          toIndex: mutation.fromIndex,
          toParentChildrenBefore: [...children],
        },
        affectedNodeIds: [node.id, fromParent.id],
      };
    }
    const fromChildren = [...fromParent.children];
    fromChildren.splice(mutation.fromIndex, 1);
    const toChildren = [...toParent.children];
    toChildren.splice(mutation.toIndex, 0, node.id);
    const movedNode = { ...cloneNode(node), parentId: toParent.id };
    return {
      tree: { ...tree, nodes: replaceNodes(tree, {
        [fromParent.id]: { ...fromParent, children: fromChildren },
        [toParent.id]: { ...toParent, children: toChildren },
        [node.id]: movedNode,
      }) },
      inverse: {
        type: "move-node",
        nodeId: node.id,
        expectedNode: cloneNode(movedNode),
        fromParentId: toParent.id,
        fromIndex: mutation.toIndex,
        fromParentChildrenBefore: [...toChildren],
        toParentId: fromParent.id,
        toIndex: mutation.fromIndex,
        toParentChildrenBefore: [...fromChildren],
      },
      affectedNodeIds: [node.id, fromParent.id, toParent.id],
    };
  }

  if (mutation.type === "replace-text") {
    const node = tree.nodes[mutation.nodeId];
    if (!node) return commandFailure("The text replacement node does not exist.");
    if (
      typeof mutation.expectedText !== "string" ||
      typeof mutation.text !== "string" ||
      node.text !== mutation.expectedText ||
      node.updatedAt !== mutation.expectedUpdatedAt
    ) {
      return commandFailure("The text replacement memento does not match the node.");
    }
    if (mutation.text === mutation.expectedText) {
      return commandFailure("A text replacement must change the text.");
    }
    if (!isCanonicalTimestamp(mutation.updatedAt)) {
      return commandFailure("A text replacement requires a canonical timestamp.");
    }
    if (isTimestampBefore(mutation.updatedAt, node.createdAt)) {
      return commandFailure("A text replacement cannot precede its node creation.");
    }
    const nextNode = { ...cloneNode(node), text: mutation.text, updatedAt: mutation.updatedAt };
    return {
      tree: { ...tree, nodes: replaceNodes(tree, { [node.id]: nextNode }) },
      inverse: {
        type: "replace-text",
        nodeId: node.id,
        expectedText: mutation.text,
        expectedUpdatedAt: mutation.updatedAt,
        text: node.text,
        updatedAt: node.updatedAt,
      },
      affectedNodeIds: [node.id],
    };
  }

  if (mutation.type === "replace-title") {
    if (
      typeof mutation.expectedTitle !== "string" ||
      typeof mutation.title !== "string" ||
      tree.title !== mutation.expectedTitle ||
      mutation.title === mutation.expectedTitle ||
      mutation.title.length === 0 ||
      mutation.title.length > 160
    ) {
      return commandFailure("The title replacement does not match the document.");
    }
    return {
      tree: { ...tree, title: mutation.title },
      inverse: {
        type: "replace-title",
        expectedTitle: mutation.title,
        title: mutation.expectedTitle,
      },
      affectedNodeIds: [],
    };
  }

  return commandFailure("The mutation type is unsupported.");
}

export function applyTreeCommand(tree: ThoughtTree, command: TreeCommand): CommandResult {
  const treeValidation = validateThoughtTree(tree);
  if (!treeValidation.ok) return failure(treeValidation.error.code, treeValidation.error.message);
  if (
    !command ||
    typeof command !== "object" ||
    typeof command.id !== "string" ||
    command.id.length === 0 ||
    typeof command.expectedTreeId !== "string" ||
    !isCanonicalTimestamp(command.createdAt) ||
    !["human", "agent", "fixture"].includes(command.source) ||
    (command.interactionId !== undefined &&
      (typeof command.interactionId !== "string" || command.interactionId.length === 0))
  ) {
    return commandFailure("The tree command envelope is invalid.");
  }
  if (command.expectedTreeId !== tree.id) {
    return commandFailure("The command targets a different tree.");
  }
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    return commandFailure("The command revision is invalid.");
  }
  if (command.expectedRevision !== tree.revision) {
    return failure("REVISION_CONFLICT", "The command revision does not match the tree.");
  }
  if (tree.revision >= Number.MAX_SAFE_INTEGER) {
    return commandFailure("The tree revision cannot be incremented safely.");
  }

  const applied = applyMutation(tree, command.mutation);
  if ("error" in applied) return applied;
  const nextTree = { ...applied.tree, revision: tree.revision + 1 };
  const nextValidation = validateThoughtTree(nextTree);
  if (!nextValidation.ok) {
    return failure(nextValidation.error.code, nextValidation.error.message);
  }

  return {
    ok: true,
    tree: nextTree,
    inverse: {
      id: `${command.id}:inverse`,
      source: command.source,
      ...(command.interactionId === undefined ? {} : { interactionId: command.interactionId }),
      expectedTreeId: tree.id,
      expectedRevision: nextTree.revision,
      mutation: applied.inverse,
      createdAt: command.createdAt,
    },
    affectedNodeIds: applied.affectedNodeIds,
  };
}
