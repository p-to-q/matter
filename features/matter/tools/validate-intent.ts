import type { ToolIntent } from "./model";
import type { ToolContext } from "./model";
import { projectTools } from "./project-tools";

/**
 * UI descriptors may become stale between pointerdown and click. The controller
 * accepts an intent only while the current projection still exposes that exact
 * serializable capability.
 */
export function isCurrentToolIntent(
  context: ToolContext,
  intent: ToolIntent,
): boolean {
  return projectTools(context).some(
    (tool) =>
      tool.availability === "available" &&
      sameToolIntent(tool.intent, intent),
  );
}

export function sameToolIntent(left: ToolIntent, right: ToolIntent): boolean {
  switch (left.type) {
    case "insert-child":
      return right.type === left.type && right.parentNodeId === left.parentNodeId;
    case "focus-node":
      return right.type === left.type && right.nodeId === left.nodeId;
    case "set-fold":
      return right.type === left.type && right.nodeId === left.nodeId && right.folded === left.folded;
    case "show-full":
    case "undo":
      return right.type === left.type;
  }
}
