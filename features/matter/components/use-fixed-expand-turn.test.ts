import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTransformPlan } from "../protocol/transform-contract";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import type { StretchCommitBasis } from "../runtime/stretch-interaction";

const hookSpies = vi.hoisted(() => ({
  requestTransform: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: <Value,>(callback: Value): Value => callback,
    useEffect: () => undefined,
    useLayoutEffect: (effect: () => void) => effect(),
    useRef: <Value,>(value: Value) => ({ current: value }),
    useState: <Value,>(initial: Value) => [initial, hookSpies.setState] as const,
  };
});

vi.mock("../interaction/transform-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../interaction/transform-client")>();
  return { ...actual, requestTransform: hookSpies.requestTransform };
});

import { createFixedExpandEnvelope, useFixedExpandTurn } from "./use-fixed-expand-turn";

const TIME = "2026-08-11T00:00:00.000Z";
const TEXT = "source. next";
const SELECTION = Object.freeze({
  type: "segment-range" as const,
  nodeId: "thought",
  start: 0,
  end: 6,
  selectedText: "source",
});
const BASIS: StretchCommitBasis = Object.freeze({
  selection: SELECTION,
  treeId: "tree_fixed",
  baseRevision: 4,
  documentEpoch: 3,
  amount: .5,
});

beforeEach(() => {
  hookSpies.requestTransform.mockReset();
  hookSpies.setState.mockReset();
});

describe("createFixedExpandEnvelope", () => {
  it("creates the exact transform/2 capability without voice or a client target", () => {
    const envelope = createFixedExpandEnvelope({
      tree: tree(),
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
      basis: BASIS,
      id: "turn_fixed",
    });
    expect(envelope).toMatchObject({
      requestVersion: "transform/2",
      operation: "expand-in-place",
      gesture: { type: "stretch", axis: "vertical", amount: .5 },
      locale: "en-US",
      context: { lineage: [{ id: "thought", parentId: null }] },
    });
    expect(envelope?.context.lineage.some((node) => node.id === "document")).toBe(false);
    expect(envelope).not.toHaveProperty("voice");
    expect(envelope).not.toHaveProperty("target");
  });

  it("refuses a stale revision, document, or selected segment", () => {
    const common = { tree: tree(), selection: SELECTION, locale: "en-US" as const, basis: BASIS, id: "turn_fixed" };
    expect(createFixedExpandEnvelope({ ...common, documentEpoch: 4 })).toBeNull();
    expect(createFixedExpandEnvelope({ ...common, documentEpoch: 3, tree: { ...tree(), revision: 5 } })).toBeNull();
    expect(createFixedExpandEnvelope({
      ...common,
      documentEpoch: 3,
      selection: { ...SELECTION, selectedText: "other" },
    })).toBeNull();
  });
});

describe("useFixedExpandTurn", () => {
  it("commits with the document epoch captured when the request started", async () => {
    hookSpies.requestTransform.mockImplementation(async (envelope) =>
      buildTransformPlan(envelope, "source more"));
    const commit = vi.fn(() => null);
    const turn = useFixedExpandTurn({
      tree: tree(),
      documentEpoch: BASIS.documentEpoch,
      selection: SELECTION,
      locale: "en-US",
      enabled: true,
      interactionScopeKey: "focus:thought",
      commit,
      onCommitted: vi.fn(),
    });

    expect(turn.start(BASIS)).toBe(true);
    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ requestVersion: "transform/2" }),
      expect.objectContaining({ requestVersion: "transform/2" }),
      BASIS.documentEpoch,
    ));
  });

  it("reopens recovery without a request or tree commit when local envelope construction fails", () => {
    const commit = vi.fn();
    const onCommitted = vi.fn();
    const turn = useFixedExpandTurn({
      tree: treeWithOversizedLineage(),
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
      enabled: true,
      interactionScopeKey: "focus:thought",
      commit,
      onCommitted,
    });

    expect(turn.start(BASIS)).toBe(false);
    expect(hookSpies.setState).toHaveBeenCalledTimes(1);
    expect(hookSpies.setState).toHaveBeenCalledWith({ phase: "error", basis: BASIS });
    expect(hookSpies.requestTransform).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
  });
});

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_fixed",
    rootId: "document",
    title: "Fixed expand",
    revision: 4,
    nodes: {
      document: { id: "document", role: "document-root", text: "", parentId: null, children: ["thought"], createdAt: TIME, updatedAt: TIME },
      thought: { id: "thought", text: TEXT, parentId: "document", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
}

function treeWithOversizedLineage(): ThoughtTree {
  const nodes: ThoughtTree["nodes"] = {
    document: { id: "document", role: "document-root", text: "", parentId: null, children: ["context_1"], createdAt: TIME, updatedAt: TIME },
    thought: { id: "thought", text: TEXT, parentId: "context_4", children: [], createdAt: TIME, updatedAt: TIME },
  };
  for (let index = 1; index <= 4; index += 1) {
    const id = `context_${index}`;
    nodes[id] = {
      id,
      text: "a".repeat(2_000),
      parentId: index === 1 ? "document" : `context_${index - 1}`,
      children: [index === 4 ? "thought" : `context_${index + 1}`],
      createdAt: TIME,
      updatedAt: TIME,
    };
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_fixed",
    rootId: "document",
    title: "Fixed expand",
    revision: 4,
    nodes,
  };
}
