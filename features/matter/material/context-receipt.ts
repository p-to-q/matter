import { MAX_NODES_PER_TREE, MAX_NODE_TEXT_CODE_UNITS, isMaterialId } from "../tree/invariants";
import { sha256Hex } from "../tree/sha256";
import { isWellFormedUnicodeText } from "../tree/unicode-text";
import {
  MATERIAL_ADDRESS_KINDS,
  MATERIAL_PROJECTION_VERSION,
  type MaterialAddressKind,
  type MaterialProjection,
  type MaterialProjectionNode,
} from "./material-projection";

/**
 * The Markdown Context Receipt: a human-readable, machine-checkable rendering
 * of one MaterialProjection. It is a projection, never an authority, and
 * nothing parsed here is ever fed back into the tree.
 *
 * Rendering and parsing are async because the digest is the shared Web Crypto
 * `sha256Hex`, not a second hand-written hash.
 *
 * Text is never interpreted: every line of node text sits behind a `> ` prefix
 * and the front matter, fence and digest are located by position, so no node
 * text can forge a structural line. A truncated node ends its quote with the
 * line `> […]`; the machine block, not the marker, is authoritative for
 * `truncated`, so a node whose own last line is `[…]` stays unambiguous.
 */
export const CONTEXT_RECEIPT_VERSION = 1;

/**
 * A tree holds at most MAX_NODES_PER_TREE nodes of MAX_NODE_TEXT_CODE_UNITS
 * code units, at most three UTF-8 bytes each; the second term covers one
 * bullet, one machine entry and quote prefixes per node. A projection that
 * would exceed it is refused by render and parse alike.
 */
const RECEIPT_NODE_OVERHEAD_BYTES = 1_024;
export const MAX_CONTEXT_RECEIPT_BYTES =
  MAX_NODES_PER_TREE * (MAX_NODE_TEXT_CODE_UNITS * 3 + RECEIPT_NODE_OVERHEAD_BYTES);

export type ContextReceiptRejection =
  | "too-large"
  | "malformed"
  | "unsupported-version"
  | "inconsistent"
  | "digest-mismatch";

export type ContextReceiptParseResult =
  | Readonly<{ ok: true; projection: MaterialProjection }>
  | Readonly<{ ok: false; reason: ContextReceiptRejection }>;

const FRONT_KEYS = Object.freeze([
  "matter-receipt",
  "projection",
  "tree",
  "revision",
  "address",
  "thoughts",
  "clipped",
] as const);
const FRONT_LINES = FRONT_KEYS.length + 2;
const TRUNCATION_MARKER = "[…]";
const DIGEST_PREFIX = "digest: sha256-";
const DIGEST_LINE = /^digest: sha256-([0-9a-f]{64})$/u;
const COUNT = /^(?:0|[1-9][0-9]{0,15})$/u;
const MIN_LINES = FRONT_LINES + 1 + 3 + 1;

export async function renderContextReceipt(projection: MaterialProjection): Promise<string> {
  const problem = projectionProblem(projection);
  if (problem !== null) throw new RangeError(`Cannot render an invalid material projection: ${problem}.`);
  const body = renderBody(projection);
  const bytes = new TextEncoder().encode(body);
  if (bytes.length > MAX_CONTEXT_RECEIPT_BYTES) {
    throw new RangeError("The context receipt exceeds its size bound; project with limits.");
  }
  return `${body}${DIGEST_PREFIX}${await sha256Hex(bytes)}\n`;
}

/** Everything the digest covers: the receipt up to and including the closing fence. */
function renderBody(projection: MaterialProjection): string {
  const { nodes } = projection;
  const levels = structuralLevels(nodes);
  const fence = "`".repeat(fenceLength(nodes));

  const lines = [
    "---",
    `matter-receipt: ${CONTEXT_RECEIPT_VERSION}`,
    `projection: ${projection.version}`,
    `tree: ${projection.treeId}`,
    `revision: ${projection.revision}`,
    `address: ${projection.address}`,
    `thoughts: ${projection.thoughtCount}`,
    `clipped: ${projection.clipped}`,
    "---",
    "",
  ];
  nodes.forEach((node, index) => {
    const indent = " ".repeat(2 * (levels[index] ?? 0));
    lines.push(`${indent}- ${node.nodeId}`);
    for (const line of quoteLines(node)) lines.push(line === "" ? `${indent}  >` : `${indent}  > ${line}`);
  });
  if (nodes.length > 0) lines.push("");
  lines.push(`${fence}json`, canonicalMachine(nodes), fence);
  return `${lines.join("\n")}\n`;
}

export async function parseContextReceipt(markdown: unknown): Promise<ContextReceiptParseResult> {
  if (typeof markdown !== "string") return reject("malformed");
  // Code units never exceed UTF-8 bytes, so this rejects before any copy.
  if (markdown.length > MAX_CONTEXT_RECEIPT_BYTES) return reject("too-large");
  if (!isWellFormedUnicodeText(markdown)) return reject("malformed");
  const bytes = new TextEncoder().encode(markdown);
  if (bytes.length > MAX_CONTEXT_RECEIPT_BYTES) return reject("too-large");
  if (!markdown.endsWith("\n")) return reject("malformed");

  const lines = markdown.split("\n");
  lines.pop();
  if (lines.length < MIN_LINES) return reject("malformed");

  const front = parseFront(lines);
  if (!front.ok) return reject(front.reason);

  const last = lines.length - 1;
  const digest = DIGEST_LINE.exec(lines[last] ?? "");
  const machineLine = lines[last - 2] ?? "";
  const opening = lines[last - 3] ?? "";
  const fence = /^(`{3,})json$/u.exec(opening);
  const openIndex = last - 3;
  if (digest === null || fence === null) return reject("malformed");
  if (openIndex < FRONT_LINES + 1 || lines[FRONT_LINES] !== "") return reject("malformed");

  let outline: readonly string[] = [];
  if (openIndex > FRONT_LINES + 1) {
    if (openIndex < FRONT_LINES + 3 || lines[openIndex - 1] !== "") return reject("malformed");
    outline = lines.slice(FRONT_LINES + 1, openIndex - 1);
  }

  const entries = parseMachine(machineLine);
  if (entries === null) return reject("malformed");
  const levels = entryLevels(entries);
  if (levels === null) return reject("inconsistent");
  const texts = parseOutline(outline, entries, levels);
  if (texts === null) return reject("inconsistent");

  const nodes: MaterialProjectionNode[] = entries.map((entry, index) =>
    Object.freeze({ ...entry, text: texts[index] ?? "" }));
  const projection: MaterialProjection = Object.freeze({
    version: MATERIAL_PROJECTION_VERSION,
    treeId: front.treeId,
    revision: front.revision,
    address: front.address,
    nodes: Object.freeze(nodes),
    thoughtCount: front.thoughtCount,
    clipped: front.clipped,
  });
  if (projectionProblem(projection) !== null) return reject("inconsistent");

  // The grammar is closed by construction: the receipt must be exactly what the
  // renderer writes for the projection it was read as, so no second spelling of
  // the same projection (fence length, spacing, blank lines) is ever accepted.
  const body = `${lines.slice(0, last).join("\n")}\n`;
  if (renderBody(projection) !== body) return reject("malformed");
  if (digest[1] !== await sha256Hex(new TextEncoder().encode(body))) return reject("digest-mismatch");
  return Object.freeze({ ok: true, projection });
}

function reject(reason: ContextReceiptRejection): ContextReceiptParseResult {
  return Object.freeze({ ok: false, reason });
}

type Front = Readonly<{
  ok: true;
  treeId: string;
  revision: number;
  address: MaterialAddressKind;
  thoughtCount: number;
  clipped: boolean;
}> | Readonly<{ ok: false; reason: ContextReceiptRejection }>;

function parseFront(lines: readonly string[]): Front {
  if (lines[0] !== "---" || lines[FRONT_LINES - 1] !== "---") return { ok: false, reason: "malformed" };
  const values: string[] = [];
  for (let index = 0; index < FRONT_KEYS.length; index += 1) {
    const prefix = `${FRONT_KEYS[index]}: `;
    const line = lines[index + 1] ?? "";
    if (!line.startsWith(prefix)) return { ok: false, reason: "malformed" };
    values.push(line.slice(prefix.length));
  }
  const [receipt, version, treeId, revision, address, thoughts, clipped] = values as [
    string, string, string, string, string, string, string,
  ];
  if (receipt !== String(CONTEXT_RECEIPT_VERSION) || version !== MATERIAL_PROJECTION_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  const revisionCount = parseCount(revision);
  const thoughtCount = parseCount(thoughts);
  if (
    !isMaterialId(treeId) ||
    revisionCount === null ||
    thoughtCount === null ||
    !(MATERIAL_ADDRESS_KINDS as readonly string[]).includes(address) ||
    (clipped !== "true" && clipped !== "false")
  ) {
    return { ok: false, reason: "malformed" };
  }
  return {
    ok: true,
    treeId,
    revision: revisionCount,
    address: address as MaterialAddressKind,
    thoughtCount,
    clipped: clipped === "true",
  };
}

function parseCount(value: string): number | null {
  if (!COUNT.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}

type Entry = Omit<MaterialProjectionNode, "text">;

function parseMachine(line: string): readonly Entry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !sameKeys(parsed, ["nodes"]) || !Array.isArray(parsed.nodes)) return null;
  if (parsed.nodes.length > MAX_NODES_PER_TREE) return null;
  const entries: Entry[] = [];
  for (const raw of parsed.nodes as unknown[]) {
    if (!isRecord(raw) || !sameKeys(raw, ["depth", "i", "id", "parent", "truncated"])) return null;
    const { depth, i, id, parent, truncated } = raw;
    if (
      !isCount(depth) ||
      !isCount(i) ||
      !isMaterialId(id) ||
      (parent !== null && !isMaterialId(parent)) ||
      typeof truncated !== "boolean"
    ) {
      return null;
    }
    entries.push({ nodeId: id, parentId: parent, siblingIndex: i, depth, truncated });
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(record);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Keys are emitted in sorted order and the text stays out of this block. */
function canonicalMachine(nodes: readonly Entry[]): string {
  const entries = nodes.map((node) =>
    `{"depth":${node.depth},"i":${node.siblingIndex},"id":${JSON.stringify(node.nodeId)},` +
    `"parent":${node.parentId === null ? "null" : JSON.stringify(node.parentId)},` +
    `"truncated":${node.truncated}}`);
  return `{"nodes":[${entries.join(",")}]}`;
}

function structuralLevels(nodes: readonly Entry[]): readonly number[] {
  return entryLevels(nodes) ?? [];
}

/**
 * Outline indentation is the carried-node relation: a node sits one level
 * under the nearest earlier entry with its parent's id, or at the top.
 * Null when a parent was not carried earlier.
 */
function entryLevels(entries: readonly Entry[]): readonly number[] | null {
  const latest = new Map<string, number>();
  const levels: number[] = [];
  for (const entry of entries) {
    let level = 0;
    if (entry.parentId !== null) {
      const parentLevel = latest.get(entry.parentId);
      if (parentLevel === undefined) return null;
      level = parentLevel + 1;
    }
    levels.push(level);
    latest.set(entry.nodeId, level);
  }
  return levels;
}

function quoteLines(node: MaterialProjectionNode): readonly string[] {
  const lines = node.text.split("\n");
  return node.truncated ? [...lines, TRUNCATION_MARKER] : lines;
}

function parseOutline(
  outline: readonly string[],
  entries: readonly Entry[],
  levels: readonly number[],
): readonly string[] | null {
  const texts: string[] = [];
  let cursor = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const level = levels[index];
    if (entry === undefined || level === undefined) return null;
    const indent = " ".repeat(2 * level);
    if (outline[cursor] !== `${indent}- ${entry.nodeId}`) return null;
    cursor += 1;
    const quote = `${indent}  >`;
    const collected: string[] = [];
    while (cursor < outline.length) {
      const line = outline[cursor] ?? "";
      if (!line.startsWith(quote)) break;
      if (line.length === quote.length) collected.push("");
      else if (line[quote.length] === " ") collected.push(line.slice(quote.length + 1));
      else return null;
      cursor += 1;
    }
    if (entry.truncated) {
      if (collected.length < 2 || collected[collected.length - 1] !== TRUNCATION_MARKER) return null;
      collected.pop();
    } else if (collected.length < 1) {
      return null;
    }
    texts.push(collected.join("\n"));
  }
  return cursor === outline.length ? texts : null;
}

/** Longer than any backtick run in the carried text, and never below three. */
function fenceLength(nodes: readonly MaterialProjectionNode[]): number {
  let longest = 0;
  for (const { text } of nodes) {
    for (const run of text.match(/`+/gu) ?? []) longest = Math.max(longest, run.length);
  }
  return Math.max(3, longest + 1);
}

/**
 * The invariants render requires and parse re-establishes, so a projection and
 * its receipt can never disagree about what is well formed.
 */
function projectionProblem(projection: MaterialProjection): string | null {
  if (projection.version !== MATERIAL_PROJECTION_VERSION) return "version";
  if (!isMaterialId(projection.treeId)) return "tree id";
  if (!isCount(projection.revision)) return "revision";
  if (!(MATERIAL_ADDRESS_KINDS as readonly string[]).includes(projection.address)) return "address";
  if (!Array.isArray(projection.nodes) || projection.nodes.length > MAX_NODES_PER_TREE) return "nodes";
  if (!isCount(projection.thoughtCount) || projection.thoughtCount < projection.nodes.length) return "thought count";
  if (typeof projection.clipped !== "boolean") return "clipped";

  const siblingIndexById = new Map<string, number>();
  let anyTruncated = false;
  for (const node of projection.nodes) {
    if (!isMaterialId(node.nodeId)) return "node id";
    // A parent is named only when carried earlier, so no cycle can be written.
    if (node.parentId !== null && !siblingIndexById.has(node.parentId)) return "parent";
    if (!isCount(node.siblingIndex)) return "sibling index";
    if (!isCount(node.depth)) return "depth";
    if (typeof node.truncated !== "boolean") return "truncated";
    if (
      typeof node.text !== "string" ||
      !isWellFormedUnicodeText(node.text) ||
      node.text.length > MAX_NODE_TEXT_CODE_UNITS
    ) {
      return "text";
    }
    const earlier = siblingIndexById.get(node.nodeId);
    // Only a selection may carry one node twice, once per range.
    if (earlier !== undefined && (projection.address !== "selection" || earlier !== node.siblingIndex)) {
      return "duplicate node";
    }
    siblingIndexById.set(node.nodeId, node.siblingIndex);
    anyTruncated ||= node.truncated;
  }
  if (projection.clipped !== (projection.thoughtCount !== projection.nodes.length || anyTruncated)) {
    return "clipped";
  }
  return null;
}
