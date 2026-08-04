import { describe, expect, it } from "vitest";
import type { ToolContext } from "./model";
import { projectTools } from "./project-tools";
import { TOOL_CATALOG } from "./catalog";

const IDLE_FULL_CONTEXT: ToolContext = Object.freeze({
  view: "full",
  selected: null,
  canUndo: false,
  interaction: "idle",
});

describe("projectTools", () => {
  it("keeps undo visible and disabled when no target or history is available", () => {
    expect(projectTools(IDLE_FULL_CONTEXT)).toEqual([
      {
        id: "undo",
        group: "utility",
        label: "Undo",
        availability: "disabled",
        reason: "history-empty",
      },
    ]);
  });

  it("projects fixed-order tools for a selected leaf", () => {
    expect(
      projectTools({
        ...IDLE_FULL_CONTEXT,
        selected: { nodeId: "leaf", hasChildren: false, isFolded: false },
        canUndo: true,
      }),
    ).toEqual([
      {
        id: "add-child",
        group: "contextual",
        label: "Add child",
        availability: "available",
        intent: { type: "insert-child", parentNodeId: "leaf" },
      },
      {
        id: "focus",
        group: "contextual",
        label: "Focus",
        availability: "available",
        intent: { type: "focus-node", nodeId: "leaf" },
      },
      {
        id: "undo",
        group: "utility",
        label: "Undo",
        availability: "available",
        intent: { type: "undo" },
      },
    ]);
  });

  it.each([
    {
      isFolded: false,
      id: "fold",
      label: "Fold",
      folded: true,
    },
    {
      isFolded: true,
      id: "unfold",
      label: "Unfold",
      folded: false,
    },
  ] as const)("projects $id as an explicit target state", ({ isFolded, id, label, folded }) => {
    const tools = projectTools({
      ...IDLE_FULL_CONTEXT,
      selected: { nodeId: "branch", hasChildren: true, isFolded },
    });

    expect(tools.map((tool) => tool.id)).toEqual(["add-child", "focus", id, "undo"]);
    expect(tools[2]).toEqual({
      id,
      group: "contextual",
      label,
      availability: "available",
      intent: { type: "set-fold", nodeId: "branch", folded },
    });
  });

  it("shows only show-all and stable undo utility in focus view", () => {
    expect(
      projectTools({
        view: "focus",
        selected: { nodeId: "focus", hasChildren: true, isFolded: false },
        canUndo: true,
        interaction: "idle",
      }),
    ).toEqual([
      {
        id: "show-all",
        group: "contextual",
        label: "Show all",
        availability: "available",
        intent: { type: "show-full" },
      },
      {
        id: "undo",
        group: "utility",
        label: "Undo",
        availability: "available",
        intent: { type: "undo" },
      },
    ]);
  });

  it("keeps applicable tools in place but disables them while work is pending", () => {
    const tools = projectTools({
      view: "full",
      selected: { nodeId: "branch", hasChildren: true, isFolded: false },
      canUndo: true,
      interaction: "pending",
    });

    expect(tools.map((tool) => tool.id)).toEqual(["add-child", "focus", "fold", "undo"]);
    expect(tools).toSatisfy(
      (items: readonly (typeof tools)[number][]) =>
        items.every(
          (tool) =>
            tool.availability === "disabled" &&
            tool.reason === "operation-pending" &&
            !("intent" in tool),
        ),
    );
  });

  it("preserves the empty-history reason while another operation is pending", () => {
    const tools = projectTools({
      ...IDLE_FULL_CONTEXT,
      selected: { nodeId: "leaf", hasChildren: false, isFolded: false },
      interaction: "pending",
    });

    expect(tools.at(-1)).toMatchObject({
      id: "undo",
      availability: "disabled",
      reason: "history-empty",
    });
  });

  it("returns a deterministic serializable value without mutating context", () => {
    const context = Object.freeze({
      view: "full" as const,
      selected: Object.freeze({
        nodeId: "branch",
        hasChildren: true,
        isFolded: false,
      }),
      canUndo: true,
      interaction: "idle" as const,
    });

    const first = projectTools(context);
    const serialized = JSON.stringify(first);

    expect(JSON.parse(serialized)).toEqual(first);
    expect(projectTools(context)).toEqual(first);
    expect(context.selected.isFolded).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
  });

  it("keeps the shared catalog physically immutable", () => {
    expect(Object.isFrozen(TOOL_CATALOG)).toBe(true);
    expect(Object.values(TOOL_CATALOG).every(Object.isFrozen)).toBe(true);
  });
});
