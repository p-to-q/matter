/**
 * The tool layer projects runtime capability into UI-safe intents. It owns no
 * material, navigation, interaction, or history state.
 */

export type ToolId =
  | "add-child"
  | "focus"
  | "fold"
  | "unfold"
  | "show-all"
  | "undo"
  | "redo";

export type ToolGroup = "contextual" | "utility";

export type ToolIntent =
  | { readonly type: "insert-child"; readonly parentNodeId: string }
  | { readonly type: "focus-node"; readonly nodeId: string }
  | {
      readonly type: "set-fold";
      readonly nodeId: string;
      readonly folded: boolean;
    }
  | { readonly type: "show-full" }
  | { readonly type: "undo" }
  | { readonly type: "redo" };

export type ToolDisabledReason = "history-empty" | "redo-empty" | "operation-pending";

export type SelectedToolTarget = {
  readonly nodeId: string;
  readonly hasChildren: boolean;
  readonly isFolded: boolean;
};

export type ToolContext = {
  readonly view: "full" | "focus";
  readonly selected: SelectedToolTarget | null;
  readonly canUndo: boolean;
  readonly canRedo?: boolean;
  readonly interaction: "idle" | "pending";
};

type ProjectedToolBase = {
  readonly id: ToolId;
  readonly group: ToolGroup;
  readonly label: string;
};

export type AvailableTool = ProjectedToolBase & {
  readonly availability: "available";
  readonly intent: ToolIntent;
};

export type DisabledTool = ProjectedToolBase & {
  readonly availability: "disabled";
  readonly reason: ToolDisabledReason;
};

export type ProjectedTool = AvailableTool | DisabledTool;
