import {
  DEFAULT_WIKI_CAPABILITY_PREFERENCES,
  WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY,
  decodeWikiCapabilityPreferences,
  serializeWikiCapabilityPreferences,
  type WikiCapabilityPreferences,
} from "./wiki-capability-preferences";

export type WikiCapabilityPreferencesPort = Readonly<{
  read(): string | null;
  write(serialized: string): void;
  subscribe(listener: (serialized: string | null) => void): () => void;
}>;

export type WikiCapabilityPreferencesWriteResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "PERSISTENCE_UNAVAILABLE" }>;

export class WikiCapabilityPreferencesController {
  private readonly listeners = new Set<() => void>();
  private snapshot: WikiCapabilityPreferences;
  private readonly stopStorage: () => void;

  constructor(private readonly port: WikiCapabilityPreferencesPort) {
    this.snapshot = readPreferences(port);
    try {
      this.stopStorage = port.subscribe((serialized) => {
        this.publish(decodeWikiCapabilityPreferences(serialized));
      });
    } catch {
      this.stopStorage = () => undefined;
    }
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
    try {
      this.port.write(serializeWikiCapabilityPreferences(value));
    } catch {
      return Object.freeze({ ok: false, code: "PERSISTENCE_UNAVAILABLE" });
    }
    this.publish(value);
    return Object.freeze({ ok: true });
  }

  private publish(value: WikiCapabilityPreferences): void {
    if (samePreferences(this.snapshot, value)) return;
    this.snapshot = Object.freeze({ ...value });
    this.listeners.forEach((listener) => listener());
  }
}

function readPreferences(
  port: WikiCapabilityPreferencesPort,
): WikiCapabilityPreferences {
  try {
    return decodeWikiCapabilityPreferences(port.read());
  } catch {
    return Object.freeze({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      automaticCollection: false,
      phoneticFitting: false,
    });
  }
}

function samePreferences(
  left: WikiCapabilityPreferences,
  right: WikiCapabilityPreferences,
): boolean {
  return left.automaticCollection === right.automaticCollection &&
    left.phoneticFitting === right.phoneticFitting;
}

function createBrowserPort(): WikiCapabilityPreferencesPort {
  return Object.freeze({
    read: () => globalThis.localStorage.getItem(
      WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY,
    ),
    write: (serialized) => globalThis.localStorage.setItem(
      WIKI_CAPABILITY_PREFERENCES_STORAGE_KEY,
      serialized,
    ),
    subscribe: (listener) => {
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

type WikiCapabilityPreferencesRuntime = Readonly<{
  controller: WikiCapabilityPreferencesController;
}>;

const RUNTIME_KEY = Symbol.for("ptoq.matter.wiki-capability-preferences.v2");
const runtimeHost = globalThis as unknown as {
  [key: symbol]: WikiCapabilityPreferencesRuntime | undefined;
};
const runtime = runtimeHost[RUNTIME_KEY] ?? Object.freeze({
  controller: new WikiCapabilityPreferencesController(createBrowserPort()),
});
runtimeHost[RUNTIME_KEY] = runtime;

export const matterWikiCapabilityPreferences = runtime.controller;
