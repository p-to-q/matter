import { describe, expect, it } from "vitest";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import {
  createNavigationState,
  focusNode,
  reconcileNavigation,
  selectNode,
  showFull,
  toggleFold,
  type NavigationState,
} from "./navigation";

const TIME = "2026-08-03T00:00:00.000Z";

function node(
  id: string,
  parentId: string | null,
  children: string[] = [],
): ThoughtNode {
  return { id, text: id, parentId, children, createdAt: TIME, updatedAt: TIME };
}

function tree(nodes: ThoughtNode[], revision = 0): ThoughtTree {
  return {
    protocolVersion: "0.2",
    id: "tree_1",
    rootId: nodes[0]?.id ?? null,
    nodes: Object.fromEntries(nodes.map((value) => [value.id, value])),
    revision,
  };
}

function fixture(): ThoughtTree {
  return tree([
    node("root", null, ["a", "b"]),
    node("a", "root", ["a1"]),
    node("a1", "a"),
    node("b", "root"),
  ]);
}

describe("runtime navigation", () => {
  it("starts in a stable empty full view", () => {
    const navigation = createNavigationState();

    expect(navigation).toMatchObject({
      mode: "full",
      focusNodeId: null,
      selectedNodeId: null,
    });
    expect(navigation.foldedNodeIds.size).toBe(0);
  });

  it("selects an existing node and preserves identity on a repeated selection", () => {
    const material = fixture();
    const selected = selectNode(material, createNavigationState(), "a");
    if (!selected.ok) throw new Error(selected.error.code);
    const repeated = selectNode(material, selected.navigation, "a");

    expect(selected.navigation.selectedNodeId).toBe("a");
    expect(repeated.ok).toBe(true);
    expect(repeated.navigation).toBe(selected.navigation);
  });

  it("rejects missing select, focus, and fold targets without changing navigation", () => {
    const material = fixture();
    const navigation = createNavigationState();

    for (const result of [
      selectNode(material, navigation, "missing"),
      focusNode(material, navigation, "missing"),
      toggleFold(material, navigation, "missing"),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "NAVIGATION_NODE_NOT_FOUND" },
      });
      expect(result.navigation).toBe(navigation);
    }
  });

  it.each(["toString", "constructor", "__proto__"])(
    "rejects inherited node name %s at every navigation action",
    (inheritedName) => {
      const material = fixture();
      const navigation = createNavigationState();

      for (const action of [selectNode, focusNode, toggleFold]) {
        expect(() => action(material, navigation, inheritedName)).not.toThrow();
        const result = action(material, navigation, inheritedName);
        expect(result).toMatchObject({
          ok: false,
          error: { code: "NAVIGATION_NODE_NOT_FOUND" },
        });
        expect(result.navigation).toBe(navigation);
      }
    },
  );

  it("rejects folding a leaf without allocating a Set", () => {
    const navigation = createNavigationState();
    const result = toggleFold(fixture(), navigation, "a1");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NAVIGATION_FOLD_UNAVAILABLE" },
    });
    expect(result.navigation).toBe(navigation);
    expect(result.navigation.foldedNodeIds).toBe(navigation.foldedNodeIds);
  });

  it("toggles an independent fold Set without mutating the caller", () => {
    const navigation = createNavigationState();
    const folded = toggleFold(fixture(), navigation, "a");
    if (!folded.ok) throw new Error(folded.error.code);
    const unfolded = toggleFold(fixture(), folded.navigation, "a");
    if (!unfolded.ok) throw new Error(unfolded.error.code);

    expect(navigation.foldedNodeIds.size).toBe(0);
    expect(folded.navigation.foldedNodeIds).not.toBe(navigation.foldedNodeIds);
    expect(folded.navigation.foldedNodeIds.has("a")).toBe(true);
    expect(unfolded.navigation.foldedNodeIds.has("a")).toBe(false);
  });

  it("moves a hidden descendant selection to the folded ancestor", () => {
    const material = fixture();
    const selected = selectNode(material, createNavigationState(), "a1");
    if (!selected.ok) throw new Error(selected.error.code);
    const folded = toggleFold(material, selected.navigation, "a");

    expect(folded).toMatchObject({ ok: true });
    expect(folded.navigation.selectedNodeId).toBe("a");
  });

  it("reveals ancestors when a full-view selection is made programmatically", () => {
    const material = fixture();
    const folded = toggleFold(material, createNavigationState(), "root");
    if (!folded.ok) throw new Error(folded.error.code);
    const selected = selectNode(material, folded.navigation, "a1");

    expect(selected.ok).toBe(true);
    expect(selected.navigation.foldedNodeIds.has("root")).toBe(false);
  });

  it("focuses a node, ignores folds, and reveals its path on return to full view", () => {
    const material = fixture();
    const folded = toggleFold(material, createNavigationState(), "root");
    if (!folded.ok) throw new Error(folded.error.code);
    const focused = focusNode(material, folded.navigation, "a1");
    if (!focused.ok) throw new Error(focused.error.code);

    expect(focused.navigation).toMatchObject({
      mode: "focus",
      focusNodeId: "a1",
      selectedNodeId: "a1",
    });
    expect(focused.navigation.foldedNodeIds.has("root")).toBe(true);

    const full = showFull(material, focused.navigation);
    expect(full).toMatchObject({ mode: "full", selectedNodeId: "a1" });
    expect(full.foldedNodeIds.has("root")).toBe(false);
  });

  it("preserves full navigation identity when reconciliation changes nothing", () => {
    const material = fixture();
    const selected = selectNode(material, createNavigationState(), "b");
    if (!selected.ok) throw new Error(selected.error.code);

    expect(reconcileNavigation(material, material, selected.navigation)).toBe(
      selected.navigation,
    );
  });

  it("recovers selection and focus to the nearest surviving ancestor", () => {
    const before = fixture();
    const after = tree([
      node("root", null, ["b"]),
      node("b", "root"),
    ], 1);
    const foldedNodeIds = new Set(["a", "root", "missing"]);
    const navigation: NavigationState = {
      mode: "focus",
      focusNodeId: "a1",
      selectedNodeId: "a1",
      foldedNodeIds,
    };

    const recovered = reconcileNavigation(before, after, navigation);

    expect(recovered).toMatchObject({
      mode: "focus",
      focusNodeId: "root",
      selectedNodeId: "root",
    });
    expect(recovered.foldedNodeIds).toEqual(new Set(["root"]));
    expect(foldedNodeIds).toEqual(new Set(["a", "root", "missing"]));
  });

  it("returns to an empty full view when the root is removed", () => {
    const before = fixture();
    const after = tree([], 1);
    const focused = focusNode(before, createNavigationState(), "a1");
    if (!focused.ok) throw new Error(focused.error.code);

    expect(reconcileNavigation(before, after, focused.navigation)).toMatchObject({
      mode: "full",
      focusNodeId: null,
      selectedNodeId: null,
      foldedNodeIds: new Set(),
    });
  });

  it.each(["toString", "constructor", "__proto__"])(
    "drops inherited navigation name %s during reconciliation",
    (inheritedName) => {
      const material = fixture();
      const navigation: NavigationState = {
        mode: "focus",
        focusNodeId: inheritedName,
        selectedNodeId: inheritedName,
        foldedNodeIds: new Set([inheritedName]),
      };

      expect(() =>
        reconcileNavigation(material, material, navigation),
      ).not.toThrow();
      expect(reconcileNavigation(material, material, navigation)).toMatchObject({
        mode: "full",
        focusNodeId: null,
        selectedNodeId: null,
        foldedNodeIds: new Set(),
      });
    },
  );

  it("drops stale and leaf folds and reveals a recovered full-view selection", () => {
    const before = fixture();
    const after = tree([
      node("root", null, ["a"]),
      node("a", "root"),
    ], 1);
    const navigation: NavigationState = {
      mode: "full",
      focusNodeId: null,
      selectedNodeId: "a1",
      foldedNodeIds: new Set(["root", "a", "missing"]),
    };

    const reconciled = reconcileNavigation(before, after, navigation);

    expect(reconciled.selectedNodeId).toBe("a");
    expect(reconciled.foldedNodeIds).toEqual(new Set());
  });

  it("guards ancestor walks if untrusted navigation meets malformed material", () => {
    const malformed = fixture();
    malformed.nodes.a.parentId = "a1";
    malformed.nodes.a1.parentId = "a";
    const navigation: NavigationState = {
      mode: "full",
      focusNodeId: null,
      selectedNodeId: "a1",
      foldedNodeIds: new Set(["a"]),
    };

    const result = selectNode(malformed, navigation, "a1");

    expect(result.ok).toBe(true);
  });
});
