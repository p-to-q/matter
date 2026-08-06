export type MatterInitialDocument = "root" | "expanded";

/**
 * The deployed preview may start with one root while local research keeps the
 * fuller fixture. Unknown values intentionally retain the local-safe default.
 */
export function normalizeMatterInitialDocument(value: string | undefined): MatterInitialDocument {
  return value === "root" ? "root" : "expanded";
}
