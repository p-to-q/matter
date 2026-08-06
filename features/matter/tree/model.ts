export const PROTOCOL_VERSION = "0.2" as const;

export type ThoughtNode = {
  id: string;
  text: string;
  parentId: string | null;
  children: string[];
  createdAt: string;
  updatedAt: string;
};

export type ThoughtTree = {
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  rootId: string | null;
  nodes: Record<string, ThoughtNode>;
  revision: number;
};

export type DetachedSubtree = {
  rootId: string;
  nodes: Record<string, ThoughtNode>;
  parentId: string;
  index: number;
  parentChildrenBeforeDetach: string[];
};

export type TreeMutation =
  | { type: "initialize-root"; root: ThoughtNode }
  | { type: "clear-root"; expectedRoot: ThoughtNode }
  | {
      type: "insert-node";
      node: ThoughtNode;
      parentId: string;
      index: number;
      expectedParentChildren: string[];
    }
  | { type: "remove-subtree"; detached: DetachedSubtree }
  | { type: "restore-subtree"; detached: DetachedSubtree }
  | {
      type: "replace-text";
      nodeId: string;
      expectedText: string;
      expectedUpdatedAt: string;
      text: string;
      updatedAt: string;
    }
  | {
      type: "move-node";
      nodeId: string;
      expectedNode: ThoughtNode;
      fromParentId: string;
      fromIndex: number;
      fromParentChildrenBefore: string[];
      toParentId: string;
      toIndex: number;
      toParentChildrenBefore: string[];
    };

export type TreeCommand = {
  id: string;
  source: "human" | "agent" | "fixture";
  interactionId?: string;
  expectedTreeId: string;
  expectedRevision: number;
  mutation: TreeMutation;
  createdAt: string;
};

export type CommandErrorCode =
  | "REVISION_CONFLICT"
  | "INVALID_COMMAND"
  | "TREE_INVARIANT_VIOLATION"
  | "BOUND_EXCEEDED";

export type CommandFailure = {
  ok: false;
  error: {
    code: CommandErrorCode;
    message: string;
  };
};

export type CommandSuccess = {
  ok: true;
  tree: ThoughtTree;
  inverse: TreeCommand;
  affectedNodeIds: string[];
};

export type CommandResult = CommandSuccess | CommandFailure;
