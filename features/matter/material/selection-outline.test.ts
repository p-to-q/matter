import { describe, expect, it } from "vitest";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { serializeMaterialSelection } from "./material-files";
import { renderSelectionOutline } from "./selection-outline";

const META = '<meta charset="utf-8">';
const TREE_ID = "tree_outline";
const ROOT_ID = documentRootId(TREE_ID);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

function node(id: string, parentId: string, children: string[], text: string): ThoughtNode {
  return {
    id, parentId, children, text,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

/** Siblings under the document root, in the order given. */
function flat(texts: readonly string[]): ThoughtTree {
  const ids = texts.map((_, index) => `n${index}`);
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: TREE_ID,
    rootId: ROOT_ID,
    revision: 1,
    nodes: {
      [ROOT_ID]: { ...node(ROOT_ID, "", ids, ""), parentId: null, role: "document-root" },
      ...Object.fromEntries(texts.map((text, index) => [ids[index]!, node(ids[index]!, ROOT_ID, [], text)])),
    },
  };
}

/** a(b(c(d), e), f(g)), h — a deep chain with side branches. */
function nested(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: TREE_ID,
    rootId: ROOT_ID,
    revision: 1,
    nodes: {
      [ROOT_ID]: { ...node(ROOT_ID, "", ["a", "h"], ""), parentId: null, role: "document-root" },
      a: node("a", ROOT_ID, ["b", "f"], "A"),
      b: node("b", "a", ["c", "e"], "B"),
      c: node("c", "b", ["d"], "C"),
      d: node("d", "c", [], "D"),
      e: node("e", "b", [], "E"),
      f: node("f", "a", ["g"], "F"),
      g: node("g", "f", [], "G"),
      h: node("h", ROOT_ID, [], "H"),
    },
  };
}

function text(tree: ThoughtTree, ids: readonly string[]): string {
  const result = serializeMaterialSelection(tree, new Set(ids));
  if (!result.ok) throw new Error(result.error);
  return result.text;
}

function html(tree: ThoughtTree, ids: readonly string[]): string {
  const result = serializeMaterialSelection(tree, new Set(ids));
  if (!result.ok) throw new Error(result.error);
  return result.html;
}

const CORPUS: readonly (readonly string[])[] = [
  ["one"],
  ["one", "two"],
  ["one", "two", "three"],
  ["第一段，不必立刻证明效率。", "第二段：慢一点也不会失去位置。"],
  ["emoji 🌱 and a ZWJ family 👨‍👩‍👧 stay whole", "🇯🇵 flag", "ñ ü é"],
  ["line one\nline two", "second\nthird\nfourth"],
  ["crlf one\r\ncrlf two", "bare cr\rnext"],
  ["trailing newline\n", "\nleading newline"],
  ["", "after an empty one"],
  [" ", "   ", "\t"],
  ["\n\n", "x"],
  ["x".repeat(2000)],
  ["界".repeat(1000), "a".repeat(2000), "😀".repeat(1000)],
  ["  leading spaces kept", "trailing spaces kept  "],
  ["- looks like a bullet", "1. looks like a number", "# looks like a heading"],
  ["<b>markup stays text</b> & ampersand [link](x)", "\"quoted\" 'single'"],
  ["ends with a double line\n\n", "next"],
  [`a${LS}separator`, `b${PS}paragraph`],
  ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"],
  ["mixed 中文 English\nمرحبا", "日本語のテキスト\r\nです"],
];

describe("an unrelated selection stays the literal join, unescaped", () => {
  it.each(CORPUS.map((texts, index) => [index, texts] as const))("corpus case %i is byte-identical", (_index, texts) => {
    const tree = flat(texts);
    const ids = texts.map((_, index) => `n${index}`);
    expect(text(tree, ids)).toBe(texts.join("\n\n"));
    // Selecting in a different order changes nothing either.
    expect(text(tree, [...ids].reverse())).toBe(texts.join("\n\n"));
    expect(renderSelectionOutline(texts.map((entry) => ({ text: entry, depth: 0 }))).text).toBe(texts.join("\n\n"));
  });

  it("is the join for cousins and a selected passage with no selected ancestor", () => {
    const tree = nested();
    expect(text(tree, ["d", "e", "g", "h"])).toBe("D\n\nE\n\nG\n\nH");
    expect(text(tree, ["c"])).toBe("C");
  });

  it("is one paragraph per passage for rich editors, so a lone passage never pastes as a bullet", () => {
    expect(html(flat(["one", "two"]), ["n0", "n1"])).toBe(`${META}<p>one</p><p>two</p>`);
    expect(html(flat(["only"]), ["n0"])).toBe(`${META}<p>only</p>`);
  });
});

describe("a selection that contains its own ancestors is a Markdown list", () => {
  it("bullets every passage, two spaces per level of relative depth, one per line", () => {
    expect(text(nested(), ["a", "b", "c", "d", "e", "f", "g", "h"])).toBe(
      ["- A", "  - B", "    - C", "      - D", "    - E", "  - F", "    - G", "- H"].join("\n"),
    );
  });

  it("makes the whole copy a list as soon as any passage contains another, unrelated ones included", () => {
    expect(text(nested(), ["a", "b", "h"])).toBe("- A\n  - B\n- H");
  });

  it("counts selected ancestors only, so a skipped parent leaves no gap", () => {
    const tree = nested();
    expect(text(tree, ["a", "d"])).toBe("- A\n  - D");
    expect(text(tree, ["a", "b", "d"])).toBe("- A\n  - B\n    - D");
    expect(text(tree, ["a", "g"])).toBe("- A\n  - G");
    // A grandchild alone is depth zero: no structure, so it is plain text.
    expect(text(tree, ["d"])).toBe("D");
  });

  it("follows authored order whatever order the ids were selected in", () => {
    expect(text(nested(), ["g", "e", "b", "a"])).toBe("- A\n  - B\n    - E\n  - G");
  });

  it("aligns continuation lines under the bullet's text and carries line breaks exactly", () => {
    const tree = flat(["top\nline", "kid\r\nsecond\r\n\r\nafter blank\rcr"]);
    const nodes = { ...tree.nodes };
    nodes["n0"] = { ...nodes["n0"]!, children: ["n1"] };
    nodes["n1"] = { ...nodes["n1"]!, parentId: "n0" };
    nodes[ROOT_ID] = { ...nodes[ROOT_ID]!, children: ["n0"] };
    expect(text({ ...tree, nodes }, ["n0", "n1"])).toBe(
      "- top\n  line\n  - kid&#xD;\n    second&#xD;\n    &#xD;\n    after blank&#xD;cr",
    );
  });

  it("carries CJK and emoji passages without touching their characters", () => {
    const base = nested();
    const nodes = { ...base.nodes, a: { ...base.nodes["a"]!, text: "根 🌱" }, b: { ...base.nodes["b"]!, text: "枝\n叶 👨‍👩‍👧" } };
    expect(text({ ...base, nodes }, ["a", "b"])).toBe("- 根 🌱\n  - 枝\n    叶 👨‍👩‍👧");
  });

  it("adds no ids, digests or headers, only the bullets", () => {
    const out = text(nested(), ["a", "b", "c"]);
    expect(out).toBe("- A\n  - B\n    - C");
    expect(out).not.toMatch(/n[0-9]|sha|id:|^#/u);
  });

  it("bullets an empty passage without a trailing space and keeps blank lines blank", () => {
    const base = nested();
    const nodes = { ...base.nodes, b: { ...base.nodes["b"]!, text: "" }, c: { ...base.nodes["c"]!, text: "x\n\ny" } };
    expect(text({ ...base, nodes }, ["a", "b", "c"])).toBe("- A\n  -\n    - x\n\n      y");
  });

  it("outlines held-aside rows like any other: selection is explicit, not working context", () => {
    expect(text(nested(), ["b", "c"])).toBe("- B\n  - C");
  });

  it("makes a passage that looks like Markdown inert inside the list, and leaves the literal join alone", () => {
    const base = nested();
    const nodes = { ...base.nodes, b: { ...base.nodes["b"]!, text: "- not a bullet\n```\n1. x\n# h" } };
    expect(text({ ...base, nodes }, ["a", "b"])).toBe("- A\n  - \\- not a bullet\n    \\```\n    1\\. x\n    \\# h");
    expect(text({ ...base, nodes }, ["b"])).toBe("- not a bullet\n```\n1. x\n# h");
  });
});

describe("the rich-text form of a nested selection", () => {
  it("nests, closes, and re-opens at the right levels", () => {
    expect(html(nested(), ["a", "b", "c", "d", "e", "f", "g", "h"])).toBe(
      `${META}<ul><li>A<ul><li>B<ul><li>C<ul><li>D</li></ul></li><li>E</li></ul></li><li>F<ul><li>G</li></ul></li></ul></li><li>H</li></ul>`,
    );
    expect(html(nested(), ["a", "d"])).toBe(`${META}<ul><li>A<ul><li>D</li></ul></li></ul>`);
  });

  it("is empty for no rows", () => {
    expect(renderSelectionOutline([])).toEqual({ text: "", html: "" });
  });
});
