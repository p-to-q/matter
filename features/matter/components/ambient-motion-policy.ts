export type AmbientConnectionHint = Readonly<{
  effectiveType?: string;
  saveData?: boolean;
}>;

/**
 * Decorative motion yields to an explicit motion preference or a browser
 * network-cost signal. Missing hints keep the normal visual path; user-agent
 * guesses would make the same connection behave differently by browser.
 */
export function shouldPresentAmbientMotion(input: Readonly<{
  connection?: AmbientConnectionHint;
  reducedMotion: boolean;
}>): boolean {
  if (input.reducedMotion || input.connection?.saveData === true) return false;
  const effectiveType = input.connection?.effectiveType?.toLowerCase();
  return effectiveType !== "slow-2g" && effectiveType !== "2g";
}
