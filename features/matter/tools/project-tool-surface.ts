import type { ProjectedTool } from "./model";

/**
 * The island has a stable physical vocabulary. Capability projection still
 * retains navigation actions for the runtime, but the first-release presenter
 * exposes only the five physical editing slots below.
 */
export const MAIN_RAIL_SLOT_IDS = Object.freeze([
  "voice",
  "lasso",
  "branch",
  "move",
  "undo",
] as const);

export type MainRailSlotId = (typeof MAIN_RAIL_SLOT_IDS)[number];

export type ProjectedToolSurface = Readonly<{
  main: Readonly<{
    branch: ProjectedTool | null;
    undo: ProjectedTool | null;
  }>;
  local: readonly ProjectedTool[];
}>;

const LOCAL_TOOL_IDS = new Set<ProjectedTool["id"]>([
  "focus",
  "fold",
  "unfold",
  "show-all",
]);

/** Splits one capability projection without creating a second state owner. */
export function projectToolSurface(
  tools: readonly ProjectedTool[],
): ProjectedToolSurface {
  const branch = tools.find((tool) => tool.id === "add-child") ?? null;
  const undo = tools.find((tool) => tool.id === "undo") ?? null;
  const local = tools.filter((tool) => LOCAL_TOOL_IDS.has(tool.id));

  return Object.freeze({
    main: Object.freeze({ branch, undo }),
    local: Object.freeze(local),
  });
}
