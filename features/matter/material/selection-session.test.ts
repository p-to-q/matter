import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANVAS_LANGUAGE_OPTIONS } from "../components/canvas-preferences";
import { materialFilesCopy } from "../components/material-files-copy";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { serializeMaterialSelection } from "./material-files";
import {
  EMPTY_SELECTION_SESSION,
  isContextRow,
  pruneSelectionSession,
  selectionAncestorIds,
  toggleSelectionRow,
  type SelectionSession,
} from "./selection-session";

const TREE_ID = "tree_session";
const ROOT_ID = documentRootId(TREE_ID);

function node(id: string, parentId: string, children: string[], text: string, role?: "document-root"): ThoughtNode {
  return {
    id, parentId, children, text, ...(role === undefined ? {} : { role }),
    createdAt: "2026-08-07T00:00:00.000Z", updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

/** doc root → l0 → l1 → l2 → l3 → l4 → l5 (depth 5), with l1 also holding s1, and a top-level sibling t. */
function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: TREE_ID,
    rootId: ROOT_ID,
    revision: 1,
    nodes: {
      [ROOT_ID]: { ...node(ROOT_ID, "", ["l0", "t"], "", "document-root"), parentId: null },
      l0: node("l0", ROOT_ID, ["l1"], "L0"),
      l1: node("l1", "l0", ["l2", "s1"], "L1"),
      l2: node("l2", "l1", ["l3"], "L2"),
      l3: node("l3", "l2", ["l4"], "L3"),
      l4: node("l4", "l3", ["l5"], "L4"),
      l5: node("l5", "l4", [], "L5"),
      s1: node("s1", "l1", [], "S1"),
      t: node("t", ROOT_ID, [], "T"),
    },
  };
}

function ids(session: SelectionSession): string[] {
  return Array.from(session.ticked).sort();
}

describe("ticking a passage pulls its ancestors in as context", () => {
  const { nodes } = tree();

  it("ticks every ancestor of a depth-five passage, excluding the invisible document root", () => {
    const session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l5");
    expect(ids(session)).toEqual(["l0", "l1", "l2", "l3", "l4", "l5"]);
    expect(session.ticked.has(ROOT_ID)).toBe(false);
    expect(selectionAncestorIds(nodes, "l5")).toEqual(["l4", "l3", "l2", "l1", "l0"]);
  });

  it("marks only the person's own tick as theirs; the rest is context", () => {
    const session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l5");
    expect(isContextRow(session, "l5")).toBe(false);
    for (const id of ["l0", "l1", "l2", "l3", "l4"]) expect(isContextRow(session, id)).toBe(true);
    expect(isContextRow(session, "t")).toBe(false);
  });

  it("counts every ticked row, context included", () => {
    expect(toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l3").ticked.size).toBe(4);
    expect(toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "t").ticked.size).toBe(1);
  });

  it("makes an explicit tick of an auto-ticked ancestor the person's own", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l2");
    expect(isContextRow(session, "l1")).toBe(true);
    session = toggleSelectionRow(nodes, session, "l1"); // unticks it
    session = toggleSelectionRow(nodes, session, "l1"); // ticks it again
    expect(session.ticked.has("l1")).toBe(true);
    expect(isContextRow(session, "l1")).toBe(false);
  });

  it("ignores an id that is not a passage", () => {
    expect(toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "ghost")).toBe(EMPTY_SELECTION_SESSION);
    expect(selectionAncestorIds(nodes, "ghost")).toEqual([]);
  });

  it("stops at a broken chain or a cycle", () => {
    const broken = { ...nodes, l0: { ...nodes["l0"]!, parentId: "gone" } };
    expect(selectionAncestorIds(broken, "l1")).toEqual(["l0"]);
    const cyclic = { ...nodes, l0: { ...nodes["l0"]!, parentId: "l2" } };
    expect(selectionAncestorIds(cyclic, "l2")).toEqual(["l1", "l0"]);
  });
});

describe("unticking and the declined memory", () => {
  const { nodes } = tree();

  it("unticks only that row: descendants stay ticked", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l3");
    session = toggleSelectionRow(nodes, session, "l1");
    expect(ids(session)).toEqual(["l0", "l2", "l3"]);
  });

  it("never re-ticks a row the person declined, however often a descendant pulls it", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l2");
    session = toggleSelectionRow(nodes, session, "l1"); // declined
    session = toggleSelectionRow(nodes, session, "s1"); // another child of l1: pulls l0, not l1
    expect(ids(session)).toEqual(["l0", "l2", "s1"]);
    session = toggleSelectionRow(nodes, session, "l5");
    expect(session.ticked.has("l1")).toBe(false);
    expect(session.ticked.has("l3")).toBe(true);
    expect(session.declined.has("l1")).toBe(true);
  });

  it("lets the person tick a declined row again, which lifts the decline", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l2");
    session = toggleSelectionRow(nodes, session, "l1");
    session = toggleSelectionRow(nodes, session, "l1");
    expect(session.declined.has("l1")).toBe(false);
    expect(session.ticked.has("l1")).toBe(true);
  });

  it("remembers a declined context row, so unticking an auto-ticked ancestor sticks", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l1");
    session = toggleSelectionRow(nodes, session, "l0"); // declines the context row
    session = toggleSelectionRow(nodes, session, "s1");
    expect(session.ticked.has("l0")).toBe(false);
  });

  it("ends the session, memory included, when the last row is unticked", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l1");
    session = toggleSelectionRow(nodes, session, "l0"); // declined
    session = toggleSelectionRow(nodes, session, "l1");
    expect(session).toBe(EMPTY_SELECTION_SESSION);
    // A fresh session pulls l0 again: nothing was remembered.
    expect(ids(toggleSelectionRow(nodes, session, "l1"))).toEqual(["l0", "l1"]);
  });

  it("does not mutate the session it was handed", () => {
    const before = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l2");
    const snapshot = ids(before);
    toggleSelectionRow(nodes, before, "l1");
    toggleSelectionRow(nodes, before, "t");
    expect(ids(before)).toEqual(snapshot);
    expect(EMPTY_SELECTION_SESSION.ticked.size).toBe(0);
  });
});

describe("pruning after an edit", () => {
  it("drops ids that no longer name a passage, and ends an emptied session", () => {
    const base = tree();
    const session = toggleSelectionRow(base.nodes, EMPTY_SELECTION_SESSION, "l2");
    const rest = Object.fromEntries(Object.entries(base.nodes).filter(([id]) => id !== "l1"));
    const pruned = pruneSelectionSession(rest, session);
    expect(ids(pruned)).toEqual(["l0", "l2"]);
    expect(pruneSelectionSession(base.nodes, session)).toBe(session);
    expect(pruneSelectionSession({}, session)).toBe(EMPTY_SELECTION_SESSION);
  });
});

describe("what Copy reads", () => {
  const { nodes } = tree();

  it("a single passage with its auto-ticked ancestors copies as a nested list", () => {
    const session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l2");
    const result = serializeMaterialSelection(tree(), session.ticked);
    expect(result.ok && result.text).toBe("- L0\n  - L1\n    - L2");
  });

  it("a single passage whose ancestors the person unticked is the literal text again", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l2");
    session = toggleSelectionRow(nodes, session, "l1");
    session = toggleSelectionRow(nodes, session, "l0");
    const result = serializeMaterialSelection(tree(), session.ticked);
    expect(result.ok && result.text).toBe("L2");
  });

  it("a top-level passage has no context to pull and copies unchanged", () => {
    const session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "t");
    const result = serializeMaterialSelection(tree(), session.ticked);
    expect(result.ok && result.text).toBe("T");
  });

  it("gaps keep their relative depth: l0 and l3 with l1 and l2 declined", () => {
    let session = toggleSelectionRow(nodes, EMPTY_SELECTION_SESSION, "l3");
    session = toggleSelectionRow(nodes, session, "l1");
    session = toggleSelectionRow(nodes, session, "l2");
    const result = serializeMaterialSelection(tree(), session.ticked);
    expect(result.ok && result.text).toBe("- L0\n  - L3");
  });
});

describe("the select row's accessibility", () => {
  const source = readFileSync(new URL("../components/MaterialFiles.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/MaterialFiles.css", import.meta.url), "utf8");

  it("keeps a context row a real checked checkbox with a description read after its name", () => {
    expect(source).toContain('aria-describedby={contextRow ? `${file.nodeId}-context` : undefined}');
    expect(source).toContain("aria-label={copy.selectForCopying(title)}");
    expect(source).toContain("checked={checked}");
    expect(source).toContain('data-context={contextRow ? "true" : undefined}');
    expect(source).toContain("{copy.includedAsContext}");
    expect(source).toContain('type="checkbox"');
  });

  it("reaches the same toggle by pointer and by Enter or Space", () => {
    expect(source).toContain("onChange={() => toggleSelected(file.nodeId)}");
    expect(source).toMatch(/if \(mode === "select"\) \{\s*toggleSelected\(file\.nodeId\);/u);
  });

  it("clears the session whenever select mode is left, and counts every ticked row", () => {
    expect(source).toContain('if (mode !== "select" && selectionState.session !== EMPTY_SELECTION_SESSION)');
    expect(source).toContain("const currentSelectedIds = selectionSession.ticked;");
  });

  it("draws context rows in a quieter ink", () => {
    expect(css).toContain('.material-file__check[data-context="true"] input:checked + .material-file__check-mark { border-color: var(--index-faint); }');
    expect(css).toContain('.material-file__check[data-context="true"] .material-file__title { color: var(--index-muted); }');
  });

  it.each(CANVAS_LANGUAGE_OPTIONS)("says 'included as context' in $label", ({ value: locale }) => {
    const copy = materialFilesCopy(locale);
    expect(copy.includedAsContext.trim().length).toBeGreaterThan(3);
    if (locale !== "en-US") expect(copy.includedAsContext).not.toBe(materialFilesCopy("en-US").includedAsContext);
  });
});
