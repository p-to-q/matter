export const CANVAS_PREFERENCES_VERSION = 1 as const;
export const CANVAS_PREFERENCES_STORAGE_KEY = "matter.canvas-preferences.v1";
export const CANVAS_PREFERENCES_MAX_STORAGE_LENGTH = 1_024;

export const CANVAS_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ value: "zh-CN", label: "中文" }),
  Object.freeze({ value: "en-US", label: "English" }),
] as const);

export const CANVAS_APPEARANCE_OPTIONS = Object.freeze([
  Object.freeze({ value: "auto", label: "Auto" }),
  Object.freeze({ value: "light", label: "Light" }),
  Object.freeze({ value: "dark", label: "Dark" }),
] as const);

export type CanvasLanguage = (typeof CANVAS_LANGUAGE_OPTIONS)[number]["value"];
export type CanvasAppearance = (typeof CANVAS_APPEARANCE_OPTIONS)[number]["value"];
export type ResolvedCanvasAppearance = Exclude<CanvasAppearance, "auto">;

export type CanvasPreferences = Readonly<{
  version: typeof CANVAS_PREFERENCES_VERSION;
  language: CanvasLanguage;
  leafFx: boolean;
  appearance: CanvasAppearance;
}>;

export type CanvasPreferencesSnapshot = Readonly<{
  preferences: CanvasPreferences;
  resolvedAppearance: ResolvedCanvasAppearance;
}>;

export type CanvasPreferencesParseResult =
  | Readonly<{ ok: true; preferences: CanvasPreferences }>
  | Readonly<{
      ok: false;
      errorCode:
        | "CANVAS_PREFERENCES_BOUND_EXCEEDED"
        | "CANVAS_PREFERENCES_INVALID_JSON"
        | "CANVAS_PREFERENCES_INVALID_SHAPE"
        | "CANVAS_PREFERENCES_UNSUPPORTED_VERSION";
    }>;

export type CanvasPreferencesPort = Readonly<{
  read: () => string | null;
  write: (serialized: string) => void;
  systemAppearance: () => ResolvedCanvasAppearance;
  subscribeStorage: (listener: (serialized: string | null) => void) => () => void;
  subscribeSystemAppearance: (
    listener: (appearance: ResolvedCanvasAppearance) => void,
  ) => () => void;
}>;

export const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = freezePreferences({
  version: CANVAS_PREFERENCES_VERSION,
  language: "zh-CN",
  leafFx: true,
  appearance: "auto",
});

const DEFAULT_SNAPSHOT = freezeSnapshot(
  DEFAULT_CANVAS_PREFERENCES,
  "light",
);

/**
 * Canvas preferences are local presentation state. The controller deliberately
 * has no access to the material store or command history.
 */
export class CanvasPreferencesController {
  private readonly listeners = new Set<() => void>();
  private retainCount = 0;
  private stopStorage: (() => void) | null = null;
  private stopSystemAppearance: (() => void) | null = null;
  private systemAppearance: ResolvedCanvasAppearance = "light";
  private snapshot: CanvasPreferencesSnapshot = DEFAULT_SNAPSHOT;

  constructor(private readonly port: CanvasPreferencesPort) {}

  getSnapshot = (): CanvasPreferencesSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  retain(): void {
    this.retainCount += 1;
    if (this.retainCount !== 1) return;

    this.stopStorage = safelySubscribe(() => this.port.subscribeStorage((serialized) => {
      this.receiveStoredPreferences(serialized);
    }));
    this.stopSystemAppearance = safelySubscribe(() =>
      this.port.subscribeSystemAppearance((appearance) => {
        this.receiveSystemAppearance(appearance);
      }),
    );

    this.systemAppearance = safelyReadSystemAppearance(this.port);
    const stored = safelyReadPreferences(this.port);
    if (stored === null) {
      this.publish(DEFAULT_CANVAS_PREFERENCES);
      return;
    }

    const parsed = parseCanvasPreferences(stored);
    this.publish(parsed.ok ? parsed.preferences : DEFAULT_CANVAS_PREFERENCES);
  }

  release(): void {
    if (this.retainCount === 0) return;
    this.retainCount -= 1;
    if (this.retainCount !== 0) return;

    safelyStop(this.stopStorage);
    safelyStop(this.stopSystemAppearance);
    this.stopStorage = null;
    this.stopSystemAppearance = null;
  }

  setLanguage(language: CanvasLanguage): void {
    if (!isCanvasLanguage(language)) return;
    this.commit({ ...this.snapshot.preferences, language });
  }

  setLeafFx(leafFx: boolean): void {
    if (typeof leafFx !== "boolean") return;
    this.commit({ ...this.snapshot.preferences, leafFx });
  }

  setAppearance(appearance: CanvasAppearance): void {
    if (!isCanvasAppearance(appearance)) return;
    this.commit({ ...this.snapshot.preferences, appearance });
  }

  private commit(preferences: CanvasPreferences): void {
    const next = freezePreferences(preferences);
    if (samePreferences(this.snapshot.preferences, next)) return;
    this.publish(next);
    safelyWritePreferences(this.port, serializeCanvasPreferences(next));
  }

  private receiveStoredPreferences(serialized: string | null): void {
    if (serialized === null) {
      this.publish(DEFAULT_CANVAS_PREFERENCES);
      return;
    }

    const parsed = parseCanvasPreferences(serialized);
    if (parsed.ok) this.publish(parsed.preferences);
  }

  private receiveSystemAppearance(appearance: ResolvedCanvasAppearance): void {
    if (!isResolvedAppearance(appearance) || appearance === this.systemAppearance) return;
    this.systemAppearance = appearance;
    if (this.snapshot.preferences.appearance === "auto") {
      this.publish(this.snapshot.preferences);
    }
  }

  private publish(preferences: CanvasPreferences): void {
    const next = freezeSnapshot(preferences, resolveCanvasAppearance(
      preferences.appearance,
      this.systemAppearance,
    ));
    if (sameSnapshot(this.snapshot, next)) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

export function parseCanvasPreferences(serialized: string): CanvasPreferencesParseResult {
  if (serialized.length > CANVAS_PREFERENCES_MAX_STORAGE_LENGTH) {
    return parseFailure("CANVAS_PREFERENCES_BOUND_EXCEEDED");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(serialized);
  } catch {
    return parseFailure("CANVAS_PREFERENCES_INVALID_JSON");
  }

  if (!isPlainRecord(candidate)) {
    return parseFailure("CANVAS_PREFERENCES_INVALID_SHAPE");
  }
  if (candidate.version !== CANVAS_PREFERENCES_VERSION) {
    return parseFailure("CANVAS_PREFERENCES_UNSUPPORTED_VERSION");
  }
  if (
    !hasOnlyKeys(candidate, ["version", "language", "leafFx", "appearance"]) ||
    !isCanvasLanguage(candidate.language) ||
    typeof candidate.leafFx !== "boolean" ||
    !isCanvasAppearance(candidate.appearance)
  ) {
    return parseFailure("CANVAS_PREFERENCES_INVALID_SHAPE");
  }

  return Object.freeze({
    ok: true,
    preferences: freezePreferences({
      version: CANVAS_PREFERENCES_VERSION,
      language: candidate.language,
      leafFx: candidate.leafFx,
      appearance: candidate.appearance,
    }),
  });
}

export function serializeCanvasPreferences(preferences: CanvasPreferences): string {
  return JSON.stringify({
    version: CANVAS_PREFERENCES_VERSION,
    language: preferences.language,
    leafFx: preferences.leafFx,
    appearance: preferences.appearance,
  });
}

export function resolveCanvasAppearance(
  appearance: CanvasAppearance,
  systemAppearance: ResolvedCanvasAppearance,
): ResolvedCanvasAppearance {
  return appearance === "auto" ? systemAppearance : appearance;
}

/** Browser capabilities stay lazy so importing or server-rendering is safe. */
export function createBrowserCanvasPreferencesPort(): CanvasPreferencesPort {
  return Object.freeze({
    read: () => browserStorage()?.getItem(CANVAS_PREFERENCES_STORAGE_KEY) ?? null,
    write: (serialized) => browserStorage()?.setItem(
      CANVAS_PREFERENCES_STORAGE_KEY,
      serialized,
    ),
    systemAppearance: () => systemAppearanceQuery()?.matches ? "dark" : "light",
    subscribeStorage: (listener) => {
      if (typeof window === "undefined") return noOp;
      const storage = browserStorage();
      if (storage === null) return noOp;
      const onStorage = (event: StorageEvent) => {
        if (event.key !== CANVAS_PREFERENCES_STORAGE_KEY) return;
        if (event.storageArea !== null && event.storageArea !== storage) return;
        listener(event.newValue);
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    subscribeSystemAppearance: (listener) => {
      const query = systemAppearanceQuery();
      if (query === null) return noOp;
      const onChange = (event: MediaQueryListEvent) => {
        listener(event.matches ? "dark" : "light");
      };
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
  });
}

function freezePreferences(preferences: CanvasPreferences): CanvasPreferences {
  return Object.freeze({ ...preferences });
}

function freezeSnapshot(
  preferences: CanvasPreferences,
  resolvedAppearance: ResolvedCanvasAppearance,
): CanvasPreferencesSnapshot {
  return Object.freeze({ preferences, resolvedAppearance });
}

function parseFailure(
  errorCode: Extract<CanvasPreferencesParseResult, { ok: false }>["errorCode"],
): CanvasPreferencesParseResult {
  return Object.freeze({ ok: false, errorCode });
}

function isCanvasLanguage(value: unknown): value is CanvasLanguage {
  return CANVAS_LANGUAGE_OPTIONS.some((option) => option.value === value);
}

function isCanvasAppearance(value: unknown): value is CanvasAppearance {
  return CANVAS_APPEARANCE_OPTIONS.some((option) => option.value === value);
}

function isResolvedAppearance(value: unknown): value is ResolvedCanvasAppearance {
  return value === "light" || value === "dark";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const ownKeys = Object.keys(value);
  return ownKeys.length === keys.length && keys.every((key) => ownKeys.includes(key));
}

function samePreferences(left: CanvasPreferences, right: CanvasPreferences): boolean {
  return left.version === right.version &&
    left.language === right.language &&
    left.leafFx === right.leafFx &&
    left.appearance === right.appearance;
}

function sameSnapshot(
  left: CanvasPreferencesSnapshot,
  right: CanvasPreferencesSnapshot,
): boolean {
  return samePreferences(left.preferences, right.preferences) &&
    left.resolvedAppearance === right.resolvedAppearance;
}

function safelyReadPreferences(port: CanvasPreferencesPort): string | null {
  try {
    return port.read();
  } catch {
    return null;
  }
}

function safelyWritePreferences(port: CanvasPreferencesPort, serialized: string): void {
  try {
    port.write(serialized);
  } catch {
    // The in-memory preference remains usable when browser storage is denied.
  }
}

function safelyReadSystemAppearance(
  port: CanvasPreferencesPort,
): ResolvedCanvasAppearance {
  try {
    const appearance = port.systemAppearance();
    return isResolvedAppearance(appearance) ? appearance : "light";
  } catch {
    return "light";
  }
}

function safelySubscribe(subscribe: () => () => void): () => void {
  try {
    return subscribe();
  } catch {
    return noOp;
  }
}

function safelyStop(stop: (() => void) | null): void {
  try {
    stop?.();
  } catch {
    // Cleanup for one browser capability must not block the other capability.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function systemAppearanceQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return null;
  }
}

function noOp(): void {}
