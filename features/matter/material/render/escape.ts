/**
 * Makes one line of a passage inert in Markdown, and gives it back exactly.
 * The escaping is for structure and injection, not for style: an author's own
 * emphasis and code spans stay as written, but no text can become a tag, an
 * entity, a link, an image, a link-reference definition or a block.
 *
 * Every backslash in the output is an escape marker, which is what makes the
 * inverse exact: a literal backslash is always written `\\`, and a numeric
 * character reference can only be one the escaper wrote, because a literal `&`
 * is always written `\&`.
 */

const BACKSLASH = "\\";
/** Characters that start something when they begin a line. */
const LINE_START = new Set([..."#>-+*_=:|`~"]);
/** Always escaped, wherever they stand. */
const ALWAYS = new Set([BACKSLASH, "<", "&", "[", "]"]);
/**
 * Control characters (C0 and C1 except the newline that separates lines), NEL,
 * the Unicode line and paragraph separators, and the bidirectional controls
 * that can reorder what a reader sees.
 */
const ENCODED = new RegExp(
  "[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u200E\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]",
  "u",
);
const HEX_REFERENCE = /^&#x([0-9A-F]+);/u;

function reference(character: string): string {
  return `&#x${character.codePointAt(0)!.toString(16).toUpperCase()};`;
}

/**
 * One line (no newline in it). A leading or trailing space or tab, and every
 * control or separator character, is a numeric reference; a line-start marker
 * or an ordered-list number's punctuation gets a backslash.
 */
export function escapeLine(line: string): string {
  const characters = Array.from(line);
  let lead = 0;
  while (lead < characters.length && /[ \t]/u.test(characters[lead]!)) lead += 1;
  let trail = characters.length;
  while (trail > 0 && /[ \t]/u.test(characters[trail - 1]!)) trail -= 1;
  let digits = 0;
  while (digits < characters.length && /[0-9]/u.test(characters[digits]!)) digits += 1;

  let out = "";
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    if (index < lead || index >= trail || ENCODED.test(character)) {
      out += reference(character);
    } else if (ALWAYS.has(character)) {
      out += `${BACKSLASH}${character}`;
    } else if (index === 0 && LINE_START.has(character)) {
      out += `${BACKSLASH}${character}`;
    } else if (digits > 0 && index === digits && (character === "." || character === ")")) {
      out += `${BACKSLASH}${character}`;
    } else {
      out += character;
    }
  }
  return out;
}

/** The exact inverse of `escapeLine`, or `null` for text it could not have written. */
export function unescapeLine(escaped: string): string | null {
  let out = "";
  for (let index = 0; index < escaped.length;) {
    const character = escaped[index]!;
    if (character === BACKSLASH) {
      const next = escaped[index + 1];
      if (next === undefined) return null;
      out += next;
      index += 2;
    } else if (character === "&") {
      const match = HEX_REFERENCE.exec(escaped.slice(index));
      if (match === null) return null;
      const code = Number.parseInt(match[1]!, 16);
      if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
      out += String.fromCodePoint(code);
      index += match[0].length;
    } else if (character === "<" || character === "[" || character === "]") {
      return null;
    } else {
      out += character;
      index += 1;
    }
  }
  return out;
}

/**
 * The lines of one passage, escaped. A newline at the very start or end of the
 * passage would be lost as a blank line, so it is carried as `&#xA;` on the
 * first or last line; an empty passage has no lines.
 */
export function escapePassage(text: string): string[] {
  if (text === "") return [];
  if (text === "\n") return ["&#xA;"];
  const lines = text.split("\n");
  const lead = lines.length > 1 && lines[0] === "";
  if (lead) lines.shift();
  const trail = lines.length > 1 && lines[lines.length - 1] === "";
  if (trail) lines.pop();
  const escaped = lines.map(escapeLine);
  if (lead) escaped[0] = `&#xA;${escaped[0]}`;
  if (trail) escaped[escaped.length - 1] = `${escaped[escaped.length - 1]}&#xA;`;
  return escaped;
}

/** The exact inverse of `escapePassage`. */
export function unescapePassage(lines: readonly string[]): string | null {
  const parts: string[] = [];
  for (const line of lines) {
    const text = unescapeLine(line);
    if (text === null) return null;
    parts.push(text);
  }
  return parts.join("\n");
}
