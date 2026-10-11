import { serializeMaterialSelection } from "../material/material-files";
import { renderSelectionReceipt } from "../material/receipt-actions";
import type { ThoughtTree } from "../tree/model";

export type MaterialCopyForm = "text" | "context";
export type MaterialCopyOutcome = "copied" | "copied-with-context" | "failed";

/**
 * The one place a selection reaches the clipboard. Native Copy stays literal
 * text; the context form is a receipt the person asked for. Both took the same
 * passages out, so both report the same ids to `onCopied` exactly once, and
 * only after the clipboard accepted the text. Nothing here throws: a refusal
 * or a clipboard failure is the same `failed` outcome.
 */
export async function copyMaterialSelection(input: Readonly<{
  form: MaterialCopyForm;
  tree: ThoughtTree;
  nodeIds: ReadonlySet<string>;
  clipboard: Partial<Pick<Clipboard, "writeText" | "write">> | undefined;
  /** False once the document this copy began on is gone. */
  stillCurrent?: () => boolean;
  onCopied?: (nodeIds: ReadonlySet<string>) => void;
}>): Promise<MaterialCopyOutcome | null> {
  // Native Copy awaits nothing before the clipboard write, so it keeps the user
  // activation it was given.
  if (input.form === "text") {
    const result = serializeMaterialSelection(input.tree, input.nodeIds);
    return write(input, result.ok ? result.text : null);
  }
  // The receipt needs an async digest. Safari accepts a clipboard write only
  // inside the gesture, so hand it a promise of the text now instead of awaiting
  // the text first; engines without ClipboardItem keep the plain path.
  const pending = renderSelectionReceipt(input.tree, input.nodeIds);
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
    input.onCopied?.(new Set(input.nodeIds));
    return "copied-with-context";
  }
  return write(input, await pending);
}

async function write(
  input: Parameters<typeof copyMaterialSelection>[0],
  text: string | null,
): Promise<MaterialCopyOutcome | null> {
  if (input.stillCurrent?.() === false) return null;
  if (text === null || input.clipboard?.writeText === undefined) return "failed";
  try {
    await input.clipboard.writeText(text);
    input.onCopied?.(new Set(input.nodeIds));
  } catch {
    return "failed";
  }
  return input.form === "context" ? "copied-with-context" : "copied";
}
