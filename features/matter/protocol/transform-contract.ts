import { isMatterLocale, type MatterLocale } from "../config/locales";
import { segmentText, validateSelection, type SegmentSelection } from "../material/text-segments";
import {
  MAX_NODE_TEXT_CODE_UNITS,
  MAX_TREE_DEPTH,
  isCanonicalTimestamp,
  isMaterialId,
  validateThoughtTree,
} from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtTree, type TreeCommand } from "../tree/model";
import { deriveExpandInPlaceLength, validateExpandInPlaceCandidate } from "./expand-in-place-policy";

export const MAX_TRANSFORM_REQUEST_BYTES = 32 * 1024;
export const TRANSFORM_CLIENT_TIMEOUT_MS = 16_000;
export const MAX_TRANSFORM_ID_LENGTH = 128;
export const MAX_TRANSFORM_CONTEXT_CODE_POINTS = 8_000;
export const TRANSFORM_REQUEST_VERSION = "transform/2" as const;

export type TransformIntent = "expand";

export type TransformLineageNode = Readonly<{
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

/** A fixed stretch turn has no voice or free direction field. */
export type TransformEnvelope = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: typeof TRANSFORM_REQUEST_VERSION;
  id: string;
  treeId: string;
  mode: "transform";
  operation: "expand-in-place";
  treeRevision: number;
  selection: SegmentSelection;
  gesture: Readonly<{ type: "stretch"; axis: "vertical"; amount: number }>;
  locale: MatterLocale;
  context: Readonly<{ lineage: readonly TransformLineageNode[] }>;
}>;

export type ReplaceTextRangeAction = Readonly<{
  id: string;
  type: "replace-text-range";
  nodeId: string;
  start: number;
  end: number;
  text: string;
  intent: "expand";
}>;

export type TransformPlan = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: typeof TRANSFORM_REQUEST_VERSION;
  id: string;
  treeId: string;
  treeRevision: number;
  action: ReplaceTextRangeAction;
  presentation: Readonly<{ motionHint: "grow" }>;
}>;

export type TransformErrorCode = "INVALID_REQUEST" | "TURN_UNAVAILABLE" | "TURN_REJECTED" | "TURN_FAILED";
export type TransformFallbackReason = "MODEL_UNAVAILABLE" | "MODEL_TIMEOUT" | "MODEL_REJECTED" | "MODEL_BUSY";
export type TransformErrorEnvelope = Readonly<{
  error: Readonly<{
    code: TransformErrorCode;
    message: string;
    retryable: boolean;
    fallbackReason?: TransformFallbackReason;
  }>;
}>;
export type TransformParseResult =
  | Readonly<{ ok: true; envelope: TransformEnvelope }>
  | Readonly<{ ok: false; message: string }>;

export type TransformErrorReceipt = Readonly<{
  code: TransformErrorCode;
  message: string;
  retryable: boolean;
  fallbackReason?: TransformFallbackReason;
}>;

/** Strict parser for transform/2. Voice and all unknown fields are rejected. */
export function parseTransformEnvelope(value: unknown): TransformParseResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocolVersion", "requestVersion", "id", "treeId", "mode", "operation", "treeRevision",
    "selection", "gesture", "locale", "context",
  ])) return invalid("The transform request shape is invalid.");
  const bytes = utf8JsonBytes(value);
  if (bytes === null || bytes > MAX_TRANSFORM_REQUEST_BYTES) return invalid("The transform request is too large.");
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    value.requestVersion !== TRANSFORM_REQUEST_VERSION ||
    value.mode !== "transform" ||
    value.operation !== "expand-in-place"
  ) return invalid("The transform request protocol is unsupported.");
  const id = boundedId(value.id);
  const treeId = boundedId(value.treeId);
  if (id === null || treeId === null || !isRevision(value.treeRevision)) return invalid("The transform identity is invalid.");
  const gesture = parseGesture(value.gesture);
  if (gesture === null) return invalid("The transform gesture is invalid.");
  if (typeof value.locale !== "string" || !isMatterLocale(value.locale)) return invalid("The transform locale is invalid.");
  const lineage = parseLineage(value.context);
  if (lineage === null) return invalid("The transform lineage is invalid.");
  const selectedNode = lineage.at(-1)!;
  const selection = parseSingleCurrentSegment(value.selection, selectedNode);
  if (selection === null) return invalid("The transform selection is invalid.");
  if (deriveExpandInPlaceLength(
    selection.selectedText,
    selectedNode.text.slice(0, selection.start),
    selectedNode.text.slice(selection.end),
    gesture.amount,
  ) === null) return invalid("The transform degree cannot produce a bounded expansion.");
  return Object.freeze({ ok: true, envelope: Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TRANSFORM_REQUEST_VERSION,
    id,
    treeId,
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: value.treeRevision,
    selection,
    gesture,
    locale: value.locale,
    context: Object.freeze({ lineage }),
  }) });
}

/** A refusal is trusted only when it is the exact versioned server shape. */
export function parseTransformError(value: unknown): TransformErrorReceipt | null {
  if (!isRecord(value) || !hasExactKeys(value, ["error"])) return null;
  const error = value.error;
  if (!isRecord(error)) return null;
  const hasFallback = Object.hasOwn(error, "fallbackReason");
  if (!hasExactKeys(
    error,
    hasFallback
      ? ["code", "message", "retryable", "fallbackReason"]
      : ["code", "message", "retryable"],
  )) return null;
  if (!isTransformErrorCode(error.code) ||
      typeof error.message !== "string" ||
      error.message.length === 0 ||
      Array.from(error.message).length > 500 ||
      typeof error.retryable !== "boolean") return null;
  const fallbackReason = hasFallback ? parseTransformFallbackReason(error.fallbackReason) : undefined;
  if (hasFallback && fallbackReason === undefined) return null;
  if (fallbackReason !== undefined &&
      (!error.retryable || (error.code !== "TURN_UNAVAILABLE" && error.code !== "TURN_REJECTED"))) {
    return null;
  }
  if (error.code === "INVALID_REQUEST" && error.retryable) return null;
  return Object.freeze({
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
}

export function deriveTransformIntent(): TransformIntent {
  return "expand";
}

/** Temporary harness helper: result is a grapheme target, never a storage unit. */
export function targetCodePointsForStretch(selectionText: string, amount: number): number | null {
  return deriveExpandInPlaceLength(selectionText, "", "", amount)?.targetGraphemes ?? null;
}

/** Server-owned construction; invalid model text never becomes a plan. */
export function buildTransformPlan(envelope: TransformEnvelope, text: string): TransformPlan {
  const node = envelope.context.lineage.at(-1)!;
  const accepted = validateExpandInPlaceCandidate({
    sourceText: envelope.selection.selectedText,
    candidateText: text,
    beforeText: node.text.slice(0, envelope.selection.start),
    afterText: node.text.slice(envelope.selection.end),
    amount: envelope.gesture.amount,
  });
  if (!accepted.ok) throw new Error(`Rejected fixed expansion: ${accepted.code}`);
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TRANSFORM_REQUEST_VERSION,
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
      intent: "expand",
    }),
    presentation: Object.freeze({ motionHint: "grow" }),
  });
}

/** Parses a server plan as an exact echo of the request capability. */
export function parseTransformPlan(value: unknown, envelope: TransformEnvelope): TransformPlan | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocolVersion", "requestVersion", "id", "treeId", "treeRevision", "action", "presentation",
  ])) return null;
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    value.requestVersion !== TRANSFORM_REQUEST_VERSION ||
    value.id !== envelope.id ||
    value.treeId !== envelope.treeId ||
    value.treeRevision !== envelope.treeRevision
  ) return null;
  const action = parseAction(value.action, envelope);
  if (action === null || !isGrowPresentation(value.presentation)) return null;
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TRANSFORM_REQUEST_VERSION,
    id: envelope.id,
    treeId: envelope.treeId,
    treeRevision: envelope.treeRevision,
    action,
    presentation: Object.freeze({ motionHint: "grow" }),
  });
}

export type TransformCommandResult =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; reason: "STALE" | "INVALID_PLAN" }>;

/** The final browser boundary repeats envelope, policy, and tree-memento checks. */
export function planToTreeCommand(
  currentTree: ThoughtTree,
  originalEnvelope: TransformEnvelope,
  rawPlan: unknown,
  options: Readonly<{ source?: "agent" | "fixture"; now?: () => number }> = {},
): TransformCommandResult {
  const parsedEnvelope = parseTransformEnvelope(originalEnvelope);
  if (!parsedEnvelope.ok) return rejected("INVALID_PLAN");
  const envelope = parsedEnvelope.envelope;
  const plan = parseTransformPlan(rawPlan, envelope);
  if (plan === null || !validateThoughtTree(currentTree).ok) return rejected("INVALID_PLAN");
  if (currentTree.id !== envelope.treeId || currentTree.revision !== envelope.treeRevision) return rejected("STALE");
  const originalNode = envelope.context.lineage.at(-1)!;
  const node = currentTree.nodes[plan.action.nodeId];
  if (node === undefined || node.text !== originalNode.text || node.updatedAt !== originalNode.updatedAt) return rejected("STALE");
  const selection = parseSingleCurrentSegment(envelope.selection, node);
  if (selection === null) return rejected("STALE");
  const policy = validateExpandInPlaceCandidate({
    sourceText: selection.selectedText,
    candidateText: plan.action.text,
    beforeText: node.text.slice(0, selection.start),
    afterText: node.text.slice(selection.end),
    amount: envelope.gesture.amount,
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

function parseGesture(value: unknown): TransformEnvelope["gesture"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "axis", "amount"])) return null;
  if (value.type !== "stretch" || value.axis !== "vertical" || typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0 || value.amount > 1) return null;
  return Object.freeze({ type: "stretch", axis: "vertical", amount: value.amount });
}

function parseLineage(value: unknown): readonly TransformLineageNode[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["lineage"]) || !Array.isArray(value.lineage)) return null;
  if (value.lineage.length === 0 || value.lineage.length > MAX_TREE_DEPTH + 1) return null;
  const lineage: TransformLineageNode[] = [];
  let codePoints = 0;
  for (let index = 0; index < value.lineage.length; index += 1) {
    const entry = value.lineage[index];
    if (!isRecord(entry) || !hasExactKeys(entry, ["id", "text", "parentId", "createdAt", "updatedAt"])) return null;
    if (!isMaterialId(entry.id) || typeof entry.text !== "string" || entry.text.length > MAX_NODE_TEXT_CODE_UNITS) return null;
    if ((index === 0 && entry.parentId !== null) || (index > 0 && (typeof entry.parentId !== "string" || entry.parentId !== lineage[index - 1]!.id)) || !isCanonicalTimestamp(entry.createdAt) || !isCanonicalTimestamp(entry.updatedAt) || Date.parse(entry.updatedAt) < Date.parse(entry.createdAt)) return null;
    codePoints += Array.from(entry.text).length;
    if (codePoints > MAX_TRANSFORM_CONTEXT_CODE_POINTS) return null;
    lineage.push(Object.freeze({ id: entry.id, text: entry.text, parentId: index === 0 ? null : entry.parentId as string, createdAt: entry.createdAt, updatedAt: entry.updatedAt }));
  }
  if (new Set(lineage.map((node) => node.id)).size !== lineage.length) return null;
  return Object.freeze(lineage);
}

function parseSingleCurrentSegment(value: unknown, node: TransformLineageNode | { id: string; text: string }): SegmentSelection | null {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "nodeId", "start", "end", "selectedText"])) return null;
  if (value.type !== "segment-range" || value.nodeId !== node.id || typeof value.selectedText !== "string" || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end)) return null;
  const validated = validateSelection(node.text, value, node.id);
  if (!validated.ok) return null;
  return segmentText(node.text).some((segment) => segment.start === validated.selection.start && segment.end === validated.selection.end)
    ? Object.freeze({ ...validated.selection })
    : null;
}

function parseAction(value: unknown, envelope: TransformEnvelope): ReplaceTextRangeAction | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "type", "nodeId", "start", "end", "text", "intent"])) return null;
  if (value.id !== envelope.id || value.type !== "replace-text-range" || value.nodeId !== envelope.selection.nodeId || value.start !== envelope.selection.start || value.end !== envelope.selection.end || value.intent !== "expand" || typeof value.text !== "string") return null;
  const node = envelope.context.lineage.at(-1)!;
  const policy = validateExpandInPlaceCandidate({
    sourceText: envelope.selection.selectedText,
    candidateText: value.text,
    beforeText: node.text.slice(0, envelope.selection.start),
    afterText: node.text.slice(envelope.selection.end),
    amount: envelope.gesture.amount,
  });
  if (!policy.ok) return null;
  return Object.freeze({ id: envelope.id, type: "replace-text-range", nodeId: envelope.selection.nodeId, start: envelope.selection.start, end: envelope.selection.end, text: value.text, intent: "expand" });
}

function isGrowPresentation(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["motionHint"]) && value.motionHint === "grow";
}
function isTransformErrorCode(value: unknown): value is TransformErrorCode {
  return value === "INVALID_REQUEST" || value === "TURN_UNAVAILABLE" ||
    value === "TURN_REJECTED" || value === "TURN_FAILED";
}
function parseTransformFallbackReason(value: unknown): TransformFallbackReason | undefined {
  return value === "MODEL_UNAVAILABLE" || value === "MODEL_TIMEOUT" ||
    value === "MODEL_REJECTED" || value === "MODEL_BUSY"
    ? value
    : undefined;
}
function nextTimestamp(previous: string, nowMs: number): string {
  return new Date(Math.max(nowMs, Date.parse(previous) + 1)).toISOString();
}
function boundedId(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_TRANSFORM_ID_LENGTH && isMaterialId(value) ? value : null;
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
function invalid(message: string): TransformParseResult { return Object.freeze({ ok: false, message }); }
function rejected(reason: "STALE" | "INVALID_PLAN"): TransformCommandResult { return Object.freeze({ ok: false, reason }); }
