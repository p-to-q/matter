import { describe, expect, it } from "vitest";
import { escapeLine, escapePassage, unescapeLine, unescapePassage } from "./escape";

const ch = (code: number) => String.fromCharCode(code);

describe("escapeLine: always", () => {
  it("escapes backslash, <, &, [ and ] wherever they stand", () => {
    expect(escapeLine("a\\b")).toBe("a\\\\b");
    expect(escapeLine("a < b")).toBe("a \\< b");
    expect(escapeLine("AT&T &amp; &#35;")).toBe("AT\\&T \\&amp; \\&#35;");
    expect(escapeLine("[x]: /url ![i](y) [l](z)")).toBe("\\[x\\]: /url !\\[i\\](y) \\[l\\](z)");
  });

  it("leaves emphasis, code spans, quotes and ordinary punctuation as the author wrote them", () => {
    expect(escapeLine("a **b** _c_ `d` > e # f ~g~ - h | i = j")).toBe("a **b** _c_ `d` > e # f ~g~ - h | i = j");
    expect(escapeLine("He said \"hi\" and it's fine; (ok) {ok}")).toBe("He said \"hi\" and it's fine; (ok) {ok}");
  });
});

describe("escapeLine: the start of a line", () => {
  it.each([..."#>-+*_=:|`~"])("backslash-escapes %s", (marker) => {
    expect(escapeLine(`${marker} x`)).toBe(`\\${marker} x`);
    expect(escapeLine(`${marker}${marker}${marker}`)).toBe(`\\${marker}${marker}${marker}`);
    // Only at the start.
    expect(escapeLine(`x ${marker} y`)).toBe(`x ${marker} y`);
  });

  it("escapes the punctuation of an ordered-list number, however many digits", () => {
    expect(escapeLine("1. x")).toBe("1\\. x");
    expect(escapeLine("23) x")).toBe("23\\) x");
    expect(escapeLine("007.")).toBe("007\\.");
    expect(escapeLine("1.2 apples")).toBe("1\\.2 apples");
    expect(escapeLine("version 1. x")).toBe("version 1. x");
    expect(escapeLine("1 . x")).toBe("1 . x");
    expect(escapeLine("1x. y")).toBe("1x. y");
  });
});

describe("escapeLine: numeric references", () => {
  it("encodes every leading and trailing space or tab, and nothing in the middle", () => {
    expect(escapeLine("  x  ")).toBe("&#x20;&#x20;x&#x20;&#x20;");
    expect(escapeLine("a b  c")).toBe("a b  c");
    expect(escapeLine("   ")).toBe("&#x20;&#x20;&#x20;");
    expect(escapeLine(`${ch(9)}x`)).toBe("&#x9;x");
    // A marker behind a leading space is no longer at the start of the line.
    expect(escapeLine(" - x")).toBe("&#x20;- x");
  });

  it("encodes control characters, NEL, the line and paragraph separators, and bidi controls", () => {
    for (const code of [0, 1, 8, 9, 11, 13, 27, 31, 0x7f, 0x80, 0x85, 0x9f, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069]) {
      const out = escapeLine(`a${ch(code)}b`);
      expect(out).toBe(`a&#x${code.toString(16).toUpperCase()};b`);
      expect(unescapeLine(out)).toBe(`a${ch(code)}b`);
    }
  });

  it("does not touch ordinary non-ASCII, combining marks, ZWJ sequences or right-to-left text", () => {
    expect(escapeLine("שלום")).toBe("שלום");
    expect(escapeLine("é 👨‍👩‍👧")).toBe("é 👨‍👩‍👧");
  });
});

describe("unescapeLine is the exact inverse, and refuses what escapeLine could not write", () => {
  it("returns the original line", () => {
    for (const line of [
      "", " ", "  x  ", "\\", "\\\\", "<", "&", "&#x41;", "\\&#x41;", "[]", "# h", "1. a", "1\\. a", "-", "- -", "a\tb",
      "x".repeat(300), "中文 😀 ‮ rtl", "&amp;", "\\<", "\\[",
    ]) {
      expect(unescapeLine(escapeLine(line)), JSON.stringify(line)).toBe(line);
    }
  });

  it("refuses an unescaped structural character, a dangling backslash, or a reference it would not write", () => {
    for (const refused of ["a < b", "[x]", "x]", "a &amp; b", "a & b", "trailing\\", "&#xZZ;", "&#x110000;", "&#xD800;", "&#x41"]) {
      expect(unescapeLine(refused), refused).toBeNull();
    }
  });
});

describe("escapePassage", () => {
  it("is no lines for an empty passage and one reference for a lone newline", () => {
    expect(escapePassage("")).toEqual([]);
    expect(escapePassage("\n")).toEqual(["&#xA;"]);
  });

  it("splits on newlines only and encodes every other line break", () => {
    expect(escapePassage("a\nb")).toEqual(["a", "b"]);
    expect(escapePassage("a\r\nb")).toEqual(["a&#xD;", "b"]);
    expect(escapePassage(`a${ch(0x2028)}b${ch(0x85)}c`)).toEqual(["a&#x2028;b&#x85;c"]);
  });

  it("carries a newline at the very start or end of the passage as a reference", () => {
    expect(escapePassage("\nx")).toEqual(["&#xA;x"]);
    expect(escapePassage("x\n")).toEqual(["x&#xA;"]);
    expect(escapePassage("\nx\n")).toEqual(["&#xA;x&#xA;"]);
    expect(escapePassage("\n\n")).toEqual(["&#xA;&#xA;"]);
    expect(escapePassage("x\n\n")).toEqual(["x", "&#xA;"]);
    expect(escapePassage("a\n\nb")).toEqual(["a", "", "b"]);
  });

  it.each(["", "\n", "\n\n", "\nx\n", "x\n\n", "\n\nx", "a\n\nb", "a\r\nb\rc\n", "  a\n  b  \n\t", "# a\n1. b\n- c\n```\n~~~"])(
    "round-trips %j",
    (text) => {
      expect(unescapePassage(escapePassage(text))).toBe(text);
    },
  );
});
