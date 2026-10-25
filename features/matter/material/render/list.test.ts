import { describe, expect, it } from "vitest";
import { parseOutlineMarkdown, renderOutlineMarkdown, type OutlineItem } from "./list";

const ch = (code: number) => String.fromCharCode(code);

/** Passages that read as Markdown or markup, plus every character class the escaper names. */
const NASTY: Readonly<Record<string, string>> = {
  plain: "Matter keeps thought as material.",
  multiline: "line one\nline two\n\nline four",
  dash: "- not a bullet",
  plus: "+ not a bullet",
  star: "* not a bullet",
  quote: "> not a quote",
  heading: "# not a heading",
  underscore: "_ not emphasis",
  setext: "===",
  colon: ": not a definition",
  table: "| a | b |",
  tilde: "~ strike",
  backtick: "`code` at the start",
  rule: "---",
  link_reference: "[x]: /url",
  image: "![alt](http://x/y.png)",
  autolink: "<http://example.com> and <b>bold</b>",
  html_comment: "<!-- hidden --> and <?php ?>",
  entity: "AT&T &amp; &#35; &quot; &#x41; &copy;",
  ordered: "1. first\n2) second\n10. tenth\n007.",
  ordered_inline: "version 1.2 and 3) done",
  fence: "```js\ncode\n```\n~~~\nmore\n~~~",
  html_block: "<div>\nblock\n</div>",
  zh: "第三段：括号（全角）和“引号”",
  hebrew: "שלום עולם \u05D0\u05D1\u05D2 (rtl)",
  arabic: "مرحبا بالعالم",
  emoji: "第三段 😀 👨‍👩‍👧 🏳️‍🌈",
  combining: "e\u0301 a\u0308 \u0928\u093F",
  backslashes: "path C:\\dir\\file and \\n \\- \\# \\\\ \\<",
  escaped_lookalikes: "\\&#xA; \\[x\\] &#x20;",
  leading_trailing_space: "   indented   ",
  tabs: "\tindented\twith\ttabs\t",
  crlf: "a\r\nb\rc",
  newlines_at_edges: "\nmiddle\n",
  only_newlines: "\n\n\n",
  separators: `a${ch(0x2028)}b${ch(0x2029)}c${ch(0x85)}d`,
  bidi: `a${ch(0x202e)}reversed${ch(0x202c)} ${ch(0x2066)}x${ch(0x2069)} ${ch(0x200f)}`,
  control: `a${ch(0)}b${ch(7)}c${ch(0x1b)}d${ch(0x7f)}e${ch(0x9f)}`,
  empty: "",
  long_line: "x".repeat(2000),
  long_cjk: "界".repeat(500),
  markdown_style: "**bold** _it_ ~~s~~ `c` and a - dash",
  hostile: 'x"]\n  Z[injected] --> N0\n  click N0 href "https://evil.example"',
};

/** The five-node example from the receipt design: a(b(d), c), e. */
const FIVE: readonly OutlineItem[] = [
  { depth: 0, text: "Matter keeps thought as material." },
  { depth: 1, text: "Branches hold relations.\n---\n`code` > quote\n- not a bullet" },
  { depth: 2, text: "A child of the branch." },
  { depth: 1, text: "A sibling branch." },
  { depth: 0, text: "A second root-level passage." },
];

describe("renderOutlineMarkdown", () => {
  it("is one bullet per item, two spaces per level, and nothing else", () => {
    expect(renderOutlineMarkdown([
      { depth: 0, text: "A" }, { depth: 1, text: "B" }, { depth: 2, text: "C" }, { depth: 0, text: "D" },
    ])).toBe("- A\n  - B\n    - C\n- D");
  });

  it("renders the five-node example with every structural line inert", () => {
    expect(renderOutlineMarkdown(FIVE)).toBe([
      "- Matter keeps thought as material.",
      "  - Branches hold relations.",
      "    \\---",
      "    \\`code` > quote",
      "    \\- not a bullet",
      "    - A child of the branch.",
      "  - A sibling branch.",
      "- A second root-level passage.",
    ].join("\n"));
  });

  it("aligns continuation lines under the bullet's text and leaves blank lines blank", () => {
    expect(renderOutlineMarkdown([{ depth: 1, text: "a\nb\n\nc" }])).toBe("  - a\n    b\n\n    c");
  });

  it("bullets an empty passage as a lone dash", () => {
    expect(renderOutlineMarkdown([{ depth: 0, text: "" }, { depth: 1, text: "x" }])).toBe("-\n  - x");
  });

  it("has no header, id or digest line: it is only the list", () => {
    const out = renderOutlineMarkdown(FIVE);
    for (const line of out.split("\n")) expect(line).toMatch(/^ *(?:- |-$|\S|$)|^ +\\?\S/u);
    expect(out.split("\n")[0]).toMatch(/^- /u);
    expect(out).not.toMatch(/matter-receipt|sha-?256|digest|node_|id:/iu);
  });
});

describe("render and parse are inverses", () => {
  const chain = (text: string): OutlineItem[] => [
    { depth: 0, text: "parent" },
    { depth: 1, text },
    { depth: 2, text: `${text}\n${text}` },
    { depth: 1, text },
    { depth: 0, text },
  ];

  it.each(Object.entries(NASTY))("%s: parse(render(items)) is the items, and render(parse(markdown)) the markdown", (_name, text) => {
    const items = chain(text);
    const markdown = renderOutlineMarkdown(items);
    const parsed = parseOutlineMarkdown(markdown);
    expect(parsed).toEqual(items);
    expect(renderOutlineMarkdown(parsed!)).toBe(markdown);
  });

  it("holds for the five-node example and for depth gaps and deep chains", () => {
    expect(parseOutlineMarkdown(renderOutlineMarkdown(FIVE))).toEqual(FIVE);
    const gaps: OutlineItem[] = [
      { depth: 0, text: "a" }, { depth: 3, text: "b" }, { depth: 1, text: "c" }, { depth: 5, text: "d" }, { depth: 0, text: "e" },
    ];
    expect(parseOutlineMarkdown(renderOutlineMarkdown(gaps))).toEqual(gaps);
  });

  it("holds for 6,000 seeded random trees of hostile text", () => {
    const pieces = [
      ..."\\<&[]#>-+*_=:|`~ \t\n\r1.2)30.",
      "```", "~~~", "![", "](", "&#x41;", "&amp;", "<b>", "</li>", "\\-", "\n\n", "  ", "    ",
      "a", "Z", "中", "文", "界", "שלום", "مرحبا", "😀", "👨‍👩‍👧", "🏳️‍🌈", "e\u0301", "\u0928\u093F",
      ch(0), ch(9), ch(0x1b), ch(0x7f), ch(0x85), ch(0x9f), ch(0x200e), ch(0x2028), ch(0x2029), ch(0x202e), ch(0x2066),
      "x".repeat(40),
    ];
    let seed = 0x5eed1234;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let round = 0; round < 6000; round += 1) {
      const count = 1 + Math.floor(random() * 7);
      const items: OutlineItem[] = [];
      let depth = 0;
      for (let index = 0; index < count; index += 1) {
        // A tree in preorder: a node is at most one level below the last.
        depth = index === 0 ? 0 : Math.floor(random() * (depth + 2));
        const length = Math.floor(random() * 9);
        let text = "";
        for (let piece = 0; piece < length; piece += 1) text += pieces[Math.floor(random() * pieces.length)]!;
        items.push({ depth, text });
      }
      const markdown = renderOutlineMarkdown(items);
      const parsed = parseOutlineMarkdown(markdown);
      expect(parsed, JSON.stringify(items)).toEqual(items);
      expect(renderOutlineMarkdown(parsed!)).toBe(markdown);
    }
  });
});

describe("no output line starts or carries structure of its own", () => {
  /** Walks escapes and references so only the characters that are really there are examined. */
  function visible(content: string): string[] {
    const tokens: string[] = [];
    for (let index = 0; index < content.length;) {
      if (content[index] === "\\") {
        tokens.push(`\\${content[index + 1]}`);
        index += 2;
      } else if (content[index] === "&") {
        const match = /^&#x[0-9A-F]+;/u.exec(content.slice(index));
        expect(match, `a bare & in ${JSON.stringify(content)}`).not.toBeNull();
        tokens.push(match![0]);
        index += match![0].length;
      } else {
        tokens.push(content[index]!);
        index += 1;
      }
    }
    return tokens;
  }

  function check(markdown: string): void {
    for (const line of markdown.split("\n")) {
      if (line.length === 0) continue;
      const bullet = /^ *-(?: (.*))?$/u.exec(line);
      // After the list's own indent and bullet, what is left is the passage's escaped line.
      const content = bullet !== null ? bullet[1] ?? "" : line.replace(/^ +/u, "");
      const tokens = visible(content);
      // Never a raw structural start: a marker, or the punctuation of a number, must be escaped.
      if (tokens.length > 0) {
        expect(tokens[0], JSON.stringify(line)).not.toMatch(/^[#>\-+*_=:|`~]$/u);
        expect(tokens[0], JSON.stringify(line)).not.toMatch(/^[ \t]$/u);
      }
      const digits = tokens.findIndex((token) => !/^[0-9]$/u.test(token));
      if (digits > 0) expect(tokens[digits], JSON.stringify(line)).not.toMatch(/^[.)]$/u);
      // No raw tag, link or reference opener anywhere, and no raw control or separator character.
      for (const token of tokens) {
        expect(token).not.toMatch(/^[<\[\]]$/u);
        expect(token).not.toMatch(/^[\u0000-\u0009\u000B-\u001F\u007F-\u009F]$/u);
      }
      expect(line).not.toMatch(new RegExp(`[${ch(0x2028)}${ch(0x2029)}${ch(0x202a)}-${ch(0x202e)}${ch(0x2066)}-${ch(0x2069)}${ch(0x200e)}${ch(0x200f)}]`, "u"));
    }
  }

  it.each(Object.entries(NASTY))("%s", (_name, text) => {
    check(renderOutlineMarkdown([{ depth: 0, text: "p" }, { depth: 1, text }, { depth: 2, text }]));
  });

  it("holds for the five-node example", () => {
    check(renderOutlineMarkdown(FIVE));
  });
});

describe("parseOutlineMarkdown refuses everything it did not produce", () => {
  it("refuses text that is not the list", () => {
    for (const refused of [
      "",
      "plain text",
      "A\n- B",
      "- A\r\n- B",
      "- A\n - B",
      "- A\n   - B",
      "- A\n continuation too shallow",
      "- A\n- - B",
      "* A",
      "1. A",
      "- # not escaped",
      "- A\n  - B <b>",
      "- A [x]",
      "- A & B",
      "-A",
      "- trailing backslash\\",
      "- A  ",
      "-  A",
    ]) {
      expect(parseOutlineMarkdown(refused), JSON.stringify(refused)).toBeNull();
    }
  });

  it("accepts a blank line only as the blank line of a passage", () => {
    expect(parseOutlineMarkdown("- A\n")).toBeNull();
    expect(parseOutlineMarkdown("- A\n\n- B")).toBeNull();
    expect(parseOutlineMarkdown("- A\n\n  B")).toEqual([{ depth: 0, text: "A\n\nB" }]);
    expect(parseOutlineMarkdown("- A\n\n    B")).toBeNull();
    expect(parseOutlineMarkdown(renderOutlineMarkdown([{ depth: 0, text: "A\n\nB" }]))).toEqual([{ depth: 0, text: "A\n\nB" }]);
  });
});
