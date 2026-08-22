import { validateThoughtTree } from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import {
  allocateSnapshotPaths,
  asCanonicalPath,
  type CanonicalRelativePath,
} from "./snapshot-paths";

export type SnapshotBundle = Readonly<{
  files: Readonly<Record<CanonicalRelativePath, string>>;
}>;

export type SnapshotCodecErrorCode =
  | "INVALID_BUNDLE"
  | "INVALID_METADATA"
  | "INVALID_PATH"
  | "INVALID_MARKDOWN"
  | "INVALID_TREE"
  | "BOUND_EXCEEDED";

export type SnapshotDecodeResult =
  | Readonly<{ ok: true; tree: ThoughtTree }>
  | Readonly<{ ok: false; error: Readonly<{ code: SnapshotCodecErrorCode; message: string }> }>;

const MAX_BUNDLE_FILES = 2_002;
const MAX_PATH_BYTES = 2_048;
const MAX_BUNDLE_BYTES = 18_000_000;
const CHILD_DIRECTORY = /^(\d{3})-([^/]+)$/u;
const FRONTMATTER_KEYS = ["id", "createdAt", "updatedAt", "role"] as const;
const UTF8 = new TextEncoder();

export function treeToBundle(tree: ThoughtTree): SnapshotBundle {
  const validation = validateThoughtTree(tree);
  if (!validation.ok) throw new TypeError(validation.error.message);
  const files = Object.create(null) as Record<CanonicalRelativePath, string>;
  files[asCanonicalPath("matter/matter.json")] = `${JSON.stringify({
    protocolVersion: tree.protocolVersion,
    treeId: tree.id,
    revision: tree.revision,
    ...(tree.title === undefined ? {} : { title: tree.title }),
  })}\n`;
  for (const entry of allocateSnapshotPaths(tree)) {
    files[entry.path] = encodeNode(tree.nodes[entry.nodeId]);
  }
  return Object.freeze({ files: Object.freeze(files) });
}

export function bundleToTree(bundle: unknown): SnapshotDecodeResult {
  if (!isPlainRecord(bundle) || !isPlainRecord(bundle.files)) {
    return failure("INVALID_BUNDLE", "A snapshot bundle requires one files record.");
  }
  if (Reflect.ownKeys(bundle).length !== 1) {
    return failure("INVALID_BUNDLE", "A snapshot bundle has unknown fields.");
  }

  const rawFiles = bundle.files;
  const paths = Object.keys(rawFiles);
  if (paths.length === 0 || paths.length > MAX_BUNDLE_FILES) {
    return failure("BOUND_EXCEEDED", "The snapshot file count is outside the supported bound.");
  }
  let bytes = 0;
  for (const path of paths) {
    const content = rawFiles[path];
    if (typeof content !== "string") return failure("INVALID_BUNDLE", `Snapshot file ${path} is not text.`);
    const pathBytes = utf8Bytes(path);
    bytes += pathBytes + utf8Bytes(content);
    if (pathBytes > MAX_PATH_BYTES || bytes > MAX_BUNDLE_BYTES) {
      return failure("BOUND_EXCEEDED", "The snapshot exceeds its path or byte bound.");
    }
    const pathError = validateBundlePath(path);
    if (pathError !== null) return failure("INVALID_PATH", pathError);
  }

  const metadataText = rawFiles["matter/matter.json"];
  if (typeof metadataText !== "string") {
    return failure("INVALID_METADATA", "The snapshot is missing matter/matter.json.");
  }
  const metadata = parseMetadata(metadataText);
  if (!metadata.ok) return metadata;
  if (paths.length === 1) {
    const emptyTree: ThoughtTree = {
      protocolVersion: PROTOCOL_VERSION,
      id: metadata.value.treeId,
      ...(metadata.value.title === undefined ? {} : { title: metadata.value.title }),
      rootId: null,
      nodes: {},
      revision: metadata.value.revision,
    };
    return validateDecodedTree(emptyTree);
  }

  if (typeof rawFiles["matter/index.md"] !== "string") {
    return failure("INVALID_PATH", "A rooted snapshot requires matter/index.md.");
  }
  const markdownPaths = paths.filter((path) => path !== "matter/matter.json");
  if (markdownPaths.some((path) => !path.endsWith("/index.md"))) {
    return failure("INVALID_PATH", "Snapshots may contain only material index.md files.");
  }

  const byDirectory = new Map<string, ThoughtNode>();
  const collisionKeys = new Set<string>();
  const directoryOrder = new Map<string, number>();
  for (const path of markdownPaths) {
    const directory = path.slice(0, -"/index.md".length);
    const collisionKey = normalizedCollisionKey(directory);
    if (collisionKeys.has(collisionKey)) {
      return failure("INVALID_PATH", "Snapshot paths collide after Unicode or case normalization.");
    }
    collisionKeys.add(collisionKey);
    const content = rawFiles[path];
    if (typeof content !== "string") return failure("INVALID_BUNDLE", `Snapshot file ${path} is not text.`);
    const decoded = decodeNode(content);
    if (!decoded.ok) return decoded;
    byDirectory.set(directory, decoded.node);
  }

  const root = byDirectory.get("matter");
  if (root === undefined) return failure("INVALID_PATH", "The root material file is missing.");
  const nodes: Record<string, ThoughtNode> = {};
  const ids = new Set<string>();
  const sortedDirectories = [...byDirectory.keys()].sort(compareSnapshotDirectories);
  for (const directory of sortedDirectories) {
    const parsed = parseDirectory(directory);
    if (!parsed.ok) return parsed;
    directoryOrder.set(directory, parsed.order);
    const source = byDirectory.get(directory)!;
    if (ids.has(source.id)) return failure("INVALID_TREE", `Duplicate node id ${source.id}.`);
    ids.add(source.id);
    const parentDirectory = parsed.parent;
    const parent = parentDirectory === null ? null : byDirectory.get(parentDirectory);
    if (parentDirectory !== null && parent === undefined) {
      return failure("INVALID_PATH", `Material directory ${directory} has no parent index.md.`);
    }
    nodes[source.id] = {
      ...source,
      parentId: parent?.id ?? null,
      children: [],
    };
  }

  const childDirectories = new Map<string, string[]>();
  for (const directory of sortedDirectories) {
    if (directory === "matter") continue;
    const parent = directory.slice(0, directory.lastIndexOf("/"));
    const siblings = childDirectories.get(parent) ?? [];
    siblings.push(directory);
    childDirectories.set(parent, siblings);
  }
  for (const [parentDirectory, children] of childDirectories) {
    children.sort((left, right) => directoryOrder.get(left)! - directoryOrder.get(right)!);
    for (const [index, directory] of children.entries()) {
      if (directoryOrder.get(directory) !== index + 1) {
        return failure("INVALID_PATH", `Children beneath ${parentDirectory} are not numbered contiguously.`);
      }
    }
    const parent = byDirectory.get(parentDirectory)!;
    nodes[parent.id].children = children.map((directory) => byDirectory.get(directory)!.id);
  }

  return validateDecodedTree({
    protocolVersion: PROTOCOL_VERSION,
    id: metadata.value.treeId,
    ...(metadata.value.title === undefined ? {} : { title: metadata.value.title }),
    rootId: root.id,
    nodes,
    revision: metadata.value.revision,
  });
}

function encodeNode(node: ThoughtNode): string {
  const role = node.role === undefined ? "" : `\nrole: ${node.role}`;
  return `---\nid: ${node.id}\ncreatedAt: ${node.createdAt}\nupdatedAt: ${node.updatedAt}${role}\n---\n\n${node.text}`;
}

function decodeNode(content: string):
  | Readonly<{ ok: true; node: ThoughtNode }>
  | Extract<SnapshotDecodeResult, { ok: false }> {
  const separator = "---\n";
  if (!content.startsWith(separator)) return failure("INVALID_MARKDOWN", "Material frontmatter is missing.");
  const end = content.indexOf("\n---\n\n", separator.length);
  if (end < 0) return failure("INVALID_MARKDOWN", "Material frontmatter is not closed.");
  const lines = content.slice(separator.length, end).split("\n");
  if (lines.length !== 3 && lines.length !== 4) {
    return failure("INVALID_MARKDOWN", "Material frontmatter has missing, duplicate, or unknown keys.");
  }
  const values = new Map<string, string>();
  for (const line of lines) {
    const match = /^([A-Za-z][A-Za-z0-9]*): (.+)$/u.exec(line);
    if (match === null || values.has(match[1]) || !FRONTMATTER_KEYS.includes(match[1] as typeof FRONTMATTER_KEYS[number])) {
      return failure("INVALID_MARKDOWN", "Material frontmatter contains an invalid field.");
    }
    values.set(match[1], match[2]);
  }
  const expectedKeys = values.has("role")
    ? ["createdAt", "id", "role", "updatedAt"]
    : ["createdAt", "id", "updatedAt"];
  if (Array.from(values.keys()).sort().join("|") !== expectedKeys.join("|")) {
    return failure("INVALID_MARKDOWN", "Material frontmatter has missing, duplicate, or unknown keys.");
  }
  const role = values.get("role");
  if (role !== undefined && role !== "document-root") {
    return failure("INVALID_MARKDOWN", "Material frontmatter has an invalid node role.");
  }
  return Object.freeze({
    ok: true,
    node: {
      id: values.get("id")!,
      ...(role === undefined ? {} : { role: "document-root" as const }),
      createdAt: values.get("createdAt")!,
      updatedAt: values.get("updatedAt")!,
      text: content.slice(end + "\n---\n\n".length),
      parentId: null,
      children: [],
    },
  });
}

function parseMetadata(text: string):
  | Readonly<{ ok: true; value: { treeId: string; revision: number; title?: string } }>
  | Extract<SnapshotDecodeResult, { ok: false }> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failure("INVALID_METADATA", "Snapshot metadata is not valid JSON.");
  }
  if (!isPlainRecord(value)) return failure("INVALID_METADATA", "Snapshot metadata must be an object.");
  const keys = Object.keys(value).sort();
  const keySignature = keys.join("|");
  if (keySignature !== "protocolVersion|revision|treeId" && keySignature !== "protocolVersion|revision|title|treeId") {
    return failure("INVALID_METADATA", "Snapshot metadata has missing or unknown fields.");
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return failure("INVALID_METADATA", "The snapshot protocol version is unsupported.");
  }
  if (typeof value.treeId !== "string" || value.treeId.length === 0) {
    return failure("INVALID_METADATA", "Snapshot metadata has an invalid tree id.");
  }
  if (value.title !== undefined && (typeof value.title !== "string" || value.title.length === 0 || value.title.length > 160)) {
    return failure("INVALID_METADATA", "Snapshot metadata has an invalid title.");
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    return failure("INVALID_METADATA", "Snapshot metadata has an invalid revision.");
  }
  return Object.freeze({
    ok: true,
    value: {
      treeId: value.treeId,
      revision: value.revision as number,
      ...(value.title === undefined ? {} : { title: value.title }),
    },
  });
}

function parseDirectory(directory: string):
  | Readonly<{ ok: true; parent: string | null; order: number }>
  | Extract<SnapshotDecodeResult, { ok: false }> {
  if (directory === "matter") return Object.freeze({ ok: true, parent: null, order: 0 });
  const split = directory.lastIndexOf("/");
  const parent = directory.slice(0, split);
  const component = directory.slice(split + 1);
  const match = CHILD_DIRECTORY.exec(component);
  if (match === null || component !== component.normalize("NFC")) {
    return failure("INVALID_PATH", `Material directory ${directory} is not canonical.`);
  }
  const order = Number(match[1]);
  if (order < 1 || match[2].length === 0) return failure("INVALID_PATH", `Material directory ${directory} has invalid order.`);
  return Object.freeze({ ok: true, parent, order });
}

function validateBundlePath(path: string): string | null {
  if (path !== path.normalize("NFC") || !path.startsWith("matter/") || path.includes("\\") || /[\u0000-\u001f\u007f]/u.test(path)) {
    return `Snapshot path ${path} is not a canonical relative path.`;
  }
  const components = path.split("/");
  if (components.some((component) => component.length === 0 || component === "." || component === "..")) {
    return `Snapshot path ${path} has an unsafe component.`;
  }
  if (components.length > 34) return `Snapshot path ${path} exceeds the depth bound.`;
  return null;
}

function validateDecodedTree(tree: ThoughtTree): SnapshotDecodeResult {
  const validation = validateThoughtTree(tree);
  return validation.ok
    ? Object.freeze({ ok: true, tree })
    : failure(validation.error.code === "BOUND_EXCEEDED" ? "BOUND_EXCEEDED" : "INVALID_TREE", validation.error.message);
}

function compareSnapshotDirectories(left: string, right: string): number {
  const leftParts = left.split("/");
  const rightParts = right.split("/");
  for (let index = 0; index < Math.min(leftParts.length, rightParts.length); index += 1) {
    const compared = leftParts[index].localeCompare(rightParts[index], "en");
    if (compared !== 0) return compared;
  }
  return leftParts.length - rightParts.length;
}

function normalizedCollisionKey(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("und");
}

function utf8Bytes(value: string): number {
  return UTF8.encode(value).byteLength;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function failure(code: SnapshotCodecErrorCode, message: string): Extract<SnapshotDecodeResult, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
