import { MATTER_LOCALE, type MatterLocale } from "../config/locales";

/**
 * The material index's own copy. It was the one surface left hard-coded in
 * Simplified Chinese. Persistence recovery copy belongs to the explicit
 * Archive surface; this table owns only the quiet identity and tree actions.
 */
export type MaterialFilesCopy = Readonly<{
  identityName: string;
  localOnly: string;
  saving: string;
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
