import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  createTextSwapBasis,
  createTextSwapEnvelope,
  deliveryDwellRemainingMs,
  pendingDwellRemainingMs,
  scheduleDeliveryDwellRefresh,
} from "./use-text-swap";

describe("Text Swap pending dwell", () => {
  it("opens delivery after an early timer without another pointer or render", () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    const remaining = () => pendingDwellRemainingMs({ atMs: 1_000 }, 600, nowMs);
    const windows: boolean[] = [];
    const cancel = scheduleDeliveryDwellRefresh(remaining, () => windows.push(remaining() === 0));
    try {
      nowMs = 1_599.6;
      vi.advanceTimersByTime(600);
      expect(windows.at(-1)).toBe(false);
      nowMs = 1_600;
      vi.advanceTimersByTime(1);
      expect(windows.at(-1)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      cancel();
      vi.useRealTimers();
    }
  });

  it("cancels the dwell refresh when its request owner leaves", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const cancel = scheduleDeliveryDwellRefresh(() => 600, refresh);
    try {
      refresh.mockClear();
      cancel();
      vi.runAllTimers();
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      cancel();
      vi.useRealTimers();
    }
  });

  it("holds delivery until a request has been pending the minimum time", () => {
    const since = { atMs: 1_000 };
    expect(pendingDwellRemainingMs(since, 600, 1_000)).toBe(600);
    expect(pendingDwellRemainingMs(since, 600, 1_450)).toBe(150);
    expect(pendingDwellRemainingMs(since, 600, 1_600)).toBe(0);
    expect(pendingDwellRemainingMs(since, 600, 9_000)).toBe(0);
    // No pending request, or no field to keep pending, never holds.
    expect(pendingDwellRemainingMs(null, 600, 1_000)).toBe(0);
    expect(pendingDwellRemainingMs(since, 0, 1_000)).toBe(0);
  });

  it("waits for the later pending cue or actual first-paint deadline", () => {
    // An old field has already met its paint dwell, so it still owes only the
    // ordinary 600 ms pending cue rather than an artificial 800 ms timeout.
    expect(deliveryDwellRemainingMs({ atMs: 5_000 }, 600, 1_800, 5_000)).toBe(600);
    expect(deliveryDwellRemainingMs({ atMs: 5_000 }, 600, 1_800, 5_600)).toBe(0);

    // If paint lands after submit, its actual deadline wins.
    expect(deliveryDwellRemainingMs({ atMs: 1_000 }, 600, 2_300, 1_020)).toBe(1_280);
    expect(deliveryDwellRemainingMs({ atMs: 1_000 }, 600, 2_300, 2_300)).toBe(0);
    expect(deliveryDwellRemainingMs(null, 600, 2_300, 1_020)).toBe(0);
  });

  it("releases a resolved delivery once when presentation detaches", () => {
    vi.useFakeTimers();
    const nowMs = 1_100;
    let minimumPendingMs = 600;
    let notBeforeMs = 2_300;
    let delivered = false;
    let commits = 0;
    const remaining = () => deliveryDwellRemainingMs(
      { atMs: 1_000 },
      minimumPendingMs,
      notBeforeMs,
      nowMs,
    );
    const refresh = () => {
      if (remaining() === 0 && !delivered) {
        delivered = true;
        commits += 1;
      }
    };
    let cancel = scheduleDeliveryDwellRefresh(remaining, refresh);
    try {
      expect(commits).toBe(0);
      // Detach clears both visible clocks and re-evaluates the same resolved
      // delivery immediately; the old deadline's timer is cancelled.
      cancel();
      minimumPendingMs = 0;
      notBeforeMs = 0;
      cancel = scheduleDeliveryDwellRefresh(remaining, refresh);
      expect(commits).toBe(1);
      refresh();
      vi.runAllTimers();
      expect(commits).toBe(1);
    } finally {
      cancel();
      vi.useRealTimers();
    }
  });
});

const TIME = "2026-08-20T00:00:00.000Z";
const TEXT = "Rain is near. Next";
const SELECTION = Object.freeze({
  type: "segment-range" as const,
  nodeId: "thought_1",
  start: 0,
  end: 12,
  selectedText: "Rain is near",
});

describe("Text Swap basis and envelope", () => {
  it("freezes one current punctuation segment with its untouched source", () => {
    const basis = createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });

    expect(basis).toEqual({
      treeId: "tree_1",
      baseRevision: 4,
      documentEpoch: 3,
      selection: SELECTION,
      sourceText: "Rain is near",
      locale: "en-US",
      lineage: [{
        id: "thought_1",
        text: TEXT,
        parentId: null,
        createdAt: TIME,
        updatedAt: TIME,
      }],
    });
    expect(Object.isFrozen(basis?.selection)).toBe(true);
  });

  it("accepts the exact whole node addressed by the passage-local AI control", () => {
    const wholeNode = Object.freeze({
      type: "segment-range" as const,
      nodeId: "thought_1",
      start: 0,
      end: TEXT.length,
      selectedText: TEXT,
    });
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: wholeNode,
      locale: "en-US",
    })?.selection).toEqual(wholeNode);
  });

  it("rejects an arbitrary partial range, stale text, and a missing selection", () => {
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: {
        ...SELECTION,
        end: TEXT.length - 1,
        selectedText: TEXT.slice(0, -1),
      },
      locale: "en-US",
    })).toBeNull();
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: { ...SELECTION, selectedText: "Other source" },
      locale: "en-US",
    })).toBeNull();
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: null,
      locale: "en-US",
    })).toBeNull();
  });

  it("builds the stable text-swap/2 shape without audio or carrier metadata", () => {
    const currentTree = tree();
    const basis = createTextSwapBasis({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });
    if (basis === null) throw new Error("basis missing");
    const envelope = createTextSwapEnvelope({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      basis,
      direction: "Use a more tentative rhythm",
      id: "text_swap_request_1",
    });

    expect(envelope).toMatchObject({
      requestVersion: "text-swap/2",
      id: "text_swap_request_1",
      mode: "transform",
      operation: "paraphrase-in-place",
      treeRevision: 4,
      selection: SELECTION,
      direction: { text: "Use a more tentative rhythm" },
      context: { lineage: [{ id: "thought_1", parentId: null }] },
    });
    expect(envelope).not.toHaveProperty("audio");
    expect(envelope).not.toHaveProperty("carrier");
    expect(envelope).not.toHaveProperty("gesture");
    expect(envelope?.context.lineage.some((node) => node.id === "document")).toBe(false);
  });

  it("rebases an unrelated revision and refuses a changed epoch, lineage, selection, or direction", () => {
    const currentTree = tree();
    const basis = createTextSwapBasis({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });
    if (basis === null) throw new Error("basis missing");
    const common = {
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      basis,
      direction: "Use a more tentative rhythm",
      id: "text_swap_request_1",
    };

    expect(createTextSwapEnvelope({ ...common, documentEpoch: 4 })).toBeNull();
    expect(createTextSwapEnvelope({
      ...common,
      tree: { ...currentTree, revision: 5 },
    })?.treeRevision).toBe(5);
    expect(createTextSwapEnvelope({
      ...common,
      tree: {
        ...currentTree,
        revision: 5,
        nodes: {
          ...currentTree.nodes,
          thought_1: { ...currentTree.nodes.thought_1!, text: "Rain was near. Next" },
        },
      },
    })).toBeNull();
    expect(createTextSwapEnvelope({
      ...common,
      selection: { ...SELECTION, selectedText: "Other source" },
    })).toBeNull();
    expect(createTextSwapEnvelope({
      ...common,
      direction: "line one\nline two",
    })).toBeNull();
  });

  it("does not reinterpret one direction after an ancestor edit or reparent", () => {
    const currentTree = nestedTree();
    const basis = createTextSwapBasis({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });
    if (basis === null) throw new Error("basis missing");
    const common = {
      documentEpoch: 3,
      selection: SELECTION,
      basis,
      direction: "Use a more tentative rhythm",
      id: "text_swap_request_1",
    };
    const ancestorChanged: ThoughtTree = {
      ...currentTree,
      revision: 5,
      nodes: {
        ...currentTree.nodes,
        parent_1: {
          ...currentTree.nodes.parent_1!,
          text: "A different frame",
          updatedAt: "2026-08-20T00:00:01.000Z",
        },
      },
    };
    expect(createTextSwapEnvelope({ ...common, tree: ancestorChanged })).toBeNull();

    const reparented: ThoughtTree = {
      ...currentTree,
      revision: 5,
      nodes: {
        ...currentTree.nodes,
        document: { ...currentTree.nodes.document!, children: ["parent_1", "parent_2"] },
        parent_1: { ...currentTree.nodes.parent_1!, children: [] },
        parent_2: {
          id: "parent_2",
          text: "Another frame",
          parentId: "document",
          children: ["thought_1"],
          createdAt: TIME,
          updatedAt: TIME,
        },
        thought_1: { ...currentTree.nodes.thought_1!, parentId: "parent_2" },
      },
    };
    expect(createTextSwapEnvelope({ ...common, tree: reparented })).toBeNull();
  });
});

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_1",
    rootId: "document",
    title: "Text Swap",
    revision: 4,
    nodes: {
      document: {
        id: "document",
        role: "document-root",
        text: "",
        parentId: null,
        children: ["thought_1"],
        createdAt: TIME,
        updatedAt: TIME,
      },
      thought_1: {
        id: "thought_1",
        text: TEXT,
        parentId: "document",
        children: [],
        createdAt: TIME,
        updatedAt: TIME,
      },
    },
  };
}

function nestedTree(): ThoughtTree {
  const current = tree();
  return {
    ...current,
    nodes: {
      ...current.nodes,
      document: { ...current.nodes.document!, children: ["parent_1"] },
      parent_1: {
        id: "parent_1",
        text: "The weather frame",
        parentId: "document",
        children: ["thought_1"],
        createdAt: TIME,
        updatedAt: TIME,
      },
      thought_1: { ...current.nodes.thought_1!, parentId: "parent_1" },
    },
  };
}
