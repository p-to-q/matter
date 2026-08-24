import { isMatterLocale, type MatterLocale } from "../config/locales";
import { segmentText, validateSelection, type SegmentSelection } from "../material/text-segments";
import {
  MAX_NODE_TEXT_CODE_UNITS,
  MAX_TREE_DEPTH,
  isCanonicalTimestamp,
  isMaterialId,
  validateThoughtTree,
} from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree, type TreeCommand } from "../tree/model";
import {
  deriveTextSwapLength,
  normalizeTextSwapDirection,
  validateTextSwapCandidate,
} from "./text-swap-policy";

export const TEXT_SWAP_REQUEST_VERSION = "text-swap/2" as const;
export const MAX_TEXT_SWAP_REQUEST_BYTES = 32 * 1024;
export const MAX_TEXT_SWAP_RESPONSE_BYTES = 8 * 1024;
export const TEXT_SWAP_CLIENT_TIMEOUT_MS = 16_000;
export const MAX_TEXT_SWAP_ID_LENGTH = 128;
export const MAX_TEXT_SWAP_CONTEXT_CODE_POINTS = 8_000;

export type TextSwapLineageNode = Readonly<{
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type TextSwapEnvelope = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: typeof TEXT_SWAP_REQUEST_VERSION;
  id: string;
  treeId: string;
  mode: "transform";
  operation: "paraphrase-in-place";
  treeRevision: number;
  selection: SegmentSelection;
  direction: Readonly<{ text: string }>;
  locale: MatterLocale;
  context: Readonly<{ lineage: readonly TextSwapLineageNode[] }>;
}>;

export type TextSwapAction = Readonly<{
  id: string;
  type: "replace-text-range";
  nodeId: string;
  start: number;
  end: number;
  text: string;
  intent: "paraphrase";
}>;

export type TextSwapPlan = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: typeof TEXT_SWAP_REQUEST_VERSION;
  id: string;
  treeId: string;
  treeRevision: number;
  action: TextSwapAction;
  presentation: Readonly<{ motionHint: "settle" }>;
}>;

export type TextSwapErrorCode = "INVALID_REQUEST" | "TURN_UNAVAILABLE" | "TURN_REJECTED" | "TURN_FAILED";
export type TextSwapFallbackReason = "MODEL_UNAVAILABLE" | "MODEL_TIMEOUT" | "MODEL_REJECTED" | "MODEL_BUSY";
export type TextSwapErrorEnvelope = Readonly<{
  error: Readonly<{
    code: TextSwapErrorCode;
    message: string;
    retryable: boolean;
    fallbackReason?: TextSwapFallbackReason;
  }>;
}>;
export type TextSwapErrorReceipt = Readonly<{
  code: TextSwapErrorCode;
  message: string;
  retryable: boolean;
  fallbackReason?: TextSwapFallbackReason;
}>;
export type TextSwapParseResult =
  | Readonly<{ ok: true; envelope: TextSwapEnvelope }>
  | Readonly<{ ok: false; message: string }>;

/** Strict text-swap/2 parser. It does not accept gesture or legacy voice fields. */
export function parseTextSwapEnvelope(value: unknown): TextSwapParseResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocolVersion", "requestVersion", "id", "treeId", "mode", "operation", "treeRevision",
    "selection", "direction", "locale", "context",
  ])) return invalid("The text swap request shape is invalid.");
  const bytes = utf8JsonBytes(value);
  if (bytes === null || bytes > MAX_TEXT_SWAP_REQUEST_BYTES) return invalid("The text swap request is too large.");
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    value.requestVersion !== TEXT_SWAP_REQUEST_VERSION ||
    value.mode !== "transform" ||
    value.operation !== "paraphrase-in-place"
  ) return invalid("The text swap request protocol is unsupported.");
  const id = boundedId(value.id);
  const treeId = boundedId(value.treeId);
  if (id === null || treeId === null || !isRevision(value.treeRevision)) {
    return invalid("The text swap identity is invalid.");
  }
  const direction = parseDirection(value.direction);
  if (direction === null) return invalid("The text swap direction is invalid.");
  if (typeof value.locale !== "string" || !isMatterLocale(value.locale)) {
    return invalid("The text swap locale is invalid.");
  }
  const lineage = parseLineage(value.context);
  if (lineage === null) return invalid("The text swap lineage is invalid.");
  const selectedNode = lineage.at(-1)!;
  const selection = parseCurrentTextSwapReference(value.selection, selectedNode);
  if (selection === null) return invalid("The text swap selection is invalid.");
  if (deriveTextSwapLength(
    selection.selectedText,
    selectedNode.text.slice(0, selection.start),
    selectedNode.text.slice(selection.end),
  ) === null) return invalid("The text swap cannot fit inside the material bounds.");
  return Object.freeze({ ok: true, envelope: Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id,
    treeId,
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: value.treeRevision,
    selection,
    direction,
    locale: value.locale,
    context: Object.freeze({ lineage }),
  }) });
}

export function parseTextSwapError(value: unknown): TextSwapErrorReceipt | null {
  if (!isRecord(value) || !hasExactKeys(value, ["error"]) || !isRecord(value.error)) return null;
  const error = value.error;
  const hasFallback = Object.hasOwn(error, "fallbackReason");
  if (!hasExactKeys(error, hasFallback
    ? ["code", "message", "retryable", "fallbackReason"]
    : ["code", "message", "retryable"])) return null;
  if (
    !isTextSwapErrorCode(error.code) ||
    typeof error.message !== "string" ||
    error.message.length === 0 ||
    Array.from(error.message).length > 500 ||
    typeof error.retryable !== "boolean"
  ) return null;
  const fallbackReason = hasFallback ? parseFallbackReason(error.fallbackReason) : undefined;
  if (hasFallback && fallbackReason === undefined) return null;
  if (
    fallbackReason !== undefined &&
    (!error.retryable || (error.code !== "TURN_UNAVAILABLE" && error.code !== "TURN_REJECTED"))
  ) return null;
  if (error.code === "INVALID_REQUEST" && error.retryable) return null;
  return Object.freeze({
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
}

/** Server-owned construction; rejected model language never becomes a plan. */
export function buildTextSwapPlan(envelope: TextSwapEnvelope, text: string): TextSwapPlan {
  const node = envelope.context.lineage.at(-1)!;
  const accepted = validateTextSwapCandidate({
    sourceText: envelope.selection.selectedText,
    candidateText: text,
    beforeText: node.text.slice(0, envelope.selection.start),
    afterText: node.text.slice(envelope.selection.end),
  });
  if (!accepted.ok) throw new Error(`Rejected text swap: ${accepted.code}`);
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: envelope.id,
    treeId: envelope.treeId,
    treeRevision: envelope.treeRevision,
    action: Object.freeze({
      id: envelope.id,
      type: "replace-text-range",
      nodeId: envelope.selection.nodeId,
      start: envelope.selection.start,
      end: envelope.selection.end,
      text,
      intent: "paraphrase",
    }),
    presentation: Object.freeze({ motionHint: "settle" }),
  });
}

export function parseTextSwapPlan(value: unknown, envelope: TextSwapEnvelope): TextSwapPlan | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocolVersion", "requestVersion", "id", "treeId", "treeRevision", "action", "presentation",
  ])) return null;
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    value.requestVersion !== TEXT_SWAP_REQUEST_VERSION ||
    value.id !== envelope.id ||
    value.treeId !== envelope.treeId ||
    value.treeRevision !== envelope.treeRevision
  ) return null;
  const action = parseAction(value.action, envelope);
  if (action === null || !isSettlePresentation(value.presentation)) return null;
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: envelope.id,
    treeId: envelope.treeId,
    treeRevision: envelope.treeRevision,
    action,
    presentation: Object.freeze({ motionHint: "settle" }),
  });
}

export type TextSwapCommandResult =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; reason: "STALE" | "INVALID_PLAN" }>;

/** Integration boundary for a later UI owner; only the tree engine may apply the result. */
export function planToTextSwapCommand(
  currentTree: ThoughtTree,
  originalEnvelope: TextSwapEnvelope,
  rawPlan: unknown,
  options: Readonly<{ source?: "agent" | "fixture"; now?: () => number }> = {},
): TextSwapCommandResult {
  const parsedEnvelope = parseTextSwapEnvelope(originalEnvelope);
  if (!parsedEnvelope.ok) return rejected("INVALID_PLAN");
  const envelope = parsedEnvelope.envelope;
  const plan = parseTextSwapPlan(rawPlan, envelope);
  if (plan === null || !validateThoughtTree(currentTree).ok) return rejected("INVALID_PLAN");
  if (currentTree.id !== envelope.treeId || currentTree.revision !== envelope.treeRevision) return rejected("STALE");
  const node = currentTree.nodes[plan.action.nodeId];
  if (node === undefined || node.role === "document-root") return rejected("STALE");
  if (!sameVisibleLineage(currentTree, node.id, envelope.context.lineage)) return rejected("STALE");
  const selection = parseCurrentTextSwapReference(envelope.selection, node);
  if (selection === null) return rejected("STALE");
  const policy = validateTextSwapCandidate({
    sourceText: selection.selectedText,
    candidateText: plan.action.text,
    beforeText: node.text.slice(0, selection.start),
    afterText: node.text.slice(selection.end),
  });
  if (!policy.ok) return rejected("INVALID_PLAN");
  const nextText = node.text.slice(0, plan.action.start) + plan.action.text + node.text.slice(plan.action.end);
  if (nextText === node.text || nextText.length > MAX_NODE_TEXT_CODE_UNITS) return rejected("INVALID_PLAN");
  const updatedAt = nextTimestamp(node.updatedAt, (options.now ?? Date.now)());
  return Object.freeze({ ok: true, command: Object.freeze({
    id: `turn_${plan.id}`,
    source: options.source ?? "agent",
    interactionId: plan.id,
    expectedTreeId: currentTree.id,
    expectedRevision: currentTree.revision,
    mutation: Object.freeze({
      type: "replace-text",
      nodeId: node.id,
      expectedText: node.text,
      expectedUpdatedAt: node.updatedAt,
      text: nextText,
      updatedAt,
    }),
    createdAt: updatedAt,
  }) });
}

function parseDirection(value: unknown): TextSwapEnvelope["direction"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["text"])) return null;
  const text = normalizeTextSwapDirection(value.text);
  return text === null ? null : Object.freeze({ text });
}

function parseLineage(value: unknown): readonly TextSwapLineageNode[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["lineage"]) || !Array.isArray(value.lineage)) return null;
  if (value.lineage.length === 0 || value.lineage.length > MAX_TREE_DEPTH) return null;
  const lineage: TextSwapLineageNode[] = [];
  let codePoints = 0;
  for (let index = 0; index < value.lineage.length; index += 1) {
    const entry = value.lineage[index];
    if (!isRecord(entry) || !hasExactKeys(entry, ["id", "text", "parentId", "createdAt", "updatedAt"])) return null;
    if (
      !isMaterialId(entry.id) ||
      typeof entry.text !== "string" ||
      entry.text.trim().length === 0 ||
      entry.text.length > MAX_NODE_TEXT_CODE_UNITS
    ) return null;
    if (
      (index === 0 && entry.parentId !== null) ||
      (index > 0 && (typeof entry.parentId !== "string" || entry.parentId !== lineage[index - 1]!.id)) ||
      !isCanonicalTimestamp(entry.createdAt) ||
      !isCanonicalTimestamp(entry.updatedAt) ||
      Date.parse(entry.updatedAt) < Date.parse(entry.createdAt)
    ) return null;
    codePoints += Array.from(entry.text).length;
    if (codePoints > MAX_TEXT_SWAP_CONTEXT_CODE_POINTS) return null;
    lineage.push(Object.freeze({
      id: entry.id,
      text: entry.text,
      parentId: index === 0 ? null : entry.parentId as string,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  }
  if (new Set(lineage.map((node) => node.id)).size !== lineage.length) return null;
  return Object.freeze(lineage);
}

/**
 * Text Swap has two explicit pointing grammars: lasso owns one exact derived
 * segment, while the passage-local AI control owns the complete current node.
 * Accepting only those two shapes keeps a node click honest without turning an
 * arbitrary substring into model authority.
 */
export function parseCurrentTextSwapReference(
  value: unknown,
  node: TextSwapLineageNode | { id: string; text: string },
): SegmentSelection | null {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "nodeId", "start", "end", "selectedText"])) return null;
  if (
    value.type !== "segment-range" ||
    value.nodeId !== node.id ||
    typeof value.selectedText !== "string" ||
    !Number.isSafeInteger(value.start) ||
    !Number.isSafeInteger(value.end)
  ) return null;
  if (
    value.start === 0 &&
    value.end === node.text.length &&
    value.selectedText === node.text
  ) return Object.freeze({
    type: "segment-range",
    nodeId: node.id,
    start: 0,
    end: node.text.length,
    selectedText: node.text,
  });
  const validated = validateSelection(node.text, value, node.id);
  if (!validated.ok) return null;
  const exactSegment = segmentText(node.text).some((segment) =>
    segment.start === validated.selection.start && segment.end === validated.selection.end
  );
  return exactSegment ? Object.freeze({ ...validated.selection }) : null;
}

function parseAction(value: unknown, envelope: TextSwapEnvelope): TextSwapAction | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "type", "nodeId", "start", "end", "text", "intent"])) return null;
  if (
    value.id !== envelope.id ||
    value.type !== "replace-text-range" ||
    value.nodeId !== envelope.selection.nodeId ||
    value.start !== envelope.selection.start ||
    value.end !== envelope.selection.end ||
    value.intent !== "paraphrase" ||
    typeof value.text !== "string"
  ) return null;
  const node = envelope.context.lineage.at(-1)!;
  const policy = validateTextSwapCandidate({
    sourceText: envelope.selection.selectedText,
    candidateText: value.text,
    beforeText: node.text.slice(0, envelope.selection.start),
    afterText: node.text.slice(envelope.selection.end),
  });
  if (!policy.ok) return null;
  return Object.freeze({
    id: envelope.id,
    type: "replace-text-range",
    nodeId: envelope.selection.nodeId,
    start: envelope.selection.start,
    end: envelope.selection.end,
    text: value.text,
    intent: "paraphrase",
  });
}

function sameVisibleLineage(
  tree: ThoughtTree,
  nodeId: string,
  expected: readonly TextSwapLineageNode[],
): boolean {
  const lineage: ThoughtNode[] = [];
  let current: ThoughtNode | undefined = tree.nodes[nodeId];
  while (current !== undefined && current.role !== "document-root") {
    lineage.push(current);
    current = current.parentId === null ? undefined : tree.nodes[current.parentId];
  }
  lineage.reverse();
  return lineage.length === expected.length && lineage.every((node, index) => {
    const entry = expected[index]!;
    const parentId = index === 0 ? null : lineage[index - 1]!.id;
    return node.id === entry.id &&
      node.text === entry.text &&
      parentId === entry.parentId &&
      node.createdAt === entry.createdAt &&
      node.updatedAt === entry.updatedAt;
  });
}

function isSettlePresentation(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["motionHint"]) && value.motionHint === "settle";
}
function isTextSwapErrorCode(value: unknown): value is TextSwapErrorCode {
  return value === "INVALID_REQUEST" || value === "TURN_UNAVAILABLE" ||
    value === "TURN_REJECTED" || value === "TURN_FAILED";
}
function parseFallbackReason(value: unknown): TextSwapFallbackReason | undefined {
  return value === "MODEL_UNAVAILABLE" || value === "MODEL_TIMEOUT" ||
    value === "MODEL_REJECTED" || value === "MODEL_BUSY" ? value : undefined;
}
function nextTimestamp(previous: string, nowMs: number): string {
  return new Date(Math.max(nowMs, Date.parse(previous) + 1)).toISOString();
}
function boundedId(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_TEXT_SWAP_ID_LENGTH && isMaterialId(value) ? value : null;
}
function utf8JsonBytes(value: unknown): number | null {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return null; }
}
function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
function invalid(message: string): TextSwapParseResult {
  return Object.freeze({ ok: false, message });
}
function rejected(reason: "STALE" | "INVALID_PLAN"): TextSwapCommandResult {
  return Object.freeze({ ok: false, reason });
}
