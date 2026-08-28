import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTransformPlan, type TransformEnvelope, type TransformPlan } from "../protocol/transform-contract";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import type { StretchCommitBasis } from "../runtime/stretch-interaction";

const hookSpies = vi.hoisted(() => ({
  requestTransform: vi.fn(),
  setState: vi.fn(),
  setInvariantFailure: vi.fn(),
  cleanups: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: <Value,>(callback: Value): Value => callback,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") hookSpies.cleanups.push(cleanup);
    },
    useLayoutEffect: (effect: () => void) => effect(),
    useRef: <Value,>(value: Value) => ({ current: value }),
    useState: <Value,>(initial: Value) => [
      initial,
      initial === null ? hookSpies.setInvariantFailure : hookSpies.setState,
    ] as const,
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
  hookSpies.setInvariantFailure.mockReset();
  hookSpies.cleanups.length = 0;
  vi.stubGlobal("window", new EventTarget());
  const pageDocument = new EventTarget() as EventTarget & {
    visibilityState: DocumentVisibilityState;
  };
  pageDocument.visibilityState = "visible";
  vi.stubGlobal("document", pageDocument);
});

afterEach(() => {
  for (const cleanup of hookSpies.cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
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

  it("refuses a stale revision, document, or selected range", () => {
    const common = { tree: tree(), selection: SELECTION, locale: "en-US" as const, basis: BASIS, id: "turn_fixed" };
    expect(createFixedExpandEnvelope({ ...common, documentEpoch: 4 })).toBeNull();
    expect(createFixedExpandEnvelope({ ...common, documentEpoch: 3, tree: { ...tree(), revision: 5 } })).toBeNull();
    expect(createFixedExpandEnvelope({
      ...common,
      documentEpoch: 3,
      selection: { ...SELECTION, selectedText: "other" },
    })).toBeNull();
  });

  it("accepts a one-sentence node whose only segment fills the node", () => {
    const current = tree();
    current.nodes.thought!.text = SELECTION.selectedText;
    expect(createFixedExpandEnvelope({
      tree: current,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
      basis: BASIS,
      id: "turn_fixed",
    })).toMatchObject({ selection: SELECTION });
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

  it("returns to idle without visible failure state when the provider request is unavailable", async () => {
    hookSpies.requestTransform.mockRejectedValue(new Error("provider unavailable"));
    const onUnavailable = vi.fn();
    const turn = useFixedExpandTurn({
      tree: tree(),
      documentEpoch: BASIS.documentEpoch,
      selection: SELECTION,
      locale: "en-US",
      enabled: true,
      interactionScopeKey: "focus:thought",
      commit: vi.fn(),
      onCommitted: vi.fn(),
      onUnavailable,
    });

    expect(turn.start(BASIS)).toBe(true);
    await vi.waitFor(() => expect(hookSpies.setState).toHaveBeenLastCalledWith({
      phase: "idle",
      basis: null,
    }));
    expect(hookSpies.setState).not.toHaveBeenCalledWith({ phase: "error", basis: BASIS });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(hookSpies.setInvariantFailure).not.toHaveBeenCalled();
  });

  it.each(["commit", "onCommitted"] as const)(
    "surfaces a local %s exception as an invariant failure, not provider unavailability",
    async (failureOwner) => {
      hookSpies.requestTransform.mockImplementation(async (envelope) =>
        buildTransformPlan(envelope, "source more"));
      const failure = new Error(`${failureOwner} invariant`);
      const onUnavailable = vi.fn();
      const onCommitted = failureOwner === "onCommitted"
        ? vi.fn(() => { throw failure; })
        : vi.fn();
      const commit = failureOwner === "commit"
        ? vi.fn(() => { throw failure; })
        : vi.fn(() => ({ nodeId: "thought" }) as never);
      const turn = useFixedExpandTurn({
        tree: tree(),
        documentEpoch: BASIS.documentEpoch,
        selection: SELECTION,
        locale: "en-US",
        enabled: true,
        interactionScopeKey: "focus:thought",
        commit,
        onCommitted,
        onUnavailable,
      });

      expect(turn.start(BASIS)).toBe(true);
      await vi.waitFor(() => expect(hookSpies.setInvariantFailure).toHaveBeenCalledWith({ error: failure }));
      expect(onUnavailable).not.toHaveBeenCalled();
      expect(hookSpies.setState).toHaveBeenLastCalledWith({ phase: "idle", basis: null });
    },
  );

  it("aborts a superseded request and gives its late plan no commit authority", async () => {
    const pending: Array<{
      envelope: TransformEnvelope;
      signal: AbortSignal;
      resolve: (plan: TransformPlan) => void;
    }> = [];
    hookSpies.requestTransform.mockImplementation((envelope, signal) =>
      new Promise<TransformPlan>((resolve) => pending.push({ envelope, signal, resolve })));
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
    expect(turn.start(BASIS)).toBe(true);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.resolve(buildTransformPlan(pending[0]!.envelope, "source more"));
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    pending[1]!.resolve(buildTransformPlan(pending[1]!.envelope, "source more"));
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  });

  it.each(["plan", "refusal"] as const)(
    "gives a stale-scope %s no authority before passive cancellation",
    async (outcome) => {
      let pending: {
        envelope: TransformEnvelope;
        resolve: (plan: TransformPlan) => void;
        reject: (error: unknown) => void;
      } | undefined;
      hookSpies.requestTransform.mockImplementation((envelope) =>
        new Promise<TransformPlan>((resolve, reject) => {
          pending = { envelope, resolve, reject };
        }));
      const commit = vi.fn();
      const onCommitted = vi.fn();
      const onUnavailable = vi.fn();
      const input = {
        tree: tree(),
        documentEpoch: BASIS.documentEpoch,
        selection: SELECTION,
        locale: "en-US" as const,
        enabled: true,
        interactionScopeKey: "full:thought:working-1",
        commit,
        onCommitted,
        onUnavailable,
      };
      const turn = useFixedExpandTurn(input);

      expect(turn.start(BASIS)).toBe(true);
      // A navigation or working-context render publishes the new input in a
      // layout effect. The response guard must not wait for passive cancellation.
      input.interactionScopeKey = "focus:thought:working-2";
      if (pending === undefined) throw new Error("Transform request did not start.");
      if (outcome === "plan") {
        pending.resolve(buildTransformPlan(pending.envelope, "source more"));
      } else {
        pending.reject(new Error("provider unavailable"));
      }

      await vi.waitFor(() => expect(hookSpies.setState).toHaveBeenLastCalledWith({
        phase: "idle",
        basis: null,
      }));
      expect(input.tree.revision).toBe(BASIS.baseRevision);
      expect(commit).not.toHaveBeenCalled();
      expect(onCommitted).not.toHaveBeenCalled();
      expect(onUnavailable).not.toHaveBeenCalled();
    },
  );

  it("keeps an in-flight expansion through an unrelated tree revision", async () => {
    let pending: { envelope: TransformEnvelope; resolve: (plan: TransformPlan) => void } | undefined;
    hookSpies.requestTransform.mockImplementation((envelope) =>
      new Promise<TransformPlan>((resolve) => {
        pending = { envelope, resolve };
      }));
    const commit = vi.fn(() => ({
      id: "change-1",
      treeId: "tree_fixed",
      documentEpoch: BASIS.documentEpoch,
      nodeId: "thought",
      committedRevision: 6,
      motionHint: "grow" as const,
      before: { text: TEXT, updatedAt: TIME },
      after: { text: "source more. next", updatedAt: "2026-08-11T00:00:01.000Z" },
    }));
    const input = {
      tree: tree(),
      documentEpoch: BASIS.documentEpoch,
      selection: SELECTION,
      locale: "en-US" as const,
      enabled: true,
      interactionScopeKey: "focus:thought",
      commit,
      onCommitted: vi.fn(),
    };
    const turn = useFixedExpandTurn(input);

    expect(turn.start(BASIS)).toBe(true);
    input.tree = { ...input.tree, revision: 5 };
    if (pending === undefined) throw new Error("Transform request did not start.");
    pending.resolve(buildTransformPlan(pending.envelope, "source more"));
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());
  });

  it("revokes an in-flight expansion when its addressed material changes", async () => {
    let pending: { envelope: TransformEnvelope; resolve: (plan: TransformPlan) => void } | undefined;
    hookSpies.requestTransform.mockImplementation((envelope) =>
      new Promise<TransformPlan>((resolve) => {
        pending = { envelope, resolve };
      }));
    const commit = vi.fn();
    const input = {
      tree: tree(),
      documentEpoch: BASIS.documentEpoch,
      selection: SELECTION,
      locale: "en-US" as const,
      enabled: true,
      interactionScopeKey: "focus:thought",
      commit,
      onCommitted: vi.fn(),
    };
    const turn = useFixedExpandTurn(input);

    expect(turn.start(BASIS)).toBe(true);
    input.tree = {
      ...input.tree,
      revision: 5,
      nodes: {
        ...input.tree.nodes,
        thought: {
          ...input.tree.nodes.thought!,
          text: `${TEXT} changed context`,
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
      },
    };
    if (pending === undefined) throw new Error("Transform request did not start.");
    pending.resolve(buildTransformPlan(pending.envelope, "source more"));
    await vi.waitFor(() => expect(hookSpies.setState).toHaveBeenLastCalledWith({
      phase: "idle",
      basis: null,
    }));
    expect(commit).not.toHaveBeenCalled();
  });

  it.each(["pagehide", "unmount"] as const)(
    "aborts on %s and makes a late plan inert",
    async (exit) => {
      let pending: {
        envelope: TransformEnvelope;
        signal: AbortSignal;
        resolve: (plan: TransformPlan) => void;
      } | undefined;
      hookSpies.requestTransform.mockImplementation((envelope, signal) =>
        new Promise<TransformPlan>((resolve) => {
          pending = { envelope, signal, resolve };
        }));
      const commit = vi.fn();
      const onUnavailable = vi.fn();
      const turn = useFixedExpandTurn({
        tree: tree(),
        documentEpoch: BASIS.documentEpoch,
        selection: SELECTION,
        locale: "en-US",
        enabled: true,
        interactionScopeKey: "focus:thought",
        commit,
        onCommitted: vi.fn(),
        onUnavailable,
      });

      expect(turn.start(BASIS)).toBe(true);
      if (exit === "pagehide") window.dispatchEvent(new Event("pagehide"));
      else hookSpies.cleanups.pop()?.();
      expect(pending?.signal.aborted).toBe(true);
      pending?.resolve(buildTransformPlan(pending.envelope, "source more"));
      await Promise.resolve();
      expect(commit).not.toHaveBeenCalled();
      expect(onUnavailable).not.toHaveBeenCalled();
    },
  );

  it("accepts a whole multi-clause node as one contiguous transform range", () => {
    const whole = { ...SELECTION, end: TEXT.length, selectedText: TEXT };
    expect(createFixedExpandEnvelope({
      tree: tree(),
      documentEpoch: 3,
      selection: whole,
      locale: "en-US",
      basis: { ...BASIS, selection: whole },
      id: "turn_fixed",
    })).toMatchObject({ selection: whole });
  });

  it("quietly reopens without a request or tree commit when local envelope construction fails", () => {
    const commit = vi.fn();
    const onCommitted = vi.fn();
    const onUnavailable = vi.fn();
    const turn = useFixedExpandTurn({
      tree: treeWithOversizedLineage(),
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
      enabled: true,
      interactionScopeKey: "focus:thought",
      commit,
      onCommitted,
      onUnavailable,
    });

    expect(turn.start(BASIS)).toBe(false);
    expect(hookSpies.setState).toHaveBeenCalledTimes(1);
    expect(hookSpies.setState).toHaveBeenCalledWith({ phase: "idle", basis: null });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
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
