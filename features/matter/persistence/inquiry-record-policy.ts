import {
  MAX_INQUIRY_ANSWER_CODE_POINTS,
  MAX_INQUIRY_ID_LENGTH,
  MAX_INQUIRY_QUESTION_CODE_POINTS,
} from "../protocol/inquiry-contract";
import { isCanonicalTimestamp } from "../tree/invariants";
import type { StoredInquiryExchange, StoredInquiryRecord } from "./matter-database";

export const MAX_INQUIRY_RECORD_EXCHANGES = 20;

export type InquiryRecordVersion = Readonly<{
  generation: number | null;
  epoch: number;
}>;

/** The caller can write exchanges, but never storage generation or clear state. */
export type InquiryRecordDraft = Readonly<{
  recordSchemaVersion: 1;
  treeId: string;
  exchanges: readonly StoredInquiryExchange[];
}>;

export function inquiryRecordVersion(record: StoredInquiryRecord | null): InquiryRecordVersion {
  return Object.freeze({
    generation: record?.writeGeneration ?? null,
    epoch: record?.recordEpoch ?? 0,
  });
}

/**
 * Appending is a stable merge, not a replacement: a concurrent tab remains
 * first in visible order and an id can name one completed exchange only.
 */
export function appendInquiryExchange(
  exchanges: readonly StoredInquiryExchange[],
  exchange: StoredInquiryExchange,
): readonly StoredInquiryExchange[] | null {
  if (!isStoredInquiryExchange(exchange)) return null;
  if (exchanges.some((candidate) => candidate.id === exchange.id)) return Object.freeze([...exchanges]);
  const next = [...exchanges, exchange]
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => left.candidate.askedAt.localeCompare(right.candidate.askedAt) || left.index - right.index)
    .map(({ candidate }) => candidate);
  return Object.freeze(next.slice(-MAX_INQUIRY_RECORD_EXCHANGES));
}

export function mergeInquiryExchanges(
  first: readonly StoredInquiryExchange[],
  second: readonly StoredInquiryExchange[],
): readonly StoredInquiryExchange[] | null {
  let merged = Object.freeze([...first]) as readonly StoredInquiryExchange[];
  for (const exchange of second) {
    const next = appendInquiryExchange(merged, exchange);
    if (next === null) return null;
    merged = next;
  }
  return merged;
}

export function isStoredInquiryRecord(value: unknown, treeId: string): value is StoredInquiryRecord {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    "storageSchemaVersion", "recordSchemaVersion", "treeId", "writeGeneration", "recordEpoch", "cleared", "exchanges",
  ], ["recordEpoch", "cleared"])) return false;
  if (
    value.storageSchemaVersion !== 1 ||
    value.recordSchemaVersion !== 1 ||
    value.treeId !== treeId ||
    !isBoundedId(value.treeId) ||
    !isPositiveSafeInteger(value.writeGeneration) ||
    !isEpoch(value.recordEpoch) ||
    (value.cleared !== undefined && typeof value.cleared !== "boolean") ||
    !Array.isArray(value.exchanges) ||
    value.exchanges.length > MAX_INQUIRY_RECORD_EXCHANGES
  ) return false;

  if (value.cleared === true && value.exchanges.length !== 0) return false;
  const seenIds = new Set<string>();
  let previousAskedAt: string | null = null;
  for (const exchange of value.exchanges) {
    if (!isStoredInquiryExchange(exchange) || exchange.basis.treeId !== treeId || seenIds.has(exchange.id)) return false;
    if (previousAskedAt !== null && exchange.askedAt < previousAskedAt) return false;
    seenIds.add(exchange.id);
    previousAskedAt = exchange.askedAt;
  }
  return true;
}

export function isStoredInquiryExchange(value: unknown): value is StoredInquiryExchange {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["id", "askedAt", "question", "outcome", "basis"])) return false;
  const basis = value.basis;
  if (
    !isBoundedId(value.id) ||
    !isCanonicalTimestamp(value.askedAt) ||
    !isBoundedText(value.question, MAX_INQUIRY_QUESTION_CODE_POINTS) ||
    !isPlainRecord(basis) ||
    !hasOnlyKeys(basis, ["treeId", "revision", "scope"]) ||
    !isBoundedId(basis.treeId) ||
    !Number.isSafeInteger(basis.revision) || (basis.revision as number) < 0 ||
    (basis.scope !== "selection" && basis.scope !== "tree")
  ) return false;
  return isStoredOutcome(value.outcome);
}

function isStoredOutcome(value: unknown): boolean {
  if (!isPlainRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "answered") {
    return hasOnlyKeys(value, ["status", "text"]) && isBoundedText(value.text, MAX_INQUIRY_ANSWER_CODE_POINTS);
  }
  return value.status === "unavailable" &&
    hasOnlyKeys(value, ["status", "reason"]) &&
    (value.reason === "NO_PROVIDER" || value.reason === "NO_MATERIAL" || value.reason === "RATE_LIMITED" ||
      value.reason === "BUSY" || value.reason === "TIMED_OUT" ||
      value.reason === "TEMPORARILY_UNAVAILABLE" || value.reason === "UNREACHABLE");
}

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_INQUIRY_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value);
}

function isBoundedText(value: unknown, maxCodePoints: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= maxCodePoints;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isEpoch(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  return actual.every((key) => allowed.has(key)) && keys.every((key) => optional.includes(key) || Object.hasOwn(value, key));
}
