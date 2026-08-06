/** Canonical locale identifiers shared by browser and server boundaries. */
export const MATTER_LOCALE = Object.freeze({
  simplifiedChinese: "zh-CN",
  traditionalChinese: "zh-TW",
  japanese: "ja-JP",
  german: "de-DE",
  english: "en-US",
} as const);

export const MATTER_LOCALES = Object.freeze([
  MATTER_LOCALE.simplifiedChinese,
  MATTER_LOCALE.traditionalChinese,
  MATTER_LOCALE.japanese,
  MATTER_LOCALE.german,
  MATTER_LOCALE.english,
] as const);

export type MatterLocale = (typeof MATTER_LOCALES)[number];

export function isMatterLocale(value: string): value is MatterLocale {
  return (MATTER_LOCALES as readonly string[]).includes(value);
}
