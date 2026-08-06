/**
 * The provisional Matter mark: one rooted thought with its lineage hanging off
 * it, which is the figure the left material index already draws. It is not the
 * product mark and may be replaced without a product-contract revision.
 *
 * Every rendering of it comes from here so the tab icon, the iOS icon and the
 * installed-app icons cannot drift apart. `app/icon.svg` is the one exception:
 * it is a static file that cannot import, so it carries the same path data by
 * hand and must be edited alongside this module.
 */

export const MATTER_INK = "#161d27";
export const MATTER_PAPER = "#f5f5f2";

/**
 * A 32-unit grid, not 64. A favicon is read at 16 px, so every dimension is
 * chosen to survive halving: 2.6 strokes and r2.7 nodes still separate, where
 * the previous 3-on-64 strokes resolved to 0.75 px and closed up.
 */
const MARK_VIEW_BOX = 32;

/**
 * The mark occupies roughly two thirds of its own view box, and the view box is
 * inset again by the caller. That double inset is what keeps the figure inside
 * the central 80% an Android maskable icon may be cropped to.
 */
export const MATTER_ICON_MARK_RATIO = 0.7;

export function matterMarkSvg(color: string = MATTER_PAPER): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_VIEW_BOX} ${MARK_VIEW_BOX}">`,
    `<g fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round">`,
    '<path d="M10 11.2v13.3M10 16.5h9.6M10 24.5h9.6"/>',
    `<circle cx="10" cy="8.5" r="2.7" fill="${color}" stroke="none"/>`,
    `<circle cx="22.4" cy="16.5" r="2.7" fill="${color}" stroke="none"/>`,
    `<circle cx="22.4" cy="24.5" r="2.7" fill="${color}" stroke="none"/>`,
    "</g></svg>",
  ].join("");
}

/**
 * `utf8` rather than base64: the payload is small, and an unencoded data URI
 * stays readable in a build artefact or a diff.
 */
export function matterMarkDataUri(color?: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(matterMarkSvg(color))}`;
}
