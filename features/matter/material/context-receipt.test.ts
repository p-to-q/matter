import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { isWellFormedUnicodeText } from "../tree/unicode-text";
import {
  MAX_CONTEXT_RECEIPT_BYTES,
  parseContextReceipt,
  renderContextReceipt,
} from "./context-receipt";
import {
  MATERIAL_PROJECTION_VERSION,
  projectMaterial,
  type MaterialAddress,
  type MaterialProjection,
  type MaterialProjectionLimits,
  type MaterialProjectionNode,
} from "./material-projection";
import { projectWorkingContext } from "./working-context";

const TREE_ID = "tree_golden";
const ROOT_ID = documentRootId(TREE_ID);
const ZERO_DIGEST = `digest: sha256-${"0".repeat(64)}`;

function node(
  id: string,
  parentId: string | null,
  children: string[],
  text: string,
  role?: "document-root",
): ThoughtNode {
  return {
    id,
    parentId,
    children,
    text,
    ...(role === undefined ? {} : { role }),
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

/** doc root → a(b, c), d(e); d is held aside in the working-tree fixture. */
const GOLDEN_TREE: ThoughtTree = {
  protocolVersion: PROTOCOL_VERSION,
  id: TREE_ID,
  rootId: ROOT_ID,
  revision: 7,
  nodes: {
    [ROOT_ID]: node(ROOT_ID, null, ["a", "d"], "", "document-root"),
    a: node("a", ROOT_ID, ["b", "c"], "Matter keeps thought as material."),
    b: node("b", "a", [], "Branches hold relations.\n---\n`code` > quote\n- not a bullet"),
    c: node("c", "a", [], "第三段 שלום 😀"),
    d: node("d", ROOT_ID, ["e"], "Held aside"),
    e: node("e", "d", [], "Secret child"),
  },
};

function viewOf(tree: ThoughtTree): { node: ThoughtNode; depth: number }[] {
  const view: { node: ThoughtNode; depth: number }[] = [];
  const visit = (nodeId: string, depth: number): void => {
    const current = tree.nodes[nodeId];
    if (current === undefined) return;
    const isRoot = current.role === "document-root";
    if (!isRoot) view.push({ node: current, depth });
    for (const childId of current.children) visit(childId, isRoot ? 0 : depth + 1);
  };
  if (tree.rootId !== null) visit(tree.rootId, 0);
  return view;
}

function workingAddress(tree: ThoughtTree, held: ReadonlySet<string> = new Set()): MaterialAddress {
  return { kind: "working-tree", view: viewOf(tree), activeNodeIds: projectWorkingContext(tree, held).activeNodeIds };
}

function range(nodeId: string, selectedText: string) {
  return { type: "segment-range" as const, nodeId, start: 0, end: selectedText.length, selectedText };
}

const GOLDEN_ADDRESSES: Record<"working-tree" | "lineage" | "selection", MaterialAddress> = {
  "working-tree": workingAddress(GOLDEN_TREE, new Set(["d"])),
  lineage: { kind: "lineage", focusNodeId: "c" },
  selection: { kind: "selection", selections: [range("b", "relations."), range("b", "`code`"), range("c", "第三段")] },
};

const GOLDEN: Record<"working-tree" | "lineage" | "selection", string> = {
  "working-tree": [
    "---",
    "matter-receipt: 1",
    "projection: material-projection/1",
    "tree: tree_golden",
    "revision: 7",
    "address: working-tree",
    "thoughts: 3",
    "clipped: false",
    "---",
    "",
    "- a",
    "  > Matter keeps thought as material.",
    "  - b",
    "    > Branches hold relations.",
    "    > ---",
    "    > `code` > quote",
    "    > - not a bullet",
    "  - c",
    "    > 第三段 שלום 😀",
    "",
    "```json",
    '{"nodes":[{"depth":0,"i":0,"id":"a","parent":null,"truncated":false},{"depth":1,"i":0,"id":"b","parent":"a","truncated":false},{"depth":1,"i":1,"id":"c","parent":"a","truncated":false}]}',
    "```",
    "digest: sha256-b8bb7e0de01bdffff3c73268c89a96da55e23997248be096aab2b9eb81cd2fc2",
    "",
  ].join("\n"),
  lineage: [
    "---",
    "matter-receipt: 1",
    "projection: material-projection/1",
    "tree: tree_golden",
    "revision: 7",
    "address: lineage",
    "thoughts: 2",
    "clipped: false",
    "---",
    "",
    "- a",
    "  > Matter keeps thought as material.",
    "  - c",
    "    > 第三段 שלום 😀",
    "",
    "```json",
    '{"nodes":[{"depth":0,"i":0,"id":"a","parent":null,"truncated":false},{"depth":1,"i":0,"id":"c","parent":"a","truncated":false}]}',
    "```",
    "digest: sha256-bfa09b85cec44d33ec49888513a732927afbc52ed78948d26625adfb2198fa86",
    "",
  ].join("\n"),
  selection: [
    "---",
    "matter-receipt: 1",
    "projection: material-projection/1",
    "tree: tree_golden",
    "revision: 7",
    "address: selection",
    "thoughts: 3",
    "clipped: false",
    "---",
    "",
    "- b",
    "  > relations.",
    "- b",
    "  > `code`",
    "- c",
    "  > 第三段",
    "",
    "```json",
    '{"nodes":[{"depth":0,"i":0,"id":"b","parent":null,"truncated":false},{"depth":1,"i":0,"id":"b","parent":null,"truncated":false},{"depth":2,"i":1,"id":"c","parent":null,"truncated":false}]}',
    "```",
    "digest: sha256-b054ca7a413dc2e94c4a98c101ea28acedf54a3e6fe4be978719f08fcf164587",
    "",
  ].join("\n"),
};

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Everything before the digest line, which the digest covers. */
function bodyOf(receipt: string): string {
  return receipt.slice(0, receipt.lastIndexOf("\ndigest: sha256-") + 1);
}

function resign(body: string): string {
  return `${body}digest: sha256-${sha(body)}\n`;
}

/** Edits the body lines and signs the result, so the structural check is what rejects it. */
function forge(receipt: string, edit: (lines: string[]) => string[]): string {
  const lines = bodyOf(receipt).split("\n");
  lines.pop();
  return resign(`${edit(lines).join("\n")}\n`);
}

function swap(from: string, to: string): (lines: string[]) => string[] {
  return (lines) => {
    const index = lines.indexOf(from);
    if (index < 0) throw new Error(`fixture line not found: ${from}`);
    return lines.map((line, at) => (at === index ? to : line));
  };
}

function machineEdit(edit: (nodes: Record<string, unknown>[]) => Record<string, unknown>[]): (lines: string[]) => string[] {
  return (lines) => lines.map((line) => {
    if (!line.startsWith('{"nodes":')) return line;
    const parsed = JSON.parse(line) as { nodes: Record<string, unknown>[] };
    return JSON.stringify({ nodes: edit(parsed.nodes) });
  });
}

function projectionOf(address: keyof typeof GOLDEN_ADDRESSES): MaterialProjection {
  return projectMaterial(GOLDEN_TREE, GOLDEN_ADDRESSES[address]);
}

function pnode(
  nodeId: string,
  parentId: string | null,
  text: string,
  extra: Partial<MaterialProjectionNode> = {},
): MaterialProjectionNode {
  return { nodeId, parentId, siblingIndex: 0, depth: 0, text, truncated: false, ...extra };
}

function manual(nodes: readonly MaterialProjectionNode[], extra: Partial<MaterialProjection> = {}): MaterialProjection {
  const clipped = nodes.some(({ truncated }) => truncated);
  return {
    version: MATERIAL_PROJECTION_VERSION,
    treeId: "tree_manual",
    revision: 1,
    address: "lineage",
    nodes,
    thoughtCount: nodes.length,
    clipped,
    ...extra,
  };
}

async function roundTrip(projection: MaterialProjection): Promise<void> {
  const receipt = await renderContextReceipt(projection);
  const parsed = await parseContextReceipt(receipt);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.projection).toEqual(projection);
  expect(await renderContextReceipt(projection)).toBe(receipt);
}

describe("context receipt goldens", () => {
  for (const address of Object.keys(GOLDEN) as (keyof typeof GOLDEN)[]) {
    it(`renders the ${address} address byte for byte`, async () => {
      const projection = projectionOf(address);
      expect(await renderContextReceipt(projection)).toBe(GOLDEN[address]);
      const parsed = await parseContextReceipt(GOLDEN[address]);
      expect(parsed).toEqual({ ok: true, projection });
    });

    it(`signs the ${address} body with an independent SHA-256`, () => {
      const receipt = GOLDEN[address];
      expect(receipt.endsWith(`digest: sha256-${sha(bodyOf(receipt))}\n`)).toBe(true);
    });
  }

  it("keeps the reference doc's worked example identical to the working-tree golden", () => {
    const doc = readFileSync(new URL("../../../docs/reference/context-receipt.md", import.meta.url), "utf8");
    expect(doc).toContain(GOLDEN["working-tree"]);
  });

  it("puts the front matter keys in their fixed order and nothing else", async () => {
    const lines = (await renderContextReceipt(projectionOf("lineage"))).split("\n");
    expect(lines.slice(0, 9).map((line) => line.split(":")[0])).toEqual([
      "---", "matter-receipt", "projection", "tree", "revision", "address", "thoughts", "clipped", "---",
    ]);
  });

  it("is deterministic and free of locale, clock and host formatting", async () => {
    const projection = projectionOf("working-tree");
    expect(await renderContextReceipt(projection)).toBe(await renderContextReceipt(projection));
    expect(await renderContextReceipt(projection)).not.toContain("\r");
    const forbidden = new RegExp(`${"to"}Locale|${"Intl"}\\.|${"Date"}\\.|new ${"Date"}|${"process"}\\.|${"navigator"}`, "u");
    for (const file of ["context-receipt.ts", "material-projection.ts"]) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).not.toMatch(forbidden);
    }
    expect(readFileSync(new URL("./context-receipt.test.ts", import.meta.url), "utf8")).not.toMatch(
      new RegExp(`\\.${"to"}Locale[A-Z]\\w*\\(`, "u"),
    );
  });
});

describe("context receipt text safety", () => {
  const FORGED = [
    "x",
    "---",
    "matter-receipt: 9",
    "revision: 0",
    "- fake",
    "  > fake",
    "```json",
    '{"nodes":[]}',
    "```",
    ZERO_DIGEST,
    "",
  ].join("\n");

  it("cannot let node text forge front matter, a bullet, the machine block or the digest", async () => {
    const projection = manual([pnode("only", null, FORGED)]);
    const receipt = await renderContextReceipt(projection);
    const lines = receipt.split("\n");
    expect(lines.filter((line) => line === "---")).toHaveLength(2);
    expect(lines.filter((line) => line.startsWith("`"))).toHaveLength(2);
    expect(lines.filter((line) => line.startsWith("digest:"))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith("matter-receipt"))).toHaveLength(1);
    expect(lines.filter((line) => /^\s*- /u.test(line))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('{"nodes"'))).toHaveLength(1);
    const parsed = await parseContextReceipt(receipt);
    expect(parsed).toEqual({ ok: true, projection });
  });

  it("round-trips hostile and international text exactly", async () => {
    const texts = [
      "a\r\nb\rc\n\nd\n",
      "---\n---",
      "> > nested\n>\n- - item\n  - sub",
      "<script>alert(1)</script> &amp; <!-- --> matter-receipt: 1",
      "`one` ``two`` ```three``` ````four````  `````five`````",
      "שלום עולם مرحبا بالعالم אבג",
      "你好，世界。日本語のテキスト、한국어 텍스트",
      "👨‍👩‍👧‍👦 🏳️‍🌈 é ạ̈ ​  ",
      "[…]",
      "  leading and trailing  ",
      "digest: sha256-" + "a".repeat(64),
    ];
    await roundTrip(manual(texts.map((text, index) => pnode(`t${index}`, null, text, { siblingIndex: index, depth: index }))));
  });

  it("sizes the fence beyond every backtick run in the text", async () => {
    const receipt = await renderContextReceipt(manual([pnode("a", null, "x ````` y")]));
    expect(receipt).toContain("\n``````json\n");
    expect((await parseContextReceipt(receipt)).ok).toBe(true);
    const plain = await renderContextReceipt(manual([pnode("a", null, "no ticks")]));
    expect(plain).toContain("\n```json\n");
  });

  it("marks truncation with a final marker line and trusts the machine block", async () => {
    const truncated = manual([pnode("a", null, "cut here", { truncated: true })], { thoughtCount: 1, clipped: true });
    const receipt = await renderContextReceipt(truncated);
    expect(receipt).toContain("  > cut here\n  > […]\n");
    await roundTrip(truncated);
    // A node whose own last line is the marker is not mistaken for a truncated one, nor the reverse.
    await roundTrip(manual([pnode("a", null, "ends\n[…]")]));
    await roundTrip(manual([pnode("a", null, "ends\n[…]", { truncated: true })], { clipped: true }));
    await roundTrip(manual([pnode("a", null, "", { truncated: true })], { clipped: true }));
    const unmarked = receipt.replace("  > […]\n", "");
    expect((await parseContextReceipt(forge(unmarked, (lines) => lines))).ok).toBe(false);
  });

  it("truncates at a surrogate pair boundary and still renders and parses", async () => {
    const tree: ThoughtTree = {
      ...GOLDEN_TREE,
      nodes: {
        ...GOLDEN_TREE.nodes,
        c: node("c", "a", [], "ab😀😀cd"),
      },
    };
    for (const maxNodeCodePoints of [2, 3, 4, 5]) {
      const projection = projectMaterial(tree, { kind: "lineage", focusNodeId: "c" }, { maxNodeCodePoints });
      for (const { text } of projection.nodes) expect(isWellFormedUnicodeText(text)).toBe(true);
      await roundTrip(projection);
    }
    const cut = projectMaterial(tree, { kind: "lineage", focusNodeId: "c" }, { maxNodeCodePoints: 3 });
    expect(cut.nodes.at(-1)).toMatchObject({ text: "ab😀", truncated: true });
  });

  it("refuses to render a projection that is not well formed", async () => {
    const lone = manual([pnode("a", null, "bad \ud800 surrogate")]);
    await expect(renderContextReceipt(lone)).rejects.toThrow(RangeError);
    await expect(renderContextReceipt(manual([pnode("has space", null, "x")]))).rejects.toThrow(RangeError);
    await expect(renderContextReceipt(manual([pnode("a", "ghost", "x")]))).rejects.toThrow(RangeError);
    await expect(renderContextReceipt(manual([pnode("a", null, "x")], { clipped: true }))).rejects.toThrow(RangeError);
    await expect(renderContextReceipt(manual([pnode("a", null, "x"), pnode("a", null, "y")]))).rejects.toThrow(RangeError);
  });
});

describe("context receipt rejection", () => {
  const WORKING = GOLDEN["working-tree"];

  const structural: readonly [string, string, (lines: string[]) => string[], string?][] = [
    ["receipt version", WORKING, swap("matter-receipt: 1", "matter-receipt: 2"), "unsupported-version"],
    ["projection version", WORKING, swap("projection: material-projection/1", "projection: material-projection/2"), "unsupported-version"],
    ["swapped key order", WORKING, (lines) => [lines[0], lines[1], lines[2], lines[4], lines[3], ...lines.slice(5)] as string[], "malformed"],
    ["extra front matter key", WORKING, (lines) => [...lines.slice(0, 8), "title: nope", ...lines.slice(8)], "malformed"],
    ["missing front matter key", WORKING, (lines) => lines.filter((line) => !line.startsWith("thoughts:")), "malformed"],
    ["unknown address", WORKING, swap("address: working-tree", "address: graph"), "malformed"],
    ["non-canonical revision", WORKING, swap("revision: 7", "revision: 07"), "malformed"],
    ["negative revision", WORKING, swap("revision: 7", "revision: -7"), "malformed"],
    ["unsafe revision", WORKING, swap("revision: 7", "revision: 99999999999999999"), "malformed"],
    ["bad tree id", WORKING, swap("tree: tree_golden", "tree: tree golden"), "malformed"],
    ["empty tree id", WORKING, swap("tree: tree_golden", "tree: "), "malformed"],
    ["clipped not boolean", WORKING, swap("clipped: false", "clipped: False"), "malformed"],
    ["thoughts above carried while not clipped", WORKING, swap("thoughts: 3", "thoughts: 9"), "inconsistent"],
    ["thoughts below carried", WORKING, swap("thoughts: 3", "thoughts: 2"), "inconsistent"],
    ["clipped without clipping", WORKING, swap("clipped: false", "clipped: true"), "inconsistent"],
    ["no blank after front matter", WORKING, (lines) => lines.filter((_, index) => index !== 9), "malformed"],
    ["missing blank before the machine block", WORKING, (lines) => lines.filter((line, index) => !(line === "" && index > 9)), "malformed"],
    ["extra blank in the outline", WORKING, (lines) => [...lines.slice(0, 12), "", ...lines.slice(12)], "inconsistent"],
    ["duplicate id outside a selection", WORKING, (lines) =>
      machineEdit((nodes) => nodes.map((entry, index) => (index === 2 ? { ...entry, id: "b" } : entry)))(
        lines.map((line) => (line === "  - c" ? "  - b" : line))), "inconsistent"],
    ["parent that is not carried", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 1 ? { ...entry, parent: "zz" } : entry))), "inconsistent"],
    ["parent carried only later", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 0 ? { ...entry, parent: "c" } : entry))), "inconsistent"],
    ["self parent", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 0 ? { ...entry, parent: "a" } : entry))), "inconsistent"],
    ["negative sibling index", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 1 ? { ...entry, i: -1 } : entry))), "malformed"],
    ["fractional depth", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 1 ? { ...entry, depth: 1.5 } : entry))), "malformed"],
    ["string depth", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 1 ? { ...entry, depth: "1" } : entry))), "malformed"],
    ["extra machine key", WORKING, machineEdit((nodes) => nodes.map((entry) => ({ ...entry, text: "smuggled" }))), "malformed"],
    ["machine key order", WORKING, (lines) => lines.map((line) => (line.startsWith('{"nodes"') ? line.replaceAll('"depth":0,"i":0', '"i":0,"depth":0') : line)), "malformed"],
    ["pretty-printed machine block", WORKING, (lines) => lines.map((line) => (line.startsWith('{"nodes"') ? JSON.stringify(JSON.parse(line), null, 1).replaceAll("\n", " ") : line)), "malformed"],
    ["machine block not json", WORKING, (lines) => lines.map((line) => (line.startsWith('{"nodes"') ? "{nodes}" : line)), "malformed"],
    ["machine block with more nodes than the outline", WORKING, machineEdit((nodes) => [...nodes, { depth: 0, i: 2, id: "z", parent: null, truncated: false }]), "inconsistent"],
    ["machine block with fewer nodes than the outline", WORKING, machineEdit((nodes) => nodes.slice(0, 2)), "inconsistent"],
    ["machine truncated without a marker", WORKING, machineEdit((nodes) => nodes.map((entry, index) => (index === 2 ? { ...entry, truncated: true } : entry))), "inconsistent"],
    ["outline indentation disagrees with the relation", WORKING, swap("  - b", "- b"), "inconsistent"],
    ["outline over-indented", WORKING, swap("  - c", "    - c"), "inconsistent"],
    ["outline id disagrees with the machine block", WORKING, swap("  - b", "  - q"), "inconsistent"],
    ["quote without its space", WORKING, swap("  > Matter keeps thought as material.", "  >Matter keeps thought as material."), "inconsistent"],
    ["bare text in the outline", WORKING, swap("  > Matter keeps thought as material.", "  Matter keeps thought as material."), "inconsistent"],
    ["node without a quote", WORKING, (lines) => lines.filter((line) => line !== "    > 第三段 שלום 😀"), "inconsistent"],
    ["extra bullet in the outline", WORKING, (lines) => [...lines.slice(0, 18), "  - zz", ...lines.slice(18)], "inconsistent"],
    ["fence longer than required", WORKING, (lines) => lines.map((line) => (line.startsWith("```") ? `\`${line}` : line)), "malformed"],
    ["fence not json", WORKING, swap("```json", "```yaml"), "malformed"],
    ["fence mismatch", WORKING, (lines) => { const at = lines.lastIndexOf("```"); return lines.map((line, index) => (index === at ? "````" : line)); }, "malformed"],
    ["a second digest line", WORKING, (lines) => [...lines, ZERO_DIGEST], "malformed"],
  ];

  it.each(structural)("rejects %s", async (_name, source, edit, reason) => {
    const parsed = await parseContextReceipt(forge(source, edit));
    expect(parsed.ok).toBe(false);
    if (reason !== undefined && !parsed.ok) expect(parsed.reason).toBe(reason);
  });

  it("rejects a second spelling of the same projection", async () => {
    const receipt = await renderContextReceipt(manual([pnode("a", null, "x\n\ny")]));
    expect(receipt).toContain("\n  >\n");
    expect((await parseContextReceipt(forge(receipt, swap("  >", "  > ")))).ok).toBe(false);
    expect((await parseContextReceipt(forge(receipt, (lines) => [...lines.slice(0, 9), "", ...lines.slice(9)]))).ok).toBe(false);
    expect((await parseContextReceipt(forge(receipt, (lines) => lines.map((line) => (line.startsWith("```") ? `${line}` + "`" : line))))).ok).toBe(false);
  });

  it("rejects a truncated node whose last quote line is not the marker", async () => {
    const receipt = await renderContextReceipt(manual([pnode("a", null, "one\ntwo", { truncated: true })]));
    expect((await parseContextReceipt(receipt)).ok).toBe(true);
    expect(await parseContextReceipt(forge(receipt, swap("  > […]", "  > two")))).toEqual({ ok: false, reason: "inconsistent" });
  });

  it("rejects thoughts below the carried count even when clipped is claimed", async () => {
    const edit = (lines: string[]) => swap("clipped: false", "clipped: true")(swap("thoughts: 3", "thoughts: 2")(lines));
    expect(await parseContextReceipt(forge(WORKING, edit))).toEqual({ ok: false, reason: "inconsistent" });
  });

  it("rejects lines left over after the last node", async () => {
    const blank = WORKING.split("\n").indexOf("```json") - 1;
    for (const extra of ["- zz", "  > extra", "stray"]) {
      expect((await parseContextReceipt(forge(WORKING, (lines) => [...lines.slice(0, blank), extra, ...lines.slice(blank)]))).ok).toBe(false);
    }
  });

  it("rejects a signed receipt that holds a lone surrogate", async () => {
    const receipt = await renderContextReceipt(manual([pnode("a", null, "pair 😀 here")]));
    const forged = forge(receipt, (lines) => lines.map((line) => line.replace("\ud83d\ude00", "\ud83d")));
    expect((await parseContextReceipt(forged)).ok).toBe(false);
  });

  it("rejects a fence too short for the text it holds", async () => {
    const receipt = await renderContextReceipt(manual([pnode("a", null, "x ``` y")]));
    const shortened = forge(receipt, (lines) => lines.map((line) => (line.startsWith("````") ? line.slice(1) : line)));
    expect(await parseContextReceipt(shortened)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a tampered byte of text, id or digest", async () => {
    const flip = (receipt: string, from: string, to: string): string => {
      const at = receipt.indexOf(from);
      expect(at).toBeGreaterThan(0);
      return `${receipt.slice(0, at)}${to}${receipt.slice(at + from.length)}`;
    };
    expect(await parseContextReceipt(flip(WORKING, "Matter keeps", "Natter keeps"))).toEqual({ ok: false, reason: "digest-mismatch" });
    expect(await parseContextReceipt(flip(WORKING, "- not a bullet", "- not a bullat"))).toEqual({ ok: false, reason: "digest-mismatch" });
    expect(await parseContextReceipt(flip(WORKING, "sha256-b8", "sha256-b9"))).toEqual({ ok: false, reason: "digest-mismatch" });
    expect(await parseContextReceipt(flip(WORKING, "tree_golden", "tree_golder"))).toEqual({ ok: false, reason: "digest-mismatch" });
    expect(await parseContextReceipt(flip(WORKING, "revision: 7", "revision: 8"))).toEqual({ ok: false, reason: "digest-mismatch" });
    // An id changed everywhere it appears still breaks the digest.
    const renamed = WORKING.replace("- a\n", "- q\n").replace('"id":"a","parent":null', '"id":"q","parent":null')
      .replaceAll('"parent":"a"', '"parent":"q"');
    expect(await parseContextReceipt(renamed)).toEqual({ ok: false, reason: "digest-mismatch" });
    // One id changed in one place breaks the cross-check before the digest is reached.
    expect((await parseContextReceipt(flip(WORKING, "- a\n", "- q\n"))).ok).toBe(false);
    expect((await parseContextReceipt(flip(WORKING, '"id":"a"', '"id":"q"'))).ok).toBe(false);
  });

  it("rejects a digest that is not lowercase hex of the exact length", async () => {
    const digest = WORKING.slice(WORKING.lastIndexOf("sha256-") + 7, -1);
    for (const bad of [digest.toUpperCase(), digest.slice(1), `${digest}0`, `${digest.slice(0, 63)}g`, ""]) {
      expect((await parseContextReceipt(WORKING.replace(digest, bad))).ok).toBe(false);
    }
  });

  it("rejects trailing garbage, a missing final newline and altered line endings", async () => {
    expect((await parseContextReceipt(`${WORKING}trailing\n`)).ok).toBe(false);
    expect((await parseContextReceipt(`${WORKING}\n`)).ok).toBe(false);
    expect((await parseContextReceipt(WORKING.slice(0, -1))).ok).toBe(false);
    expect((await parseContextReceipt(WORKING.replaceAll("\n", "\r\n"))).ok).toBe(false);
    expect((await parseContextReceipt(`\n${WORKING}`)).ok).toBe(false);
    expect((await parseContextReceipt(`${WORKING}${WORKING}`)).ok).toBe(false);
  });

  it("rejects input that is not a string, is empty, is oversized or holds a lone surrogate", async () => {
    for (const input of [undefined, null, 7, {}, "", "\n", "---\n---\n"]) {
      expect((await parseContextReceipt(input)).ok).toBe(false);
    }
    expect(await parseContextReceipt("a".repeat(MAX_CONTEXT_RECEIPT_BYTES + 1))).toEqual({ ok: false, reason: "too-large" });
    expect((await parseContextReceipt(WORKING.replace("Matter", "Mat\ud800ter"))).ok).toBe(false);
  });

  it("enforces the tree's text and node bounds", async () => {
    await roundTrip(manual([pnode("a", null, "x".repeat(2_000))]));
    await expect(renderContextReceipt(manual([pnode("a", null, "x".repeat(2_001))]))).rejects.toThrow(RangeError);
    const receipt = await renderContextReceipt(manual([pnode("a", null, "x".repeat(2_000))]));
    expect((await parseContextReceipt(forge(receipt, (lines) => lines.map((line) => line.replace("x".repeat(2_000), "x".repeat(2_001)))))).ok).toBe(false);
    const many = Array.from({ length: 2_001 }, (_, index) => pnode(`n${index}`, null, "x"));
    await expect(renderContextReceipt(manual(many))).rejects.toThrow(RangeError);
    const machine = `{"nodes":[${many.map((entry) => `{"depth":0,"i":0,"id":"${entry.nodeId}","parent":null,"truncated":false}`).join(",")}]}`;
    const outline = many.flatMap((entry) => [`- ${entry.nodeId}`, "  > x"]);
    const forged = resign(["---", "matter-receipt: 1", "projection: material-projection/1", "tree: t", "revision: 0", "address: lineage", "thoughts: 2001", "clipped: false", "---", "", ...outline, "", "```json", machine, "```", ""].join("\n"));
    expect(await parseContextReceipt(forged)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses to render beyond the same size bound", async () => {
    const heavy = "a" + "\n".repeat(1_999);
    const nodes = Array.from({ length: 2_000 }, (_, index) => pnode(`n${index}`, null, heavy));
    await expect(renderContextReceipt(manual(nodes))).rejects.toThrow(RangeError);
  });
});

describe("context receipt round trip", () => {
  it("round-trips an empty projection and each golden address", async () => {
    await roundTrip(manual([]));
    await roundTrip(manual([], { address: "selection" }));
    for (const address of Object.keys(GOLDEN_ADDRESSES) as (keyof typeof GOLDEN_ADDRESSES)[]) {
      await roundTrip(projectionOf(address));
    }
    await roundTrip(projectMaterial(GOLDEN_TREE, { kind: "lineage", focusNodeId: "missing" }));
  });

  it("round-trips a clipped projection that dropped nodes", async () => {
    const projection = projectMaterial(GOLDEN_TREE, workingAddress(GOLDEN_TREE), { maxNodes: 2 });
    expect(projection).toMatchObject({ clipped: true, thoughtCount: 5 });
    await roundTrip(projection);
  });

  it("round-trips a 1000-node projection of a real tree", async () => {
    const tree = bigTree(1_000);
    const projection = projectMaterial(tree, workingAddress(tree));
    expect(projection.nodes).toHaveLength(1_000);
    expect(projection.nodes.some(({ parentId }) => parentId !== null)).toBe(true);
    await roundTrip(projection);
  });

  it("round-trips seeded random trees over every address, with and without limits", async () => {
    const random = prng(0x5eed1234);
    for (let round = 0; round < 250; round += 1) {
      const tree = randomTree(random);
      const held = new Set(Object.keys(tree.nodes).filter((id) => id !== ROOT_ID && random() < 0.15));
      const ids = Object.keys(tree.nodes).filter((id) => id !== ROOT_ID);
      const limits: MaterialProjectionLimits = random() < 0.4
        ? { maxNodes: 1 + Math.floor(random() * 12), maxNodeCodePoints: Math.floor(random() * 30), maxTotalCodePoints: Math.floor(random() * 200) }
        : {};
      const addresses: MaterialAddress[] = [
        workingAddress(tree, held),
        { kind: "lineage", focusNodeId: ids[Math.floor(random() * ids.length)] ?? "none" },
        {
          kind: "selection",
          selections: Array.from({ length: Math.floor(random() * 6) }, () => {
            const id = ids[Math.floor(random() * ids.length)] ?? "none";
            const points = Array.from(tree.nodes[id]?.text ?? "");
            const start = Math.floor(random() * (points.length + 1));
            const end = start + Math.floor(random() * (points.length - start + 1));
            return range(id, points.slice(start, end).join(""));
          }),
        },
      ];
      for (const address of addresses) {
        await roundTrip(projectMaterial(tree, address, limits));
      }
    }
  });
});

describe("context receipt privacy", () => {
  it("is identical whatever withheld material the tree holds", async () => {
    const without: ThoughtTree = {
      ...GOLDEN_TREE,
      nodes: {
        [ROOT_ID]: node(ROOT_ID, null, ["a"], "", "document-root"),
        a: GOLDEN_TREE.nodes.a as ThoughtNode,
        b: GOLDEN_TREE.nodes.b as ThoughtNode,
        c: GOLDEN_TREE.nodes.c as ThoughtNode,
      },
    };
    const more: ThoughtTree = {
      ...GOLDEN_TREE,
      nodes: {
        ...GOLDEN_TREE.nodes,
        [ROOT_ID]: node(ROOT_ID, null, ["x1", "x2", "a", "d"], "", "document-root"),
        x1: node("x1", ROOT_ID, [], "another withheld thought"),
        x2: node("x2", ROOT_ID, [], "and one more"),
      },
    };
    const reference = await renderContextReceipt(projectMaterial(GOLDEN_TREE, workingAddress(GOLDEN_TREE, new Set(["d"]))));
    expect(await renderContextReceipt(projectMaterial(without, workingAddress(without)))).toBe(reference);
    expect(await renderContextReceipt(projectMaterial(more, workingAddress(more, new Set(["d", "x1", "x2"]))))).toBe(reference);
    for (const secret of ["Held aside", "Secret child", "withheld", "- d", "- e", '"d"', '"e"']) {
      expect(reference).not.toContain(secret);
    }
  });
});

function bigTree(count: number): ThoughtTree {
  const nodes: Record<string, ThoughtNode> = { [ROOT_ID]: node(ROOT_ID, null, [], "", "document-root") };
  for (let index = 0; index < count; index += 1) {
    const id = `n${index}`;
    const parentId = index < 3 ? ROOT_ID : `n${Math.floor((index - 3) / 3)}`;
    nodes[id] = node(id, parentId, [], `passage ${index} — 内容 ${"x".repeat(index % 17)}`);
    (nodes[parentId] as ThoughtNode).children.push(id);
  }
  return { ...GOLDEN_TREE, id: "tree_big", rootId: ROOT_ID, nodes: { ...nodes } };
}

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const PIECES = [
  "plain words", "---", "> quoted", "- bullet", "`", "``", "```", "````", "`````", "``````",
  "<b>html</b>", "matter-receipt: 1", "digest: sha256-" + "f".repeat(64), "[…]", "{\"nodes\":[]}",
  "👨‍👩‍👧‍👦", "🏳️‍🌈", "😀", "é", "ạ̈", "שלום", "مرحبا بالعالم", "你好，世界。", "日本語", "한국어",
  "​", " ", "tab\there", "  padded  ",
];
const JOINERS = ["", " ", "\n", "\r\n", "\n\n", "\r", "\n> ", "\n- "];

function randomText(random: () => number): string {
  const count = 1 + Math.floor(random() * 6);
  let text = "x";
  for (let index = 0; index < count; index += 1) {
    text += JOINERS[Math.floor(random() * JOINERS.length)] ?? "";
    text += PIECES[Math.floor(random() * PIECES.length)] ?? "";
  }
  return text;
}

function randomTree(random: () => number): ThoughtTree {
  const nodes: Record<string, ThoughtNode> = { [ROOT_ID]: node(ROOT_ID, null, [], "", "document-root") };
  const ids: string[] = [ROOT_ID];
  const count = Math.floor(random() * 40);
  for (let index = 0; index < count; index += 1) {
    const id = `n${index}`;
    const parentId = ids[Math.floor(random() * ids.length)] ?? ROOT_ID;
    nodes[id] = node(id, parentId, [], randomText(random));
    (nodes[parentId] as ThoughtNode).children.push(id);
    ids.push(id);
  }
  return { ...GOLDEN_TREE, id: "tree_fuzz", rootId: ROOT_ID, revision: Math.floor(random() * 1_000), nodes };
}
