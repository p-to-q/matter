import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "../tree/engine";
import { MATTER_LOCALES } from "../config/locales";
import { MAX_TREE_DEPTH } from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  TRANSFORM_REQUEST_VERSION,
  buildTransformPlan,
  parseTransformEnvelope,
  parseTransformPlan,
  planToTreeCommand,
} from "./transform-contract";

const TIME = "2026-08-11T00:00:00.000Z";
const TEXT = "source. next";
const PASSAGE = "source";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TRANSFORM_REQUEST_VERSION,
    id: "turn_contract",
    treeId: "tree_contract",
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: 4,
    selection: { type: "segment-range", nodeId: "thought", start: 0, end: PASSAGE.length, selectedText: PASSAGE },
    gesture: { type: "stretch", axis: "vertical", amount: .5 },
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
    title: "Contract test",
    revision: 4,
    nodes: {
      document: { id: "document", role: "document-root", text: "", parentId: null, children: ["thought"], createdAt: TIME, updatedAt: TIME },
      thought: { id: "thought", text: TEXT, parentId: "document", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
}

function boundedLineage(length: number) {
  return Array.from({ length }, (_, index) => {
    const final = index === length - 1;
    return {
      id: final ? "thought" : `context_${index}`,
      text: final ? TEXT : "x",
      parentId: index === 0 ? null : `context_${index - 1}`,
      createdAt: TIME,
      updatedAt: TIME,
    };
  });
}

describe("transform/2 contract", () => {
  it("accepts one exact fixed-expand envelope and rejects voice, legacy, and unknown fields", () => {
    expect(parseTransformEnvelope(envelope()).ok).toBe(true);
    expect(parseTransformEnvelope({ ...envelope(), voice: { transcript: "more" } }).ok).toBe(false);
    expect(parseTransformEnvelope(envelope({ requestVersion: "transform/1" })).ok).toBe(false);
    expect(parseTransformEnvelope(envelope({ operation: "rewrite" })).ok).toBe(false);
    expect(parseTransformEnvelope(envelope({ selection: { type: "segment-range", nodeId: "thought", start: 0, end: TEXT.length, selectedText: TEXT } })).ok).toBe(false);
  });

  it("accepts every supported locale without letting locale change the passage", () => {
    for (const locale of MATTER_LOCALES) {
      const parsed = parseTransformEnvelope(envelope({ locale }));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.envelope.selection.selectedText).toBe(PASSAGE);
    }
  });

  it("accepts the tree depth bound and rejects one extra visible lineage node", () => {
    expect(parseTransformEnvelope(envelope({
      context: { lineage: boundedLineage(MAX_TREE_DEPTH) },
    })).ok).toBe(true);
    expect(parseTransformEnvelope(envelope({
      context: { lineage: boundedLineage(MAX_TREE_DEPTH + 1) },
    })).ok).toBe(false);
  });

  it("requires an exact echo, fixed grow presentation, and a policy-valid expansion", () => {
    const parsed = parseTransformEnvelope(envelope());
    if (!parsed.ok) throw new Error("fixture must parse");
    const plan = buildTransformPlan(parsed.envelope, "source more");
    expect(parseTransformPlan(plan, parsed.envelope)).toEqual(plan);
    expect(parseTransformPlan({ ...plan, presentation: { motionHint: "settle" } }, parsed.envelope)).toBeNull();
    expect(parseTransformPlan({ ...plan, id: "other" }, parsed.envelope)).toBeNull();
    expect(parseTransformPlan({ ...plan, action: { ...plan.action, text: "source" } }, parsed.envelope)).toBeNull();
  });

  it("revalidates policy, current punctuation segment, revision, and tree memento immediately before commit", () => {
    const parsed = parseTransformEnvelope(envelope());
    if (!parsed.ok) throw new Error("fixture must parse");
    const plan = buildTransformPlan(parsed.envelope, "source more");
    const command = planToTreeCommand(tree(), parsed.envelope, plan, {
      source: "fixture",
      now: () => Date.parse("2026-08-11T00:00:01.000Z"),
    });
    expect(command.ok).toBe(true);
    if (!command.ok) throw new Error("plan must become command");
    expect(applyTreeCommand(tree(), command.command).ok).toBe(true);
    expect(planToTreeCommand({ ...tree(), revision: 5 }, parsed.envelope, plan)).toEqual({ ok: false, reason: "STALE" });
    expect(planToTreeCommand(tree(), parsed.envelope, {
      ...plan,
      action: { ...plan.action, text: "source\u202Emore" },
    })).toEqual({ ok: false, reason: "INVALID_PLAN" });
  });
});
