import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { parseVersionedContextReceipt as parseContextReceipt } from "../material/context-receipt-v2";
import { projectWorkingContext } from "../material/working-context";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { copyActiveTreeReceipt, copyMaterialSelection } from "./material-copy-action";

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
      b: node("b", "a", ["d"], bText),
      d: node("d", "b", [], "Delta <b>&"),
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

type Globals = { ClipboardItem?: unknown };
const original = (globalThis as Globals).ClipboardItem;
afterEach(() => {
  (globalThis as Globals).ClipboardItem = original;
});

/** An engine without ClipboardItem: only `writeText` is available. */
function plainClipboard(options: Readonly<{ reject?: boolean }> = {}) {
  const written: string[] = [];
  return {
    written,
    clipboard: {
      writeText: async (text: string) => {
        if (options.reject === true) throw new Error("denied");
        written.push(text);
      },
    },
  };
}

/** An engine with ClipboardItem: records each item's parts as it is handed over. */
function richClipboard(options: Readonly<{
  rejectWrite?: boolean;
  throwOnConstruct?: boolean;
  rejectText?: boolean;
  release?: Promise<void>;
}> = {}) {
  class FakeItem {
    constructor(readonly parts: Record<string, Blob | Promise<Blob>>) {
      if (options.throwOnConstruct === true) throw new TypeError("unsupported");
      for (const part of Object.values(parts)) if (part instanceof Promise) part.catch(() => undefined);
    }
  }
  (globalThis as Globals).ClipboardItem = FakeItem;
  const state = {
    writes: 0,
    plain: [] as string[],
    html: [] as string[],
    texts: [] as string[],
    events: [] as string[],
  };
  return {
    state,
    clipboard: {
      write: async (items: ClipboardItems) => {
        state.writes += 1;
        state.events.push("write");
        await options.release;
        if (options.rejectWrite === true) throw new Error("denied");
        const item = items[0] as unknown as FakeItem;
        const plain = await item.parts["text/plain"];
        if (plain !== undefined) state.plain.push(await plain.text());
        const html = await item.parts["text/html"];
        if (html !== undefined) state.html.push(await html.text());
      },
      writeText: async (text: string) => {
        if (options.rejectText === true) throw new Error("denied");
        state.events.push("writeText");
        state.texts.push(text);
      },
    },
  };
}

describe("copyMaterialSelection without ClipboardItem", () => {
  it("writes the literal join for passages that do not contain one another, and reports their ids once", async () => {
    (globalThis as Globals).ClipboardItem = undefined;
    const { written, clipboard } = plainClipboard();
    const reported: ReadonlySet<string>[] = [];
    const outcome = await copyMaterialSelection({
      tree: fixture(),
      nodeIds: new Set(["c", "a"]),
      clipboard,
      onCopied: (ids) => reported.push(ids),
    });
    expect(outcome).toBe("copied");
    expect(written).toEqual(["Alpha\n\nGamma"]);
    expect(reported).toEqual([new Set(["c", "a"])]);
  });

  it("writes a Markdown list once a selected passage sits inside another, every line aligned", async () => {
    (globalThis as Globals).ClipboardItem = undefined;
    const { written, clipboard } = plainClipboard();
    await copyMaterialSelection({ tree: fixture(), nodeIds: new Set(["a", "b", "d", "c"]), clipboard });
    expect(written).toEqual(["- Alpha\n  - Beta\n    second line\n    - Delta \\<b>\\&\n- Gamma"]);
  });

  it("reports nothing and writes nothing when the clipboard is missing", async () => {
    const reported: ReadonlySet<string>[] = [];
    await expect(copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a"]), clipboard: undefined, onCopied: (ids) => reported.push(ids),
    })).resolves.toBe("failed");
    expect(reported).toEqual([]);
  });

  it("reports nothing when the clipboard refuses the write", async () => {
    const { clipboard } = plainClipboard({ reject: true });
    const reported: ReadonlySet<string>[] = [];
    await expect(copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a"]), clipboard, onCopied: (ids) => reported.push(ids),
    })).resolves.toBe("failed");
    expect(reported).toEqual([]);
  });

  it("is the ordinary failure for an empty or stale selection, and writes nothing", async () => {
    const { written, clipboard } = plainClipboard();
    await expect(copyMaterialSelection({ tree: fixture(), nodeIds: new Set(), clipboard })).resolves.toBe("failed");
    await expect(copyMaterialSelection({ tree: fixture(), nodeIds: new Set(["ghost"]), clipboard }))
      .resolves.toBe("failed");
    expect(written).toEqual([]);
  });

  it("does nothing for a document that is no longer current", async () => {
    const { written, clipboard } = plainClipboard();
    const reported: ReadonlySet<string>[] = [];
    await expect(copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a"]), clipboard, stillCurrent: () => false, onCopied: (ids) => reported.push(ids),
    })).resolves.toBeNull();
    expect(written).toEqual([]);
    expect(reported).toEqual([]);
  });
});

describe("copyMaterialSelection with ClipboardItem", () => {
  it("starts the clipboard write inside the call, before anything is awaited", async () => {
    const { state, clipboard } = richClipboard();
    const pending = copyMaterialSelection({ tree: fixture(), nodeIds: new Set(["a", "b"]), clipboard });
    // Nothing has been awaited yet: the gesture is still the one that clicked.
    expect(state.writes).toBe(1);
    expect(state.events).toEqual(["write"]);
    await pending;
  });

  it("hands over a lone passage as plain text and one paragraph, never a bullet", async () => {
    const { state, clipboard } = richClipboard();
    await copyMaterialSelection({ tree: fixture(), nodeIds: new Set(["c"]), clipboard });
    expect(state.plain).toEqual(["Gamma"]);
    expect(state.html).toEqual(['<meta charset="utf-8"><p>Gamma</p>']);
  });

  it("hands over text/plain and text/html together, with the same nesting", async () => {
    const { state, clipboard } = richClipboard();
    await copyMaterialSelection({ tree: fixture(), nodeIds: new Set(["a", "b", "d", "c"]), clipboard });
    expect(state.plain).toEqual(["- Alpha\n  - Beta\n    second line\n    - Delta \\<b>\\&\n- Gamma"]);
    expect(state.html).toEqual([
      '<meta charset="utf-8"><ul><li>Alpha<ul><li>Beta<br>second line<ul><li>Delta &lt;b&gt;&amp;</li></ul></li></ul></li><li>Gamma</li></ul>',
    ]);
    expect(state.texts).toEqual([]);
  });

  it("never starts a write for a document that is already gone", async () => {
    const { state, clipboard } = richClipboard();
    await expect(copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a"]), clipboard, stillCurrent: () => false,
    })).resolves.toBeNull();
    expect(state.writes).toBe(0);
    expect(state.texts).toEqual([]);
  });

  it("reports the node ids once, and only after the clipboard accepted the write", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { clipboard } = richClipboard({ release: gate });
    const reported: ReadonlySet<string>[] = [];
    const pending = copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["b", "a"]), clipboard, onCopied: (ids) => reported.push(ids),
    });
    await Promise.resolve();
    expect(reported).toEqual([]);
    release();
    await expect(pending).resolves.toBe("copied");
    expect(reported).toEqual([new Set(["b", "a"])]);
  });

  it("falls back to the plain write when the rich write is refused, and still reports once", async () => {
    const { state, clipboard } = richClipboard({ rejectWrite: true });
    const reported: ReadonlySet<string>[] = [];
    const outcome = await copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a", "b"]), clipboard, onCopied: (ids) => reported.push(ids),
    });
    expect(outcome).toBe("copied");
    expect(state.texts).toEqual(["- Alpha\n  - Beta\n    second line"]);
    expect(reported).toHaveLength(1);
  });

  it("falls back to the plain write when the engine cannot build the item", async () => {
    const { state, clipboard } = richClipboard({ throwOnConstruct: true });
    await expect(copyMaterialSelection({ tree: fixture(), nodeIds: new Set(["c"]), clipboard })).resolves.toBe("copied");
    expect(state.texts).toEqual(["Gamma"]);
  });

  it("reports failure and no Wiki fact when both writes are refused", async () => {
    const { clipboard } = richClipboard({ rejectWrite: true, rejectText: true });
    const reported: ReadonlySet<string>[] = [];
    await expect(copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a"]), clipboard, onCopied: (ids) => reported.push(ids),
    })).resolves.toBe("failed");
    expect(reported).toEqual([]);
  });

  it("reports nothing when the document moved on while the write was in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { clipboard } = richClipboard({ release: gate });
    let current = true;
    const reported: ReadonlySet<string>[] = [];
    const pending = copyMaterialSelection({
      tree: fixture(), nodeIds: new Set(["a"]), clipboard, stillCurrent: () => current, onCopied: (ids) => reported.push(ids),
    });
    current = false;
    release();
    await expect(pending).resolves.toBeNull();
    expect(reported).toEqual([]);
  });
});

describe("copyActiveTreeReceipt", () => {
  function active(tree: ThoughtTree) {
    const view: { node: ThoughtNode; depth: number }[] = [];
    const visit = (nodeId: string, depth: number): void => {
      const current = tree.nodes[nodeId]!;
      const isRoot = current.role === "document-root";
      if (!isRoot) view.push({ node: current, depth });
      for (const childId of current.children) visit(childId, isRoot ? 0 : depth + 1);
    };
    visit(tree.rootId!, 0);
    return { view, activeNodeIds: projectWorkingContext(tree).activeNodeIds };
  }

  it("hands the clipboard its item before the receipt exists, so the gesture still counts", async () => {
    const { state, clipboard } = richClipboard();
    const tree = fixture();
    const pending = copyActiveTreeReceipt({ tree, active: active(tree), clipboard });
    expect(state.writes).toBe(1);
    await expect(pending).resolves.toBe("copied");
    const parsed = await parseContextReceipt(state.plain[0]!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.projection.nodes.map(({ nodeId, parentId }) => [nodeId, parentId])).toEqual([
      ["a", null], ["b", "a"], ["d", "b"], ["c", null],
    ]);
  });

  it("uses writeText where there is no ClipboardItem", async () => {
    (globalThis as Globals).ClipboardItem = undefined;
    const { written, clipboard } = plainClipboard();
    const tree = fixture();
    await expect(copyActiveTreeReceipt({ tree, active: active(tree), clipboard })).resolves.toBe("copied");
    expect((await parseContextReceipt(written[0]!)).ok).toBe(true);
  });

  it("is the ordinary failure when the receipt is refused, with nothing written", async () => {
    const refused = fixture("lone surrogate \uD800");
    const rich = richClipboard();
    await expect(copyActiveTreeReceipt({ tree: refused, active: active(refused), clipboard: rich.clipboard }))
      .resolves.toBe("failed");
    expect(rich.state.plain).toEqual([]);
    (globalThis as Globals).ClipboardItem = undefined;
    const plain = plainClipboard();
    await expect(copyActiveTreeReceipt({ tree: refused, active: active(refused), clipboard: plain.clipboard }))
      .resolves.toBe("failed");
    expect(plain.written).toEqual([]);
  });

  it("does nothing for a document that is no longer current, and fails when denied", async () => {
    const tree = fixture();
    const stale = richClipboard();
    await expect(copyActiveTreeReceipt({
      tree, active: active(tree), clipboard: stale.clipboard, stillCurrent: () => false,
    })).resolves.toBeNull();
    expect(stale.state.writes).toBe(0);
    const denied = richClipboard({ rejectWrite: true });
    await expect(copyActiveTreeReceipt({ tree, active: active(tree), clipboard: denied.clipboard }))
      .resolves.toBe("failed");
  });

  it("never reports a delayed clipboard success on a replacement document", async () => {
    const tree = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const rich = richClipboard({ release: gate });
    let current = true;
    const pending = copyActiveTreeReceipt({
      tree, active: active(tree), clipboard: rich.clipboard, stillCurrent: () => current,
    });
    current = false;
    release();
    await expect(pending).resolves.toBeNull();
    expect(rich.state.texts).toEqual([]);

    (globalThis as Globals).ClipboardItem = undefined;
    current = true;
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    let finish!: () => void;
    const writeGate = new Promise<void>((resolve) => { finish = resolve; });
    const plain = copyActiveTreeReceipt({
      tree, active: active(tree), stillCurrent: () => current,
      clipboard: { writeText: async () => { entered(); await writeGate; } },
    });
    await writing;
    current = false;
    finish();
    await expect(plain).resolves.toBeNull();
  });

  it.each(["selection", "receipt"] as const)(
    "does not report a delayed %s clipboard rejection on a replacement document",
    async (kind) => {
      (globalThis as Globals).ClipboardItem = undefined;
      const tree = fixture();
      let current = true;
      let entered!: () => void;
      const writing = new Promise<void>((resolve) => { entered = resolve; });
      let deny!: (reason: unknown) => void;
      const gate = new Promise<void>((_resolve, reject) => { deny = reject; });
      const clipboard = { writeText: async () => { entered(); await gate; } };
      const pending = kind === "receipt"
        ? copyActiveTreeReceipt({ tree, active: active(tree), clipboard, stillCurrent: () => current })
        : copyMaterialSelection({ tree, nodeIds: new Set(["a"]), clipboard, stillCurrent: () => current });
      await writing;
      current = false;
      deny(new Error("late denial"));
      await expect(pending).resolves.toBeNull();
    },
  );

  it.each([false, true])("owns the promised part after constructor refusal (stale=%s)", async (stale) => {
    const tree = fixture(stale ? "Valid text" : "lone surrogate \uD800");
    const { clipboard } = richClipboard({ throwOnConstruct: true });
    let current = true;
    const pending = copyActiveTreeReceipt({ tree, active: active(tree), clipboard, stillCurrent: () => current });
    if (stale) current = false;
    // The constructor has already refused synchronously; the unconsumed part
    // can still reject later when its receipt or document is no longer usable.
    await expect(pending).resolves.toBe("failed");
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});

describe("the Files panel wiring", () => {
  const source = readFileSync(new URL("./MaterialFiles.tsx", import.meta.url), "utf8");

  it("has one Copy in the select footer, and the receipt only in Archive", () => {
    const footer = source.slice(
      source.indexOf('<footer className="material-files__footer">'),
      source.indexOf('<footer className="material-files__identity">'),
    );
    expect(footer.match(/<button/gu)).toHaveLength(1);
    expect(footer).toContain("disabled={selectedCount === 0 || props.interactionPending}");
    expect(footer).toContain("void copySelection()");
    expect(source).not.toMatch(/copyWithContext|copiedWithContext|copied-with-context/u);
    expect(source).toContain("onClick={onCopyReceipt}");
    expect(source).toContain("{copy.archiveReceiptCopy}");
    expect(source).toContain("{copy.archiveReceiptDownload}");
  });

  it("states what the receipt is as visible text under the pair, not only as a tooltip", () => {
    expect(source).toContain('<p className="material-files__archive-helper">{copy.archiveReceiptDescription}</p>');
    expect(source).not.toContain("title={copy.archiveReceiptDescription}");
  });

  it("reports the Wiki copied fact from one call site only", () => {
    expect(source.match(/props\.onMaterialCopied/gu)).toHaveLength(1);
    expect(source).not.toMatch(/onMaterialCopied\?\./u);
  });

  it("gives Copy its accessible name", () => {
    expect(source).toContain("aria-label={copy.copySelectedThoughts(selectedCount)}");
  });

  it("reads the not-saved notice at 10px in the active ink and leaves the not-exported one muted", () => {
    const css = readFileSync(new URL("./MaterialFiles.css", import.meta.url), "utf8");
    expect(source).toContain('noticeRisk={shownNotice?.kind === "pictures-not-saved"}');
    expect(source).toContain('data-tone={phaseLabel === null && notice !== null && noticeRisk ? "risk" : undefined}');
    expect(css).toContain('.material-files__archive-status[data-tone="risk"] { color: var(--active); font-size: 10px; }');
    // The base status line stays the muted 9px one.
    expect(css).toMatch(/\.material-files__archive-error \{ margin: 12px 0 0; font-size: 9px; line-height: 1\.5; \}/u);
  });
});
