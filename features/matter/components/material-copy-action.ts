import { serializeMaterialSelection } from "../material/material-files";
import { renderActiveTreeReceipt, type ActiveWorkingTree } from "../material/receipt-actions";
import type { ThoughtTree } from "../tree/model";

export type MaterialCopyOutcome = "copied" | "failed";

type ClipboardLike = Partial<Pick<Clipboard, "writeText" | "write">> | undefined;

/**
 * The one place a selection reaches the clipboard. Copy carries the selection's
 * own structure in both forms a destination can use: plain text (the literal
 * join when nothing is nested, an indented outline when passages contain one
 * another) and a nested list for rich editors. The write starts before any
 * await, so it keeps the user activation it was given. Where the engine has no
 * `ClipboardItem`, or refuses it, the plain text goes through `writeText`.
 *
 * `onCopied` hears the same node ids exactly once, and only after the clipboard
 * accepted the write. Nothing here throws: a refusal and a clipboard failure
 * are the same `failed` outcome.
 */
export async function copyMaterialSelection(input: Readonly<{
  tree: ThoughtTree;
  nodeIds: ReadonlySet<string>;
  clipboard: ClipboardLike;
  /** False once the document this copy began on is gone. */
  stillCurrent?: () => boolean;
  onCopied?: (nodeIds: ReadonlySet<string>) => void;
}>): Promise<MaterialCopyOutcome | null> {
  if (input.stillCurrent?.() === false) return null;
  const result = serializeMaterialSelection(input.tree, input.nodeIds);
  if (!result.ok) return "failed";

  const clipboard = input.clipboard;
  let written = false;
  if (clipboard?.write !== undefined && typeof ClipboardItem !== "undefined") {
    try {
      const item = new ClipboardItem({
        "text/plain": new Blob([result.text], { type: "text/plain" }),
        "text/html": new Blob([result.html], { type: "text/html" }),
      });
      await clipboard.write([item]);
      written = true;
    } catch {
      // Fall through to the plain write; a denial fails there too.
    }
  }
  if (!written) {
    if (input.stillCurrent?.() === false) return null;
    if (clipboard?.writeText === undefined) return "failed";
    try {
      await clipboard.writeText(result.text);
    } catch {
      return "failed";
    }
  }
  if (input.stillCurrent?.() === false) return null;
  input.onCopied?.(new Set(input.nodeIds));
  return "copied";
}

/**
 * The strict context receipt of the active working tree, on the clipboard. It
 * needs an async digest, and Safari accepts a clipboard write only inside the
 * gesture, so the clipboard is handed a promise of the text now instead of the
 * text after an await; engines without `ClipboardItem` keep the plain path.
 */
export async function copyActiveTreeReceipt(input: Readonly<{
  tree: ThoughtTree;
  active: ActiveWorkingTree;
  clipboard: ClipboardLike;
  stillCurrent?: () => boolean;
}>): Promise<MaterialCopyOutcome | null> {
  const pending = renderActiveTreeReceipt(input.tree, input.active);
  const clipboard = input.clipboard;
  if (clipboard?.write !== undefined && typeof ClipboardItem !== "undefined") {
    try {
      const item = new ClipboardItem({
        "text/plain": pending.then((text) => {
          if (text === null || input.stillCurrent?.() === false) throw new Error("no receipt");
          return new Blob([text], { type: "text/plain" });
        }),
      });
      await clipboard.write([item]);
    } catch {
      // A refusal, a stale document and a denied write look the same from here.
      return input.stillCurrent?.() === false ? null : "failed";
    }
    return "copied";
  }
  const text = await pending;
  if (input.stillCurrent?.() === false) return null;
  if (text === null || clipboard?.writeText === undefined) return "failed";
  try {
    await clipboard.writeText(text);
  } catch {
    return "failed";
  }
  return "copied";
}
