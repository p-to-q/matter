import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WIKI_CAPABILITY_PREFERENCES,
  MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH,
  WikiCapabilityPreferencesController,
  parseWikiCapabilityPreferences,
  serializeWikiCapabilityPreferences,
  type WikiCapabilityPreferencesPort,
} from "./wiki-capability-preferences";

describe("Wiki capability preferences", () => {
  it("defaults both independent local capabilities on", () => {
    const fixture = port();
    const controller = new WikiCapabilityPreferencesController(fixture.value);

    expect(controller.getSnapshot()).toEqual({
      version: 1,
      automaticCollection: true,
      phoneticFitting: true,
    });
  });

  it("persists strict values and receives cross-tab changes", () => {
    const fixture = port();
    const controller = new WikiCapabilityPreferencesController(fixture.value);
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.setAutomaticCollection(false)).toEqual({ ok: true });
    expect(parseWikiCapabilityPreferences(fixture.serialized())).toEqual({
      version: 1,
      automaticCollection: false,
      phoneticFitting: true,
    });

    fixture.receive(serializeWikiCapabilityPreferences({
      version: 1,
      automaticCollection: false,
      phoneticFitting: false,
    }));
    expect(controller.getSnapshot().phoneticFitting).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    fixture.receive(null);
    expect(controller.getSnapshot()).toEqual(DEFAULT_WIKI_CAPABILITY_PREFERENCES);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("fails closed on writes without publishing an unpersisted state", () => {
    const fixture = port();
    const controller = new WikiCapabilityPreferencesController({
      ...fixture.value,
      write: () => {
        throw new Error("quota");
      },
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.setPhoneticFitting(false)).toEqual({
      ok: false,
      code: "PERSISTENCE_UNAVAILABLE",
    });
    expect(controller.getSnapshot()).toBe(DEFAULT_WIKI_CAPABILITY_PREFERENCES);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects malformed, extra, wrong-version, and oversized storage", () => {
    expect(parseWikiCapabilityPreferences("not-json")).toBeNull();
    expect(parseWikiCapabilityPreferences(JSON.stringify({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      extra: true,
    }))).toBeNull();
    expect(parseWikiCapabilityPreferences(JSON.stringify({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      version: 2,
    }))).toBeNull();
    expect(parseWikiCapabilityPreferences(
      "x".repeat(MAX_WIKI_CAPABILITY_PREFERENCES_STORAGE_LENGTH + 1),
    )).toBeNull();
  });
});

function port(initial: string | null = null): Readonly<{
  value: WikiCapabilityPreferencesPort;
  serialized(): string;
  receive(value: string | null): void;
}> {
  let stored = initial;
  let listener: ((value: string | null) => void) | null = null;
  return Object.freeze({
    value: Object.freeze({
      read: () => stored,
      write: (value: string) => {
        stored = value;
      },
      subscribe: (next: (value: string | null) => void) => {
        listener = next;
        return () => {
          listener = null;
        };
      },
    }),
    serialized: () => stored ?? "",
    receive: (value) => listener?.(value),
  });
}
