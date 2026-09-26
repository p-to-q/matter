import {
  MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH,
  WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY,
  WIKI_CAPABILITY_PREFERENCES_VERSION,
} from "./wiki-capability-preferences-reader";

export {
  MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH,
  WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY,
  WIKI_CAPABILITY_PREFERENCES_VERSION,
};

export type WikiCapabilityPreferences = Readonly<{
  version: typeof WIKI_CAPABILITY_PREFERENCES_VERSION;
  automaticCollection: boolean;
  phoneticFitting: boolean;
}>;

export const DEFAULT_WIKI_CAPABILITY_PREFERENCES: WikiCapabilityPreferences =
  freezePreferences({
    version: WIKI_CAPABILITY_PREFERENCES_VERSION,
    automaticCollection: true,
    phoneticFitting: true,
  });

const DISABLED_WIKI_CAPABILITY_PREFERENCES: WikiCapabilityPreferences =
  freezePreferences({
    version: WIKI_CAPABILITY_PREFERENCES_VERSION,
    automaticCollection: false,
    phoneticFitting: false,
  });

export function parseWikiCapabilityPreferences(
  serialized: string,
): WikiCapabilityPreferences | null {
  if (serialized.length > MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH) return null;
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isRecord(value) || Object.keys(value).length !== 3 ||
      value.version !== WIKI_CAPABILITY_PREFERENCES_VERSION ||
      typeof value.automaticCollection !== "boolean" ||
      typeof value.phoneticFitting !== "boolean") return null;
  return freezePreferences({
    version: WIKI_CAPABILITY_PREFERENCES_VERSION,
    automaticCollection: value.automaticCollection,
    phoneticFitting: value.phoneticFitting,
  });
}

export function serializeWikiCapabilityPreferences(
  value: WikiCapabilityPreferences,
): string {
  return JSON.stringify({
    version: value.version,
    automaticCollection: value.automaticCollection,
    phoneticFitting: value.phoneticFitting,
  });
}

export function decodeWikiCapabilityPreferences(
  serialized: string | null,
): WikiCapabilityPreferences {
  if (serialized === null) return DEFAULT_WIKI_CAPABILITY_PREFERENCES;
  return parseWikiCapabilityPreferences(serialized) ??
    DISABLED_WIKI_CAPABILITY_PREFERENCES;
}

function freezePreferences(
  value: WikiCapabilityPreferences,
): WikiCapabilityPreferences {
  return Object.freeze({ ...value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
