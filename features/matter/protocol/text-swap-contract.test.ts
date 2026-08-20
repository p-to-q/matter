import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "../tree/engine";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  TEXT_SWAP_REQUEST_VERSION,
  buildTextSwapPlan,
  parseTextSwapError,
  parseTextSwapEnvelope,
  parseTextSwapPlan,
  planToTextSwapCommand,
} from "./text-swap-contract";

const TIME = "2026-08-20T00:00:00.000Z";
const TEXT = "Rain touched the window. Next";
const PASSAGE = "Rain touched the window";
const SWAP = "Drops tapped against glass";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: "swap_contract",
    treeId: "tree_contract",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: 4,
    selection: { type: "segment-range", nodeId: "thought", start: 0, end: PASSAGE.length, selectedText: PASSAGE },
    direction: { text: "  make it more tactile  " },
    locale: "en-US",
    context: { lineage: [
      { id: "thought", text: TEXT, parentId: null, createdAt: TIME, updatedAt: TIME },
    ] },
    ...overrides,
  };
}

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_contract",
    rootId: "document",
    title: "Text swap contract",
    revision: 4,
    nodes: {
      document: { id: "document", role: "document-root", text: "", parentId: null, children: ["thought"], createdAt: TIME, updatedAt: TIME },
      thought: { id: "thought", text: TEXT, parentId: "document", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
}

describe("text-swap/1 contract", () => {
  it("accepts only the exact contract and canonicalizes the bounded direction", () => {
    const parsed = parseTextSwapEnvelope(envelope());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope.direction).toEqual({ text: "make it more tactile" });
    expect(parseTextSwapEnvelope({ ...envelope(), gesture: { type: "stretch" } }).ok).toBe(false);
    expect(parseTextSwapEnvelope({ ...envelope(), voice: { transcript: "rewrite" } }).ok).toBe(false);
    expect(parseTextSwapEnvelope(envelope({ requestVersion: "transform/2" })).ok).toBe(false);
    expect(parseTextSwapEnvelope(envelope({ direction: { text: "one\ntwo" } })).ok).toBe(false);
    expect(parseTextSwapEnvelope(envelope({ context: { lineage: [
      { id: "document", text: "", parentId: null, createdAt: TIME, updatedAt: TIME },
      { id: "thought", text: TEXT, parentId: "document", createdAt: TIME, updatedAt: TIME },
    ] } })).ok).toBe(false);
  });

  it("requires exactly one current punctuation segment", () => {
    expect(parseTextSwapEnvelope(envelope({
      selection: { type: "segment-range", nodeId: "thought", start: 0, end: TEXT.length, selectedText: TEXT },
    })).ok).toBe(false);
  });

  it("accepts only an exact, internally consistent error receipt", () => {
    expect(parseTextSwapError({
      error: {
        code: "TURN_UNAVAILABLE",
        message: "try later",
        retryable: true,
        fallbackReason: "MODEL_TIMEOUT",
      },
    })).toEqual({
      code: "TURN_UNAVAILABLE",
      message: "try later",
      retryable: true,
      fallbackReason: "MODEL_TIMEOUT",
    });
    expect(parseTextSwapError({
      error: { code: "INVALID_REQUEST", message: "bad", retryable: true },
    })).toBeNull();
    expect(parseTextSwapError({
      error: { code: "TURN_REJECTED", message: "no", retryable: true, extra: true },
    })).toBeNull();
  });

  it("builds and accepts only a server-owned paraphrase plan with settle presentation", () => {
    const parsed = parseTextSwapEnvelope(envelope());
    if (!parsed.ok) throw new Error("fixture must parse");
    const plan = buildTextSwapPlan(parsed.envelope, SWAP);
    expect(parseTextSwapPlan(plan, parsed.envelope)).toEqual(plan);
    expect(plan.action.intent).toBe("paraphrase");
    expect(plan.presentation.motionHint).toBe("settle");
    expect(parseTextSwapPlan({ ...plan, presentation: { motionHint: "grow" } }, parsed.envelope)).toBeNull();
    expect(parseTextSwapPlan({ ...plan, action: { ...plan.action, intent: "expand" } }, parsed.envelope)).toBeNull();
  });

  it("translates through the tree boundary and rejects stale tree or lineage", () => {
    const parsed = parseTextSwapEnvelope(envelope());
    if (!parsed.ok) throw new Error("fixture must parse");
    const plan = buildTextSwapPlan(parsed.envelope, SWAP);
    const result = planToTextSwapCommand(tree(), parsed.envelope, plan, {
      source: "fixture",
      now: () => Date.parse("2026-08-20T00:00:01.000Z"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("plan must become command");
    expect(applyTreeCommand(tree(), result.command).ok).toBe(true);
    expect(planToTextSwapCommand({ ...tree(), revision: 5 }, parsed.envelope, plan))
      .toEqual({ ok: false, reason: "STALE" });
    const changed = tree();
    changed.nodes.thought.text = "Changed. Next";
    expect(planToTextSwapCommand(changed, parsed.envelope, plan))
      .toEqual({ ok: false, reason: "STALE" });
  });
});
