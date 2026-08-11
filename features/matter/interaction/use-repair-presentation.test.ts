import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdmissionRepairCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import {
  createRepairPresentationController,
  isRepairPresentationCurrent,
} from "./use-repair-presentation";

const CHANGE: AdmissionRepairCommittedChange = {
  id: "repair_1",
  treeId: "tree_1",
  documentEpoch: 4,
  nodeId: "node_1",
  committedRevision: 2,
  before: { text: "呃，我觉得可以。", updatedAt: "2026-08-11T10:00:00.000Z" },
  after: { text: "我觉得可以。", updatedAt: "2026-08-11T10:00:00.100Z" },
};

const TREE: ThoughtTree = {
  protocolVersion: "0.2",
  id: "tree_1",
  rootId: "node_1",
  revision: 2,
  nodes: {
    node_1: {
      id: "node_1",
      text: "我觉得可以。",
      parentId: null,
      children: [],
      createdAt: "2026-08-11T10:00:00.000Z",
      updatedAt: "2026-08-11T10:00:00.100Z",
    },
  },
};

describe("repair presentation validation", () => {
  it("survives unrelated later revisions but not a same-node change", () => {
    expect(isRepairPresentationCurrent(
      CHANGE,
      { treeId: "tree_1", documentEpoch: 4 },
      { ...TREE, revision: 3 },
    )).toBe(true);

    expect(isRepairPresentationCurrent(
      CHANGE,
      { treeId: "tree_1", documentEpoch: 4 },
      {
        ...TREE,
        revision: 3,
        nodes: {
          node_1: { ...TREE.nodes.node_1, text: "我自己又改了。" },
        },
      },
    )).toBe(false);
  });

  it("rejects a stale revision, document, or document epoch", () => {
    expect(isRepairPresentationCurrent(
      CHANGE,
      { treeId: "tree_1", documentEpoch: 4 },
      { ...TREE, revision: 1 },
    )).toBe(false);
    expect(isRepairPresentationCurrent(
      CHANGE,
      { treeId: "tree_1", documentEpoch: 5 },
      TREE,
    )).toBe(false);
    expect(isRepairPresentationCurrent(
      CHANGE,
      { treeId: "tree_2", documentEpoch: 4 },
      TREE,
    )).toBe(false);
  });
});

describe("repair presentation ownership", () => {
  afterEach(() => vi.useRealTimers());

  it("retains motion beyond its CSS duration and expires the receipt", () => {
    vi.useFakeTimers();
    const controller = createRepairPresentationController({
      treeId: "tree_1",
      documentEpoch: 4,
    });
    controller.publish(CHANGE);

    vi.advanceTimersByTime(300);
    expect(controller.getSnapshot().get("node_1")).toBe(CHANGE);
    vi.advanceTimersByTime(700);
    expect(controller.getSnapshot().size).toBe(0);
    controller.dispose();
  });

  it("bounds concurrent nodes and clears retained text on dispose", () => {
    vi.useFakeTimers();
    const controller = createRepairPresentationController({
      treeId: "tree_1",
      documentEpoch: 4,
    });
    for (let index = 1; index <= 4; index += 1) {
      controller.publish({
        ...CHANGE,
        id: `repair_${index}`,
        nodeId: `node_${index}`,
      });
    }

    expect([...controller.getSnapshot().keys()]).toEqual(["node_2", "node_3", "node_4"]);
    controller.dispose();
    expect(controller.getSnapshot().size).toBe(0);
  });

  it("rejects receipts from a different tree or document epoch", () => {
    const controller = createRepairPresentationController({
      treeId: "tree_2",
      documentEpoch: 5,
    });
    controller.publish(CHANGE);
    expect(controller.getSnapshot().size).toBe(0);
    controller.dispose();
  });

  it("survives a Strict Mode effect replay and disposes after a real release", async () => {
    vi.useFakeTimers();
    const controller = createRepairPresentationController({
      treeId: "tree_1",
      documentEpoch: 4,
    });

    controller.retain();
    controller.release();
    controller.retain();
    await Promise.resolve();
    controller.publish(CHANGE);
    expect(controller.getSnapshot().get("node_1")).toBe(CHANGE);

    controller.release();
    await Promise.resolve();
    expect(controller.getSnapshot().size).toBe(0);
    controller.publish(CHANGE);
    expect(controller.getSnapshot().size).toBe(0);
  });
});
