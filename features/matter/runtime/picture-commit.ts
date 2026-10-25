import { equalImagePointers } from "../tree/image-pointer";
import type { ThoughtTree, TreeCommand, TreeMutation } from "../tree/model";

export type ReplaceImageMutation = Extract<TreeMutation, { type: "replace-image" }>;

export type AttachPictureValues = Readonly<{
  commandId: string;
  createdAt: string;
  mutation: ReplaceImageMutation;
}>;

export type AttachPictureCommand =
  | Readonly<{ ok: true; command: TreeCommand }>
  | Readonly<{ ok: false; reason: "stale" }>;

/**
 * Keep is a human act, so the command is human and an ordinary undoable step.
 * The mementos decide staleness, not the revision: an unrelated edit elsewhere in
 * the document must not discard a picture the person already paid for, but a
 * passage that changed, vanished, or gained another picture must.
 */
export function attachPictureCommand(
  tree: ThoughtTree,
  values: AttachPictureValues,
): AttachPictureCommand {
  const { mutation } = values;
  const node = tree.nodes[mutation.nodeId];
  if (
    node === undefined ||
    node.updatedAt !== mutation.expectedUpdatedAt ||
    !equalImagePointers(node.image, mutation.expectedImage)
  ) return Object.freeze({ ok: false, reason: "stale" });
  return Object.freeze({
    ok: true,
    command: {
      id: values.commandId,
      source: "human" as const,
      expectedTreeId: tree.id,
      expectedRevision: tree.revision,
      createdAt: values.createdAt,
      mutation,
    },
  });
}
