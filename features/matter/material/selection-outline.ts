import { renderOutlineHtml, renderParagraphsHtml } from "./render/html";
import { renderOutlineMarkdown } from "./render/list";

/**
 * The clipboard forms of a selection, pure and DOM-free. A row is one selected
 * passage in authored order with its depth among the selected passages only:
 * the number of selected ancestors, so an unselected parent leaves no gap. The
 * list grammar itself is `render/list.ts`, shared with every other reader
 * of an outline.
 */
export type SelectionOutlineRow = Readonly<{ text: string; depth: number }>;

export type SelectionOutline = Readonly<{
  /**
   * Plain text. With no structure among the passages it is the literal join,
   * byte for byte and unescaped; once one selected passage contains another it
   * is the shared Markdown nested list (`render/list.ts`). It has no header, no ids and no digest.
   */
  text: string;
  /**
   * The same selection for rich editors: the nested list when there is
   * structure, one paragraph per passage when there is not (a lone passage must
   * not paste as a bullet).
   */
  html: string;
}>;

export function renderSelectionOutline(rows: readonly SelectionOutlineRow[]): SelectionOutline {
  const nested = rows.some(({ depth }) => depth > 0);
  return Object.freeze(
    nested
      ? { text: renderOutlineMarkdown(rows), html: renderOutlineHtml(rows) }
      : {
          text: rows.map(({ text }) => text).join("\n\n"),
          html: renderParagraphsHtml(rows.map(({ text }) => text)),
        },
  );
}
