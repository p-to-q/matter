/**
 * The storage error vocabulary shared by every repository. It imports nothing,
 * so a module that must stay clear of Wiki can name these without reaching the
 * database schema that does.
 */

export const SUPERSEDED_DATABASE_ERROR = "MatterDatabaseSupersededError";
export const CLEARED_DATABASE_ERROR = "MatterDatabaseClearedError";

/** WebKit reports a full disk as an `UnknownError`, not a quota error. */
export function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    (error.name === "UnknownError" && /disk is full/iu.test(error.message))
  );
}
