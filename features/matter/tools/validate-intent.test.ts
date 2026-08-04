import { describe, expect, it } from "vitest";
import type { ToolContext } from "./model";
import { isCurrentToolIntent } from "./validate-intent";

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
});
