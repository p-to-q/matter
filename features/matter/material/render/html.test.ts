import { describe, expect, it } from "vitest";
import { escapeHtmlText, renderOutlineHtml, renderParagraphsHtml } from "./html";

const META = '<meta charset="utf-8">';

describe("renderOutlineHtml", () => {
  it("is a nested list with the same relative nesting, after the charset declaration", () => {
    expect(renderOutlineHtml([
      { depth: 0, text: "A" }, { depth: 1, text: "B" }, { depth: 0, text: "C" },
    ])).toBe(`${META}<ul><li>A<ul><li>B</li></ul></li><li>C</li></ul>`);
    expect(renderOutlineHtml([])).toBe("");
  });

  it("escapes with HTML rules only, <br> for breaks, no-break spaces for runs, no backslashes", () => {
    const out = renderOutlineHtml([{ depth: 0, text: '- <a href="x">&</a>\n  two  spaces\\' }]);
    expect(out).toBe(`${META}<ul><li>- &lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;<br> &nbsp;two &nbsp;spaces\\</li></ul>`);
  });

  it("carries no attributes, styles or ids beyond the charset meta, whatever the text", () => {
    const hostile = [
      "<img src=x onerror=alert(1)>", "<div style=\"x\">", "[x]: /url", "&#x41; &amp;", "\\<", "a\nb\r\nc", "  two  ", "", "</li></ul>",
    ];
    const out = renderOutlineHtml(hostile.map((text, index) => ({ depth: index % 3, text })));
    expect(out.startsWith(META)).toBe(true);
    const body = out.slice(META.length);
    expect(body).not.toMatch(/<[a-z]+ /u);
    expect(body).not.toMatch(/<[^>]*(?:style|id|class)=/u);
    expect(body.replace(/<\/?(?:ul|li|br)>/gu, "")).not.toMatch(/[<>]/u);
  });

  it("never emits an unbalanced list, even for depths that skip a level", () => {
    const out = renderOutlineHtml([
      { depth: 0, text: "a" }, { depth: 3, text: "b" }, { depth: 0, text: "c" }, { depth: 2, text: "d" },
    ]);
    expect(out.match(/<ul>/gu)?.length).toBe(out.match(/<\/ul>/gu)?.length);
    expect(out.match(/<li>/gu)?.length).toBe(out.match(/<\/li>/gu)?.length);
    expect(out).not.toContain("<ul><ul>");
    expect(out).not.toContain("<li></li>");
  });
});

describe("renderParagraphsHtml and escapeHtmlText", () => {
  it("is one paragraph per passage", () => {
    expect(renderParagraphsHtml(["a", "b"])).toBe(`${META}<p>a</p><p>b</p>`);
    expect(renderParagraphsHtml([])).toBe("");
  });

  it("escapes & < > and quotes only, turns every line break into <br>, keeps the first space of a run", () => {
    expect(escapeHtmlText("<b>&\"'</b>")).toBe("&lt;b&gt;&amp;&quot;'&lt;/b&gt;");
    expect(escapeHtmlText("a\nb\r\nc\rd")).toBe("a<br>b<br>c<br>d");
    expect(escapeHtmlText("a  b   c d")).toBe("a &nbsp;b &nbsp;&nbsp;c d");
    expect(escapeHtmlText("   indented")).toBe(" &nbsp;&nbsp;indented");
    expect(escapeHtmlText("- x [y] # z 1. w")).toBe("- x [y] # z 1. w");
  });
});
