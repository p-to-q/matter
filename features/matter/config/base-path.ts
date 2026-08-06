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

/**
 * The base path as the browser sees it. Every client that calls a Matter route
 * needs this, and each one deriving it privately is how a route quietly breaks
 * under a non-default deployment path.
 */
export function clientMatterBasePath(): string {
  return normalizeMatterBasePath(process.env.NEXT_PUBLIC_MATTER_BASE_PATH ?? DEFAULT_MATTER_BASE_PATH);
}
