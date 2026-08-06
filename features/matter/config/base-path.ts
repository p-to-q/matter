export const DEFAULT_MATTER_BASE_PATH = "/matter";

/**
 * Keeps the deployment prefix safe for Next routing and browser fetches.
 * An empty prefix is intentional for a dedicated custom domain.
 */
export function normalizeMatterBasePath(value: string | undefined): string {
  if (value === undefined) return DEFAULT_MATTER_BASE_PATH;
  if (value === "" || value === "/") return "";
  if (!value.startsWith("/") || value.endsWith("/") || value.includes("//")) {
    return DEFAULT_MATTER_BASE_PATH;
  }
  return value;
}
