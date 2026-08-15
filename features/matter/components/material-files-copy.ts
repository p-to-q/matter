import { MATTER_LOCALE, type MatterLocale } from "../config/locales";

/**
 * The material index's own copy. It was the one surface left hard-coded in
 * Simplified Chinese, which made the only signal that durable material had
 * stopped saving unreadable to most of the audience. The visible text and the
 * recovery control's accessible name come from the same entry so they can no
 * longer drift into different languages.
 */
export type MaterialFilesCopy = Readonly<{
  identityName: string;
  localOnly: string;
  saving: string;
  saveFailed: string;
  storageFull: string;
  conflict: string;
  saveFailedAction: string;
  storageFullAction: string;
  conflictAction: string;
  collapseBranch: (title: string) => string;
  expandBranch: (title: string) => string;
  includeInWorkingContext: (title: string) => string;
  restoreAndView: (title: string) => string;
  setAsideFromWorkingContext: (title: string) => string;
}>;

const ENGLISH: MaterialFilesCopy = Object.freeze({
  identityName: "Quarrier",
  localOnly: "Kept only on this device",
  saving: "Saving to this device",
  saveFailed: "Not saved · Retry",
  storageFull: "Storage full · Export a copy first",
  conflict: "Newer material · Reload",
  saveFailedAction: "Retry saving material",
  storageFullAction: "Open archive to export material before freeing storage",
  conflictAction: "Reload newer material",
  collapseBranch: (title) => `Collapse ${title} in the material index`,
  expandBranch: (title) => `Expand ${title} in the material index`,
  includeInWorkingContext: (title) => `Include ${title} in the material on this canvas and reopen its branch`,
  restoreAndView: (title) => `Include ${title} in the material on this canvas and view it`,
  setAsideFromWorkingContext: (title) => `Set ${title} aside from the material on this canvas and compact its branch`,
});

const SIMPLIFIED_CHINESE: MaterialFilesCopy = Object.freeze({
  identityName: "采石者",
  localOnly: "仅存于这台设备",
  saving: "正在存到这台设备",
  saveFailed: "没有保存成功 · 重试",
  storageFull: "存储已满 · 先导出备份",
  conflict: "有更新的材料 · 重新载入",
  saveFailedAction: "重试保存材料",
  storageFullAction: "打开归档，先导出材料再清理存储",
  conflictAction: "重新载入更新的材料",
  collapseBranch: (title) => `在材料目录中收起：${title}`,
  expandBranch: (title) => `在材料目录中展开：${title}`,
  includeInWorkingContext: (title) => `重新纳入画面里的材料，并展开下方分支：${title}`,
  restoreAndView: (title) => `重新纳入画面里的材料并查看：${title}`,
  setAsideFromWorkingContext: (title) => `暂时不纳入画面里的材料，并收起下方分支：${title}`,
});

const TRADITIONAL_CHINESE: MaterialFilesCopy = Object.freeze({
  identityName: "採石者",
  localOnly: "僅存於這台裝置",
  saving: "正在存到這台裝置",
  saveFailed: "沒有儲存成功 · 重試",
  storageFull: "儲存已滿 · 先匯出備份",
  conflict: "有更新的材料 · 重新載入",
  saveFailedAction: "重試儲存材料",
  storageFullAction: "開啟封存，先匯出材料再清理儲存空間",
  conflictAction: "重新載入更新的材料",
  collapseBranch: (title) => `在材料目錄中收起：${title}`,
  expandBranch: (title) => `在材料目錄中展開：${title}`,
  includeInWorkingContext: (title) => `重新納入畫面裡的材料，並展開下方分支：${title}`,
  restoreAndView: (title) => `重新納入畫面裡的材料並查看：${title}`,
  setAsideFromWorkingContext: (title) => `暫時不納入畫面裡的材料，並收起下方分支：${title}`,
});

const JAPANESE: MaterialFilesCopy = Object.freeze({
  identityName: "石を切る人",
  localOnly: "この端末にのみ保存",
  saving: "この端末に保存中",
  saveFailed: "保存できませんでした · 再試行",
  storageFull: "保存容量がいっぱいです · 先に書き出し",
  conflict: "新しい材料があります · 再読み込み",
  saveFailedAction: "材料の保存を再試行",
  storageFullAction: "アーカイブを開いて、容量を空ける前に材料を書き出す",
  conflictAction: "新しい材料を再読み込み",
  collapseBranch: (title) => `素材一覧で分岐を閉じる：${title}`,
  expandBranch: (title) => `素材一覧で分岐を開く：${title}`,
  includeInWorkingContext: (title) => `この画面で扱う素材に戻し、分岐を開く：${title}`,
  restoreAndView: (title) => `この画面で扱う素材に戻して表示：${title}`,
  setAsideFromWorkingContext: (title) => `この画面で扱う素材から外し、分岐をたたむ：${title}`,
});

const GERMAN: MaterialFilesCopy = Object.freeze({
  identityName: "Steinbrecher",
  localOnly: "Nur auf diesem Gerät",
  saving: "Wird auf diesem Gerät gespeichert",
  saveFailed: "Nicht gespeichert · Erneut versuchen",
  storageFull: "Speicher voll · Zuerst exportieren",
  conflict: "Neueres Material · Neu laden",
  saveFailedAction: "Speichern des Materials erneut versuchen",
  storageFullAction: "Archiv öffnen und Material exportieren, bevor Speicher frei wird",
  conflictAction: "Neueres Material neu laden",
  collapseBranch: (title) => `${title} im Materialindex schließen`,
  expandBranch: (title) => `${title} im Materialindex öffnen`,
  includeInWorkingContext: (title) => `${title} wieder in das Material dieser Fläche aufnehmen und den Zweig öffnen`,
  restoreAndView: (title) => `${title} wieder aufnehmen und anzeigen`,
  setAsideFromWorkingContext: (title) => `${title} aus dem Material dieser Fläche ausnehmen und den Zweig schließen`,
});

const BY_LOCALE: Readonly<Record<MatterLocale, MaterialFilesCopy>> = Object.freeze({
  [MATTER_LOCALE.english]: ENGLISH,
  [MATTER_LOCALE.simplifiedChinese]: SIMPLIFIED_CHINESE,
  [MATTER_LOCALE.traditionalChinese]: TRADITIONAL_CHINESE,
  [MATTER_LOCALE.japanese]: JAPANESE,
  [MATTER_LOCALE.german]: GERMAN,
});

export function materialFilesCopy(locale: MatterLocale): MaterialFilesCopy {
  return BY_LOCALE[locale] ?? SIMPLIFIED_CHINESE;
}
