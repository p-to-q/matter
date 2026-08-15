import { describe, expect, it } from "vitest";
import {
  SEEDED_DOCUMENT_NODE_IDS,
  createSeededDocument,
} from "../material/seeded-document";
import { createNavigationState } from "../runtime/navigation";
import {
  isCurrentNodeActionIntent,
  projectNodeActions,
} from "./project-node-actions";

describe("projectNodeActions", () => {
  const tree = createSeededDocument().tree;
  const rootId = tree.rootId;
  if (rootId === null) throw new Error("seeded tree requires a root");
  const activeNodeIds = new Set(Object.keys(tree.nodes));

  it("reprojects only growth and focus for an explicit full-view node", () => {
    const tools = projectNodeActions({
      activeNodeIds,
      interaction: "idle",
      navigation: createNavigationState(),
      nodeId: rootId,
      tree,
    });
    expect(tools.map(({ id }) => id)).toEqual(["add-child", "focus"]);
    expect(tools.every(({ availability }) => availability === "available")).toBe(true);
  });

  it("fails closed for held or stale material", () => {
    expect(projectNodeActions({
      activeNodeIds: new Set(),
      interaction: "idle",
      navigation: createNavigationState(),
      nodeId: rootId,
      tree,
    })).toEqual([]);
    expect(projectNodeActions({
      activeNodeIds: new Set([...activeNodeIds, "missing"]),
      interaction: "idle",
      navigation: createNavigationState(),
      nodeId: "missing",
      tree,
    })).toEqual([]);
  });

  it("offers only the exit in focus view and preserves pending locks", () => {
    const navigation = {
      ...createNavigationState(),
      mode: "focus" as const,
      focusNodeId: rootId,
    };
    const idle = projectNodeActions({ activeNodeIds, interaction: "idle", navigation, nodeId: rootId, tree });
    expect(idle.map(({ id }) => id)).toEqual(["show-all"]);
    const pending = projectNodeActions({ activeNodeIds, interaction: "pending", navigation, nodeId: rootId, tree });
    expect(pending).toMatchObject([{ id: "show-all", availability: "disabled" }]);
  });

  it("rejects an intent projected for a different explicit node", () => {
    const context = {
      activeNodeIds,
      interaction: "idle" as const,
      navigation: createNavigationState(),
      nodeId: rootId,
      tree,
    };
    expect(isCurrentNodeActionIntent(context, {
      type: "insert-child",
      parentNodeId: rootId,
    })).toBe(true);
    expect(isCurrentNodeActionIntent(context, {
      type: "insert-child",
      parentNodeId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    })).toBe(false);
    expect(isCurrentNodeActionIntent(context, {
      type: "focus-node",
      nodeId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    })).toBe(false);
  });

  it("rejects an intent after its view or pending capability changes", () => {
    const full = createNavigationState();
    const focus = {
      ...full,
      mode: "focus" as const,
      focusNodeId: rootId,
      selectedNodeId: rootId,
    };
    const addChild = { type: "insert-child" as const, parentNodeId: rootId };
    const showFull = { type: "show-full" as const };

    expect(isCurrentNodeActionIntent({
      activeNodeIds,
      interaction: "idle",
      navigation: full,
      nodeId: rootId,
      tree,
    }, addChild)).toBe(true);
    expect(isCurrentNodeActionIntent({
      activeNodeIds,
      interaction: "idle",
      navigation: focus,
      nodeId: rootId,
      tree,
    }, addChild)).toBe(false);
    expect(isCurrentNodeActionIntent({
      activeNodeIds,
      interaction: "idle",
      navigation: focus,
      nodeId: rootId,
      tree,
    }, showFull)).toBe(true);
    expect(isCurrentNodeActionIntent({
      activeNodeIds,
      interaction: "idle",
      navigation: full,
      nodeId: rootId,
      tree,
    }, showFull)).toBe(false);
    expect(isCurrentNodeActionIntent({
      activeNodeIds,
      interaction: "pending",
      navigation: full,
      nodeId: rootId,
      tree,
    }, addChild)).toBe(false);
  });

  it("rejects an intent after its node leaves the active working context", () => {
    const nodeId = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
    const intent = { type: "focus-node" as const, nodeId };
    const context = {
      activeNodeIds,
      interaction: "idle" as const,
      navigation: createNavigationState(),
      nodeId,
      tree,
    };
    expect(isCurrentNodeActionIntent(context, intent)).toBe(true);

    const heldAside = new Set(activeNodeIds);
    heldAside.delete(nodeId);
    expect(isCurrentNodeActionIntent({ ...context, activeNodeIds: heldAside }, intent)).toBe(false);
  });
});
