import {
  PROTOCOL_VERSION,
  type CommandErrorCode,
  type ThoughtNode,
  type ThoughtTree,
} from "./model";

export const MAX_NODE_TEXT_CODE_UNITS = 2_000;
export const MAX_REPLACEMENT_TEXT_CODE_UNITS = 800;
export const MAX_MATERIAL_ID_BYTES = 128;
export const MAX_TREE_DEPTH = 32;
export const MAX_CHILDREN_PER_NODE = 64;
export const MAX_NODES_PER_TREE = 2_000;
const MATERIAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

export type TreeValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: { code: Extract<CommandErrorCode, "TREE_INVARIANT_VIOLATION" | "BOUND_EXCEEDED">; message: string };
    };

function failure(
  code: "TREE_INVARIANT_VIOLATION" | "BOUND_EXCEEDED",
  message: string,
): TreeValidationResult {
  return { ok: false, error: { code, message } };
}

export function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isTimestampBefore(left: string, right: string): boolean {
  return Date.parse(left) < Date.parse(right);
}

export function validateThoughtNode(
  node: unknown,
): TreeValidationResult {
  if (!node || typeof node !== "object") {
    return failure("TREE_INVARIANT_VIOLATION", "A thought node must be an object.");
  }

  const candidate = node as Partial<ThoughtNode>;
  if (!isMaterialId(candidate.id)) {
    return failure("TREE_INVARIANT_VIOLATION", "A thought node requires a non-empty id.");
  }
  if (typeof candidate.text !== "string") {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has invalid text.`);
  }
  if (candidate.role !== undefined && candidate.role !== "document-root") {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has an invalid role.`);
  }
  if (candidate.role === "document-root" && candidate.text !== "") {
    return failure("TREE_INVARIANT_VIOLATION", `Document root ${candidate.id} must have empty text.`);
  }
  if (candidate.text.length > MAX_NODE_TEXT_CODE_UNITS) {
    return failure("BOUND_EXCEEDED", `Node ${candidate.id} exceeds the text bound.`);
  }
  if (candidate.parentId !== null && typeof candidate.parentId !== "string") {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has an invalid parent id.`);
  }
  if (!Array.isArray(candidate.children)) {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has invalid children.`);
  }
  if (candidate.children.length > MAX_CHILDREN_PER_NODE) {
    return failure("BOUND_EXCEEDED", `Node ${candidate.id} exceeds the child bound.`);
  }
  if (
    candidate.children.some((childId) => typeof childId !== "string" || childId.length === 0)
  ) {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has an invalid child id.`);
  }
  if (new Set(candidate.children).size !== candidate.children.length) {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has duplicate children.`);
  }
  if (!isCanonicalTimestamp(candidate.createdAt) || !isCanonicalTimestamp(candidate.updatedAt)) {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} has a non-canonical timestamp.`);
  }
  if (isTimestampBefore(candidate.updatedAt, candidate.createdAt)) {
    return failure("TREE_INVARIANT_VIOLATION", `Node ${candidate.id} was updated before it was created.`);
  }
  return { ok: true };
}

export function createEmptyTree(id: string, revision = 0): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id,
    rootId: null,
    nodes: {},
    revision,
  };
}

export function validateThoughtTree(tree: unknown): TreeValidationResult {
  if (!tree || typeof tree !== "object") {
    return failure("TREE_INVARIANT_VIOLATION", "A thought tree must be an object.");
  }

  const candidate = tree as Partial<ThoughtTree>;
  if (candidate.protocolVersion !== PROTOCOL_VERSION) {
    return failure("TREE_INVARIANT_VIOLATION", "The tree protocol version is unsupported.");
  }
  if (!isMaterialId(candidate.id)) {
    return failure("TREE_INVARIANT_VIOLATION", "A thought tree requires a non-empty id.");
  }
  if (!Number.isSafeInteger(candidate.revision) || (candidate.revision ?? -1) < 0) {
    return failure("TREE_INVARIANT_VIOLATION", "The tree revision must be a non-negative safe integer.");
  }
  if (!candidate.nodes || typeof candidate.nodes !== "object" || Array.isArray(candidate.nodes)) {
    return failure("TREE_INVARIANT_VIOLATION", "The tree nodes must be a record.");
  }
  const nodes = candidate.nodes as Record<string, ThoughtNode>;
  const nodeIds = Object.keys(nodes);
  if (nodeIds.length > MAX_NODES_PER_TREE) {
    return failure("BOUND_EXCEEDED", "The tree exceeds the node bound.");
  }
  if (candidate.rootId !== null && typeof candidate.rootId !== "string") {
    return failure("TREE_INVARIANT_VIOLATION", "The tree root id is invalid.");
  }
  if (candidate.rootId === null) {
    return nodeIds.length === 0
      ? { ok: true }
      : failure("TREE_INVARIANT_VIOLATION", "A non-empty tree requires one root.");
  }
  if (nodeIds.length === 0 || !Object.hasOwn(nodes, candidate.rootId)) {
    return failure("TREE_INVARIANT_VIOLATION", "The tree root does not exist.");
  }
  if (
    typeof candidate.title !== "undefined" &&
    (typeof candidate.title !== "string" || candidate.title.trim().length === 0 || candidate.title.length > 160)
  ) {
    return failure("TREE_INVARIANT_VIOLATION", "The document title is invalid.");
  }

  const incoming = new Map<string, number>();
  for (const key of nodeIds) {
    const node = nodes[key];
    const nodeResult = validateThoughtNode(node);
    if (!nodeResult.ok) return nodeResult;
    if (key !== node.id) {
      return failure("TREE_INVARIANT_VIOLATION", `Node record key ${key} differs from its id.`);
    }
  }

  for (const key of nodeIds) {
    const node = nodes[key];
    if (node.id === candidate.rootId) {
      if (node.parentId !== null) {
        return failure("TREE_INVARIANT_VIOLATION", "The root node must not have a parent.");
      }
    } else if (node.parentId === null) {
      return failure("TREE_INVARIANT_VIOLATION", `Node ${node.id} is an additional root.`);
    }
    if (node.role === "document-root" && node.id !== candidate.rootId) {
      return failure("TREE_INVARIANT_VIOLATION", `Node ${node.id} cannot be a nested document root.`);
    }

    for (const childId of node.children) {
      if (!Object.hasOwn(nodes, childId)) {
        return failure("TREE_INVARIANT_VIOLATION", `Node ${node.id} names an unknown child.`);
      }
      incoming.set(childId, (incoming.get(childId) ?? 0) + 1);
      if (nodes[childId].parentId !== node.id) {
        return failure("TREE_INVARIANT_VIOLATION", `Nodes ${node.id} and ${childId} disagree about parentage.`);
      }
    }
  }

  if (incoming.has(candidate.rootId)) {
    return failure("TREE_INVARIANT_VIOLATION", "The root node cannot be a child.");
  }
  for (const id of nodeIds) {
    if (id !== candidate.rootId && incoming.get(id) !== 1) {
      return failure("TREE_INVARIANT_VIOLATION", `Node ${id} does not have exactly one parent attachment.`);
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string, depth: number): TreeValidationResult => {
    if (depth > MAX_TREE_DEPTH) {
      return failure("BOUND_EXCEEDED", `The path to node ${id} exceeds the depth bound.`);
    }
    if (active.has(id)) {
      return failure("TREE_INVARIANT_VIOLATION", `The tree contains a cycle at node ${id}.`);
    }
    if (visited.has(id)) return { ok: true };
    active.add(id);
    visited.add(id);
    for (const childId of nodes[id].children) {
      const result = visit(childId, depth + 1);
      if (!result.ok) return result;
    }
    active.delete(id);
    return { ok: true };
  };

  const traversal = visit(candidate.rootId, nodes[candidate.rootId].role === "document-root" ? 0 : 1);
  if (!traversal.ok) return traversal;
  if (visited.size !== nodeIds.length) {
    return failure("TREE_INVARIANT_VIOLATION", "The tree contains an unreachable node.");
  }
  return { ok: true };
}

export function isMaterialId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= MAX_MATERIAL_ID_BYTES &&
    MATERIAL_ID.test(value);
}
