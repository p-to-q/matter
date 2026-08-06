"use client";

import { useMemo, useState } from "react";
import type { SegmentSelection } from "../material/text-segments";
import { copyLassoSelectionSet } from "../material/lasso-selection";
import styles from "./LassoSelectionTray.module.css";

type LassoSelectionTrayProps = Readonly<{
  selections: readonly SegmentSelection[];
  onClear: () => void;
  onLocate: (selection: SegmentSelection) => void;
}>;

/**
 * A transient, copy-oriented view of the current lasso address set. It does
 * not receive a tree command callback: selection is a handle, never material.
 */
export function LassoSelectionTray({
  selections,
  onClear,
  onLocate,
}: LassoSelectionTrayProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyText = useMemo(
    () => copyLassoSelectionSet(selections),
    [selections],
  );

  if (selections.length === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <aside
      aria-label="Selected language"
      className={styles.tray}
      data-canvas-interactive
      data-selection-count={selections.length}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Selection</p>
          <h2>{selections.length === 1 ? "1 passage" : `${selections.length} passages`}</h2>
        </div>
        <button
          aria-label="Clear language selection"
          className={styles.close}
          onClick={onClear}
          type="button"
        >
          ×
        </button>
      </header>
      <ol className={styles.list}>
        {selections.map((selection, index) => (
          <li key={`${selection.nodeId}:${selection.start}:${selection.end}`}>
            <button
              className={styles.item}
              onClick={() => onLocate(selection)}
              type="button"
            >
              <span className={styles.index}>{index + 1}</span>
              <span>{selection.selectedText}</span>
            </button>
          </li>
        ))}
      </ol>
      <footer className={styles.actions}>
        <button className={styles.copy} onClick={copy} type="button">
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy unavailable" : "Copy"}
        </button>
        <button className={styles.clear} onClick={onClear} type="button">
          Clear
        </button>
      </footer>
    </aside>
  );
}
