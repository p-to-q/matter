import {
  isCanonicalTimestamp,
  MAX_NODE_TEXT_CODE_UNITS,
} from "../tree/invariants";
import type { ThoughtTree, TreeCommand } from "../tree/model";
import { isWellFormedUnicodeText } from "../tree/unicode-text";

const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });

/**
 * One exact range the person restores to a form they choose, such as the
 * heard form behind a lexical correction. The expected range text and node
 * timestamp are the memento: anything else that changed fails closed.
 */
export type HumanTextRangeRestorationValues = Readonly<{
  commandId: string;
  treeId: string;
  nodeId: string;
  expectedUpdatedAt: string;
  start: number;
  end: number;
  expectedText: string;
  replacement: string;
  createdAt: string;
}>;

export type HumanTextRangeRestorationError = Readonly<{
  code: "INVALID_INTERACTION" | "REVISION_CONFLICT" | "BOUND_EXCEEDED";
  message: string;
}>;

export type HumanTextRangeRestorationResult =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; error: HumanTextRangeRestorationError }>;

/**
 * Builds an ordinary human `replace-text` command for one range. It is a
 * normal pointer-undoable material change; undoing it is ordinary history.
 */
export function humanTextRangeRestorationCommand(
  tree: ThoughtTree,
  values: HumanTextRangeRestorationValues,
): HumanTextRangeRestorationResult {
  if (
    !nonEmpty(values.commandId) ||
    !nonEmpty(values.treeId) ||
    !nonEmpty(values.nodeId) ||
    !isCanonicalTimestamp(values.expectedUpdatedAt) ||
    !isCanonicalTimestamp(values.createdAt) ||
    typeof values.expectedText !== "string" ||
    typeof values.replacement !== "string" ||
    values.replacement.length === 0 ||
    values.replacement === values.expectedText ||
    !isWellFormedUnicodeText(values.replacement)
  ) return invalid("INVALID_INTERACTION", "The text restoration values are invalid.");
  if (tree.id !== values.treeId) {
    return invalid("REVISION_CONFLICT", "The restored passage belongs to another document.");
  }
  const node = tree.nodes[values.nodeId];
  if (
    node === undefined ||
    node.role === "document-root" ||
    node.updatedAt !== values.expectedUpdatedAt ||
    !Number.isSafeInteger(values.start) ||
    !Number.isSafeInteger(values.end) ||
    values.start < 0 ||
    values.end <= values.start ||
    values.end > node.text.length ||
    node.text.slice(values.start, values.end) !== values.expectedText ||
    !isGraphemeBoundary(node.text, values.start) ||
    !isGraphemeBoundary(node.text, values.end)
  ) return invalid("REVISION_CONFLICT", "The restored passage changed.");

  const text = node.text.slice(0, values.start) + values.replacement +
    node.text.slice(values.end);
  if (text.length > MAX_NODE_TEXT_CODE_UNITS) {
    return invalid("BOUND_EXCEEDED", "The restored passage exceeds the material text bound.");
  }
  if (!isWellFormedUnicodeText(text)) {
    return invalid("INVALID_INTERACTION", "The restored passage is not well-formed text.");
  }
  // A strictly later timestamp keeps the node's committed identity distinct
  // from the text it replaces, even within one clock millisecond.
  const updatedAt = new Date(Math.max(
    Date.parse(values.createdAt),
    Date.parse(node.updatedAt) + 1,
  )).toISOString();
  return Object.freeze({
    ok: true,
    command: Object.freeze({
      id: values.commandId,
      source: "human",
      expectedTreeId: tree.id,
      expectedRevision: tree.revision,
      createdAt: values.createdAt,
      mutation: Object.freeze({
        type: "replace-text",
        nodeId: node.id,
        expectedText: node.text,
        expectedUpdatedAt: node.updatedAt,
        text,
        updatedAt,
      }),
    }),
  });
}

function isGraphemeBoundary(text: string, offset: number): boolean {
  if (offset === 0 || offset === text.length) return true;
  for (const part of GRAPHEME_SEGMENTER.segment(text)) {
    if (part.index === offset) return true;
    if (part.index > offset) return false;
  }
  return false;
}

function invalid(
  code: HumanTextRangeRestorationError["code"],
  message: string,
): Readonly<{ ok: false; error: HumanTextRangeRestorationError }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
