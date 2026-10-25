import type { ProjectedTool } from "./model";

/**
 * The island has a stable physical vocabulary. Capability projection still
 * retains navigation actions for the runtime, but the first-release presenter
 * exposes only the four physical editing slots below. Human child creation is
 * the Under mark on a passage, not a rail slot; `move` is shown as Pan.
 */
export const MAIN_RAIL_SLOT_IDS = Object.freeze([
  "voice",
  "lasso",
  "move",
  "undo",
] as const);

/** A Preview Branch build (see `config/preview-branch.ts`) restores the fifth slot. */
export const PREVIEW_BRANCH_RAIL_SLOT_IDS = Object.freeze([
  "voice",
  "lasso",
  "branch",
  "move",
  "undo",
] as const);

export type MainRailSlotId =
  | (typeof MAIN_RAIL_SLOT_IDS)[number]
  | (typeof PREVIEW_BRANCH_RAIL_SLOT_IDS)[number];

export function railSlotIds(previewBranch: boolean): readonly MainRailSlotId[] {
  return previewBranch ? PREVIEW_BRANCH_RAIL_SLOT_IDS : MAIN_RAIL_SLOT_IDS;
}

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
