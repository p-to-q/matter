import { isMatterLocale } from "../config/locales";
import type { WikiPreferences } from "./wiki-model";

export const DEFAULT_WIKI_PREFERENCES: WikiPreferences = Object.freeze({
  nearSound: Object.freeze([]), accents: Object.freeze([]) as readonly [], hints: null,
});

export function isWikiPreferences(value: unknown): value is WikiPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || !Object.hasOwn(row, "nearSound") ||
      !Object.hasOwn(row, "accents") || !Object.hasOwn(row, "hints") ||
      !Array.isArray(row.nearSound) || row.nearSound.length > 5 ||
      !Array.isArray(row.accents) || row.accents.length !== 0 || row.hints !== null) return false;
  let previous = "";
  return row.nearSound.every((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const decision = entry as Record<string, unknown>;
    if (Object.keys(decision).length !== 2 || typeof decision.locale !== "string" ||
        !isMatterLocale(decision.locale) || typeof decision.enabled !== "boolean" ||
        decision.locale <= previous) return false;
    previous = decision.locale;
    return true;
  });
}

export function freezeWikiPreferences(value: WikiPreferences): WikiPreferences {
  return Object.freeze({ nearSound: Object.freeze(value.nearSound.map((entry) =>
    Object.freeze({ locale: entry.locale, enabled: entry.enabled }))),
  accents: Object.freeze([]) as readonly [], hints: null });
}

/** A preference can only withhold a qualified capability, never qualify one. */
export function wikiNearSoundEnabled(
  preferences: WikiPreferences,
  locale: WikiPreferences["nearSound"][number]["locale"],
): boolean {
  return preferences.nearSound.find((entry) => entry.locale === locale)?.enabled ?? true;
}
