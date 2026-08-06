import type { ThoughtNode, ThoughtTree } from "../tree/model";

export type CanonicalRelativePath = string & { readonly __canonicalRelativePath: unique symbol };

export type SnapshotPathEntry = Readonly<{
  nodeId: string;
  path: CanonicalRelativePath;
  directory: CanonicalRelativePath;
  authoredIndex: number;
}>;

const MAX_SLUG_SCALARS = 48;
const MAX_SLUG_UTF8_BYTES = 48;
const UTF8 = new TextEncoder();

/** Allocates paths from authored structure; readable slugs never carry identity. */
export function allocateSnapshotPaths(tree: ThoughtTree): readonly SnapshotPathEntry[] {
  if (tree.rootId === null || !Object.hasOwn(tree.nodes, tree.rootId)) {
    return Object.freeze([]);
  }
  const entries: SnapshotPathEntry[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string, directory: string): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = Object.hasOwn(tree.nodes, nodeId) ? tree.nodes[nodeId] : undefined;
    if (node === undefined) return;
    entries.push(Object.freeze({
      nodeId,
      directory: asCanonicalPath(directory),
      path: asCanonicalPath(`${directory}/index.md`),
      authoredIndex: entries.length,
    }));
    for (const [index, childId] of node.children.entries()) {
      const child = Object.hasOwn(tree.nodes, childId) ? tree.nodes[childId] : undefined;
      if (child === undefined) continue;
      visit(childId, `${directory}/${String(index + 1).padStart(3, "0")}-${materialSlug(child.text)}`);
    }
  };
  visit(tree.rootId, "matter");
  return Object.freeze(entries);
}

/** Allocates one exact display path without deriving paths for offscreen rows. */
export function allocateSnapshotPath(
  tree: ThoughtTree,
  nodeId: string,
): CanonicalRelativePath | null {
  if (tree.rootId === null || !Object.hasOwn(tree.nodes, tree.rootId)) return null;
  const reverseLineage: ThoughtNode[] = [];
  const visited = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId !== null) {
    if (visited.has(currentId) || !Object.hasOwn(tree.nodes, currentId)) return null;
    visited.add(currentId);
    const current: ThoughtNode = tree.nodes[currentId];
    reverseLineage.push(current);
    currentId = current.parentId;
  }
  reverseLineage.reverse();
  if (reverseLineage[0]?.id !== tree.rootId) return null;

  let directory = "matter";
  for (let index = 1; index < reverseLineage.length; index += 1) {
    const parent = reverseLineage[index - 1];
    const node = reverseLineage[index];
    const authoredIndex = parent.children.indexOf(node.id);
    if (authoredIndex < 0) return null;
    directory += `/${String(authoredIndex + 1).padStart(3, "0")}-${materialSlug(node.text)}`;
  }
  return asCanonicalPath(`${directory}/index.md`);
}

export function materialSlug(text: string): string {
  const normalized = text
    .normalize("NFC")
    .toLocaleLowerCase("und")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/gu, "-")
    .replace(/[\s\p{P}\p{S}]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  const boundedScalars: string[] = [];
  let bytes = 0;
  for (const scalar of Array.from(normalized).slice(0, MAX_SLUG_SCALARS)) {
    const scalarBytes = UTF8.encode(scalar).byteLength;
    if (bytes + scalarBytes > MAX_SLUG_UTF8_BYTES) break;
    boundedScalars.push(scalar);
    bytes += scalarBytes;
  }
  const bounded = boundedScalars.join("").replace(/-$/u, "");
  return bounded.length > 0 ? bounded : "thought";
}

export function asCanonicalPath(path: string): CanonicalRelativePath {
  return path as CanonicalRelativePath;
}
