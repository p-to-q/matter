import { describe, expect, it } from "vitest";
import { projectTools } from "./project-tools";
import {
  MAIN_RAIL_SLOT_IDS,
  PREVIEW_BRANCH_RAIL_SLOT_IDS,
  projectToolSurface,
  railSlotIds,
} from "./project-tool-surface";

describe("projectToolSurface", () => {
  it("keeps the right island fixed while retaining navigation capabilities off-rail", () => {
    const tools = projectTools({
      previewBranch: false,
      view: "full",
      selected: { nodeId: "branch", hasChildren: true, isFolded: false },
      canUndo: true,
      interaction: "idle",
    });

    const surface = projectToolSurface(tools);

    expect(MAIN_RAIL_SLOT_IDS).toEqual(["voice", "lasso", "move", "undo"]);
    expect(surface.main.branch).toBeNull();
    expect(surface.main.undo?.id).toBe("undo");
    expect(surface.local.map((tool) => tool.id)).toEqual(["focus", "fold"]);
  });

  it("restores the Branch slot, and only that slot, for a Preview Branch build", () => {
    const surface = projectToolSurface(projectTools({
      previewBranch: true,
      view: "full",
      selected: { nodeId: "branch", hasChildren: true, isFolded: false },
      canUndo: true,
      interaction: "idle",
    }));

    expect(PREVIEW_BRANCH_RAIL_SLOT_IDS).toEqual(["voice", "lasso", "branch", "move", "undo"]);
    expect(railSlotIds(true)).toEqual(["voice", "lasso", "branch", "move", "undo"]);
    expect(railSlotIds(false)).toEqual(["voice", "lasso", "move", "undo"]);
    expect(surface.main.branch?.id).toBe("add-child");
  });

  it("retains show-all off-rail and preserves disabled projected capabilities", () => {
    const surface = projectToolSurface(projectTools({
      previewBranch: true,
      view: "focus",
      selected: { nodeId: "focused", hasChildren: true, isFolded: false },
      canUndo: false,
      interaction: "pending",
    }));

    expect(surface.main.branch).toBeNull();
    expect(surface.main.undo).toMatchObject({ id: "undo", availability: "disabled" });
    expect(surface.local).toMatchObject([{ id: "show-all", availability: "disabled" }]);
    expect(Object.isFrozen(surface)).toBe(true);
    expect(Object.isFrozen(surface.main)).toBe(true);
    expect(Object.isFrozen(surface.local)).toBe(true);
  });
});
