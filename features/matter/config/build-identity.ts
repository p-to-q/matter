/** Public artifact identity, never a credential or a sortable release number. */
export function parseMatterBuildId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
}

export function resolveMatterBuildId(explicit: string | undefined, platform: string | undefined): string | null {
  const value = explicit ?? platform;
  if (value === undefined) return null;
  const parsed = parseMatterBuildId(value);
  if (parsed === null) throw new Error("Matter build identity must contain 1–128 ASCII letters, digits, hyphens or underscores.");
  return parsed;
}

// Next replaces this expression with the same build-frozen literal in both
// browser and server output. Runtime operator/platform variables are not read.
export const MATTER_BUILD_ID = parseMatterBuildId(process.env.NEXT_PUBLIC_MATTER_BUILD_ID);
