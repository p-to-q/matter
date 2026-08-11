import { isMatterLocale } from "../config/locales";
import {
  MAX_VOCABULARY_TERMS,
  MAX_VOCABULARY_TERM_CODE_UNITS,
} from "../material/material-vocabulary";
import {
  MAX_REPAIR_TEXT_CODE_UNITS,
  TRANSCRIPT_REPAIR_PROMPT_VERSION,
  type RepairSource,
} from "../material/transcript-repair";
import { PROTOCOL_VERSION } from "../tree/model";

/**
 * The wire shape of the transcript-repair boundary. Both sides parse against
 * this contract; neither trusts the other's serializer.
 *
 * A repair request carries one utterance and its locale — no tree, no node, no
 * lineage, no target. The response carries one utterance back and says where it
 * came from. Neither direction carries a plan, an action, or a provider name.
 */

export const MAX_REPAIR_REQUEST_BYTES = 12 * 1_024;
export const MAX_REPAIR_RESPONSE_BYTES = 12 * 1_024;
export const MAX_OPERATION_ID_LENGTH = 128;
export const MAX_LOCALE_LENGTH = 35;

/**
 * The person is holding still while this runs, so the deadline is the whole
 * design constraint rather than a safety net. It scales with the utterance —
 * see `repairDeadlineMs` — and these two are the ceiling around that.
 *
 * The client's is the larger of the pair so that a server timeout arrives as an
 * attributable answer instead of a dead socket, and admission continues with the
 * transcript it already has either way.
 */
export const REPAIR_PROVIDER_CEILING_MS = 8_000;
export const REPAIR_TRANSPORT_GRACE_MS = 800;
export const REPAIR_CLIENT_TIMEOUT_MS = REPAIR_PROVIDER_CEILING_MS + REPAIR_TRANSPORT_GRACE_MS;

export type RepairRequest = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: typeof TRANSCRIPT_REPAIR_PROMPT_VERSION;
  operationId: string;
  attempt: number;
  locale: string;
  text: string;
  /**
   * Terms drawn from the person's own visible material, most-used first. Bounded
   * and optional: an older client, or a tree with nothing repeated in it, simply
   * sends none. No node id, depth, or ordering leaves the browser with them.
   */
  vocabulary?: readonly string[];
}>;

export type RepairSuccess = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: typeof TRANSCRIPT_REPAIR_PROMPT_VERSION;
  operationId: string;
  attempt: number;
  text: string;
  source: RepairSource;
  /** Why the model answer was not used, when `source` fell back to verbatim. */
  fallbackReason?: RepairFallbackReason;
}>;

export type RepairFallbackReason =
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_REJECTED"
  | "MODEL_BUSY"
  | "NOT_WORTH_ASKING";

export type RepairErrorCode = "INVALID_REQUEST" | "REPAIR_FAILED";

export type RepairErrorEnvelope = Readonly<{
  error: Readonly<{
    code: RepairErrorCode;
    message: string;
    retryable: boolean;
    operationId?: string;
  }>;
}>;

const REPAIR_FALLBACK_REASONS: ReadonlySet<string> = new Set<RepairFallbackReason>([
  "MODEL_UNAVAILABLE",
  "MODEL_TIMEOUT",
  "MODEL_REJECTED",
  "MODEL_BUSY",
  "NOT_WORTH_ASKING",
]);

export function isRepairFallbackReason(value: unknown): value is RepairFallbackReason {
  return typeof value === "string" && REPAIR_FALLBACK_REASONS.has(value);
}

export type RepairRequestParse =
  | Readonly<{ ok: true; request: RepairRequest }>
  | Readonly<{ ok: false; message: string }>;

/**
 * Parses an untrusted request body. Unknown fields are rejected rather than
 * ignored so a future field can never be silently dropped by an older server.
 */
export function parseRepairRequest(value: unknown): RepairRequestParse {
  if (!isPlainObject(value)) return invalid("The repair request is not an object.");
  if (!hasExactKeys(value, [
    "protocolVersion",
    "promptVersion",
    "operationId",
    "attempt",
    "locale",
    "text",
    "vocabulary",
  ])) {
    return invalid("The repair request fields are invalid.");
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return invalid("The repair protocol version is unsupported.");
  }
  if (value.promptVersion !== TRANSCRIPT_REPAIR_PROMPT_VERSION) {
    return invalid("The repair prompt version is unsupported.");
  }
  const operationId = boundedString(value.operationId, MAX_OPERATION_ID_LENGTH);
  if (operationId === null) return invalid("The repair operation id is invalid.");
  if (!isAttempt(value.attempt)) return invalid("The repair attempt is invalid.");

  const locale = boundedString(value.locale, MAX_LOCALE_LENGTH);
  if (locale === null || !isMatterLocale(locale)) return invalid("The repair locale is invalid.");

  const text = boundedString(value.text, MAX_REPAIR_TEXT_CODE_UNITS);
  if (text === null || text.trim().length === 0) return invalid("The repair transcript is invalid.");

  const vocabulary = parseVocabulary(value.vocabulary);
  if (vocabulary === null) return invalid("The repair vocabulary is invalid.");

  return Object.freeze({
    ok: true,
    request: Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
      operationId,
      attempt: value.attempt,
      locale,
      text,
      ...(vocabulary.length === 0 ? {} : { vocabulary }),
    }),
  });
}

/** Recognizes a success envelope and checks that it echoes the request identity. */
export function isRepairSuccess(
  value: unknown,
  request: Pick<RepairRequest, "operationId" | "attempt">,
): value is RepairSuccess {
  if (!isPlainObject(value)) return false;
  if (!hasExactKeys(value, [
    "protocolVersion",
    "promptVersion",
    "operationId",
    "attempt",
    "text",
    "source",
    "fallbackReason",
  ])) {
    return false;
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) return false;
  if (value.promptVersion !== TRANSCRIPT_REPAIR_PROMPT_VERSION) return false;
  if (value.operationId !== request.operationId) return false;
  if (value.attempt !== request.attempt) return false;
  if (typeof value.text !== "string" || value.text.trim().length === 0) return false;
  if (value.text.length > MAX_REPAIR_TEXT_CODE_UNITS) return false;
  if (value.source !== "verbatim" && value.source !== "model") return false;
  if (value.fallbackReason !== undefined && !isRepairFallbackReason(value.fallbackReason)) {
    return false;
  }
  return true;
}

/**
 * A hint is the most droppable field on this boundary, so it is bounded rather
 * than trusted: too many terms, or one too long, is a client that has gone
 * wrong, and the repair is still perfectly possible without any of them.
 */
function parseVocabulary(value: unknown): readonly string[] | null {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_VOCABULARY_TERMS) return null;
  const terms: string[] = [];
  for (const entry of value) {
    const term = boundedString(entry, MAX_VOCABULARY_TERM_CODE_UNITS);
    if (term === null || term.trim().length === 0) return null;
    terms.push(term);
  }
  return Object.freeze(terms);
}

function isAttempt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
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

function invalid(message: string): RepairRequestParse {
  return Object.freeze({ ok: false, message });
}
