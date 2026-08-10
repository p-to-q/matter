import { isMatterLocale, type MatterLocale } from "../config/locales";
import { validateSelection, type SegmentSelection } from "../material/text-segments";
import {
  isCanonicalTimestamp,
  isMaterialId,
  MAX_NODE_TEXT_CODE_UNITS,
  MAX_REPLACEMENT_TEXT_CODE_UNITS,
  MAX_TREE_DEPTH,
  validateThoughtTree,
} from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtTree, type TreeCommand } from "../tree/model";

/** The wire boundary for one lasso + stretch material turn. */
export const MAX_TRANSFORM_REQUEST_BYTES = 32 * 1_024;
export const TRANSFORM_CLIENT_TIMEOUT_MS = 16_000;
export const MAX_TRANSFORM_ID_LENGTH = 128;
export const MAX_TRANSFORM_DIRECTION_CODE_POINTS = 500;
export const MAX_TRANSFORM_CONTEXT_CODE_POINTS = 8_000;

/** Kept here because both the route and pre-commit boundary enforce it. */
export const TRANSFORM_LENGTH_TOLERANCE = 0.45;

export type TransformIntent = "expand" | "compress" | "reinterpret" | "refine";

export type TransformLineageNode = Readonly<{
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type TransformEnvelope = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  treeId: string;
  mode: "transform";
  treeRevision: number;
  selection: SegmentSelection;
  gesture: Readonly<{ type: "stretch"; axis: "vertical"; amount: number }>;
  voice: Readonly<{ transcript: string; language?: MatterLocale; durationMs?: number }>;
  context: Readonly<{ lineage: readonly TransformLineageNode[] }>;
}>;

export type ReplaceTextRangeAction = Readonly<{
  id: string;
  type: "replace-text-range";
  nodeId: string;
  start: number;
  end: number;
  text: string;
  intent: TransformIntent;
}>;

export type TransformPlan = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  interactionId: string;
  treeId: string;
  treeRevision: number;
  action: ReplaceTextRangeAction;
  presentation?: Readonly<{ motionHint?: "grow" | "compress" | "settle" }>;
}>;

export type TransformErrorCode =
  | "INVALID_REQUEST"
  | "TURN_UNAVAILABLE"
  | "TURN_REJECTED"
  | "TURN_FAILED";

export type TransformFallbackReason =
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_REJECTED"
  | "MODEL_BUSY";

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

/**
 * Parses untrusted network data as one complete turn. Unknown fields are a
 * version mismatch, not optional future intent: silently dropping one would
 * let an old route reinterpret a newer gesture.
 */
export function parseTransformEnvelope(value: unknown): TransformParseResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocolVersion", "id", "treeId", "mode", "treeRevision", "selection", "gesture", "voice", "context",
  ])) return invalid("The transform request shape is invalid.");
  if (value.protocolVersion !== PROTOCOL_VERSION || value.mode !== "transform") {
    return invalid("The transform request protocol is unsupported.");
  }
  const id = boundedId(value.id);
  const treeId = boundedId(value.treeId);
  if (id === null || treeId === null) return invalid("The transform identity is invalid.");
  if (!isRevision(value.treeRevision)) return invalid("The transform revision is invalid.");
  const gesture = parseGesture(value.gesture);
  if (gesture === null) return invalid("The transform gesture is invalid.");
  const voice = parseVoice(value.voice);
  if (voice === null) return invalid("The transform direction is invalid.");
  const lineage = parseLineage(value.context);
  if (lineage === null) return invalid("The transform lineage is invalid.");
  const selectedNode = lineage.at(-1)!;
  const selection = parseSelection(value.selection, selectedNode);
  if (selection === null) return invalid("The transform selection is invalid.");

  return Object.freeze({ ok: true, envelope: Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    id,
    treeId,
    mode: "transform",
    treeRevision: value.treeRevision,
    selection,
    gesture,
    voice,
    context: Object.freeze({ lineage }),
  }) });
}

/** A stretch is an expansion control in 0.2; voice alone never reverses it. */
export function deriveTransformIntent(gesture: TransformEnvelope["gesture"]): TransformIntent {
  void gesture;
  return "expand";
}

/**
 * Converts continuous degree into a bounded language target before any model
 * sees it. At full degree the selected material aims for roughly three times
 * its current size; the output cap remains the physical tree safety bound.
 */
export function targetCodePointsForStretch(selectionText: string, amount: number): number | null {
  if (typeof selectionText !== "string" || !isUnitAmount(amount)) return null;
  const source = Array.from(selectionText).length;
  if (source === 0) return null;
  return Math.min(
    MAX_REPLACEMENT_TEXT_CODE_UNITS,
    source + Math.max(1, Math.ceil(source * amount * 2)),
  );
}

/** Server-owned construction: the model never supplies any field but text. */
export function buildTransformPlan(envelope: TransformEnvelope, text: string): TransformPlan {
  const intent = deriveTransformIntent(envelope.gesture);
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    interactionId: envelope.id,
    treeId: envelope.treeId,
    treeRevision: envelope.treeRevision,
    action: Object.freeze({
      id: envelope.id,
      type: "replace-text-range",
      nodeId: envelope.selection.nodeId,
      start: envelope.selection.start,
      end: envelope.selection.end,
      text,
      intent,
    }),
    presentation: Object.freeze({ motionHint: "grow" }),
  });
}

/** Parses the reply as a plan for exactly the request that produced it. */
export function parseTransformPlan(value: unknown, envelope: TransformEnvelope): TransformPlan | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocolVersion", "interactionId", "treeId", "treeRevision", "action", "presentation",
  ])) return null;
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    value.interactionId !== envelope.id ||
    value.treeId !== envelope.treeId ||
    value.treeRevision !== envelope.treeRevision
  ) return null;
  const action = parseAction(value.action, envelope);
  if (action === null) return null;
  const presentation = parsePresentation(value.presentation);
  if (presentation === null) return null;
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    interactionId: envelope.id,
    treeId: envelope.treeId,
    treeRevision: envelope.treeRevision,
    action,
    ...(presentation === undefined ? {} : { presentation }),
  });
}

export type TransformCommandResult =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; reason: "STALE" | "INVALID_PLAN" }>;

/**
 * The second boundary, immediately before durable mutation. A route cannot
 * authoritatively know the browser's current tree, so its plan is accepted
 * only if the exact request snapshot still agrees with current material.
 */
export function planToTreeCommand(
  currentTree: ThoughtTree,
  originalEnvelope: TransformEnvelope,
  rawPlan: unknown,
  options: Readonly<{ source?: "agent" | "fixture"; now?: () => number }> = {},
): TransformCommandResult {
  const parsedEnvelope = parseTransformEnvelope(originalEnvelope);
  if (!parsedEnvelope.ok) return rejected("INVALID_PLAN");
  const plan = parseTransformPlan(rawPlan, parsedEnvelope.envelope);
  if (plan === null) return rejected("INVALID_PLAN");
  const treeValidation = validateThoughtTree(currentTree);
  if (!treeValidation.ok) return rejected("INVALID_PLAN");
  if (
    currentTree.id !== parsedEnvelope.envelope.treeId ||
    currentTree.revision !== parsedEnvelope.envelope.treeRevision
  ) return rejected("STALE");

  const originalNode = parsedEnvelope.envelope.context.lineage.at(-1)!;
  const node = currentTree.nodes[plan.action.nodeId];
  if (
    node === undefined ||
    node.text !== originalNode.text ||
    node.updatedAt !== originalNode.updatedAt
  ) return rejected("STALE");
  const selection = validateSelection(node.text, parsedEnvelope.envelope.selection, node.id);
  if (!selection.ok) return rejected("STALE");

  const nextText = node.text.slice(0, plan.action.start) + plan.action.text + node.text.slice(plan.action.end);
  if (nextText === node.text || nextText.length > MAX_NODE_TEXT_CODE_UNITS) return rejected("INVALID_PLAN");
  const now = options.now ?? Date.now;
  const updatedAt = nextTimestamp(node.updatedAt, now());
  return Object.freeze({ ok: true, command: Object.freeze({
    id: `turn_${plan.interactionId}`,
    source: options.source ?? "agent",
    interactionId: plan.interactionId,
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
  if (value.type !== "stretch" || value.axis !== "vertical" || !isUnitAmount(value.amount) || value.amount <= 0) {
    return null;
  }
  return Object.freeze({ type: "stretch", axis: "vertical", amount: value.amount });
}

function parseVoice(value: unknown): TransformEnvelope["voice"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["transcript", "language", "durationMs"])) return null;
  const transcript = boundedCodePoints(value.transcript, MAX_TRANSFORM_DIRECTION_CODE_POINTS);
  if (transcript === null || transcript.trim().length === 0) return null;
  const language = value.language;
  const durationMs = value.durationMs;
  if (language !== undefined && (typeof language !== "string" || !isMatterLocale(language))) return null;
  if (
    durationMs !== undefined &&
    (!Number.isSafeInteger(durationMs) || typeof durationMs !== "number" || durationMs < 0 || durationMs > 10 * 60_000)
  ) return null;
  return Object.freeze({
    transcript: transcript.trim(),
    ...(language === undefined ? {} : { language }),
    ...(durationMs === undefined ? {} : { durationMs }),
  });
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
    const parentId = entry.parentId;
    if (
      (index === 0 && parentId !== null) ||
      (index > 0 && (typeof parentId !== "string" || parentId !== lineage[index - 1]!.id))
    ) return null;
    if (!isCanonicalTimestamp(entry.createdAt) || !isCanonicalTimestamp(entry.updatedAt)) return null;
    if (Date.parse(entry.updatedAt) < Date.parse(entry.createdAt)) return null;
    codePoints += Array.from(entry.text).length;
    if (codePoints > MAX_TRANSFORM_CONTEXT_CODE_POINTS) return null;
    const canonicalParentId = index === 0 ? null : parentId as string;
    lineage.push(Object.freeze({
      id: entry.id,
      text: entry.text,
      parentId: canonicalParentId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  }
  if (new Set(lineage.map((node) => node.id)).size !== lineage.length) return null;
  return Object.freeze(lineage);
}

function parseSelection(value: unknown, selectedNode: TransformLineageNode): SegmentSelection | null {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "nodeId", "start", "end", "selectedText"])) return null;
  if (value.type !== "segment-range" || value.nodeId !== selectedNode.id || typeof value.selectedText !== "string") return null;
  if (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end)) return null;
  if (value.selectedText.length > MAX_REPLACEMENT_TEXT_CODE_UNITS) return null;
  const validated = validateSelection(selectedNode.text, value, selectedNode.id);
  return validated.ok ? Object.freeze({ ...validated.selection }) : null;
}

function parseAction(value: unknown, envelope: TransformEnvelope): ReplaceTextRangeAction | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "type", "nodeId", "start", "end", "text", "intent"])) return null;
  if (
    value.id !== envelope.id ||
    value.type !== "replace-text-range" ||
    value.nodeId !== envelope.selection.nodeId ||
    value.start !== envelope.selection.start ||
    value.end !== envelope.selection.end ||
    value.intent !== deriveTransformIntent(envelope.gesture) ||
    typeof value.text !== "string" ||
    value.text.trim().length === 0 ||
    value.text.length > MAX_REPLACEMENT_TEXT_CODE_UNITS ||
    /[\p{Cc}\p{Cf}]/u.test(value.text)
  ) return null;
  const target = targetCodePointsForStretch(envelope.selection.selectedText, envelope.gesture.amount);
  if (target === null || !withinTarget(Array.from(value.text.trim()).length, target)) return null;
  return Object.freeze({
    id: envelope.id,
    type: "replace-text-range",
    nodeId: envelope.selection.nodeId,
    start: envelope.selection.start,
    end: envelope.selection.end,
    text: value.text.trim(),
    intent: deriveTransformIntent(envelope.gesture),
  });
}

function parsePresentation(value: unknown): TransformPlan["presentation"] | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasExactKeys(value, ["motionHint"])) return null;
  if (value.motionHint !== undefined && value.motionHint !== "grow" && value.motionHint !== "compress" && value.motionHint !== "settle") {
    return null;
  }
  return Object.freeze({ ...(value.motionHint === undefined ? {} : { motionHint: value.motionHint }) });
}

function withinTarget(length: number, target: number): boolean {
  const lower = Math.max(1, Math.floor(target * (1 - TRANSFORM_LENGTH_TOLERANCE)));
  const upper = Math.ceil(target * (1 + TRANSFORM_LENGTH_TOLERANCE));
  return length >= lower && length <= upper;
}

function nextTimestamp(previous: string, nowMs: number): string {
  return new Date(Math.max(nowMs, Date.parse(previous) + 1)).toISOString();
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_TRANSFORM_ID_LENGTH && isMaterialId(value) ? value : null;
}

function boundedCodePoints(value: unknown, maximum: number): string | null {
  return typeof value === "string" && Array.from(value).length <= maximum ? value : null;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isUnitAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function invalid(message: string): TransformParseResult {
  return Object.freeze({ ok: false, message });
}

function rejected(reason: "STALE" | "INVALID_PLAN"): TransformCommandResult {
  return Object.freeze({ ok: false, reason });
}
