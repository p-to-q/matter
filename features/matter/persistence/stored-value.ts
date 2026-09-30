/**
 * Shape guards for values read back from the material database: the snapshot
 * row, its journal manifest, and its step records. IndexedDB hands back
 * structured clones, so a record is a plain object and a count or position is
 * a non-negative safe integer; anything else is damage and is never coerced.
 */

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
