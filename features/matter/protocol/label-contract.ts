import {
  MAX_PARENT_EXCERPT_CODE_UNITS,
  MAX_SEMANTIC_LABEL_GRAPHEMES,
  MAX_SIBLING_LABELS,
  SEMANTIC_LABEL_PROMPT_VERSION,
  type SemanticLabelSource,
} from "../material/semantic-label";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import { PROTOCOL_VERSION } from "../tree/model";
import { isMatterLocale } from "../config/locales";

/**
 * The wire shape of the thought-label boundary. Both sides parse against this
 * contract; neither trusts the other's serializer.
 *
 * A label request carries material for compression, never an instruction. The
 * response carries a label and its provenance, never a plan, an action, or a
 * node reference the browser did not already send.
 */

export const MAX_LABEL_REQUEST_BYTES = 8 * 1_024;
export const MAX_LABEL_RESPONSE_BYTES = 4 * 1_024;
export const MAX_LABEL_SIBLING_CODE_UNITS = 64;
export const MAX_OPERATION_ID_LENGTH = 128;
export const MAX_LOCALE_LENGTH = 35;

/**
 * Nothing waits on these: a label is already on screen, so the deadline only
 * decides how late an improvement may still arrive. Measured relay latency on
 * the corpus is p50 ≈ 0.65 s and p95 ≈ 1.7 s, so a 1.5 s provider budget threw
 * away answers that were merely slow. Those numbers were measured from a
 * workstation beside the relays. The deployed region reaches them across a
 * slower path, and the first call from a cold function pays the connection
 * before it pays the model: measured from `matter.ptoq.io`, an inquiry with an
 * 8 s attempt answers in 1.3-2.2 s while a label with a 3 s attempt spends its
 * whole budget and falls back. The difference is not the model.
 *
 * So this budget is sized for a cold connection rather than for a warm one.
 * It can afford to be, and repair cannot: a person is holding still for repair
 * and is reading a working name the entire time this runs. A late label is
 * invisible; an absent one costs the row its name for the session.
 */
export const LABEL_CLIENT_TIMEOUT_MS = 13_000;
/** Server deadline, kept under the browser's so a timeout is attributable. */
export const LABEL_PROVIDER_TIMEOUT_MS = 12_000;

export type LabelBasis = Readonly<{
  treeId: string;
  nodeId: string;
  revision: number;
}>;

export type LabelReference = Readonly<{
  parentLabel?: string;
  parentExcerpt?: string;
  siblingLabels?: readonly string[];
}>;

export type LabelRequest = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: string;
  operationId: string;
  basis: LabelBasis;
  locale: string;
  maxGraphemes: number;
  text: string;
  reference: LabelReference;
}>;

export type LabelSuccess = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: string;
  operationId: string;
  basis: LabelBasis;
  label: string;
  source: SemanticLabelSource;
  /** Why a model answer was not used, when `source` fell back to provisional. */
  fallbackReason?: LabelFallbackReason;
}>;

export type LabelFallbackReason =
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_REJECTED"
  | "MODEL_BUSY";

export type LabelErrorCode =
  | "INVALID_REQUEST"
  | "LABEL_UNAVAILABLE"
  | "LABEL_FAILED";

export type LabelErrorEnvelope = Readonly<{
  error: Readonly<{
    code: LabelErrorCode;
    message: string;
    retryable: boolean;
    operationId?: string;
  }>;
}>;

const LABEL_ERROR_CODES: ReadonlySet<string> = new Set<LabelErrorCode>([
  "INVALID_REQUEST",
  "LABEL_UNAVAILABLE",
  "LABEL_FAILED",
]);

const LABEL_FALLBACK_REASONS: ReadonlySet<string> = new Set<LabelFallbackReason>([
  "MODEL_UNAVAILABLE",
  "MODEL_TIMEOUT",
  "MODEL_REJECTED",
  "MODEL_BUSY",
]);

export function isLabelErrorCode(value: unknown): value is LabelErrorCode {
  return typeof value === "string" && LABEL_ERROR_CODES.has(value);
}

export function isLabelFallbackReason(value: unknown): value is LabelFallbackReason {
  return typeof value === "string" && LABEL_FALLBACK_REASONS.has(value);
}

export type LabelRequestParse =
  | Readonly<{ ok: true; request: LabelRequest }>
  | Readonly<{ ok: false; message: string }>;

/**
 * Parses an untrusted request body. Unknown fields are rejected rather than
 * ignored so a future field can never be silently dropped by an older server.
 */
export function parseLabelRequest(value: unknown): LabelRequestParse {
  if (!isPlainObject(value)) return invalid("The label request is not an object.");
  if (!hasExactKeys(value, [
    "protocolVersion",
    "promptVersion",
    "operationId",
    "basis",
    "locale",
    "maxGraphemes",
    "text",
    "reference",
  ])) {
    return invalid("The label request fields are invalid.");
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return invalid("The label protocol version is unsupported.");
  }
  if (value.promptVersion !== SEMANTIC_LABEL_PROMPT_VERSION) {
    return invalid("The label prompt version is unsupported.");
  }
  const operationId = boundedString(value.operationId, MAX_OPERATION_ID_LENGTH);
  if (operationId === null) return invalid("The label operation id is invalid.");

  const basis = parseBasis(value.basis);
  if (basis === null) return invalid("The label basis is invalid.");

  const locale = boundedString(value.locale, MAX_LOCALE_LENGTH);
  if (locale === null || !isMatterLocale(locale)) {
    return invalid("The label locale is invalid.");
  }
  if (
    typeof value.maxGraphemes !== "number" ||
    !Number.isSafeInteger(value.maxGraphemes) ||
    value.maxGraphemes < 2 ||
    value.maxGraphemes > MAX_SEMANTIC_LABEL_GRAPHEMES
  ) {
    return invalid("The label length bound is invalid.");
  }
  const text = boundedString(value.text, MAX_NODE_TEXT_CODE_UNITS);
  if (text === null || text.trim().length === 0) return invalid("The label material is invalid.");

  const reference = parseReference(value.reference);
  if (reference === null) return invalid("The label reference material is invalid.");

  return Object.freeze({
    ok: true,
    request: Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
      operationId,
      basis,
      locale,
      maxGraphemes: value.maxGraphemes,
      text,
      reference,
    }),
  });
}

/** Recognizes a success envelope and checks that it echoes the request identity. */
export function isLabelSuccess(
  value: unknown,
  request: Pick<LabelRequest, "operationId" | "basis" | "promptVersion">,
): value is LabelSuccess {
  if (!isPlainObject(value)) return false;
  if (!hasExactKeys(value, [
    "protocolVersion",
    "promptVersion",
    "operationId",
    "basis",
    "label",
    "source",
    "fallbackReason",
  ])) {
    return false;
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) return false;
  if (value.promptVersion !== request.promptVersion) return false;
  if (value.operationId !== request.operationId) return false;
  const basis = parseBasis(value.basis);
  if (
    basis === null ||
    basis.treeId !== request.basis.treeId ||
    basis.nodeId !== request.basis.nodeId ||
    basis.revision !== request.basis.revision
  ) {
    return false;
  }
  if (typeof value.label !== "string" || value.label.length === 0) return false;
  if (value.source !== "provisional" && value.source !== "model") return false;
  if (value.fallbackReason !== undefined && !isLabelFallbackReason(value.fallbackReason)) {
    return false;
  }
  return true;
}

function parseBasis(value: unknown): LabelBasis | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ["treeId", "nodeId", "revision"])) return null;
  const treeId = boundedString(value.treeId, MAX_OPERATION_ID_LENGTH);
  const nodeId = boundedString(value.nodeId, MAX_OPERATION_ID_LENGTH);
  if (treeId === null || nodeId === null) return null;
  if (
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    return null;
  }
  return Object.freeze({ treeId, nodeId, revision: value.revision });
}

function parseReference(value: unknown): LabelReference | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ["parentLabel", "parentExcerpt", "siblingLabels"])) return null;

  const reference: {
    parentLabel?: string;
    parentExcerpt?: string;
    siblingLabels?: readonly string[];
  } = {};
  if (value.parentLabel !== undefined) {
    const parentLabel = boundedString(value.parentLabel, MAX_LABEL_SIBLING_CODE_UNITS);
    if (parentLabel === null) return null;
    reference.parentLabel = parentLabel;
  }
  if (value.parentExcerpt !== undefined) {
    const excerpt = boundedString(value.parentExcerpt, MAX_PARENT_EXCERPT_CODE_UNITS);
    if (excerpt === null) return null;
    reference.parentExcerpt = excerpt;
  }
  if (value.siblingLabels !== undefined) {
    if (!Array.isArray(value.siblingLabels) || value.siblingLabels.length > MAX_SIBLING_LABELS) {
      return null;
    }
    const labels: string[] = [];
    for (const entry of value.siblingLabels) {
      const sibling = boundedString(entry, MAX_LABEL_SIBLING_CODE_UNITS);
      if (sibling === null) return null;
      labels.push(sibling);
    }
    reference.siblingLabels = Object.freeze(labels);
  }
  return Object.freeze(reference);
}

function boundedString(value: unknown, maxCodeUnits: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxCodeUnits) return null;
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Optional keys may be absent, but no key outside the list may appear. An
 * unexpected key means the peer speaks a different contract than it declared.
 */
function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function invalid(message: string): LabelRequestParse {
  return Object.freeze({ ok: false, message });
}
