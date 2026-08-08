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
