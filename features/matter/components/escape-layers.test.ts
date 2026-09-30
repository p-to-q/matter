import { afterEach, describe, expect, it, vi } from "vitest";
import { IME_PROCESS_KEY_CODE } from "./composition-safe-keys";
import {
  createEscapeStack,
  registerEscapeLayer,
  type EscapeKeydown,
  type EscapeTier,
} from "./escape-layers";

function escape(overrides: Partial<EscapeKeydown> = {}): EscapeKeydown & { prevented: boolean } {
  const event = {
    key: "Escape",
    keyCode: 27,
    isComposing: false,
    repeat: false,
    defaultPrevented: false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
    ...overrides,
  };
  return event;
}

function layer(log: string[], name: string, tier: EscapeTier, handles = true) {
  return {
    tier,
    onEscape: () => {
      log.push(name);
      return handles;
    },
  };
}

describe("escape stack", () => {
  it("closes exactly one layer per keydown, highest tier first", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "lasso", "mode"));
    stack.register(layer(log, "inquiry", "panel"));
    stack.register(layer(log, "drag", "gesture"));
    stack.register(layer(log, "lens", "transient"));

    const event = escape();
    expect(stack.handleKeydown(event)).toBe(true);
    expect(log).toEqual(["drag"]);
    expect(event.prevented).toBe(true);
  });

  it("keeps paper surfaces below everything that covers the paper and above a mode", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    const unregister = new Map<string, () => void>();
    // Registered in the order that recency alone would reverse.
    for (const [name, tier] of [
      ["settings menu", "transient"],
      ["overlay index", "panel"],
      ["Ask Matter", "panel"],
      ["lasso", "mode"],
      ["submitted Elastic degree", "paper"],
      ["Point Talk", "paper"],
      ["Wiki takeover", "paper"],
      ["grip drag", "gesture"],
    ] as const) {
      unregister.set(name, stack.register(layer(log, name, tier)));
    }
    for (let press = 0; press < 8; press += 1) {
      const before = log.length;
      expect(stack.handleKeydown(escape())).toBe(true);
      // Each press closes exactly one layer, which then leaves the stack.
      expect(log.length).toBe(before + 1);
      unregister.get(log[log.length - 1]!)?.();
    }
    expect(stack.size()).toBe(0);
    expect(log).toEqual([
      "grip drag",
      "settings menu",
      "Ask Matter",
      "overlay index",
      "Wiki takeover",
      "Point Talk",
      "submitted Elastic degree",
      "lasso",
    ]);
  });

  it("lets a paper surface opened after a panel still wait below it", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "overlay index", "panel"));
    stack.register(layer(log, "node action lens", "paper"));
    stack.handleKeydown(escape());
    expect(log).toEqual(["overlay index"]);
  });

  it("orders a tier by activation recency", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "older panel", "panel"));
    stack.register(layer(log, "newer panel", "panel"));
    stack.handleKeydown(escape());
    expect(log).toEqual(["newer panel"]);
  });

  it("lets a layer with nothing to cancel pass the key down", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "lasso", "mode"));
    stack.register(layer(log, "settled request", "gesture", false));
    expect(stack.handleKeydown(escape())).toBe(true);
    expect(log).toEqual(["settled request", "lasso"]);
  });

  it("walks the stack one layer per separate press", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    const unregisterPanel = stack.register(layer(log, "panel", "panel"));
    stack.register(layer(log, "mode", "mode"));
    stack.handleKeydown(escape());
    unregisterPanel();
    stack.handleKeydown(escape());
    expect(log).toEqual(["panel", "mode"]);
  });

  it("honours a focused field that already claimed the key", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "inquiry", "panel"));
    expect(stack.handleKeydown(escape({ defaultPrevented: true }))).toBe(false);
    expect(log).toEqual([]);
  });

  it("never lets auto-repeat close a second layer", () => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "panel", "panel"));
    stack.register(layer(log, "lens", "transient"));
    stack.handleKeydown(escape());
    for (let index = 0; index < 5; index += 1) stack.handleKeydown(escape({ repeat: true }));
    expect(log).toEqual(["lens"]);
  });

  it.each([
    ["composing flag", { isComposing: true, keyCode: IME_PROCESS_KEY_CODE }],
    ["229 without the flag", { isComposing: false, keyCode: IME_PROCESS_KEY_CODE }],
    ["another key", { key: "Enter", keyCode: 13 }],
    ["keyup", { type: "keyup" }],
  ])("ignores an Escape the IME owns or a non-Escape key: %s", (_name, overrides) => {
    const stack = createEscapeStack();
    const log: string[] = [];
    stack.register(layer(log, "inquiry", "panel"));
    const event = escape(overrides);
    expect(stack.handleKeydown(event)).toBe(false);
    expect(log).toEqual([]);
    expect(event.prevented).toBe(false);
  });

  it("keeps unregistration idempotent", () => {
    const stack = createEscapeStack();
    const unregister = stack.register(layer([], "a", "mode"));
    unregister();
    unregister();
    expect(stack.size()).toBe(0);
  });
});

describe("document escape binding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns one bubble-phase window listener only while a layer exists", () => {
    const target = new EventTarget();
    const add = vi.spyOn(target, "addEventListener");
    const remove = vi.spyOn(target, "removeEventListener");
    vi.stubGlobal("window", target);
    const log: string[] = [];

    const first = registerEscapeLayer(layer(log, "first", "panel"));
    const second = registerEscapeLayer(layer(log, "second", "transient"));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0]).toBe("keydown");
    // No capture flag: the owner must run after every React handler.
    expect(add.mock.calls[0]?.[2]).toBeUndefined();

    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key: "Escape",
      keyCode: 27,
      isComposing: false,
      repeat: false,
    });
    target.dispatchEvent(event);
    expect(log).toEqual(["second"]);
    expect(event.defaultPrevented).toBe(true);

    second();
    expect(remove).not.toHaveBeenCalled();
    first();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
