import { MAX_NODES_PER_TREE, MAX_NODE_TEXT_CODE_UNITS, MAX_TREE_DEPTH, isMaterialId } from "../tree/invariants";
import { sha256Hex } from "../tree/sha256";
import { isWellFormedUnicodeText } from "../tree/unicode-text";
import { parseContextReceipt, type ContextReceiptParseResult, type ContextReceiptRejection } from "./context-receipt";
import {
  MATERIAL_ADDRESS_KINDS,
  MATERIAL_PROJECTION_VERSION,
  type MaterialAddressKind,
  type MaterialProjection,
  type MaterialProjectionNode,
} from "./material-projection";
import { parseOutlineMarkdown, renderOutlineMarkdown } from "./render/list";

/**
 * Receipt v2 shares Copy's inert Markdown passage grammar, not its scope or
 * single-passage presentation. Permanent relations live only in the positional
 * machine block. Reading a receipt never gives it material-write authority.
 */
export const CONTEXT_RECEIPT_V2_FORMAT = "matter-receipt/2" as const;

// An escaped UTF-16 code unit costs at most eight UTF-8 bytes (&#x202E;).
// Indentation and machine entries share the explicit remaining allowance;
// exceptionally large outlines are refused, never flattened or clipped here.
export const MAX_CONTEXT_RECEIPT_V2_BYTES =
  MAX_NODES_PER_TREE * (MAX_NODE_TEXT_CODE_UNITS * 8 + 1_024);

const FRONT_KEYS = ["format", "projection", "tree", "revision", "address", "thoughts", "clipped"] as const;
const FRONT_LINES = FRONT_KEYS.length + 2;
const COUNT = /^(?:0|[1-9][0-9]{0,15})$/u;
const DIGEST_LINE = /^digest: sha256-([0-9a-f]{64})$/u;
type Entry = Omit<MaterialProjectionNode, "text">;

export async function renderContextReceiptV2(projection: MaterialProjection): Promise<string> {
  const levels = projectionLevels(projection);
  if (levels === null) throw new RangeError("Cannot render an invalid material projection.");
  const body = renderBody(projection, levels);
  return `${body}digest: sha256-${await sha256Hex(new TextEncoder().encode(body))}\n`;
}

function renderBody(projection: MaterialProjection, levels: readonly number[]): string {
  const head = [
    "---",
    `format: ${CONTEXT_RECEIPT_V2_FORMAT}`,
    `projection: ${projection.version}`,
    `tree: ${projection.treeId}`,
    `revision: ${projection.revision}`,
    `address: ${projection.address}`,
    `thoughts: ${projection.thoughtCount}`,
    `clipped: ${projection.clipped}`,
    "---",
    "",
  ].join("\n") + "\n";
  const fence = "`".repeat(fenceLength(projection.nodes));
  const machine = `${fence}json\n${canonicalMachine(projection.nodes)}\n${fence}\n`;
  let bytes = new TextEncoder().encode(head + machine).length + 80;
  const items: string[] = [];
  for (let index = 0; index < projection.nodes.length; index += 1) {
    const node = projection.nodes[index]!;
    // Bound each item before joining the complete body. A deeply multiline
    // outline must not allocate its full expanded indentation before refusal.
    const item = renderOutlineMarkdown([{ depth: levels[index]!, text: node.text }]);
    bytes += new TextEncoder().encode(item).length + 1;
    if (bytes > MAX_CONTEXT_RECEIPT_V2_BYTES) throw new RangeError("The context receipt exceeds its size bound.");
    items.push(item);
  }
  return head + (items.length === 0 ? "" : `${items.join("\n")}\n\n`) + machine;
}

export async function parseContextReceiptV2(markdown: unknown): Promise<ContextReceiptParseResult> {
  if (typeof markdown !== "string") return reject("malformed");
  if (markdown.length > MAX_CONTEXT_RECEIPT_V2_BYTES) return reject("too-large");
  if (!isWellFormedUnicodeText(markdown)) return reject("malformed");
  if (new TextEncoder().encode(markdown).length > MAX_CONTEXT_RECEIPT_V2_BYTES) return reject("too-large");
  if (!markdown.endsWith("\n")) return reject("malformed");
  const lines = markdown.slice(0, -1).split("\n");
  const front = parseFront(lines);
  if (!front.ok) return reject(front.reason);
  const last = lines.length - 1;
  const digest = DIGEST_LINE.exec(lines[last] ?? "");
  const fence = /^(`{3,})json$/u.exec(lines[last - 3] ?? "");
  const open = last - 3;
  if (digest === null || fence === null || lines[last - 1] !== fence[1]) return reject("malformed");
  if (open < FRONT_LINES + 1 || lines[FRONT_LINES] !== "") return reject("malformed");
  let outline = "";
  if (open > FRONT_LINES + 1) {
    if (open < FRONT_LINES + 3 || lines[open - 1] !== "") return reject("malformed");
    outline = lines.slice(FRONT_LINES + 1, open - 1).join("\n");
  }
  const entries = parseMachine(lines[last - 2] ?? "");
  if (entries === null) return reject("malformed");
  const items = outline === "" ? [] : parseOutlineMarkdown(outline);
  if (items === null || items.length !== entries.length) return reject("inconsistent");
  const projection: MaterialProjection = Object.freeze({
    version: MATERIAL_PROJECTION_VERSION,
    treeId: front.treeId,
    revision: front.revision,
    address: front.address,
    thoughtCount: front.thoughtCount,
    clipped: front.clipped,
    nodes: Object.freeze(entries.map((entry, index) => Object.freeze({ ...entry, text: items[index]!.text }))),
  });
  const levels = projectionLevels(projection);
  if (levels === null || items.some((item, index) => item.depth !== levels[index])) return reject("inconsistent");
  const body = `${lines.slice(0, last).join("\n")}\n`;
  let canonical: string;
  try {
    canonical = renderBody(projection, levels);
  } catch {
    return reject("too-large");
  }
  if (body !== canonical) return reject("malformed");
  if (digest[1] !== await sha256Hex(new TextEncoder().encode(body))) return reject("digest-mismatch");
  return Object.freeze({ ok: true, projection });
}

/** Dispatch only the exact known file versions; the v1 verifier stays frozen. */
export function parseVersionedContextReceipt(markdown: unknown): Promise<ContextReceiptParseResult> {
  if (typeof markdown !== "string") return Promise.resolve(reject("malformed"));
  if (markdown.startsWith("---\nmatter-receipt: ")) return parseContextReceipt(markdown);
  if (markdown.startsWith("---\nformat: ")) return parseContextReceiptV2(markdown);
  return Promise.resolve(reject("malformed"));
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
  const [format, version, treeId, revision, address, thoughts, clipped] = values as [
    string, string, string, string, string, string, string,
  ];
  if (format !== CONTEXT_RECEIPT_V2_FORMAT || version !== MATERIAL_PROJECTION_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  const revisionCount = parseCount(revision);
  const thoughtCount = parseCount(thoughts);
  if (!isMaterialId(treeId) || revisionCount === null || thoughtCount === null ||
      !(MATERIAL_ADDRESS_KINDS as readonly string[]).includes(address) || (clipped !== "true" && clipped !== "false")) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, treeId, revision: revisionCount, address: address as MaterialAddressKind, thoughtCount, clipped: clipped === "true" };
}

function parseCount(value: string): number | null {
  if (!COUNT.test(value)) return null;
  const count = Number(value);
  return isCount(count) ? count : null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function parseMachine(line: string): readonly Entry[] | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value) || !sameKeys(value, ["nodes"]) || !Array.isArray(value.nodes) || value.nodes.length > MAX_NODES_PER_TREE) return null;
  const entries: Entry[] = [];
  for (const raw of value.nodes as unknown[]) {
    if (!isRecord(raw) || !sameKeys(raw, ["depth", "i", "id", "parent", "truncated"])) return null;
    const { depth, i, id, parent, truncated } = raw;
    if (!isCount(depth) || !isCount(i) || !isMaterialId(id) ||
        (parent !== null && !isMaterialId(parent)) || typeof truncated !== "boolean") return null;
    entries.push({ depth, siblingIndex: i, nodeId: id, parentId: parent, truncated });
  }
  return entries;
}

function canonicalMachine(nodes: readonly Entry[]): string {
  return JSON.stringify({ nodes: nodes.map((node) => ({
    depth: node.depth, i: node.siblingIndex, id: node.nodeId, parent: node.parentId, truncated: node.truncated,
  })) });
}

function fenceLength(nodes: readonly MaterialProjectionNode[]): number {
  let longest = 0;
  for (const { text } of nodes) {
    for (const run of text.match(/`+/gu) ?? []) longest = Math.max(longest, run.length);
  }
  return Math.max(3, longest + 1);
}

/** Validate relationships separately from address-specific presentation depth. */
function projectionLevels(projection: MaterialProjection): readonly number[] | null {
  if (projection.version !== MATERIAL_PROJECTION_VERSION || !isMaterialId(projection.treeId) ||
      !isCount(projection.revision) || !(MATERIAL_ADDRESS_KINDS as readonly string[]).includes(projection.address) ||
      !Array.isArray(projection.nodes) || projection.nodes.length > MAX_NODES_PER_TREE ||
      !isCount(projection.thoughtCount) || projection.thoughtCount < projection.nodes.length ||
      typeof projection.clipped !== "boolean") return null;
  const carried = new Map<string, { level: number; siblingIndex: number }>();
  const parents = new Map<string, string>();
  const openPath: string[] = [];
  const levels: number[] = [];
  let truncated = false;
  for (const node of projection.nodes) {
    if (!isMaterialId(node.nodeId) || (node.parentId !== null && !isMaterialId(node.parentId)) ||
        !isCount(node.depth) || node.depth >= MAX_NODES_PER_TREE || !isCount(node.siblingIndex) ||
        node.siblingIndex >= MAX_NODES_PER_TREE || typeof node.truncated !== "boolean" ||
        typeof node.text !== "string" || !isWellFormedUnicodeText(node.text) || node.text.length > MAX_NODE_TEXT_CODE_UNITS) return null;
    const earlier = carried.get(node.nodeId);
    if (earlier !== undefined && (projection.address !== "selection" || earlier.siblingIndex !== node.siblingIndex)) return null;
    let level = 0;
    if (node.parentId !== null) {
      const parent = carried.get(node.parentId);
      if (parent === undefined || node.parentId === node.nodeId) return null;
      // Markdown nesting names the still-open preceding parent. A relation
      // to an earlier closed branch would silently display another parent.
      if (openPath[parent.level] !== node.parentId) return null;
      const known = parents.get(node.nodeId);
      if (known !== undefined && known !== node.parentId) return null;
      parents.set(node.nodeId, node.parentId);
      let ancestor: string | undefined = node.parentId;
      while (ancestor !== undefined) {
        if (ancestor === node.nodeId) return null;
        ancestor = parents.get(ancestor);
      }
      level = parent.level + 1;
    }
    if (level > MAX_TREE_DEPTH) return null;
    openPath.length = level;
    openPath.push(node.nodeId);
    levels.push(level);
    carried.set(node.nodeId, { level, siblingIndex: node.siblingIndex });
    truncated ||= node.truncated;
  }
  return projection.clipped === (projection.thoughtCount !== projection.nodes.length || truncated) ? levels : null;
}
