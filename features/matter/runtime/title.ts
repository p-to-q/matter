import { normalizeDocumentTitle } from "../tree/document-root";
import type { ThoughtTree, TreeCommand } from "../tree/model";

export type RenameDocumentValues = Readonly<{
  commandId: string;
  title: string;
  createdAt: string;
}>;

export function renameDocumentCommand(
  tree: ThoughtTree,
  values: RenameDocumentValues,
): TreeCommand | null {
  if (tree.title === undefined) return null;
  const title = normalizeDocumentTitle(values.title);
  if (title === tree.title) return null;
  return {
    id: values.commandId,
    source: "human",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    createdAt: values.createdAt,
    mutation: {
      type: "replace-title",
      expectedTitle: tree.title,
      title,
    },
  };
}
