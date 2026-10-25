import { escapePassage, unescapePassage } from "./escape";

/**
 * The one readable body grammar for an outline of passages: a Markdown nested
 * list, and its exact inverse. Pure and DOM-free; it owns no selection,
 * clipboard or receipt, and every caller that wants the same readable format
 * shares it.
 *
 * Grammar (closed): one bullet line per item, `- ` after two spaces per level of
 * depth (a lone `-` for an empty passage); further lines of the item sit under
 * the bullet's text, two spaces deeper than the bullet; a blank line stays
 * blank; items are separated by one line break. Each line is escaped by
 * `escape.ts`, so no passage can start a structure of its own, and the text
 * comes back exactly, whatever line breaks and control characters it held.
 */
export type OutlineItem = Readonly<{ depth: number; text: string }>;

const INDENT = "  ";
const BULLET = "- ";

export function renderOutlineMarkdown(items: readonly OutlineItem[]): string {
  return items.map(({ depth, text }) => {
    const indent = INDENT.repeat(Math.max(0, depth));
    const continuation = `${indent}${" ".repeat(BULLET.length)}`;
    const lines = escapePassage(text);
    if (lines.length === 0) return `${indent}-`;
    return lines
      .map((line, index) => index === 0
        ? `${indent}${BULLET}${line}`
        : line.length === 0 ? line : `${continuation}${line}`)
      .join("\n");
  }).join("\n");
}

/**
 * The inverse of `renderOutlineMarkdown`, or `null` for anything it did not
 * produce. It reads the grammar above, unescapes each line, and then checks by
 * rendering the result again, so a body that merely resembles the grammar is
 * refused rather than guessed at.
 */
export function parseOutlineMarkdown(markdown: string): OutlineItem[] | null {
  if (markdown.length === 0) return null;
  const items: { depth: number; lines: string[] }[] = [];
  for (const line of markdown.split("\n")) {
    const bullet = /^( *)-(?: ([^\n]*))?$/u.exec(line);
    if (bullet !== null) {
      const spaces = bullet[1]!.length;
      if (spaces % INDENT.length !== 0) return null;
      items.push({ depth: spaces / INDENT.length, lines: bullet[2] === undefined ? [] : [bullet[2]] });
      continue;
    }
    const current = items.at(-1);
    if (current === undefined) return null;
    if (line.length === 0) {
      current.lines.push("");
      continue;
    }
    const prefix = " ".repeat(current.depth * INDENT.length + BULLET.length);
    if (!line.startsWith(prefix)) return null;
    current.lines.push(line.slice(prefix.length));
  }
  const parsed: OutlineItem[] = [];
  for (const { depth, lines } of items) {
    const text = unescapePassage(lines);
    if (text === null) return null;
    parsed.push({ depth, text });
  }
  return renderOutlineMarkdown(parsed) === markdown ? parsed : null;
}
