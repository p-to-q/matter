import type { ToolGroup, ToolId } from "./model";

export type ToolDescriptor = {
  readonly group: ToolGroup;
  readonly label: string;
  readonly order: number;
};

export const TOOL_CATALOG = Object.freeze({
  "add-child": Object.freeze({ group: "contextual", label: "Add child", order: 10 }),
  focus: Object.freeze({ group: "contextual", label: "Focus", order: 20 }),
  fold: Object.freeze({ group: "contextual", label: "Fold", order: 30 }),
  unfold: Object.freeze({ group: "contextual", label: "Unfold", order: 30 }),
  "show-all": Object.freeze({ group: "contextual", label: "Show all", order: 10 }),
  undo: Object.freeze({ group: "utility", label: "Undo", order: 100 }),
  redo: Object.freeze({ group: "utility", label: "Redo", order: 110 }),
} as const satisfies Record<ToolId, ToolDescriptor>);
