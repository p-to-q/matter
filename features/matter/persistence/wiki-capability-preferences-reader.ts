export const WIKI_CAPABILITY_PREFERENCES_VERSION = 1 as const;
export const WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY =
  "matter.wiki-capability-preferences.v1";
export const MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH = 256;

const AUTOMATIC_COLLECTION = 1;
const PHONETIC_FITTING = 2;

let cachedRaw: string | null | undefined;
let cachedBits = 0;

/** Compact synchronous permission read for material admission; no Wiki state enters here. */
export function readMatterWikiCapabilityBits(): number {
  let raw: string | null;
  try {
    raw = globalThis.localStorage.getItem(WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY);
  } catch {
    cachedRaw = undefined;
    return 0;
  }
  if (raw === cachedRaw) return cachedBits;
  cachedRaw = raw;
  if (raw === null) return (cachedBits = AUTOMATIC_COLLECTION | PHONETIC_FITTING);
  if (raw.length > MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH) {
    return (cachedBits = 0);
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value) ||
        Object.keys(value).length !== 3) return (cachedBits = 0);
    const record = value as Record<string, unknown>;
    if (record.version !== WIKI_CAPABILITY_PREFERENCES_VERSION ||
        typeof record.automaticCollection !== "boolean" ||
        typeof record.phoneticFitting !== "boolean") return (cachedBits = 0);
    return (cachedBits = (record.automaticCollection ? AUTOMATIC_COLLECTION : 0) |
      (record.phoneticFitting ? PHONETIC_FITTING : 0));
  } catch {
    return (cachedBits = 0);
  }
}

export const isMatterWikiAutomaticCollectionEnabled = (): boolean =>
  (readMatterWikiCapabilityBits() & AUTOMATIC_COLLECTION) !== 0;

export const isMatterWikiPhoneticFittingEnabled = (): boolean =>
  (readMatterWikiCapabilityBits() & PHONETIC_FITTING) !== 0;
