import { isMatterLocale, type MatterLocale } from "../config/locales";
import type { ExpandInPlacePolicyCode } from "../protocol/expand-in-place-policy";
import type { TextSwapPolicyCode } from "../protocol/text-swap-policy";
import type { ScenarioObservation } from "./harness";

export type MaterialTurnOperation = "expand-in-place" | "paraphrase-in-place";
export type MaterialTurnOutcome =
  | "success"
  | "rejected"
  | "unavailable"
  | "timeout"
  | "busy"
  | "invalid"
  | "admission"
  | "cancelled"
  | "failed";

export type MaterialTurnReason =
  | "NONE"
  | ExpandInPlacePolicyCode
  | TextSwapPolicyCode
  | "POLICY_REJECTED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_BUSY"
  | "REQUEST_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_REQUEST"
  | "ORIGIN"
  | "RATE"
  | "ADMISSION_BUSY"
  | "CLIENT_CANCELLED"
  | "INTERNAL_FAILURE";

export type MaterialTurnObservation = Readonly<{
  operation: MaterialTurnOperation;
  outcome: MaterialTurnOutcome;
  reason: MaterialTurnReason;
  locale: MatterLocale | "unknown";
  amountBucket: "0.15-0.39" | "0.40-0.74" | "0.75-1.00" | "tool-owned" | "unknown";
  lengthBucket: "1-20" | "21-80" | "81-200" | "201-800" | "over-800" | "unknown";
  requestBytesBucket: MaterialTurnByteBucket;
  responseBytesBucket: MaterialTurnByteBucket | "none";
  elapsedMs: number;
}>;

export type MaterialTurnObserver = (observation: MaterialTurnObservation) => void;

export type MaterialTurnObservationOptions = Readonly<{
  observe?: MaterialTurnObserver;
  now?: () => number;
}>;

type MaterialTurnByteBucket =
  | "0-1KiB"
  | "1-4KiB"
  | "4-16KiB"
  | "16-32KiB"
  | "over-32KiB"
  | "unknown";

export type MaterialTurnTerminal = Readonly<{
  outcome: MaterialTurnOutcome;
  reason: string;
  responseBytes?: number;
}>;

export type MaterialTurnFailureFacts = Readonly<{
  admissionReason?: "ORIGIN" | "RATE" | "BUSY";
  cancelled?: boolean;
  serverError?: Readonly<{
    code: string;
    status: number;
    fallbackReason?: string;
  }>;
}>;

export type MaterialTurnObservationOwner = Readonly<{
  noteRequestBytes: (bytes: number) => void;
  noteBasis: (basis: Readonly<{
    locale: string;
    amount: number | "tool-owned";
    targetGraphemes: number;
  }>) => void;
  noteScenario: (observation: ScenarioObservation) => void;
  settle: (terminal: MaterialTurnTerminal) => void;
}>;

const EXPAND_REASONS: readonly ExpandInPlacePolicyCode[] = Object.freeze([
  "EMPTY",
  "NO_CHANGE",
  "NOT_GROWING",
  "LENGTH_OUT_OF_RANGE",
  "BOUND_EXCEEDED",
  "INVALID_FORMAT",
  "SOURCE_MATERIAL_CHANGED",
  "PROTECTED_MEANING_CHANGED",
  "SCRIPT_DRIFT",
]);
const SWAP_REASONS: readonly TextSwapPolicyCode[] = Object.freeze([
  "EMPTY",
  "NO_CHANGE",
  "LENGTH_OUT_OF_RANGE",
  "BOUND_EXCEEDED",
  "INVALID_FORMAT",
  "PROTECTED_MEANING_CHANGED",
  "SCRIPT_DRIFT",
]);
/**
 * Owns exactly one routine production receipt for one material-turn request.
 * Its methods accept only scalar operational facts, so material cannot reach
 * the sink by accidental object spreading or error serialization.
 */
export function createMaterialTurnObservationOwner(
  operation: MaterialTurnOperation,
  options: MaterialTurnObservationOptions = {},
): MaterialTurnObservationOwner {
  const now = options.now ?? Date.now;
  const observe = options.observe ?? recordMaterialTurnObservation;
  const startedAtMs = now();
  let settled = false;
  let locale: MatterLocale | "unknown" = "unknown";
  let amountBucket: MaterialTurnObservation["amountBucket"] = "unknown";
  let lengthBucket: MaterialTurnObservation["lengthBucket"] = "unknown";
  let requestBytesBucket: MaterialTurnByteBucket = "unknown";
  let policyReason: MaterialTurnReason = "POLICY_REJECTED";

  return Object.freeze({
    noteRequestBytes: (bytes) => {
      requestBytesBucket = byteBucket(bytes);
    },
    noteBasis: (basis) => {
      locale = isMatterLocale(basis.locale) ? basis.locale : "unknown";
      amountBucket = basis.amount === "tool-owned" ? "tool-owned" : stretchAmountBucket(basis.amount);
      lengthBucket = graphemeBucket(basis.targetGraphemes);
    },
    noteScenario: (observation) => {
      if (observation.reason !== "MODEL_REJECTED") return;
      policyReason = safePolicyReason(operation, observation.rejectionReason);
    },
    settle: (terminal) => {
      if (settled) return;
      settled = true;
      const outcome = safeOutcome(terminal.outcome);
      const reason = outcome === "success"
        ? "NONE"
        : outcome === "rejected"
          ? policyReason
          : safeFailureReason(outcome, terminal.reason);
      const observation = Object.freeze({
        operation,
        outcome,
        reason,
        locale,
        amountBucket,
        lengthBucket,
        requestBytesBucket,
        responseBytesBucket: terminal.responseBytes === undefined
          ? "none" as const
          : byteBucket(terminal.responseBytes),
        elapsedMs: elapsed(now() - startedAtMs),
      });
      try {
        observe(observation);
      } catch {
        // Observability is never allowed to change a person's material turn.
      }
    },
  });
}

export function recordMaterialTurnObservation(observation: MaterialTurnObservation): void {
  console.info(`matter.material-turn ${JSON.stringify(observation)}`);
}

export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Maps only route-owned error enums and status codes, never an Error message. */
export function classifyMaterialTurnFailure(
  facts: MaterialTurnFailureFacts,
): MaterialTurnTerminal {
  if (facts.admissionReason !== undefined) {
    return Object.freeze({
      outcome: "admission",
      reason: facts.admissionReason === "BUSY" ? "ADMISSION_BUSY" : facts.admissionReason,
    });
  }
  if (facts.cancelled === true) {
    return Object.freeze({ outcome: "cancelled", reason: "CLIENT_CANCELLED" });
  }
  const error = facts.serverError;
  if (error === undefined) return Object.freeze({ outcome: "failed", reason: "INTERNAL_FAILURE" });
  switch (error.fallbackReason) {
    case "MODEL_REJECTED": return Object.freeze({ outcome: "rejected", reason: error.fallbackReason });
    case "MODEL_UNAVAILABLE": return Object.freeze({ outcome: "unavailable", reason: error.fallbackReason });
    case "MODEL_TIMEOUT": return Object.freeze({ outcome: "timeout", reason: error.fallbackReason });
    case "MODEL_BUSY": return Object.freeze({ outcome: "busy", reason: error.fallbackReason });
  }
  if (error.code === "INVALID_REQUEST") {
    return Object.freeze({
      outcome: "invalid",
      reason: error.status === 413
        ? "REQUEST_TOO_LARGE"
        : error.status === 415
          ? "UNSUPPORTED_MEDIA_TYPE"
          : "INVALID_REQUEST",
    });
  }
  if (error.status === 504) return Object.freeze({ outcome: "timeout", reason: "MODEL_TIMEOUT" });
  if (error.status === 499) return Object.freeze({ outcome: "cancelled", reason: "CLIENT_CANCELLED" });
  return Object.freeze({ outcome: "failed", reason: "INTERNAL_FAILURE" });
}

function safePolicyReason(operation: MaterialTurnOperation, value: string | undefined): MaterialTurnReason {
  const allowed: readonly string[] = operation === "expand-in-place" ? EXPAND_REASONS : SWAP_REASONS;
  return value !== undefined && allowed.includes(value)
    ? value as MaterialTurnReason
    : "POLICY_REJECTED";
}

function safeOutcome(value: MaterialTurnOutcome): MaterialTurnOutcome {
  switch (value) {
    case "success":
    case "rejected":
    case "unavailable":
    case "timeout":
    case "busy":
    case "invalid":
    case "admission":
    case "cancelled":
    case "failed":
      return value;
    default:
      return "failed";
  }
}

function safeFailureReason(outcome: MaterialTurnOutcome, value: string): MaterialTurnReason {
  switch (outcome) {
    case "unavailable":
      return value === "MODEL_UNAVAILABLE" ? value : "MODEL_UNAVAILABLE";
    case "timeout":
      return value === "MODEL_TIMEOUT" ? value : "MODEL_TIMEOUT";
    case "busy":
      return value === "MODEL_BUSY" ? value : "MODEL_BUSY";
    case "invalid":
      return value === "REQUEST_TOO_LARGE" || value === "UNSUPPORTED_MEDIA_TYPE"
        ? value
        : "INVALID_REQUEST";
    case "admission":
      return value === "ORIGIN" || value === "RATE" ? value : "ADMISSION_BUSY";
    case "cancelled":
      return "CLIENT_CANCELLED";
    default: return "INTERNAL_FAILURE";
  }
}

function stretchAmountBucket(amount: number): MaterialTurnObservation["amountBucket"] {
  if (!Number.isFinite(amount) || amount < .15 || amount > 1) return "unknown";
  if (amount < .4) return "0.15-0.39";
  if (amount < .75) return "0.40-0.74";
  return "0.75-1.00";
}

function graphemeBucket(value: number): MaterialTurnObservation["lengthBucket"] {
  if (!Number.isFinite(value) || value < 1) return "unknown";
  if (value <= 20) return "1-20";
  if (value <= 80) return "21-80";
  if (value <= 200) return "81-200";
  if (value <= 800) return "201-800";
  return "over-800";
}

function byteBucket(value: number): MaterialTurnByteBucket {
  if (!Number.isFinite(value) || value < 0) return "unknown";
  if (value <= 1_024) return "0-1KiB";
  if (value <= 4_096) return "1-4KiB";
  if (value <= 16_384) return "4-16KiB";
  if (value <= 32_768) return "16-32KiB";
  return "over-32KiB";
}

function elapsed(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
