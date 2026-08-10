import { describe, expect, it } from "vitest";
import { projectTools } from "./project-tools";
import { MAIN_RAIL_SLOT_IDS, projectToolSurface } from "./project-tool-surface";

describe("projectToolSurface", () => {
  it("keeps the right island fixed while retaining navigation capabilities off-rail", () => {
    const tools = projectTools({
      view: "full",
      selected: { nodeId: "branch", hasChildren: true, isFolded: false },
      canUndo: true,
      interaction: "idle",
    });

    const surface = projectToolSurface(tools);

    expect(MAIN_RAIL_SLOT_IDS).toEqual(["voice", "lasso", "branch", "move", "undo", "redo"]);
    expect(surface.main.branch?.id).toBe("add-child");
    expect(surface.main.undo?.id).toBe("undo");
    expect(surface.main.redo).toBeNull();
    expect(surface.local.map((tool) => tool.id)).toEqual(["focus", "fold"]);
  });

  it("retains show-all off-rail and preserves disabled projected capabilities", () => {
    const surface = projectToolSurface(projectTools({
      view: "focus",
      selected: { nodeId: "focused", hasChildren: true, isFolded: false },
      canUndo: false,
      interaction: "pending",
    }));

    expect(surface.main.branch).toBeNull();
    expect(surface.main.undo).toMatchObject({ id: "undo", availability: "disabled" });
    expect(surface.main.redo).toBeNull();
    expect(surface.local).toMatchObject([{ id: "show-all", availability: "disabled" }]);
    expect(Object.isFrozen(surface)).toBe(true);
    expect(Object.isFrozen(surface.main)).toBe(true);
    expect(Object.isFrozen(surface.local)).toBe(true);
  });
});
