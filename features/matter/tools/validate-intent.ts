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
  const serialized = JSON.stringify(intent);
  return projectTools(context).some(
    (tool) =>
      tool.availability === "available" &&
      JSON.stringify(tool.intent) === serialized,
  );
}
