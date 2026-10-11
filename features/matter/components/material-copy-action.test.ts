import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseContextReceipt } from "../material/context-receipt";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { copyMaterialSelection } from "./material-copy-action";

const TREE_ID = "tree_copy_action";
const ROOT_ID = documentRootId(TREE_ID);

function fixture(bText = "Beta\nsecond line"): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: TREE_ID,
    rootId: ROOT_ID,
    revision: 3,
    nodes: {
      [ROOT_ID]: node(ROOT_ID, null, ["a", "c"], "", "document-root"),
      a: node("a", ROOT_ID, ["b"], "Alpha"),
      b: node("b", "a", [], bText),
      c: node("c", ROOT_ID, [], "Gamma"),
    },
  };
}

function node(id: string, parentId: string | null, children: string[], text: string, role?: "document-root"): ThoughtNode {
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

function harness(options: Readonly<{ reject?: boolean; absent?: boolean }> = {}) {
  const written: string[] = [];
  const reported: ReadonlySet<string>[] = [];
  return {
    written,
    reported,
    input: {
      clipboard: options.absent === true
        ? undefined
        : {
            writeText: async (text: string) => {
              if (options.reject === true) throw new Error("denied");
              written.push(text);
            },
          },
      onCopied: (ids: ReadonlySet<string>) => reported.push(ids),
    },
  };
}

describe("copyMaterialSelection", () => {
  it("native Copy writes the literal join of the selected text and nothing else", async () => {
    const { written, reported, input } = harness();
    const outcome = await copyMaterialSelection({
      ...input, form: "text", tree: fixture(), nodeIds: new Set(["c", "b", "a"]),
    });
    expect(outcome).toBe("copied");
    expect(written).toEqual(["Alpha\n\nBeta\nsecond line\n\nGamma"]);
    expect(reported).toEqual([new Set(["c", "b", "a"])]);
  });

  it("Copy with context writes a receipt the parser accepts and reports the same ids once", async () => {
    const { written, reported, input } = harness();
    const outcome = await copyMaterialSelection({
      ...input, form: "context", tree: fixture(), nodeIds: new Set(["a", "b"]),
    });
    expect(outcome).toBe("copied-with-context");
    expect(written).toHaveLength(1);
    const result = await parseContextReceipt(written[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.nodes.map(({ nodeId, parentId }) => [nodeId, parentId])).toEqual([
      ["a", null], ["b", "a"],
    ]);
    expect(result.projection.nodes[1]?.text).toBe("Beta\nsecond line");
    expect(reported).toEqual([new Set(["a", "b"])]);
  });

  it("reports nothing and writes nothing when the clipboard is missing", async () => {
    for (const form of ["text", "context"] as const) {
      const { reported, input } = harness({ absent: true });
      await expect(copyMaterialSelection({ ...input, form, tree: fixture(), nodeIds: new Set(["a"]) }))
        .resolves.toBe("failed");
      expect(reported).toEqual([]);
    }
  });

  it("reports nothing when the clipboard refuses the write", async () => {
    for (const form of ["text", "context"] as const) {
      const { reported, input } = harness({ reject: true });
      await expect(copyMaterialSelection({ ...input, form, tree: fixture(), nodeIds: new Set(["a"]) }))
        .resolves.toBe("failed");
      expect(reported).toEqual([]);
    }
  });

  it("turns a refused receipt into the ordinary failure without throwing or writing", async () => {
    const { written, reported, input } = harness();
    const refused = fixture("lone surrogate \uD800");
    await expect(copyMaterialSelection({ ...input, form: "context", tree: refused, nodeIds: new Set(["b"]) }))
      .resolves.toBe("failed");
    expect(written).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("does nothing for a document that is no longer current", async () => {
    for (const form of ["text", "context"] as const) {
      const { written, reported, input } = harness();
      await expect(copyMaterialSelection({
        ...input, form, tree: fixture(), nodeIds: new Set(["a"]), stillCurrent: () => false,
      })).resolves.toBeNull();
      expect(written).toEqual([]);
      expect(reported).toEqual([]);
    }
  });
});

describe("the Files panel wiring", () => {
  const source = readFileSync(new URL("./MaterialFiles.tsx", import.meta.url), "utf8");

  it("enables both copy actions under exactly the same condition", () => {
    const condition = "disabled={selectedCount === 0 || props.interactionPending}";
    expect(source.split(condition)).toHaveLength(3);
    expect(source).toContain('onClick={() => void copySelection("text")}');
    expect(source).toContain('onClick={() => void copySelection("context")}');
  });

  it("reports the Wiki copied fact from one call site only", () => {
    expect(source.match(/props\.onMaterialCopied/gu)).toHaveLength(1);
    expect(source).not.toMatch(/onMaterialCopied\?\./u);
  });

  it("gives native Copy its own accessible name and the context action its visible text", () => {
    expect(source).toContain("aria-label={copy.copySelectedThoughts(selectedCount)}");
    expect(source).toContain("<span>{copy.copyWithContext}</span>");
    expect(source).toContain("title={copy.archiveReceiptDescription}");
    expect(source).toContain("{copy.archiveReceiptDownload}");
  });
});

describe("copyMaterialSelection with a promise-capable clipboard", () => {
  it("hands the clipboard its item before the receipt exists, so the gesture still counts", async () => {
    const seen: string[] = [];
    class FakeItem {
      constructor(readonly parts: Record<string, Promise<Blob>>) {}
    }
    const original = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeItem;
    try {
      let handedBeforeResolved = false;
      const reported: ReadonlySet<string>[] = [];
      const outcome = await copyMaterialSelection({
        form: "context",
        tree: fixture(),
        nodeIds: new Set(["a", "b"]),
        clipboard: {
          write: async (items: ClipboardItems) => {
            // `write` ran synchronously from the action: the text promise is still pending.
            handedBeforeResolved = true;
            const blob = await (items[0] as unknown as FakeItem).parts["text/plain"]!;
            seen.push(await blob.text());
          },
        },
        onCopied: (ids) => reported.push(ids),
      });
      expect(handedBeforeResolved).toBe(true);
      expect(outcome).toBe("copied-with-context");
      const parsed = await parseContextReceipt(seen[0]!);
      expect(parsed.ok).toBe(true);
      expect(reported).toHaveLength(1);
    } finally {
      (globalThis as { ClipboardItem?: unknown }).ClipboardItem = original;
    }
  });

  it("reports failure and no Wiki fact when the write is refused, and nothing when the document moved on", async () => {
    class FakeItem { constructor(readonly parts: Record<string, Promise<Blob>>) { void Object.values(parts).forEach((p) => p.catch(() => undefined)); } }
    const original = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeItem;
    try {
      const reported: ReadonlySet<string>[] = [];
      const denied = await copyMaterialSelection({
        form: "context",
        tree: fixture(),
        nodeIds: new Set(["a"]),
        clipboard: { write: async () => { throw new Error("denied"); } },
        onCopied: (ids) => reported.push(ids),
      });
      const stale = await copyMaterialSelection({
        form: "context",
        tree: fixture(),
        nodeIds: new Set(["a"]),
        stillCurrent: () => false,
        clipboard: { write: async (items: ClipboardItems) => { await (items[0] as unknown as FakeItem).parts["text/plain"]; } },
        onCopied: (ids) => reported.push(ids),
      });
      expect(denied).toBe("failed");
      expect(stale).toBeNull();
      expect(reported).toHaveLength(0);
    } finally {
      (globalThis as { ClipboardItem?: unknown }).ClipboardItem = original;
    }
  });
});
