import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "../tree/engine";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  buildTransformPlan,
  parseTransformEnvelope,
  parseTransformPlan,
  planToTreeCommand,
  targetCodePointsForStretch,
} from "./transform-contract";

const TIME = "2026-08-11T00:00:00.000Z";
const TEXT = "我一直觉得，这件事可能没那么重要。";
const PASSAGE = "这件事可能没那么重要";

function envelope(overrides: Record<string, unknown> = {}) {
  const start = TEXT.indexOf(PASSAGE);
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "turn_contract",
    treeId: "tree_contract",
    mode: "transform",
    treeRevision: 4,
    selection: { type: "segment-range", nodeId: "thought", start, end: start + PASSAGE.length, selectedText: PASSAGE },
    gesture: { type: "stretch", axis: "vertical", amount: 0.5 },
    voice: { transcript: "说得更具体一点", language: "zh-CN", durationMs: 900 },
    context: { lineage: [
      { id: "document", text: "", parentId: null, createdAt: TIME, updatedAt: TIME },
      { id: "thought", text: TEXT, parentId: "document", createdAt: TIME, updatedAt: TIME },
    ] },
    ...overrides,
  };
}

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_contract",
    rootId: "document",
    title: "Contract test",
    revision: 4,
    nodes: {
      document: { id: "document", role: "document-root", text: "", parentId: null, children: ["thought"], createdAt: TIME, updatedAt: TIME },
      thought: { id: "thought", text: TEXT, parentId: "document", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
}

describe("transform contract", () => {
  it("accepts one exact root-to-selection envelope and rejects protocol drift", () => {
    const parsed = parseTransformEnvelope(envelope());
    expect(parsed.ok).toBe(true);
    expect(parseTransformEnvelope(envelope({ extra: true })).ok).toBe(false);
    expect(parseTransformEnvelope(envelope({ gesture: { type: "stretch", axis: "horizontal", amount: 0.5 } })).ok).toBe(false);
    expect(parseTransformEnvelope(envelope({ selection: { type: "segment-range", nodeId: "thought", start: 0, end: 1, selectedText: "我" } })).ok).toBe(false);
  });

  it("makes the continuous stretch a bounded server-owned expansion target", () => {
    expect(targetCodePointsForStretch(PASSAGE, 0.5)).toBe(20);
    expect(targetCodePointsForStretch(PASSAGE, 1)).toBe(30);
    expect(targetCodePointsForStretch(PASSAGE, 1.1)).toBeNull();
  });

  it("only accepts a plan that echoes every capability-fixed field", () => {
    const parsed = parseTransformEnvelope(envelope());
    if (!parsed.ok) throw new Error("fixture must parse");
    const plan = buildTransformPlan(parsed.envelope, "这件事可能没那么重要，但还有一些尚未展开的地方");
    expect(parseTransformPlan(plan, parsed.envelope)).toEqual(plan);
    expect(parseTransformPlan({ ...plan, action: { ...plan.action, nodeId: "other" } }, parsed.envelope)).toBeNull();
    expect(parseTransformPlan({ ...plan, action: { ...plan.action, text: "很短" } }, parsed.envelope)).toBeNull();
  });

  it("revalidates identity, revision, selection, and composed node bounds immediately before a commit", () => {
    const parsed = parseTransformEnvelope(envelope());
    if (!parsed.ok) throw new Error("fixture must parse");
    const plan = buildTransformPlan(parsed.envelope, "这件事可能没那么重要，但还有一些尚未展开的地方");
    const command = planToTreeCommand(tree(), parsed.envelope, plan, {
      source: "fixture",
      now: () => Date.parse("2026-08-11T00:00:01.000Z"),
    });
    expect(command.ok).toBe(true);
    if (!command.ok) throw new Error("plan must become command");
    const committed = applyTreeCommand(tree(), command.command);
    expect(committed.ok).toBe(true);
    expect(planToTreeCommand({ ...tree(), revision: 5 }, parsed.envelope, plan)).toEqual({
      ok: false,
      reason: "STALE",
    });
    expect(planToTreeCommand(tree(), parsed.envelope, {
      ...plan,
      action: { ...plan.action, end: plan.action.end - 1 },
    })).toEqual({ ok: false, reason: "INVALID_PLAN" });
  });
});
