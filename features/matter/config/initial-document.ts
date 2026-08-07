export type MatterInitialDocument = "root" | "expanded";

export const DEFAULT_MATTER_DOCUMENT_TITLE = "被允许想象的其他生活";

/**
 * The deployed preview may start with one root while local research keeps the
 * fuller fixture. Unknown values intentionally retain the local-safe default.
 */
export function normalizeMatterInitialDocument(value: string | undefined): MatterInitialDocument {
  return value === "root" ? "root" : "expanded";
}
