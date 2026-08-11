import { MAX_NODE_TEXT_CODE_UNITS, isCanonicalTimestamp } from "../tree/invariants";
import type { ThoughtTree, TreeCommand } from "../tree/model";

/**
 * A transcript is already human material when repair starts. The repair window
 * is therefore a lease, not a background job: after it expires, or after the
 * addressed text changes, the result has no authority to edit the tree.
 */
export const ADMISSION_REPAIR_WINDOW_MS = 12_000;

export type AdmissionRepairValues = Readonly<{
  interactionId: string;
  commandId: string;
  treeId: string;
  nodeId: string;
  expectedText: string;
  expectedUpdatedAt: string;
  text: string;
  createdAt: string;
  admittedAtMs: number;
  settledAtMs: number;
}>;

export type AdmissionRepairError = Readonly<{
  code: "INVALID_REPAIR" | "REPAIR_EXPIRED" | "REPAIR_STALE" | "BOUND_EXCEEDED";
  message: string;
}>;

export type AdmissionRepairCommandResult =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; error: AdmissionRepairError }>;

/**
 * Constructs the private replace-text mutation against the latest tree
 * revision while retaining an exact node memento. Other branches may move in
 * the repair window; this one passage may not.
 */
export function admissionRepairToTreeCommand(
  tree: ThoughtTree,
  values: AdmissionRepairValues,
): AdmissionRepairCommandResult {
  if (
    !nonEmpty(values.interactionId) ||
    !nonEmpty(values.commandId) ||
    !nonEmpty(values.treeId) ||
    !nonEmpty(values.nodeId) ||
    !isCanonicalTimestamp(values.expectedUpdatedAt) ||
    !isCanonicalTimestamp(values.createdAt) ||
    !Number.isFinite(values.admittedAtMs) ||
    !Number.isFinite(values.settledAtMs) ||
    values.admittedAtMs < 0 ||
    values.settledAtMs < values.admittedAtMs
  ) {
    return invalid("INVALID_REPAIR", "Transcript repair values are invalid.");
  }
  if (values.settledAtMs - values.admittedAtMs > ADMISSION_REPAIR_WINDOW_MS) {
    return invalid("REPAIR_EXPIRED", "Transcript repair settled after its lease expired.");
  }
  if (
    values.expectedText.length === 0 ||
    values.text.length === 0 ||
    values.expectedText.length > MAX_NODE_TEXT_CODE_UNITS ||
    values.text.length > MAX_NODE_TEXT_CODE_UNITS
  ) {
    return invalid("BOUND_EXCEEDED", "Transcript repair exceeds the material text bound.");
  }
  if (values.text === values.expectedText) {
    return invalid("INVALID_REPAIR", "Transcript repair must change the text.");
  }
  if (tree.id !== values.treeId) {
    return invalid("REPAIR_STALE", "Transcript repair belongs to another material document.");
  }
  const node = tree.nodes[values.nodeId];
  if (
    node === undefined ||
    node.text !== values.expectedText ||
    node.updatedAt !== values.expectedUpdatedAt
  ) {
    return invalid("REPAIR_STALE", "Transcript repair no longer matches the admitted passage.");
  }

  return Object.freeze({
    ok: true,
    command: Object.freeze({
      id: values.commandId,
      source: "repair",
      interactionId: values.interactionId,
      expectedTreeId: tree.id,
      expectedRevision: tree.revision,
      createdAt: values.createdAt,
      mutation: Object.freeze({
        type: "replace-text",
        nodeId: node.id,
        expectedText: values.expectedText,
        expectedUpdatedAt: values.expectedUpdatedAt,
        text: values.text,
        updatedAt: values.createdAt,
      }),
    }),
  });
}

function invalid(
  code: AdmissionRepairError["code"],
  message: string,
): Readonly<{ ok: false; error: AdmissionRepairError }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
