import { PROTOCOL_VERSION } from "../tree/model";
import { isMatterLocale } from "../config/locales";

/**
 * The wire shape of the inquiry boundary. Both sides parse against this
 * contract; neither trusts the other's serializer.
 *
 * A request carries one question and the root-to-focus lineage it is about. It
 * never carries an instruction, a tool, or a node the browser did not already
 * have on screen. A response carries either an answer or a stated reason there
 * is none — never a plan, never an action against material.
 */

export const MAX_INQUIRY_REQUEST_BYTES = 24 * 1_024;
export const MAX_INQUIRY_QUESTION_CODE_POINTS = 500;
export const MAX_INQUIRY_LINEAGE_NODES = 64;
export const MAX_INQUIRY_NODE_TEXT_CODE_POINTS = 480;
export const MAX_INQUIRY_LOCALE_LENGTH = 35;
export const MAX_INQUIRY_ID_LENGTH = 128;

/**
 * A person is waiting on this one, unlike a label, so the budget is longer —
 * but still short enough that a stalled provider becomes a stated failure
 * rather than an interface that hangs.
 */
export const INQUIRY_CLIENT_TIMEOUT_MS = 20_000;
/** Server deadline, kept under the browser's so a timeout is attributable. */
export const INQUIRY_PROVIDER_TIMEOUT_MS = 18_000;

export type InquiryContextNodePayload = Readonly<{
  nodeId: string;
  depth: number;
  text: string;
  truncated: boolean;
}>;

export type InquiryContextPayload = Readonly<{
  treeId: string;
  revision: number;
  lineage: readonly InquiryContextNodePayload[];
  thoughtCount: number;
  clipped: boolean;
}>;

export type InquiryRequest = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  question: string;
  locale: string;
  context: InquiryContextPayload;
}>;

/**
 * What the server did with the context it was given. It is returned even when
 * there is no answer, because "nothing happened" is not the same claim as
 * "nothing was going to happen", and a person is entitled to tell them apart.
 */
export type InquiryReceipt = Readonly<{
  lineageNodes: number;
  contextCodePoints: number;
  clipped: boolean;
  thoughtCount: number;
}>;

export type InquiryAnswer =
  | Readonly<{ status: "answered"; text: string; receipt: InquiryReceipt }>
  | Readonly<{ status: "unavailable"; reason: InquiryUnavailableReason; receipt: InquiryReceipt }>;

/** Why no answer exists. Each is a real state, not a placeholder for success. */
export type InquiryUnavailableReason =
  /** No model is configured for this deployment. */
  | "NO_PROVIDER"
  /** The document held nothing to reason about. */
  | "NO_MATERIAL";

export type InquiryErrorCode = "INVALID_REQUEST" | "INQUIRY_FAILED";

export type InquiryErrorEnvelope = Readonly<{
  error: Readonly<{ code: InquiryErrorCode; message: string; retryable: boolean }>;
}>;

export type InquiryParseResult =
  | Readonly<{ ok: true; request: InquiryRequest }>
  | Readonly<{ ok: false; message: string }>;

export function parseInquiryRequest(payload: unknown): InquiryParseResult {
  if (!isRecord(payload)) return invalid("The inquiry request is not an object.");
  if (payload.protocolVersion !== PROTOCOL_VERSION) {
    return invalid("The inquiry request protocol version is unsupported.");
  }

  const question = boundedText(payload.question, MAX_INQUIRY_QUESTION_CODE_POINTS);
  if (question === null || question.trim().length === 0) {
    return invalid("The inquiry request has no question.");
  }

  // The same allowlist the rest of the product speaks, not a shape regex: a
  // well-formed locale Matter does not support is still not answerable.
  const locale = typeof payload.locale === "string"
    && payload.locale.length <= MAX_INQUIRY_LOCALE_LENGTH
    && isMatterLocale(payload.locale)
    ? payload.locale
    : null;
  if (locale === null) return invalid("The inquiry request locale is invalid.");

  const context = parseContext(payload.context);
  if (context === null) return invalid("The inquiry request context is invalid.");

  return Object.freeze({
    ok: true,
    request: Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      question: question.trim(),
      locale,
      context,
    }),
  });
}

export function inquiryReceipt(context: InquiryContextPayload): InquiryReceipt {
  return Object.freeze({
    lineageNodes: context.lineage.length,
    contextCodePoints: context.lineage.reduce(
      (total, node) => total + Array.from(node.text).length,
      0,
    ),
    clipped: context.clipped,
    thoughtCount: context.thoughtCount,
  });
}

function parseContext(value: unknown): InquiryContextPayload | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.treeId !== "string" ||
    value.treeId.length === 0 ||
    value.treeId.length > MAX_INQUIRY_ID_LENGTH
  ) return null;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return null;
  if (!Number.isSafeInteger(value.thoughtCount) || (value.thoughtCount as number) < 0) return null;
  if (typeof value.clipped !== "boolean") return null;
  if (!Array.isArray(value.lineage) || value.lineage.length > MAX_INQUIRY_LINEAGE_NODES) return null;

  const lineage: InquiryContextNodePayload[] = [];
  const seenNodeIds = new Set<string>();
  for (const entry of value.lineage) {
    if (!isRecord(entry)) return null;
    if (
      typeof entry.nodeId !== "string" ||
      entry.nodeId.length === 0 ||
      entry.nodeId.length > MAX_INQUIRY_ID_LENGTH ||
      seenNodeIds.has(entry.nodeId)
    ) return null;
    if (
      !Number.isSafeInteger(entry.depth) ||
      (entry.depth as number) < 0 ||
      (entry.depth as number) >= MAX_INQUIRY_LINEAGE_NODES
    ) return null;
    if (typeof entry.truncated !== "boolean") return null;
    const previousDepth = lineage.at(-1)?.depth;
    if (previousDepth !== undefined && (entry.depth as number) <= previousDepth) return null;
    const text = boundedText(entry.text, MAX_INQUIRY_NODE_TEXT_CODE_POINTS);
    if (text === null) return null;
    seenNodeIds.add(entry.nodeId);
    lineage.push(Object.freeze({
      nodeId: entry.nodeId,
      depth: entry.depth as number,
      text,
      truncated: entry.truncated,
    }));
  }

  if (lineage.length > 0 && lineage[0]!.depth !== 0) return null;
  if (lineage.length === 0 && value.thoughtCount !== 0) return null;

  return Object.freeze({
    treeId: value.treeId,
    revision: value.revision as number,
    lineage: Object.freeze(lineage),
    thoughtCount: value.thoughtCount as number,
    clipped: value.clipped,
  });
}

/** Rejects an over-long value rather than silently trimming somebody's words. */
function boundedText(value: unknown, maxCodePoints: number): string | null {
  if (typeof value !== "string") return null;
  return Array.from(value).length > maxCodePoints ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): InquiryParseResult {
  return Object.freeze({ ok: false, message });
}
