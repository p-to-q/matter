import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_NODES_PER_TREE, MAX_NODE_TEXT_CODE_UNITS, MAX_TREE_DEPTH } from "../tree/invariants";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { parseContextReceipt, renderContextReceipt } from "./context-receipt";
import {
  MAX_CONTEXT_RECEIPT_V2_BYTES,
  parseContextReceiptV2,
  parseVersionedContextReceipt,
  renderContextReceiptV2,
} from "./context-receipt-v2";
import { serializeMaterialSelection } from "./material-files";
import { MATERIAL_PROJECTION_VERSION, projectMaterial, type MaterialProjection, type MaterialProjectionNode } from "./material-projection";

function node(nodeId: string, parentId: string | null, text: string, extra: Partial<MaterialProjectionNode> = {}): MaterialProjectionNode {
  return { nodeId, parentId, text, depth: 0, siblingIndex: 0, truncated: false, ...extra };
}

function projection(nodes: readonly MaterialProjectionNode[] = [], extra: Partial<MaterialProjection> = {}): MaterialProjection {
  return {
    version: MATERIAL_PROJECTION_VERSION,
    treeId: "tree_receipt_v2",
    revision: 7,
    address: "working-tree",
    thoughtCount: nodes.length,
    clipped: nodes.some(({ truncated }) => truncated),
    nodes,
    ...extra,
  };
}

const SIMPLE = projection([
  node("a", null, "Alpha"),
  node("b", "a", "Beta", { depth: 1 }),
  node("c", "a", "Gamma", { depth: 1, siblingIndex: 1 }),
]);
const GOLDEN_BODY = [
  "---",
  "format: matter-receipt/2",
  "projection: material-projection/1",
  "tree: tree_receipt_v2",
  "revision: 7",
  "address: working-tree",
  "thoughts: 3",
  "clipped: false",
  "---",
  "",
  "- Alpha",
  "  - Beta",
  "  - Gamma",
  "",
  "```json",
  '{"nodes":[{"depth":0,"i":0,"id":"a","parent":null,"truncated":false},{"depth":1,"i":0,"id":"b","parent":"a","truncated":false},{"depth":1,"i":1,"id":"c","parent":"a","truncated":false}]}',
  "```",
  "",
].join("\n");

const sha = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");
const sign = (body: string) => `${body}digest: sha256-${sha(body)}\n`;

async function roundTrip(value: MaterialProjection) {
  const receipt = await renderContextReceiptV2(value);
  expect(await parseContextReceiptV2(receipt)).toEqual({ ok: true, projection: value });
  expect(await renderContextReceiptV2(value)).toBe(receipt);
  return receipt;
}

function editMachine(body: string, edit: (nodes: Record<string, unknown>[]) => Record<string, unknown>[]): string {
  return body.split("\n").map((line) => {
    if (!line.startsWith('{"nodes":')) return line;
    return JSON.stringify({ nodes: edit((JSON.parse(line) as { nodes: Record<string, unknown>[] }).nodes) });
  }).join("\n");
}

describe("Receipt v2 grammar and compatibility", () => {
  it("holds one fixed Markdown body and an independently computed exact UTF-8 SHA-256", async () => {
    expect(await renderContextReceiptV2(SIMPLE)).toBe(sign(GOLDEN_BODY));
    expect(await parseContextReceiptV2(sign(GOLDEN_BODY))).toEqual({ ok: true, projection: SIMPLE });
    const outline = GOLDEN_BODY.slice(GOLDEN_BODY.indexOf("- Alpha"), GOLDEN_BODY.indexOf("\n\n```json"));
    expect(outline).toBe("- Alpha\n  - Beta\n  - Gamma");
    for (const id of ["a", "b", "c"]) expect(outline).not.toContain(`id: ${id}`);
  });

  it("keeps v1 byte-compatible and verifies both versions only by an explicit discriminator", async () => {
    const v1 = await renderContextReceipt(SIMPLE);
    const v2 = await renderContextReceiptV2(SIMPLE);
    expect(await parseVersionedContextReceipt(v1)).toEqual({ ok: true, projection: SIMPLE });
    expect(await parseVersionedContextReceipt(v2)).toEqual({ ok: true, projection: SIMPLE });
    expect((await parseContextReceipt(v2)).ok).toBe(false);
    expect((await parseContextReceiptV2(v1)).ok).toBe(false);
    expect(await parseVersionedContextReceipt(v2.replace("matter-receipt/2", "matter-receipt/3")))
      .toEqual({ ok: false, reason: "unsupported-version" });
    expect(await parseVersionedContextReceipt(v1.replace("matter-receipt: 1", "matter-receipt: 2")))
      .toEqual({ ok: false, reason: "unsupported-version" });
  });

  it("keeps Copy's exact nested human bytes without IDs, while single Copy stays literal", async () => {
    const tree = fixture();
    const ids = new Set(["a", "b", "c"]);
    const copied = serializeMaterialSelection(tree, ids);
    expect(copied.ok).toBe(true);
    if (!copied.ok) throw new Error("fixture Copy failed");
    const value = projectMaterial(tree, { kind: "working-tree", view: view(tree), activeNodeIds: ids });
    const receipt = await roundTrip(value);
    expect(receipt).toContain(`\n\n${copied.text}\n\n`);
    expect(copied.html).toContain("<ul>");
    expect(copied.text).not.toContain("thought_");
    const single = serializeMaterialSelection(tree, new Set(["b"]));
    expect(single).toMatchObject({ ok: true, text: tree.nodes.b!.text });
    expect((await renderContextReceiptV2(projection([node("b", null, tree.nodes.b!.text)]))))
      .toContain("\n\n- Branch");
  });

  it("keeps structural indentation separate from positional selection depth", async () => {
    const value = projection([
      node("a", null, "first", { depth: 0 }),
      node("a", null, "second", { depth: 1 }),
      node("b", "a", "child", { depth: 2 }),
    ], { address: "selection" });
    const receipt = await roundTrip(value);
    expect(receipt).toContain("\n- first\n- second\n  - child\n");
    expect(receipt).toContain('{"depth":1,"i":0,"id":"a","parent":null');
  });

  it("refuses a closed-parent relation rather than showing a different human parent", async () => {
    const value = projection([
      node("a", null, "Alpha"),
      node("b", null, "Beta", { siblingIndex: 1 }),
      node("c", "a", "Gamma", { depth: 1 }),
    ], { address: "selection" });
    await expect(renderContextReceiptV2(value)).rejects.toThrow(RangeError);
    const misleading = editMachine(GOLDEN_BODY.replace("  - Beta", "- Beta"), (nodes) =>
      nodes.map((entry, index) => index === 1 ? { ...entry, parent: null } : entry));
    expect(await parseContextReceiptV2(sign(misleading))).toEqual({ ok: false, reason: "inconsistent" });

    const tree = fixture();
    const selection = projectMaterial(tree, { kind: "selection", selections: ["a", "hidden", "b"].map((nodeId) => ({
      type: "segment-range", nodeId, start: 0, end: tree.nodes[nodeId]!.text.length, selectedText: tree.nodes[nodeId]!.text,
    })) });
    expect(selection.nodes.map(({ nodeId, parentId }) => ({ nodeId, parentId }))).toEqual([
      { nodeId: "a", parentId: null }, { nodeId: "hidden", parentId: null }, { nodeId: "b", parentId: "a" },
    ]);
    await expect(renderContextReceiptV2(selection)).rejects.toThrow(RangeError);
  });

  it("preserves repeated ranges, omitted parents and an explicit repeated parent that reopens its branch", async () => {
    for (const nodes of [
      [node("a", null, "parent"), node("b", "a", "range one"), node("b", "a", "range two", { depth: 1 })],
      [node("b", null, "before parent"), node("a", null, "parent"), node("b", "a", "after parent", { depth: 2 })],
      [node("a", null, "first parent"), node("b", "a", "child"), node("a", null, "parent repeated", { depth: 2 }), node("c", "a", "next child", { depth: 3, siblingIndex: 1 })],
      [node("a", null, "parent omitted"), node("b", null, "different omitted parent", { siblingIndex: 1 })],
    ]) await roundTrip(projection(nodes, { address: "selection" }));
  });

  it("represents empty and clipped projections without invented markers or lost text", async () => {
    await roundTrip(projection());
    await roundTrip(projection([], { thoughtCount: 4, clipped: true }));
    for (const text of ["", "[…]", "ends\n[…]"]) {
      const value = projection([node("a", null, text, { truncated: true })]);
      const receipt = await roundTrip(value);
      expect(receipt).toContain('"truncated":true');
      if (text === "") expect(receipt).toContain("\n\n-\n\n");
    }
  });
});

describe("Receipt v2 inert text and determinism", () => {
  it.each(["\r", "\r\n", "\u0085", "\u2028", "\u2029"])("round-trips the valid material separator %j without normalization", async (separator) => {
    const value = projection([node("a", null, `first${separator}- forged${separator}`)]);
    const receipt = await roundTrip(value);
    expect(receipt).not.toMatch(/[\r\u0085\u2028\u2029]/u);
    expect(receipt).toContain("&#x");
  });

  it("round-trips all control/markup/edge whitespace classes through the one Copy grammar", async () => {
    const texts = [
      "x\n---\nformat: matter-receipt/9\n```json\n{\"nodes\":[]}\n```\ndigest: sha256-" + "0".repeat(64),
      "\n\nleading and trailing\n\n",
      "<script>danger</script> [link](https://example.test) ![image](x) &amp; &#xA; \\",
      "\u0000\u0007\u000b\u001b\u007f\u009f\u200e\u202e\u202c\u2066\u2069",
      " 	word  \n  more\t ",
      "שלום مرحبا 中文 日本語 👨‍👩‍👧‍👦 é ạ̈",
      "- bullet\n# header\n1. ordered\n> quote\n~~~fence\n```ticks",
      "\\&#xA; \\[x\\] &#x20;",
      "\n", "\n\n\n", "", "  ",
    ];
    await roundTrip(projection(texts.map((text, index) => node(`n${index}`, null, text, { siblingIndex: index }))));
  });

  it("has no forged header, machine block or digest even when material holds those exact lines", async () => {
    const receipt = await roundTrip(projection([node("a", null, "---\n```json\n{\"nodes\":[]}\n```\ndigest: sha256-fake\nformat: matter-receipt/9")]));
    const lines = receipt.split("\n");
    expect(lines.filter((line) => line === "---")).toHaveLength(2);
    expect(lines.filter((line) => line.startsWith("format:"))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith("digest:"))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('{"nodes":'))).toHaveLength(1);
    expect(receipt).toContain("\n````json\n");
  });

  it("does not depend on timestamps, object insertion order, held siblings or missing image bytes", async () => {
    const tree = fixture();
    const active = new Set(["a", "b", "c"]);
    const original = await renderContextReceiptV2(projectMaterial(tree, { kind: "working-tree", view: view(tree), activeNodeIds: active }));
    const later = structuredClone(tree);
    later.nodes = Object.fromEntries(Object.entries(later.nodes).reverse());
    for (const passage of Object.values(later.nodes)) {
      passage.createdAt = "2030-02-01T23:31:00.000Z";
      passage.updatedAt = "2030-02-01T23:31:00.000Z";
    }
    later.nodes.hidden!.text = "a different withheld value";
    later.nodes[ROOT]!.children.unshift("other");
    later.nodes.other = thought("other", ROOT, [], "another withheld node");
    later.nodes.b!.image = { mediaType: "image/png", width: 256, height: 256, byteLength: 99, contentHash: "f".repeat(64) };
    const changed = await renderContextReceiptV2(projectMaterial(later, { kind: "working-tree", view: view(later), activeNodeIds: active }));
    expect(changed).toBe(original);
  });

  it("round-trips bounded generated cases and every address without accepting hidden parent IDs", async () => {
    const tree = fixture();
    const pieces = ["\r", "\n", "\u2028", "&", "<b>", "[x]", "\\", "😀", "界", "\u202e", "`", " "];
    let seed = 0x515eed;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let index = 0; index < 100; index += 1) {
      tree.nodes.b!.text = "word" + Array.from({ length: 30 }, () => pieces[Math.floor(random() * pieces.length)]!).join("");
      for (const address of [
        { kind: "lineage" as const, focusNodeId: "b" },
        { kind: "selection" as const, selections: [{ type: "segment-range" as const, nodeId: "b", start: 0, end: tree.nodes.b!.text.length, selectedText: tree.nodes.b!.text }] },
        { kind: "working-tree" as const, view: view(tree), activeNodeIds: new Set(["b", "c"]) },
      ]) {
        const value = projectMaterial(tree, address, { maxNodeCodePoints: 17, maxTotalCodePoints: 30 });
        const receipt = await roundTrip(value);
        expect(receipt).not.toContain("hidden");
      }
    }
  });
});

describe("Receipt v2 closed grammar refusals", () => {
  const cases: readonly [string, (body: string) => string, string?][] = [
    ["version", (body) => body.replace("matter-receipt/2", "matter-receipt/99"), "unsupported-version"],
    ["projection version", (body) => body.replace("material-projection/1", "material-projection/99"), "unsupported-version"],
    ["key order", (body) => body.replace("tree: tree_receipt_v2\nrevision: 7", "revision: 7\ntree: tree_receipt_v2"), "malformed"],
    ["extra header", (body) => body.replace("clipped: false\n", "clipped: false\ntime: 99\n"), "malformed"],
    ["unknown address", (body) => body.replace("working-tree", "all-hidden"), "malformed"],
    ["noncanonical count", (body) => body.replace("revision: 7", "revision: 07"), "malformed"],
    ["unsafe count", (body) => body.replace("revision: 7", "revision: 9007199254740992"), "malformed"],
    ["empty ID", (body) => body.replace("tree: tree_receipt_v2", "tree: "), "malformed"],
    ["too few thoughts", (body) => body.replace("thoughts: 3", "thoughts: 2"), "inconsistent"],
    ["concealed clipping", (body) => body.replace("thoughts: 3", "thoughts: 4"), "inconsistent"],
    ["invented clipping", (body) => body.replace("clipped: false", "clipped: true"), "inconsistent"],
    ["body missing item", (body) => body.replace("  - Gamma\n", ""), "inconsistent"],
    ["body extra item", (body) => body.replace("  - Gamma\n", "  - Gamma\n  - Fourth\n"), "inconsistent"],
    ["body wrong indent", (body) => body.replace("  - Beta", "- Beta"), "inconsistent"],
    ["raw markup", (body) => body.replace("- Alpha", "- <script>Alpha</script>"), "inconsistent"],
    ["alternate entity", (body) => body.replace("- Alpha", "- &#x41;lpha"), "inconsistent"],
    ["alternate escaping", (body) => body.replace("- Alpha", "- \\Alpha"), "inconsistent"],
    ["foreign break", (body) => body.replace("- Alpha", "- Al\rpha"), "inconsistent"],
    ["extra machine key", (body) => editMachine(body, (nodes) => nodes.map((entry) => ({ ...entry, text: "smuggled" }))), "malformed"],
    ["unavailable parent", (body) => editMachine(body, (nodes) => nodes.map((entry, index) => index === 1 ? { ...entry, parent: "hidden" } : entry)), "inconsistent"],
    ["late parent", (body) => editMachine(body, (nodes) => nodes.map((entry, index) => index === 0 ? { ...entry, parent: "c" } : entry)), "inconsistent"],
    ["self parent", (body) => editMachine(body, (nodes) => nodes.map((entry, index) => index === 0 ? { ...entry, parent: "a" } : entry)), "inconsistent"],
    ["duplicate ID", (body) => editMachine(body, (nodes) => nodes.map((entry, index) => index === 2 ? { ...entry, id: "b" } : entry)), "inconsistent"],
    ["negative index", (body) => editMachine(body, (nodes) => nodes.map((entry) => ({ ...entry, i: -1 }))), "malformed"],
    ["huge depth", (body) => editMachine(body, (nodes) => nodes.map((entry) => ({ ...entry, depth: Number.MAX_SAFE_INTEGER }))), "inconsistent"],
    ["machine ordering", (body) => body.replace('"depth":0,"i":0', '"i":0,"depth":0'), "malformed"],
    ["machine whitespace", (body) => body.replace('{"nodes":[', '{"nodes": ['), "malformed"],
    ["fence mismatch", (body) => body.replace("\n```\n", "\n````\n"), "malformed"],
    ["oversized fence", (body) => body.replaceAll("```", "````"), "malformed"],
    ["missing blank", (body) => body.replace("\n\n```json", "\n```json"), "malformed"],
  ];
  it.each(cases)("rejects a correctly signed %s defect", async (_name, edit, reason) => {
    const parsed = await parseContextReceiptV2(sign(edit(GOLDEN_BODY)));
    expect(parsed.ok).toBe(false);
    if (reason !== undefined) expect(parsed).toEqual({ ok: false, reason });
  });

  it("detects content, identity, revision and checksum corruption without re-signing", async () => {
    const receipt = sign(GOLDEN_BODY);
    for (const [from, to] of [["Alpha", "Elpha"], ["tree_receipt_v2", "tree_receipt_v3"], ["revision: 7", "revision: 8"], ["sha256-", "sha256-f"]]) {
      expect((await parseContextReceiptV2(receipt.replace(from!, to!))).ok).toBe(false);
    }
    expect(await parseContextReceiptV2(receipt.replace("Alpha", "Elpha"))).toEqual({ ok: false, reason: "digest-mismatch" });
  });

  it("rejects trailing data, noncanonical line endings, bad Unicode and non-text inputs", async () => {
    const receipt = sign(GOLDEN_BODY);
    for (const value of [null, undefined, 2, {}, "", receipt + "\n", receipt + "extra\n", receipt.slice(0, -1), receipt.replaceAll("\n", "\r\n"), receipt.replace("Alpha", "\ud800")]) {
      expect((await parseContextReceiptV2(value)).ok).toBe(false);
    }
  });

  it("rejects duplicate selection identities with conflicting ranks or relationship cycles", async () => {
    for (const nodes of [
      [node("a", null, "first"), node("a", null, "second", { siblingIndex: 1 })],
      [node("a", null, "first"), node("b", "a", "second"), node("a", "b", "third")],
      [node("a", null, "first"), node("b", null, "second"), node("c", "a", "third"), node("c", "b", "fourth")],
    ]) await expect(renderContextReceiptV2(projection(nodes, { address: "selection" }))).rejects.toThrow(RangeError);
  });

  it("refuses text/node/structural bounds before rendering and input bytes before parsing", async () => {
    await roundTrip(projection([node("a", null, "x".repeat(MAX_NODE_TEXT_CODE_UNITS))]));
    await expect(renderContextReceiptV2(projection([node("a", null, "x".repeat(MAX_NODE_TEXT_CODE_UNITS + 1))]))).rejects.toThrow(RangeError);
    const many = Array.from({ length: MAX_NODES_PER_TREE + 1 }, (_, index) => node(`n${index}`, null, "x"));
    await expect(renderContextReceiptV2(projection(many))).rejects.toThrow(RangeError);
    const deep = Array.from({ length: MAX_TREE_DEPTH + 2 }, (_, index) => node(`n${index}`, index === 0 ? null : `n${index - 1}`, "x"));
    await expect(renderContextReceiptV2(projection(deep))).rejects.toThrow(RangeError);
    expect(await parseContextReceiptV2("a".repeat(MAX_CONTEXT_RECEIPT_V2_BYTES + 1))).toEqual({ ok: false, reason: "too-large" });
    expect(await parseContextReceiptV2("界".repeat(Math.floor(MAX_CONTEXT_RECEIPT_V2_BYTES / 3) + 1))).toEqual({ ok: false, reason: "too-large" });
  });

  it("bounds indentation expansion rather than allocating the complete worst-case body", async () => {
    const deep = Array.from({ length: MAX_TREE_DEPTH }, (_, index) => node(`n${index}`, index === 0 ? null : `n${index - 1}`, "x"));
    const heavy = "x" + "\nx".repeat(999);
    const leaves = Array.from({ length: MAX_NODES_PER_TREE - deep.length }, (_, index) => node(`leaf${index}`, `n${MAX_TREE_DEPTH - 1}`, heavy));
    await expect(renderContextReceiptV2(projection([...deep, ...leaves]))).rejects.toThrow(RangeError);
  });
});

const ROOT = documentRootId("tree_fixture_receipt2");
function thought(id: string, parentId: string | null, children: string[], text: string, role?: "document-root"): ThoughtNode {
  return { id, parentId, children, text, ...(role === undefined ? {} : { role }), createdAt: "2026-08-07T00:00:00.000Z", updatedAt: "2026-08-07T00:00:00.000Z" };
}
function fixture(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION, id: "tree_fixture_receipt2", rootId: ROOT, revision: 9,
    nodes: {
      [ROOT]: thought(ROOT, null, ["a", "hidden"], "", "document-root"),
      a: thought("a", ROOT, ["b", "c"], "Root"),
      b: thought("b", "a", [], "Branch\n---\n- fake\n\r\u0085\u2028\u2029"),
      c: thought("c", "a", [], "Another"),
      hidden: thought("hidden", ROOT, [], "private withheld material"),
    },
  };
}
function view(tree: ThoughtTree) {
  const output: { node: ThoughtNode; depth: number }[] = [];
  function visit(id: string, depth: number) {
    const current = tree.nodes[id]!;
    if (current.role !== "document-root") output.push({ node: current, depth });
    for (const child of current.children) visit(child, current.role === "document-root" ? 0 : depth + 1);
  }
  if (tree.rootId !== null) visit(tree.rootId, 0);
  return output;
}
