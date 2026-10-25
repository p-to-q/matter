/**
 * The one reader of `NEXT_PUBLIC_MATTER_PREVIEW_BRANCH`. A build with it set to
 * `true` keeps the retired Branch rail tool, its `insert-child` intent and the
 * seeded-branch prose. Its local lens uses the retained two-action AI/context
 * design, with no growth or Under mark in that preview. Every
 * other build, and the deployed product, lacks those sample entries and keeps
 * human child creation on the selected passage's Under mark instead.
 * Next inlines the value at build time, so the default is closed.
 */
export function previewBranchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH === "true";
}
