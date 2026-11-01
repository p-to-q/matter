/**
 * The one reader of `NEXT_PUBLIC_MATTER_PREVIEW_BRANCH`. A build with it set to
 * `true` exposes the API-backed Branch rail tool and its `insert-child` intent.
 * Its local lens uses the retained two-action AI/context
 * design, with no growth or Under mark in that preview. Every
 * unflagged build lacks that entry and keeps
 * human child creation on the selected passage's Under mark instead.
 * Next inlines the value at build time. Managed provider permission is separate.
 */
export function previewBranchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH === "true";
}
