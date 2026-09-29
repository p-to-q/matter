import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "../tree/engine";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  humanTextRangeRestorationCommand,
  type HumanTextRangeRestorationValues,
} from "./text-range-restoration";

const T0 = "2026-09-29T00:00:00.000Z";
const TEXT = "我觉得 [p → q] 很重要。";
const START = TEXT.indexOf("[p → q]");

describe("Human text range restoration", () => {
  it("restores one exact range as an ordinary human replace-text command", () => {
    const result = humanTextRangeRestorationCommand(tree(), values());
    expect(result).toEqual({
      ok: true,
      command: {
        id: "human_restore_1",
        source: "human",
        expectedTreeId: "tree_restore",
        expectedRevision: 2,
        createdAt: "2026-09-29T00:00:05.000Z",
        mutation: {
          type: "replace-text",
          nodeId: "thought",
          expectedText: TEXT,
          expectedUpdatedAt: T0,
          text: "我觉得 P to Q 很重要。",
          updatedAt: "2026-09-29T00:00:05.000Z",
        },
      },
    });
    if (!result.ok) return;
    const applied = applyTreeCommand(tree(), result.command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    // The inverse is the exact memento, so Undo returns the canonical word.
    expect(applyTreeCommand(applied.tree, applied.inverse).ok).toBe(true);
  });

  it("keeps the restored timestamp strictly after the replaced one", () => {
    const result = humanTextRangeRestorationCommand(tree(), values({
      createdAt: "2026-09-28T23:59:59.000Z",
    }));
    expect(result).toMatchObject({
      ok: true,
      command: { mutation: { updatedAt: "2026-09-29T00:00:00.001Z" } },
    });
  });

  it("fails closed when the passage changed in any way", () => {
    for (const changed of [
      values({ expectedUpdatedAt: "2026-09-29T00:00:01.000Z" }),
      values({ start: START + 1 }),
      values({ expectedText: "[p → Q]" }),
      values({ treeId: "another_tree" }),
      values({ nodeId: "missing" }),
    ]) {
      expect(humanTextRangeRestorationCommand(tree(), changed)).toMatchObject({
        ok: false,
        error: { code: "REVISION_CONFLICT" },
      });
    }
  });

  it("rejects invalid values, grapheme splits, and the material bound", () => {
    expect(humanTextRangeRestorationCommand(tree(), values({ replacement: "" })))
      .toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(humanTextRangeRestorationCommand(tree(), values({ replacement: "[p → q]" })))
      .toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(humanTextRangeRestorationCommand(tree(), values({ replacement: "\uD800" })))
      .toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });
    expect(humanTextRangeRestorationCommand(tree(), values({ createdAt: "yesterday" })))
      .toMatchObject({ ok: false, error: { code: "INVALID_INTERACTION" } });

    const emoji = tree("a👍🏽b");
    expect(humanTextRangeRestorationCommand(emoji, values({
      start: 1,
      end: 3,
      expectedText: "👍",
    }))).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });

    expect(humanTextRangeRestorationCommand(tree(), values({
      replacement: "x".repeat(20_000),
    }))).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });
});

function values(
  overrides: Partial<HumanTextRangeRestorationValues> = {},
): HumanTextRangeRestorationValues {
  return {
    commandId: "human_restore_1",
    treeId: "tree_restore",
    nodeId: "thought",
    expectedUpdatedAt: T0,
    start: START,
    end: START + "[p → q]".length,
    expectedText: "[p → q]",
    replacement: "P to Q",
    createdAt: "2026-09-29T00:00:05.000Z",
    ...overrides,
  };
}

function tree(text = TEXT): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_restore",
    rootId: "document",
    revision: 2,
    nodes: {
      document: {
        id: "document",
        role: "document-root",
        text: "",
        parentId: null,
        children: ["thought"],
        createdAt: T0,
        updatedAt: T0,
      },
      thought: {
        id: "thought",
        text,
        parentId: "document",
        children: [],
        createdAt: T0,
        updatedAt: T0,
      },
    },
  };
}
