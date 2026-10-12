/**
 * The one reader of `NEXT_PUBLIC_MATTER_PREVIEW_BRANCH`. A build with it set to
 * `true` keeps the retired Branch rail tool, its `insert-child` intent and the
 * seeded-branch prose; every other build, and the deployed product, lacks them.
 * Human child creation lives on the selected passage's Under mark instead.
 * Next inlines the value at build time, so the default is closed.
 */
export function previewBranchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH === "true";
}
