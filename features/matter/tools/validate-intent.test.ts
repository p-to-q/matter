import { describe, expect, it } from "vitest";
import type { ToolContext } from "./model";
import { isCurrentToolIntent, sameToolIntent } from "./validate-intent";

const context: ToolContext = {
  view: "full",
  selected: { nodeId: "selected", hasChildren: false, isFolded: false },
  canUndo: true,
  interaction: "idle",
};

describe("isCurrentToolIntent", () => {
  it("accepts only an intent exposed by the current projection", () => {
    expect(isCurrentToolIntent(context, { type: "insert-child", parentNodeId: "selected" })).toBe(true);
    expect(isCurrentToolIntent(context, { type: "insert-child", parentNodeId: "other" })).toBe(false);
    expect(isCurrentToolIntent(context, { type: "show-full" })).toBe(false);
  });

  it("rejects every intent while its applicable tool is pending", () => {
    expect(
      isCurrentToolIntent(
        { ...context, interaction: "pending" },
        { type: "focus-node", nodeId: "selected" },
      ),
    ).toBe(false);
  });

  it("compares each closed intent by meaning rather than object serialization", () => {
    expect(sameToolIntent(
      { type: "set-fold", nodeId: "selected", folded: true },
      { folded: true, nodeId: "selected", type: "set-fold" },
    )).toBe(true);
    expect(sameToolIntent(
      { type: "set-fold", nodeId: "selected", folded: true },
      { type: "set-fold", nodeId: "selected", folded: false },
    )).toBe(false);
  });
});
