import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_PREFERENCES_MAX_STORAGE_LENGTH,
  CANVAS_LANGUAGE_OPTIONS,
  CANVAS_PREFERENCES_STORAGE_KEY,
  CANVAS_PREFERENCES_VERSION,
  CanvasPreferencesController,
  createBrowserCanvasPreferencesPort,
  DEFAULT_CANVAS_PREFERENCES,
  parseCanvasPreferences,
  resolveCanvasAppearance,
  resolveAutoAppearanceAt,
  serializeCanvasPreferences,
  type CanvasPreferencesPort,
  type ResolvedCanvasAppearance,
} from "./canvas-preferences";

function createPort(initial: string | null = null, system: ResolvedCanvasAppearance = "light") {
  let stored = initial;
  let currentSystem = system;
  const storageListeners = new Set<(serialized: string | null) => void>();
  const systemListeners = new Set<(appearance: ResolvedCanvasAppearance) => void>();
  const writes: string[] = [];
  const port: CanvasPreferencesPort = {
    read: () => stored,
    write: (serialized) => {
      stored = serialized;
      writes.push(serialized);
    },
    clockAppearance: () => currentSystem,
    subscribeStorage: (listener) => {
      storageListeners.add(listener);
      return () => storageListeners.delete(listener);
    },
    subscribeClockAppearance: (listener) => {
      systemListeners.add(listener);
      return () => systemListeners.delete(listener);
    },
  };
  return {
    port,
    writes,
    storageListeners,
    systemListeners,
    sendStorage: (value: string | null) => storageListeners.forEach((listener) => listener(value)),
    sendSystem: (value: ResolvedCanvasAppearance) => {
      currentSystem = value;
      systemListeners.forEach((listener) => listener(value));
    },
  };
}

describe("canvas preference codec", () => {
  it("keeps the language picker order stable", () => {
    expect(CANVAS_LANGUAGE_OPTIONS.map((option) => option.value)).toEqual([
      "zh-CN",
      "en-US",
      "ja-JP",
      "de-DE",
      "zh-TW",
    ]);
  });

  it("round-trips the strict versioned preference record", () => {
    const serialized = serializeCanvasPreferences({
      version: CANVAS_PREFERENCES_VERSION,
      language: "en-US",
      leafFx: false,
      appearance: "dark",
    });

    expect(parseCanvasPreferences(serialized)).toEqual({
      ok: true,
      preferences: {
        version: 1,
        language: "en-US",
        leafFx: false,
        appearance: "dark",
      },
    });
  });

  it.each([
    ["bad JSON", "{", "CANVAS_PREFERENCES_INVALID_JSON"],
    ["wrong version", JSON.stringify({ version: 2, language: "zh-CN", leafFx: true, appearance: "auto" }), "CANVAS_PREFERENCES_UNSUPPORTED_VERSION"],
    ["unsupported language", JSON.stringify({ version: 1, language: "fr-FR", leafFx: true, appearance: "auto" }), "CANVAS_PREFERENCES_INVALID_SHAPE"],
    ["unsupported appearance", JSON.stringify({ version: 1, language: "zh-CN", leafFx: true, appearance: "sepia" }), "CANVAS_PREFERENCES_INVALID_SHAPE"],
    ["coerced FX", JSON.stringify({ version: 1, language: "zh-CN", leafFx: "yes", appearance: "auto" }), "CANVAS_PREFERENCES_INVALID_SHAPE"],
    ["extra fields", JSON.stringify({ version: 1, language: "zh-CN", leafFx: true, appearance: "auto", material: {} }), "CANVAS_PREFERENCES_INVALID_SHAPE"],
  ] as const)("rejects %s as a whole", (_name, serialized, errorCode) => {
    expect(parseCanvasPreferences(serialized)).toEqual({ ok: false, errorCode });
  });

  it("bounds storage input before parsing", () => {
    expect(parseCanvasPreferences("x".repeat(CANVAS_PREFERENCES_MAX_STORAGE_LENGTH + 1)))
      .toEqual({ ok: false, errorCode: "CANVAS_PREFERENCES_BOUND_EXCEEDED" });
  });

  it("resolves auto through the system without changing explicit themes", () => {
    expect(resolveCanvasAppearance("auto", "dark")).toBe("dark");
    expect(resolveCanvasAppearance("auto", "light")).toBe("light");
    expect(resolveCanvasAppearance("dark", "light")).toBe("dark");
    expect(resolveCanvasAppearance("light", "dark")).toBe("light");
  });

  it("resolves Auto from local clock boundaries", () => {
    expect(resolveAutoAppearanceAt(new Date(2026, 0, 1, 6, 59))).toBe("dark");
    expect(resolveAutoAppearanceAt(new Date(2026, 0, 1, 7, 0))).toBe("light");
    expect(resolveAutoAppearanceAt(new Date(2026, 0, 1, 18, 59))).toBe("light");
    expect(resolveAutoAppearanceAt(new Date(2026, 0, 1, 19, 0))).toBe("dark");
    expect(resolveAutoAppearanceAt(new Date(Number.NaN), "dark")).toBe("dark");
  });
});

describe("canvas preference controller", () => {
  it("hydrates once retained and persists only validated person changes", () => {
    const environment = createPort(JSON.stringify({
      version: 1,
      language: "en-US",
      leafFx: false,
      appearance: "auto",
    }), "dark");
    const controller = new CanvasPreferencesController(environment.port);
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.getSnapshot()).toEqual({
      preferences: DEFAULT_CANVAS_PREFERENCES,
      resolvedAppearance: "light",
    });
    controller.retain();
    expect(controller.getSnapshot()).toEqual({
      preferences: {
        version: 1,
        language: "en-US",
        leafFx: false,
        appearance: "auto",
      },
      resolvedAppearance: "dark",
    });
    expect(environment.writes).toEqual([]);

    controller.setLanguage("zh-CN");
    controller.setLeafFx(true);
    controller.setAppearance("light");
    expect(environment.writes).toHaveLength(3);
    expect(parseCanvasPreferences(environment.writes.at(-1)!)).toEqual({
      ok: true,
      preferences: {
        version: 1,
        language: "zh-CN",
        leafFx: true,
        appearance: "light",
      },
    });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("follows valid storage events, resets on removal, and ignores corrupt events", () => {
    const environment = createPort();
    const controller = new CanvasPreferencesController(environment.port);
    controller.retain();
    environment.sendStorage(JSON.stringify({
      version: 1,
      language: "en-US",
      leafFx: false,
      appearance: "dark",
    }));
    expect(controller.getSnapshot().preferences).toEqual({
      version: 1,
      language: "en-US",
      leafFx: false,
      appearance: "dark",
    });

    environment.sendStorage("not-json");
    expect(controller.getSnapshot().preferences.appearance).toBe("dark");
    environment.sendStorage(null);
    expect(controller.getSnapshot().preferences).toBe(DEFAULT_CANVAS_PREFERENCES);
  });

  it("publishes system changes only while auto is the effective appearance", () => {
    const environment = createPort(null, "light");
    const controller = new CanvasPreferencesController(environment.port);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.retain();

    environment.sendSystem("dark");
    expect(controller.getSnapshot().resolvedAppearance).toBe("dark");
    controller.setAppearance("light");
    environment.sendSystem("light");
    environment.sendSystem("dark");
    expect(controller.getSnapshot().resolvedAppearance).toBe("light");
    controller.setAppearance("auto");
    expect(controller.getSnapshot().resolvedAppearance).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("cleans up browser subscriptions after the final release", () => {
    const environment = createPort();
    const controller = new CanvasPreferencesController(environment.port);
    controller.retain();
    controller.retain();
    expect(environment.storageListeners.size).toBe(1);
    expect(environment.systemListeners.size).toBe(1);

    controller.release();
    expect(environment.storageListeners.size).toBe(1);
    controller.release();
    expect(environment.storageListeners.size).toBe(0);
    expect(environment.systemListeners.size).toBe(0);
    controller.release();
  });

  it("ignores unsupported action values without publishing or persisting them", () => {
    const environment = createPort();
    const controller = new CanvasPreferencesController(environment.port);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.retain();

    controller.setLanguage("fr-FR" as "zh-CN");
    controller.setAppearance("sepia" as "auto");
    controller.setLeafFx("yes" as unknown as boolean);

    expect(controller.getSnapshot().preferences).toBe(DEFAULT_CANVAS_PREFERENCES);
    expect(environment.writes).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stays usable when browser capabilities throw", () => {
    const controller = new CanvasPreferencesController({
      read: () => { throw new Error("denied"); },
      write: () => { throw new Error("denied"); },
      clockAppearance: () => { throw new Error("denied"); },
      subscribeStorage: () => { throw new Error("denied"); },
      subscribeClockAppearance: () => { throw new Error("denied"); },
    });

    expect(() => controller.retain()).not.toThrow();
    expect(() => controller.setLeafFx(false)).not.toThrow();
    expect(controller.getSnapshot()).toEqual({
      preferences: { ...DEFAULT_CANVAS_PREFERENCES, leafFx: false },
      resolvedAppearance: "light",
    });
  });
});

describe("browser canvas preference port", () => {
  it("is inert and SSR-safe when window is absent", () => {
    const port = createBrowserCanvasPreferencesPort();
    expect(port.read()).toBeNull();
    expect(port.clockAppearance()).toBe(resolveAutoAppearanceAt(new Date()));
    expect(() => port.write("ignored")).not.toThrow();
    expect(() => port.subscribeStorage(() => undefined)()).not.toThrow();
    expect(() => port.subscribeClockAppearance(() => undefined)()).not.toThrow();
    expect(CANVAS_PREFERENCES_STORAGE_KEY).toContain("v1");
  });
});
