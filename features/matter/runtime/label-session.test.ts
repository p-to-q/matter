import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import {
  createLabelSessionState,
  labelFor,
  planLabelWork,
  reduceLabelSession,
  type LabelWorkItem,
} from "./label-session";

const SPOKEN = "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。";

function node(id: string, text: string, parentId: string | null, children: string[] = []): ThoughtNode {
  return {
    id,
    text,
    parentId,
    children,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function tree(nodes: readonly ThoughtNode[], revision = 3): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree-1",
    rootId: nodes[0]?.id ?? null,
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    revision,
  };
}

const ROOT = tree([
  node("root", SPOKEN, null, ["child"]),
  node("child", "重新思考首页结构", "root"),
]);

function plan(state = createLabelSessionState("tree-1", 0), nodeIds = ["root", "child"]) {
  return planLabelWork(ROOT, nodeIds, state, "zh-CN");
}

function begun(items: readonly LabelWorkItem[], operationId: string | null = "op-1") {
  let state = createLabelSessionState("tree-1", 0);
  for (const item of items) {
    state = reduceLabelSession(state, { type: "begin", item, operationId });
  }
  return state;
}

describe("planLabelWork", () => {
  it("plans one item per node with a label and a decision", () => {
    const items = plan();
    expect(items.map((item) => item.nodeId)).toEqual(["root", "child"]);
    expect(items[0]?.provisional.length).toBeGreaterThan(0);
    expect(items[0]?.requestModel).toBe(true);
    expect(items[1]?.requestModel).toBe(false);
  });

  it("skips a node whose material has not changed", () => {
    const state = begun(plan());
    expect(plan(state)).toEqual([]);
  });

  it("re-plans a node whose material changed", () => {
    const state = begun(plan());
    const edited = tree([node("root", "完全不同的一段材料", null, ["child"]), node("child", "重新思考首页结构", "root")]);
    const items = planLabelWork(edited, ["root"], state, "zh-CN");
    expect(items).toHaveLength(1);
    expect(items[0]?.basis).not.toBe(state.entries.get("root")?.basis);
  });

  it("skips unknown and blank nodes", () => {
    expect(planLabelWork(ROOT, ["missing"], createLabelSessionState("tree-1", 0), "zh-CN")).toEqual([]);
    const blank = tree([node("root", "   ", null)]);
    expect(planLabelWork(blank, ["root"], createLabelSessionState("tree-1", 0), "zh-CN")).toEqual([]);
  });

  it("never repeats a node id in one plan", () => {
    expect(plan(createLabelSessionState("tree-1", 0), ["root", "root"])).toHaveLength(1);
  });

  it("sends the parent excerpt and known sibling labels as reference only", () => {
    const state = begun(plan(createLabelSessionState("tree-1", 0), ["root"]));
    const [item] = planLabelWork(ROOT, ["child"], state, "zh-CN");
    expect(item?.reference.parentExcerpt).toBe(SPOKEN);
    expect(item?.reference.parentLabel).toBe(labelFor(state, "root"));
    expect(item?.text).not.toContain("<");
  });

  it("omits an empty document-root excerpt from the wire reference", () => {
    const document = tree([
      node("document", "", null, ["child"]),
      node("child", "一段需要命名的材料", "document"),
    ]);
    const [item] = planLabelWork(document, ["child"], createLabelSessionState("tree-1", 0), "zh-CN");
    expect(item?.reference).toEqual({});
  });
});

describe("reduceLabelSession", () => {
  const items = plan();
  const rootItem = items[0] as LabelWorkItem;

  it("commits the deterministic label immediately", () => {
    const state = begun([rootItem]);
    expect(state.entries.get("root")).toMatchObject({
      label: rootItem.provisional,
      origin: "provisional",
      pendingOperationId: "op-1",
    });
  });

  it("ignores a repeated begin for unchanged material", () => {
    const state = begun([rootItem]);
    expect(reduceLabelSession(state, { type: "begin", item: rootItem, operationId: "op-2" }))
      .toBe(state);
  });

  it("applies a model answer for the current operation", () => {
    const state = reduceLabelSession(begun([rootItem]), {
      type: "settled",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      label: "想象的生活",
      source: "model",
    });
    expect(state.entries.get("root")).toMatchObject({
      label: "想象的生活",
      origin: "model",
      pendingOperationId: null,
    });
  });

  it("drops an answer whose material moved on", () => {
    const state = begun([rootItem]);
    expect(reduceLabelSession(state, {
      type: "settled",
      nodeId: "root",
      basis: "a-different-basis",
      operationId: "op-1",
      label: "想象的生活",
      source: "model",
    })).toBe(state);
  });

  it("drops an answer superseded by a newer operation", () => {
    const state = begun([rootItem], "op-2");
    expect(reduceLabelSession(state, {
      type: "settled",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      label: "想象的生活",
      source: "model",
    })).toBe(state);
  });

  it("drops an answer for a node that no longer exists", () => {
    const state = reduceLabelSession(begun([rootItem]), {
      type: "prune",
      liveNodeIds: new Set<string>(),
    });
    expect(state.entries.size).toBe(0);
    expect(reduceLabelSession(state, {
      type: "settled",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      label: "想象的生活",
      source: "model",
    })).toBe(state);
  });

  it("keeps the deterministic label on failure", () => {
    const state = reduceLabelSession(begun([rootItem]), {
      type: "failed",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
    });
    expect(state.entries.get("root")).toMatchObject({
      label: rootItem.provisional,
      origin: "provisional",
      pendingOperationId: null,
    });
  });

  it("releases queued ownership while preserving the right to plan after cooldown", () => {
    const state = reduceLabelSession(begun([rootItem]), {
      type: "failed",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      deferred: true,
    });
    expect(state.entries.get("root")).toMatchObject({
      label: rootItem.provisional,
      pendingOperationId: null,
      deferred: true,
    });
    expect(planLabelWork(ROOT, ["root"], state, "zh-CN")).toHaveLength(1);
  });

  it("clears everything at a document boundary", () => {
    const state = reduceLabelSession(begun([rootItem]), {
      type: "document-changed",
      treeId: "tree-2",
      documentEpoch: 1,
    });
    expect(state.entries.size).toBe(0);
    expect(state.treeId).toBe("tree-2");
  });

  it("is unchanged when the document boundary did not move", () => {
    const state = begun([rootItem]);
    expect(reduceLabelSession(state, {
      type: "document-changed",
      treeId: "tree-1",
      documentEpoch: 0,
    })).toBe(state);
  });

  it("restores a stored label without asking again", () => {
    const state = reduceLabelSession(createLabelSessionState("tree-1", 0), {
      type: "restore",
      treeId: "tree-1",
      entries: [{ nodeId: "root", label: "想象的其他生活", origin: "model", basis: rootItem.basis }],
    });
    expect(state.entries.get("root")).toMatchObject({ label: "想象的其他生活", origin: "model" });
    expect(planLabelWork(ROOT, ["root"], state, "zh-CN")).toEqual([]);
  });

  it("ignores a restore for another document", () => {
    const state = createLabelSessionState("tree-1", 0);
    expect(reduceLabelSession(state, {
      type: "restore",
      treeId: "tree-2",
      entries: [{ nodeId: "root", label: "别的", origin: "model", basis: "x" }],
    })).toBe(state);
  });

  it("never lets a restore displace a label this session settled", () => {
    const settled = reduceLabelSession(begun([rootItem]), {
      type: "settled",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      label: "想象的生活",
      source: "model",
    });
    const restored = reduceLabelSession(settled, {
      type: "restore",
      treeId: "tree-1",
      entries: [{ nodeId: "root", label: "旧的名字", origin: "model", basis: "old" }],
    });
    expect(labelFor(restored, "root")).toBe("想象的生活");
  });

  it("does not restore a model label over a different current material basis", () => {
    const current = begun([rootItem]);
    const restored = reduceLabelSession(current, {
      type: "restore",
      treeId: "tree-1",
      entries: [{ nodeId: "root", label: "旧的名字", origin: "model", basis: "old-basis" }],
    });
    expect(restored).toBe(current);
  });

  it("lets a durable manual name outrank an automatic answer", () => {
    const settled = reduceLabelSession(begun([rootItem]), {
      type: "settled",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      label: "想象的生活",
      source: "model",
    });
    const restored = reduceLabelSession(settled, {
      type: "restore",
      treeId: "tree-1",
      entries: [{ nodeId: "root", label: "我给它的名字", origin: "user", basis: null }],
    });
    expect(restored.entries.get("root")).toMatchObject({
      label: "我给它的名字",
      origin: "user",
      basis: null,
    });
  });

  it("keeps a name a person typed against every automatic path", () => {
    const named = reduceLabelSession(begun([rootItem]), {
      type: "rename",
      nodeId: "root",
      label: "  过去的另一种生活  ",
    });
    expect(named.entries.get("root")).toMatchObject({
      label: "过去的另一种生活",
      origin: "user",
      basis: null,
      pendingOperationId: null,
    });

    // Neither a model answer, nor a re-plan, nor a restore may overwrite it.
    expect(reduceLabelSession(named, {
      type: "settled",
      nodeId: "root",
      basis: rootItem.basis,
      operationId: "op-1",
      label: "模型的名字",
      source: "model",
    })).toBe(named);
    expect(reduceLabelSession(named, { type: "begin", item: rootItem, operationId: "op-9" })).toBe(named);
    expect(reduceLabelSession(named, {
      type: "restore",
      treeId: "tree-1",
      entries: [{ nodeId: "root", label: "存过的名字", origin: "model", basis: rootItem.basis }],
    })).toBe(named);
    expect(planLabelWork(ROOT, ["root"], named, "zh-CN")).toEqual([]);
  });

  it("keeps a manual name after the material changes", () => {
    const named = reduceLabelSession(begun([rootItem]), {
      type: "rename",
      nodeId: "root",
      label: "过去的另一种生活",
    });
    const edited = tree([node("root", "完全不同的一段材料在这里", null, ["child"]), node("child", "重新思考首页结构", "root")]);
    expect(planLabelWork(edited, ["root"], named, "zh-CN")).toEqual([]);
    expect(labelFor(named, "root")).toBe("过去的另一种生活");
  });

  it("returns a node to automatic naming when the name is reset", () => {
    const named = reduceLabelSession(begun([rootItem]), {
      type: "rename",
      nodeId: "root",
      label: "过去的另一种生活",
    });
    const reset = reduceLabelSession(named, { type: "reset-name", nodeId: "root" });
    expect(reset.entries.has("root")).toBe(false);
    expect(planLabelWork(ROOT, ["root"], reset, "zh-CN")).toHaveLength(1);
    expect(reduceLabelSession(reset, { type: "reset-name", nodeId: "root" })).toBe(reset);
  });

  it("ignores a blank rename", () => {
    const state = begun([rootItem]);
    expect(reduceLabelSession(state, { type: "rename", nodeId: "root", label: "   " })).toBe(state);
  });

  it("keeps prune identity when nothing was removed", () => {
    const state = begun([rootItem]);
    expect(reduceLabelSession(state, { type: "prune", liveNodeIds: new Set(["root"]) })).toBe(state);
  });
});
