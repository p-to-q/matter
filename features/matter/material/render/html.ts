import type { OutlineItem } from "./list";

/** A clipboard fragment is read as Latin-1 by some editors unless it says otherwise. */
const HTML_PREFIX = '<meta charset="utf-8">';

/**
 * A nested list for rich editors, HTML-escaped (never Markdown-escaped) and
 * carrying no attributes, styles or ids. A deeper item opens exactly one list
 * inside the open item, so a gap in the depths never produces an empty item.
 */
export function renderOutlineHtml(items: readonly OutlineItem[]): string {
  if (items.length === 0) return "";
  let html = "";
  let previous = -1;
  for (const item of items) {
    const depth = Math.max(0, Math.min(item.depth, previous + 1));
    if (depth > previous) {
      html += "<ul>";
    } else {
      html += "</li>";
      for (let level = previous; level > depth; level -= 1) html += "</ul></li>";
    }
    html += `<li>${escapeHtmlText(item.text)}`;
    previous = depth;
  }
  html += "</li>";
  for (let level = previous; level > 0; level -= 1) html += "</ul></li>";
  return `${HTML_PREFIX}${html}</ul>`;
}

/** One paragraph per passage: the rich form of passages that do not contain one another. */
export function renderParagraphsHtml(texts: readonly string[]): string {
  return texts.length === 0
    ? ""
    : HTML_PREFIX + texts.map((text) => `<p>${escapeHtmlText(text)}</p>`).join("");
}

/** Standard HTML escaping only (`& < > "`): HTML is not Markdown, so no backslashes. */
export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .split(/(\r\n|\n|\r)/u)
    // A run of spaces keeps its first space and turns the rest into no-break
    // spaces, which an editor would otherwise collapse.
    .map((part, index) => index % 2 === 1
      ? "<br>"
      : part.replace(/ {2,}/gu, (run) => ` ${"&nbsp;".repeat(run.length - 1)}`))
    .join("");
}
