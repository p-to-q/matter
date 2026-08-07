import { PROTOCOL_VERSION } from "../tree/model";
import { isMatterLocale } from "../config/locales";

/** A bounded, non-mutating question about visible material. */
export const MAX_INQUIRY_REQUEST_BYTES = 24 * 1_024;
export const MAX_INQUIRY_QUESTION_CODE_POINTS = 500;
export const MAX_INQUIRY_ANSWER_CODE_POINTS = 1_201;
export const MAX_INQUIRY_LINEAGE_NODES = 64;
export const MAX_INQUIRY_NODE_TEXT_CODE_POINTS = 480;
export const MAX_INQUIRY_CONTEXT_CODE_POINTS = 4_000;
export const MAX_INQUIRY_LOCALE_LENGTH = 35;
export const MAX_INQUIRY_ID_LENGTH = 128;
export const INQUIRY_CLIENT_TIMEOUT_MS = 20_000;

export type InquiryContextNodePayload = Readonly<{
  nodeId: string;
  depth: number;
  text: string;
  truncated: boolean;
}>;

export type InquiryContextScope = "selection" | "tree";

export type InquiryContextPayload = Readonly<{
  treeId: string;
  revision: number;
  scope: InquiryContextScope;
  lineage: readonly InquiryContextNodePayload[];
  thoughtCount: number;
  clipped: boolean;
}>;

export type InquiryRequest = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  question: string;
  locale: string;
  context: InquiryContextPayload;
}>;

export type InquiryBasis = Readonly<{
  requestId: string;
  treeId: string;
  revision: number;
  scope: InquiryContextScope;
}>;

export type InquiryReceipt = Readonly<{
  scope: InquiryContextScope;
  lineageNodes: number;
  contextCodePoints: number;
  clipped: boolean;
  thoughtCount: number;
}>;

export type InquiryUnavailableReason = "NO_PROVIDER" | "NO_MATERIAL";

export type InquiryAnswer =
  | Readonly<{
      protocolVersion: typeof PROTOCOL_VERSION;
      basis: InquiryBasis;
      status: "answered";
      text: string;
      receipt: InquiryReceipt;
    }>
  | Readonly<{
      protocolVersion: typeof PROTOCOL_VERSION;
      basis: InquiryBasis;
      status: "unavailable";
      reason: InquiryUnavailableReason;
      receipt: InquiryReceipt;
    }>;

export type InquiryErrorCode = "INVALID_REQUEST" | "INQUIRY_FAILED";

export type InquiryErrorEnvelope = Readonly<{
  error: Readonly<{ code: InquiryErrorCode; message: string; retryable: boolean }>;
}>;

export type InquiryParseResult =
  | Readonly<{ ok: true; request: InquiryRequest }>
  | Readonly<{ ok: false; message: string }>;

export function parseInquiryRequest(payload: unknown): InquiryParseResult {
  if (!isRecord(payload)) return invalid("The inquiry request is not an object.");
  if (!hasExactKeys(payload, ["protocolVersion", "requestId", "question", "locale", "context"])) {
    return invalid("The inquiry request shape is invalid.");
  }
  if (payload.protocolVersion !== PROTOCOL_VERSION) {
    return invalid("The inquiry request protocol version is unsupported.");
  }
  const requestId = boundedId(payload.requestId);
  if (requestId === null) return invalid("The inquiry request id is invalid.");
  const question = boundedText(payload.question, MAX_INQUIRY_QUESTION_CODE_POINTS);
  if (question === null || question.trim().length === 0) {
    return invalid("The inquiry request has no question.");
  }
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
      requestId,
      question: question.trim(),
      locale,
      context,
    }),
  });
}

export function inquiryBasis(request: InquiryRequest): InquiryBasis {
  return Object.freeze({
    requestId: request.requestId,
    treeId: request.context.treeId,
    revision: request.context.revision,
    scope: request.context.scope,
  });
}

/** Strictly parses a response against the exact request that produced it. */
export function parseInquiryAnswer(
  payload: unknown,
  requestId: string,
  context: InquiryContextPayload,
): InquiryAnswer | null {
  if (!isRecord(payload) || payload.protocolVersion !== PROTOCOL_VERSION) return null;
  if (payload.status !== "answered" && payload.status !== "unavailable") return null;
  const expectedKeys = payload.status === "answered"
    ? ["protocolVersion", "basis", "status", "text", "receipt"]
    : ["protocolVersion", "basis", "status", "reason", "receipt"];
  if (!hasExactKeys(payload, expectedKeys)) return null;
  const basis = parseBasis(payload.basis);
  if (
    basis === null ||
    basis.requestId !== requestId ||
    basis.treeId !== context.treeId ||
    basis.revision !== context.revision ||
    basis.scope !== context.scope
  ) return null;
  const receipt = parseReceipt(payload.receipt);
  const expectedReceipt = inquiryReceipt(context);
  if (receipt === null || !sameReceipt(receipt, expectedReceipt)) return null;
  if (payload.status === "answered") {
    const text = boundedText(payload.text, MAX_INQUIRY_ANSWER_CODE_POINTS);
    if (text === null || text.trim().length === 0) return null;
    return Object.freeze({ protocolVersion: PROTOCOL_VERSION, basis, status: "answered", text, receipt });
  }
  if (payload.reason !== "NO_PROVIDER" && payload.reason !== "NO_MATERIAL") return null;
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    basis,
    status: "unavailable",
    reason: payload.reason,
    receipt,
  });
}

export function sameInquiryContext(
  left: InquiryContextPayload,
  right: InquiryContextPayload,
): boolean {
  if (
    left.treeId !== right.treeId ||
    left.revision !== right.revision ||
    left.scope !== right.scope ||
    left.thoughtCount !== right.thoughtCount ||
    left.clipped !== right.clipped ||
    left.lineage.length !== right.lineage.length
  ) return false;
  return left.lineage.every((node, index) => {
    const other = right.lineage[index];
    return other !== undefined &&
      node.nodeId === other.nodeId &&
      node.depth === other.depth &&
      node.text === other.text &&
      node.truncated === other.truncated;
  });
}

export function inquiryReceipt(context: InquiryContextPayload): InquiryReceipt {
  return Object.freeze({
    scope: context.scope,
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
  if (!hasExactKeys(value, ["treeId", "revision", "scope", "lineage", "thoughtCount", "clipped"])) {
    return null;
  }
  if (
    typeof value.treeId !== "string" ||
    value.treeId.length === 0 ||
    value.treeId.length > MAX_INQUIRY_ID_LENGTH
  ) return null;
  if (value.scope !== "selection" && value.scope !== "tree") return null;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return null;
  if (!Number.isSafeInteger(value.thoughtCount) || (value.thoughtCount as number) < 0) return null;
  if (typeof value.clipped !== "boolean") return null;
  if (!Array.isArray(value.lineage) || value.lineage.length > MAX_INQUIRY_LINEAGE_NODES) return null;

  const lineage: InquiryContextNodePayload[] = [];
  const seenNodeIds = new Set<string>();
  let contextCodePoints = 0;
  for (const entry of value.lineage) {
    if (!isRecord(entry)) return null;
    if (!hasExactKeys(entry, ["nodeId", "depth", "text", "truncated"])) return null;
    if (
      typeof entry.nodeId !== "string" ||
      entry.nodeId.length === 0 ||
      entry.nodeId.length > MAX_INQUIRY_ID_LENGTH ||
      (value.scope === "tree" && seenNodeIds.has(entry.nodeId))
    ) return null;
    if (
      !Number.isSafeInteger(entry.depth) ||
      (entry.depth as number) < 0 ||
      (entry.depth as number) >= MAX_INQUIRY_LINEAGE_NODES
    ) return null;
    if (typeof entry.truncated !== "boolean") return null;
    const text = boundedText(entry.text, MAX_INQUIRY_NODE_TEXT_CODE_POINTS);
    if (text === null) return null;
    contextCodePoints += Array.from(text).length;
    if (contextCodePoints > MAX_INQUIRY_CONTEXT_CODE_POINTS) return null;
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
    scope: value.scope,
    lineage: Object.freeze(lineage),
    thoughtCount: value.thoughtCount as number,
    clipped: value.clipped,
  });
}

function parseBasis(value: unknown): InquiryBasis | null {
  if (!isRecord(value) || !hasExactKeys(value, ["requestId", "treeId", "revision", "scope"])) return null;
  const requestId = boundedId(value.requestId);
  const treeId = boundedId(value.treeId);
  if (
    requestId === null ||
    treeId === null ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    (value.scope !== "selection" && value.scope !== "tree")
  ) return null;
  return Object.freeze({
    requestId,
    treeId,
    revision: value.revision as number,
    scope: value.scope,
  });
}

function parseReceipt(value: unknown): InquiryReceipt | null {
  if (!isRecord(value) || !hasExactKeys(value, ["scope", "lineageNodes", "contextCodePoints", "clipped", "thoughtCount"])) {
    return null;
  }
  if (value.scope !== "selection" && value.scope !== "tree") return null;
  if (typeof value.clipped !== "boolean") return null;
  for (const key of ["lineageNodes", "contextCodePoints", "thoughtCount"] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) return null;
  }
  return Object.freeze({
    scope: value.scope,
    lineageNodes: value.lineageNodes as number,
    contextCodePoints: value.contextCodePoints as number,
    clipped: value.clipped,
    thoughtCount: value.thoughtCount as number,
  });
}

function sameReceipt(left: InquiryReceipt, right: InquiryReceipt): boolean {
  return left.scope === right.scope &&
    left.lineageNodes === right.lineageNodes &&
    left.contextCodePoints === right.contextCodePoints &&
    left.clipped === right.clipped &&
    left.thoughtCount === right.thoughtCount;
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_INQUIRY_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
    ? value
    : null;
}

function boundedText(value: unknown, maxCodePoints: number): string | null {
  if (typeof value !== "string") return null;
  return Array.from(value).length > maxCodePoints ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function invalid(message: string): InquiryParseResult {
  return Object.freeze({ ok: false, message });
}
