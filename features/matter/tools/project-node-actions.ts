import type { NavigationState } from "../runtime/navigation";
import type { ThoughtTree } from "../tree/model";
import type { ProjectedTool, ToolIntent } from "./model";
import { projectTools } from "./project-tools";
import { sameToolIntent } from "./validate-intent";

const FULL_VIEW_ACTIONS = new Set<ProjectedTool["id"]>(["add-child", "focus"]);
const FOCUS_VIEW_ACTIONS = new Set<ProjectedTool["id"]>(["show-all"]);

export type NodeActionContext = Readonly<{
  activeNodeIds: ReadonlySet<string>;
  interaction: "idle" | "pending";
  navigation: NavigationState;
  nodeId: string;
  tree: ThoughtTree;
}>;

/**
 * Reuses the closed tool catalog for one explicit render-edge target. Hover is
 * a reference to material, never a second selection or capability owner.
 */
export function projectNodeActions(context: NodeActionContext): readonly ProjectedTool[] {
  if (!context.activeNodeIds.has(context.nodeId)) return Object.freeze([]);
  const node = context.tree.nodes[context.nodeId];
  if (node === undefined) return Object.freeze([]);

  const tools = projectTools({
    view: context.navigation.mode,
    selected: context.navigation.mode === "full"
      ? {
          nodeId: node.id,
          hasChildren: node.children.length > 0,
          isFolded: context.navigation.foldedNodeIds.has(node.id),
        }
      : null,
    canUndo: false,
    interaction: context.interaction,
  });
  const allowed = context.navigation.mode === "full" ? FULL_VIEW_ACTIONS : FOCUS_VIEW_ACTIONS;
  return Object.freeze(tools.filter((tool) => allowed.has(tool.id)));
}

export function isCurrentNodeActionIntent(
  context: NodeActionContext,
  intent: ToolIntent,
): boolean {
  return projectNodeActions(context).some(
    (tool) => tool.availability === "available" && sameToolIntent(tool.intent, intent),
  );
}
