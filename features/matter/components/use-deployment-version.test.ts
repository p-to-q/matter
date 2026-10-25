import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeploymentVersion } from "../interaction/deployment-version-watch";

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, setVersion: vi.fn(), read: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (value: DeploymentVersion) => [value, hooks.setVersion],
  useRef: <Value,>(value: Value) => ({ current: value }),
  useLayoutEffect: (effect: () => void) => effect(),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock("../config/build-identity", async (original) => ({ ...await original<typeof import("../config/build-identity")>(), MATTER_BUILD_ID: "hook_build" }));
vi.mock("../interaction/deployment-version-watch", async (original) => ({
  ...await original<typeof import("../interaction/deployment-version-watch")>(), readDeploymentVersion: hooks.read,
}));
import { useDeploymentVersion } from "./use-deployment-version";

const flush = async () => { for (let count = 0; count < 10; count += 1) await Promise.resolve(); };
let pageWindow: EventTarget;
let pageDocument: EventTarget & { visibilityState: DocumentVisibilityState; hasFocus: () => boolean };
let online: boolean;
let focused: boolean;
let now: number;
let cleanup: (() => void) | void;

beforeEach(() => {
  cleanup = undefined; hooks.effects.length = 0; hooks.setVersion.mockClear(); hooks.read.mockReset().mockResolvedValue("different");
  online = true; focused = true; now = 0;
  pageWindow = new EventTarget();
  pageDocument = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState, hasFocus: () => focused });
  vi.stubGlobal("window", pageWindow); vi.stubGlobal("document", pageDocument);
  vi.stubGlobal("navigator", { get onLine() { return online; } });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("deployment-version browser binding", () => {
  it("survives Strict Mode setup/cleanup without duplicate initial requests", async () => {
    useDeploymentVersion(true);
    const effect = hooks.effects[0]!;
    const rehearsal = effect(); rehearsal?.(); cleanup = effect();
    await flush();
    expect(hooks.read).toHaveBeenCalledOnce();
    expect(hooks.read).toHaveBeenCalledWith("hook_build", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(hooks.setVersion).toHaveBeenLastCalledWith("different");
  });

  it("checks focus/online/visibility/page lifetime and removes every listener", async () => {
    useDeploymentVersion(true); cleanup = hooks.effects[0]!(); await flush();
    focused = false; pageWindow.dispatchEvent(new Event("blur"));
    expect(hooks.setVersion).toHaveBeenLastCalledWith("unknown");
    now += 60_000; pageWindow.dispatchEvent(new Event("online")); await flush(); expect(hooks.read).toHaveBeenCalledOnce();
    focused = true; pageWindow.dispatchEvent(new Event("focus")); await flush(); expect(hooks.read).toHaveBeenCalledTimes(2);
    pageDocument.visibilityState = "hidden"; pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(hooks.setVersion).toHaveBeenLastCalledWith("unknown");
    now += 60_000; pageWindow.dispatchEvent(new Event("pagehide"));
    pageDocument.visibilityState = "visible"; pageWindow.dispatchEvent(new Event("focus")); await flush();
    expect(hooks.read).toHaveBeenCalledTimes(2);
    pageWindow.dispatchEvent(new Event("pageshow")); await flush(); expect(hooks.read).toHaveBeenCalledTimes(3);
    online = false; pageWindow.dispatchEvent(new Event("offline"));
    expect(hooks.setVersion).toHaveBeenLastCalledWith("unknown");
    cleanup?.(); cleanup = undefined;
    online = true; now += 60_000; pageWindow.dispatchEvent(new Event("online")); await flush();
    expect(hooks.read).toHaveBeenCalledTimes(3);
  });

  it("does not request while the root is busy", async () => {
    useDeploymentVersion(false); cleanup = hooks.effects[0]!();
    pageWindow.dispatchEvent(new Event("focus")); await flush();
    expect(hooks.read).not.toHaveBeenCalled();
  });

  it("a new effect owner clears a retained answer before its new read settles", async () => {
    useDeploymentVersion(true);
    const effect = hooks.effects[0]!;
    const first = effect(); await flush(); expect(hooks.setVersion).toHaveBeenLastCalledWith("different");
    const publications = hooks.setVersion.mock.calls.length;
    first?.();
    expect(hooks.setVersion).toHaveBeenCalledTimes(publications);
    hooks.read.mockImplementation(() => new Promise(() => undefined));
    cleanup = effect();
    expect(hooks.setVersion).toHaveBeenLastCalledWith("unknown");
    await flush(); expect(hooks.setVersion).toHaveBeenLastCalledWith("unknown");
    expect(hooks.read).toHaveBeenCalledOnce();
    now += 60_000; pageWindow.dispatchEvent(new Event("focus")); await flush();
    expect(hooks.read).toHaveBeenCalledTimes(2);
    expect(hooks.setVersion).toHaveBeenLastCalledWith("unknown");
  });
});
