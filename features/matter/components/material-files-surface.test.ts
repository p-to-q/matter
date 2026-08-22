import { describe, expect, it } from "vitest";
import type { NavigationState } from "../runtime/navigation";
import { projectMaterialFilesSurface } from "./material-files-surface";

const full: NavigationState = {
  mode: "full",
  focusNodeId: null,
  selectedNodeId: "root",
  foldedNodeIds: new Set(),
};

const focus: NavigationState = {
  mode: "focus",
  focusNodeId: "child",
  selectedNodeId: "child",
  foldedNodeIds: new Set(),
};

describe("material files surface", () => {
  it("uses the deferred navigation only for rows and disables stale row actions", () => {
    const surface = projectMaterialFilesSurface({
      currentNavigation: focus,
      projectedNavigation: full,
      currentQuery: "",
      projectedQuery: "",
      interactionPending: false,
    });

    expect(surface).toEqual({
      navigation: full,
      projectionStale: true,
      queryProjectionStale: false,
      rowInteractionDisabled: true,
    });
    expect(Object.isFrozen(surface)).toBe(true);
  });

  it("restores row interaction only after the projection catches up", () => {
    expect(projectMaterialFilesSurface({
      currentNavigation: focus,
      projectedNavigation: focus,
      currentQuery: "",
      projectedQuery: "",
      interactionPending: false,
    })).toMatchObject({ projectionStale: false, rowInteractionDisabled: false });
    expect(projectMaterialFilesSurface({
      currentNavigation: focus,
      projectedNavigation: focus,
      currentQuery: "",
      projectedQuery: "",
      interactionPending: true,
    })).toMatchObject({ projectionStale: false, rowInteractionDisabled: true });
  });

  it("keeps stale deferred search results inert without making the search field stale", () => {
    expect(projectMaterialFilesSurface({
      currentNavigation: full,
      projectedNavigation: full,
      currentQuery: "new query",
      projectedQuery: "old query",
      interactionPending: false,
    })).toMatchObject({
      projectionStale: false,
      queryProjectionStale: true,
      rowInteractionDisabled: true,
    });
  });
});
