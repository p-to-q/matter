export type MatterInitialDocument = "empty" | "root" | "expanded";

export const DEFAULT_MATTER_DOCUMENT_TITLE = "被允许想象的其他生活";
export const EMPTY_MATTER_DOCUMENT_TITLE = "Matter";
export const LEGACY_MATTER_DOCUMENT_TITLE = "而是那个过去在今天仍然允许我们想象的其他生活";

/**
 * Capture may start before the first admission, the deployed preview may start
 * with one root, and local research keeps the fuller fixture. Unknown values
 * intentionally retain the local-safe default.
 */
export function normalizeMatterInitialDocument(value: string | undefined): MatterInitialDocument {
  if (value === "empty") return "empty";
  return value === "root" ? "root" : "expanded";
}
