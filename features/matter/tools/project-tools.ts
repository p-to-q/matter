import { TOOL_CATALOG } from "./catalog";
import type {
  DisabledTool,
  ProjectedTool,
  ToolContext,
  ToolId,
  ToolIntent,
} from "./model";

type ApplicableTool = {
  readonly id: ToolId;
  readonly intent: ToolIntent;
};

export function projectTools(context: ToolContext): readonly ProjectedTool[] {
  const applicable = projectApplicableTools(context);
  const contextual = applicable
    .filter((tool) => TOOL_CATALOG[tool.id].group === "contextual")
    .sort(compareApplicableTools)
    .map((tool) => projectAvailability(tool, context.interaction));

  const undo = context.canUndo
    ? projectAvailability({ id: "undo", intent: { type: "undo" } }, context.interaction)
    : disabledTool("undo", "history-empty");
  // `canRedo` was added after the initial tool contract. Omitted means an
  // older non-interactive projection, not an implicit history capability.
  const redo = context.canRedo === undefined
    ? []
    : [context.canRedo
      ? projectAvailability({ id: "redo", intent: { type: "redo" } }, context.interaction)
      : disabledTool("redo", "redo-empty")];

  return Object.freeze([...contextual, undo, ...redo]);
}

function projectApplicableTools(context: ToolContext): readonly ApplicableTool[] {
  if (context.view === "focus") {
    return [{ id: "show-all", intent: { type: "show-full" } }];
  }

  const selected = context.selected;
  if (selected === null) {
    return [];
  }

  const tools: ApplicableTool[] = [
    {
      id: "add-child",
      intent: { type: "insert-child", parentNodeId: selected.nodeId },
    },
    {
      id: "focus",
      intent: { type: "focus-node", nodeId: selected.nodeId },
    },
  ];

  if (selected.hasChildren) {
    // An explicit target state lets the controller revalidate duplicate or
    // delayed activation without accidentally toggling twice.
    tools.push(
      selected.isFolded
        ? {
            id: "unfold",
            intent: {
              type: "set-fold",
              nodeId: selected.nodeId,
              folded: false,
            },
          }
        : {
            id: "fold",
            intent: {
              type: "set-fold",
              nodeId: selected.nodeId,
              folded: true,
            },
          },
    );
  }

  return tools;
}

function projectAvailability(
  tool: ApplicableTool,
  interaction: ToolContext["interaction"],
): ProjectedTool {
  if (interaction === "pending") {
    return disabledTool(tool.id, "operation-pending");
  }

  const descriptor = TOOL_CATALOG[tool.id];
  return Object.freeze({
    id: tool.id,
    group: descriptor.group,
    label: descriptor.label,
    availability: "available",
    intent: Object.freeze(tool.intent),
  });
}

function disabledTool(
  id: ToolId,
  reason: DisabledTool["reason"],
): DisabledTool {
  const descriptor = TOOL_CATALOG[id];
  return Object.freeze({
    id,
    group: descriptor.group,
    label: descriptor.label,
    availability: "disabled",
    reason,
  });
}

function compareApplicableTools(left: ApplicableTool, right: ApplicableTool): number {
  return TOOL_CATALOG[left.id].order - TOOL_CATALOG[right.id].order;
}
