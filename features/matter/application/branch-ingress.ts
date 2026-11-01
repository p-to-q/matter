import { parseBranchAnswer, parseBranchRequest, type BranchAnswer, type BranchRequest, validateBranchText } from "../protocol/branch-contract";
import type { ThoughtTree, TreeCommand } from "../tree/model";
import { canonicalizeMaterialText, type MaterialLexicalSession, type MaterialLexicalOccurrenceEdit } from "./material-lexical-port";

/** A strict basis prevents a late answer from acquiring a new parent or child order. */
export function prepareBranchIngress(tree: ThoughtTree, request: BranchRequest, answer: BranchAnswer,
  nodeId: string, createdAt: string, session: MaterialLexicalSession) {
  if (parseBranchRequest(request) === null) return null;
  const parent = tree.nodes[request.parentId];
  if (parseBranchAnswer(answer, request) === null || tree.id !== request.treeId ||
    tree.revision !== request.revision || parent === undefined || parent.text !== request.parentText ||
    JSON.stringify(parent.children.map((id) => tree.nodes[id]?.text)) !== JSON.stringify(request.children)) return null;
  const lexical = canonicalizeMaterialText(session, { text: answer.text, channel: "written", locale: request.locale });
  const useLexical = validateBranchText(lexical.text, request);
  const text = useLexical ? lexical.text : answer.text;
  const command: TreeCommand = {
    id: `branch_${request.requestId}`, source: "agent", expectedTreeId: tree.id, expectedRevision: tree.revision,
    createdAt, mutation: { type: "insert-node", parentId: parent.id, index: parent.children.length,
      expectedParentChildren: [...parent.children], node: { id: nodeId, text, parentId: parent.id,
        children: [], createdAt, updatedAt: createdAt } },
  };
  return { command, edits: useLexical ? lexical.edits.filter((edit): edit is MaterialLexicalOccurrenceEdit =>
    edit.occurrence !== undefined) : [] };
}
Object.defineProperty(prepareBranchIngress, "matterCapability", { value: "matter-capability:branch-ingress" });
