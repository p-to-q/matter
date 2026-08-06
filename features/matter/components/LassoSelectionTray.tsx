"use client";

import { useMemo, useState } from "react";
import type { SegmentSelection } from "../material/text-segments";
import { copyLassoSelectionSet } from "../material/lasso-selection";
import styles from "./LassoSelectionTray.module.css";
import type { CanvasLanguage } from "./canvas-preferences";

type LassoSelectionTrayProps = Readonly<{
  selections: readonly SegmentSelection[];
  onClear: () => void;
  onLocate: (selection: SegmentSelection) => void;
  locale: CanvasLanguage;
}>;

const COPY: Readonly<Record<CanvasLanguage, Readonly<{
  selection: string; passage: (count: number) => string; clear: string;
  clearSelection: string; copy: string; copied: string; copyFailed: string;
}>>> = {
  "zh-CN": { selection: "选区", passage: (count) => `${count} 段文字`, clear: "清空", clearSelection: "清空文字选区", copy: "复制", copied: "已复制", copyFailed: "无法复制" },
  "zh-TW": { selection: "選區", passage: (count) => `${count} 段文字`, clear: "清空", clearSelection: "清空文字選區", copy: "複製", copied: "已複製", copyFailed: "無法複製" },
  "ja-JP": { selection: "選択", passage: (count) => `${count} 件`, clear: "クリア", clearSelection: "選択をクリア", copy: "コピー", copied: "コピー済み", copyFailed: "コピー不可" },
  "de-DE": { selection: "Auswahl", passage: (count) => `${count} ${count === 1 ? "Passage" : "Passagen"}`, clear: "Leeren", clearSelection: "Textauswahl leeren", copy: "Kopieren", copied: "Kopiert", copyFailed: "Kopieren nicht möglich" },
  "en-US": { selection: "Selection", passage: (count) => count === 1 ? "1 passage" : `${count} passages`, clear: "Clear", clearSelection: "Clear language selection", copy: "Copy", copied: "Copied", copyFailed: "Copy unavailable" },
};

/**
 * A transient, copy-oriented view of the current lasso address set. It does
 * not receive a tree command callback: selection is a handle, never material.
 */
export function LassoSelectionTray({
  selections,
  onClear,
  onLocate,
  locale,
}: LassoSelectionTrayProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyText = useMemo(
    () => copyLassoSelectionSet(selections),
    [selections],
  );

  if (selections.length === 0) return null;
  const labels = COPY[locale];

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
      aria-label={labels.selection}
      className={styles.tray}
      data-canvas-interactive
      data-selection-count={selections.length}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{labels.selection}</p>
          <h2>{labels.passage(selections.length)}</h2>
        </div>
        <button
          aria-label={labels.clearSelection}
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
          {copyState === "copied" ? labels.copied : copyState === "failed" ? labels.copyFailed : labels.copy}
        </button>
        <button className={styles.clear} onClick={onClear} type="button">
          {labels.clear}
        </button>
      </footer>
    </aside>
  );
}
