import type { CanvasLanguage } from "./canvas-preferences";

/** The takeover's own words. Every locale is complete; none inherits another. */
export type WikiTakeoverCopy = Readonly<{
  /** Names the change for assistive technology, heard form first. */
  changed: (heard: string, canonical: string) => string;
  keep: string;
  keepLabel: (canonical: string) => string;
  restoreLabel: (heard: string) => string;
  wiki: string;
  wikiLabel: (canonical: string) => string;
}>;

const COPY: Readonly<Record<CanvasLanguage, WikiTakeoverCopy>> = Object.freeze({
  "en-US": table({
    changed: (heard, canonical) => `Wiki changed ‘${heard}’ to ‘${canonical}’`,
    keep: "Keep",
    keepLabel: (canonical) => `Keep ‘${canonical}’`,
    restoreLabel: (heard) => `Restore ‘${heard}’`,
    wiki: "Wiki…",
    wikiLabel: (canonical) => `Open ‘${canonical}’ in Wiki`,
  }),
  "zh-CN": table({
    changed: (heard, canonical) => `词典 WIKI 把“${heard}”改成了“${canonical}”`,
    keep: "保留",
    keepLabel: (canonical) => `保留“${canonical}”`,
    restoreLabel: (heard) => `恢复为“${heard}”`,
    wiki: "词典…",
    wikiLabel: (canonical) => `在词典 WIKI 中查看“${canonical}”`,
  }),
  "zh-TW": table({
    changed: (heard, canonical) => `詞典 WIKI 把「${heard}」改成了「${canonical}」`,
    keep: "保留",
    keepLabel: (canonical) => `保留「${canonical}」`,
    restoreLabel: (heard) => `恢復為「${heard}」`,
    wiki: "詞典…",
    wikiLabel: (canonical) => `在詞典 WIKI 中查看「${canonical}」`,
  }),
  "ja-JP": table({
    changed: (heard, canonical) => `辞書 WIKI が「${heard}」を「${canonical}」に変えました`,
    keep: "このまま",
    keepLabel: (canonical) => `「${canonical}」のままにする`,
    restoreLabel: (heard) => `「${heard}」に戻す`,
    wiki: "辞書…",
    wikiLabel: (canonical) => `辞書 WIKI で「${canonical}」を開く`,
  }),
  "de-DE": table({
    changed: (heard, canonical) => `Wörterbuch Wiki hat „${heard}“ in „${canonical}“ geändert`,
    keep: "Behalten",
    keepLabel: (canonical) => `„${canonical}“ behalten`,
    restoreLabel: (heard) => `„${heard}“ wiederherstellen`,
    wiki: "Wiki…",
    wikiLabel: (canonical) => `„${canonical}“ im Wörterbuch Wiki öffnen`,
  }),
});

/** Keeps each table contextually typed, so every entry must be complete. */
function table(copy: WikiTakeoverCopy): WikiTakeoverCopy {
  return Object.freeze(copy);
}

export function wikiTakeoverCopy(locale: CanvasLanguage): WikiTakeoverCopy {
  return COPY[locale];
}
