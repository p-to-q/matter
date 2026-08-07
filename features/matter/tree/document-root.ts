import { validateThoughtTree } from "./invariants";
import type { ThoughtNode, ThoughtTree } from "./model";

const DOCUMENT_ROOT_PREFIX = "matter_document_root_";
const DEFAULT_TITLE = "Untitled matter";

export function documentRootId(treeId: string): string {
  return `${DOCUMENT_ROOT_PREFIX}${treeId}`.slice(0, 128);
}

export function isDocumentRoot(tree: ThoughtTree, nodeId: string | null): boolean {
  return nodeId !== null && tree.rootId === nodeId && tree.nodes[nodeId]?.role === "document-root";
}

/** Wraps legacy one-root documents in an invisible structural root. */
export function normalizeDocumentTree(tree: ThoughtTree, initialTitle?: string): ThoughtTree {
  if (tree.rootId === null || Object.keys(tree.nodes).length === 0) {
    const containerId = documentRootId(tree.id);
    const container: ThoughtNode = {
      id: containerId,
      role: "document-root",
      text: "",
      parentId: null,
      children: [],
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    };
    return {
      ...tree,
      title: tree.title ?? initialTitle ?? DEFAULT_TITLE,
      rootId: containerId,
      nodes: { [containerId]: container },
    };
  }
  const existingRoot = tree.nodes[tree.rootId];
  if (
    existingRoot !== undefined &&
    existingRoot.parentId === null &&
    existingRoot.text === "" &&
    existingRoot.id === documentRootId(tree.id)
  ) {
    const first = existingRoot.children[0] === undefined ? undefined : tree.nodes[existingRoot.children[0]];
    const titleNeedsRepair = first !== undefined && (
      tree.title === undefined || tree.title === DEFAULT_TITLE || tree.title === "Untitled thought"
    );
    if (existingRoot.role === "document-root" && !titleNeedsRepair) return tree;
    const normalized: ThoughtTree = {
      ...tree,
      title: titleNeedsRepair
        ? (initialTitle ?? first?.text.trim() ?? "") || DEFAULT_TITLE
        : tree.title,
      nodes: {
        ...tree.nodes,
        [existingRoot.id]: { ...existingRoot, role: "document-root" },
      },
    };
    const validation = validateThoughtTree(normalized);
    return validation.ok ? normalized : tree;
  }
  if (isDocumentRoot(tree, tree.rootId)) {
    return tree.title === undefined ? { ...tree, title: initialTitle ?? deriveDocumentTitle(tree) } : tree;
  }

  const legacyRoot = tree.nodes[tree.rootId];
  if (legacyRoot === undefined) return tree;
  const containerId = documentRootId(tree.id);
  const container: ThoughtNode = {
    id: containerId,
    role: "document-root",
    text: "",
    parentId: null,
    children: [legacyRoot.id],
    createdAt: legacyRoot.createdAt,
    updatedAt: legacyRoot.updatedAt,
  };
  const normalized: ThoughtTree = {
    ...tree,
    title: tree.title ?? initialTitle ?? deriveDocumentTitle(tree),
    rootId: containerId,
    nodes: {
      ...tree.nodes,
      [legacyRoot.id]: { ...legacyRoot, parentId: containerId },
      [containerId]: container,
    },
  };
  const validation = validateThoughtTree(normalized);
  return validation.ok ? normalized : tree;
}

function deriveDocumentTitle(tree: ThoughtTree): string {
  if (tree.rootId === null) return DEFAULT_TITLE;
  const root = tree.nodes[tree.rootId];
  if (root?.role === "document-root") {
    const first = root.children[0] === undefined ? undefined : tree.nodes[root.children[0]];
    return first?.text.trim() || DEFAULT_TITLE;
  }
  return root?.text.trim() || DEFAULT_TITLE;
}

export const DOCUMENT_TITLE_MAX_CODE_UNITS = 160;

export function normalizeDocumentTitle(value: string): string {
  return value.trim().slice(0, DOCUMENT_TITLE_MAX_CODE_UNITS) || DEFAULT_TITLE;
}
