export const WIKI_CAPABILITY_PREFERENCES_VERSION = 1 as const;
export const WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY =
  "matter.wiki-capability-preferences.v1";
export const MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH = 256;

export type WikiCapabilityPreferences = Readonly<{
  version: typeof WIKI_CAPABILITY_PREFERENCES_VERSION;
  automaticCollection: boolean;
  phoneticFitting: boolean;
}>;

export type WikiCapabilityPreferencesPort = Readonly<{
  read(): string | null;
  write(serialized: string): void;
  subscribe(listener: (serialized: string | null) => void): () => void;
}>;

export type WikiCapabilityPreferencesWriteResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "PERSISTENCE_UNAVAILABLE" }>;

export const DEFAULT_WIKI_CAPABILITY_PREFERENCES: WikiCapabilityPreferences =
  freezePreferences({
    version: WIKI_CAPABILITY_PREFERENCES_VERSION,
    automaticCollection: true,
    phoneticFitting: true,
  });

export class WikiCapabilityPreferencesController {
  private readonly listeners = new Set<() => void>();
  private snapshot: WikiCapabilityPreferences;
  private readonly stopStorage: () => void;

  constructor(private readonly port: WikiCapabilityPreferencesPort) {
    this.snapshot = readPreferences(port);
    this.stopStorage = safelySubscribe(port, (serialized) => {
      if (serialized === null) {
        this.publish(DEFAULT_WIKI_CAPABILITY_PREFERENCES);
        return;
      }
      const parsed = parseWikiCapabilityPreferences(serialized);
      if (parsed !== null) this.publish(parsed);
    });
  }

  getSnapshot = (): WikiCapabilityPreferences => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setAutomaticCollection(enabled: boolean): WikiCapabilityPreferencesWriteResult {
    return this.commit({ ...this.snapshot, automaticCollection: enabled });
  }

  setPhoneticFitting(enabled: boolean): WikiCapabilityPreferencesWriteResult {
    return this.commit({ ...this.snapshot, phoneticFitting: enabled });
  }

  dispose(): void {
    this.stopStorage();
    this.listeners.clear();
  }

  private commit(
    value: WikiCapabilityPreferences,
  ): WikiCapabilityPreferencesWriteResult {
    if (samePreferences(this.snapshot, value)) return Object.freeze({ ok: true });
    const next = freezePreferences(value);
    try {
      this.port.write(serializeWikiCapabilityPreferences(next));
    } catch {
      return Object.freeze({ ok: false, code: "PERSISTENCE_UNAVAILABLE" });
    }
    this.publish(next);
    return Object.freeze({ ok: true });
  }

  private publish(value: WikiCapabilityPreferences): void {
    if (samePreferences(this.snapshot, value)) return;
    this.snapshot = freezePreferences(value);
    this.listeners.forEach((listener) => listener());
  }
}

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

function createBrowserPort(): WikiCapabilityPreferencesPort {
  return Object.freeze({
    read: () => {
      try {
        return globalThis.localStorage?.getItem(WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY) ?? null;
      } catch {
        return null;
      }
    },
    write: (serialized) => {
      globalThis.localStorage?.setItem(WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY, serialized);
    },
    subscribe: (listener) => {
      if (typeof globalThis.addEventListener !== "function") return () => undefined;
      const receive = (event: StorageEvent) => {
        if (event.key === WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY || event.key === null) {
          listener(event.key === null ? null : event.newValue);
        }
      };
      globalThis.addEventListener("storage", receive);
      return () => globalThis.removeEventListener("storage", receive);
    },
  });
}

function readPreferences(
  port: WikiCapabilityPreferencesPort,
): WikiCapabilityPreferences {
  let serialized: string | null;
  try {
    serialized = port.read();
  } catch {
    return DEFAULT_WIKI_CAPABILITY_PREFERENCES;
  }
  if (serialized === null) return DEFAULT_WIKI_CAPABILITY_PREFERENCES;
  return parseWikiCapabilityPreferences(serialized) ?? DEFAULT_WIKI_CAPABILITY_PREFERENCES;
}

function safelySubscribe(
  port: WikiCapabilityPreferencesPort,
  listener: (serialized: string | null) => void,
): () => void {
  try {
    return port.subscribe(listener);
  } catch {
    return () => undefined;
  }
}

function samePreferences(
  left: WikiCapabilityPreferences,
  right: WikiCapabilityPreferences,
): boolean {
  return left.version === right.version &&
    left.automaticCollection === right.automaticCollection &&
    left.phoneticFitting === right.phoneticFitting;
}

function freezePreferences(
  value: WikiCapabilityPreferences,
): WikiCapabilityPreferences {
  return Object.freeze({ ...value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type WikiCapabilityPreferencesRuntime = Readonly<{
  controller: WikiCapabilityPreferencesController;
}>;

const RUNTIME_KEY = Symbol.for("ptoq.matter.wiki-capability-preferences.v1");
const runtimeHost = globalThis as unknown as {
  [key: symbol]: WikiCapabilityPreferencesRuntime | undefined;
};
const runtime = runtimeHost[RUNTIME_KEY] ?? Object.freeze({
  controller: new WikiCapabilityPreferencesController(createBrowserPort()),
});
runtimeHost[RUNTIME_KEY] = runtime;

export const matterWikiCapabilityPreferences = runtime.controller;
