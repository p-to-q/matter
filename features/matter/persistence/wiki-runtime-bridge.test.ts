import { afterEach, describe, expect, it, vi } from "vitest";
import { compileWikiBasis } from "../wiki/wiki-basis";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";
import {
  DEFAULT_WIKI_CAPABILITY_PREFERENCES,
  serializeWikiCapabilityPreferences,
} from "./wiki-capability-preferences";

const LEGACY_BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v3");
const BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v5");
const bridgeHost = globalThis as unknown as { [key: symbol]: unknown };

afterEach(() => {
  delete bridgeHost[LEGACY_BRIDGE_KEY];
  delete bridgeHost[BRIDGE_KEY];
  vi.doUnmock("./wiki-runtime-core");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Wiki runtime bridge", () => {
  it("matches the canonical empty basis without loading durable configuration", async () => {
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();
    const bridge = await import("./wiki-runtime-bridge");
    const compiled = compileWikiBasis(createEmptyWikiState(), 0);
    if (!compiled.ok) throw new Error(compiled.error.message);

    expect(bridge.readMatterWikiBasis()).toEqual(compiled.basis);
  });

  it("does not reuse a legacy Fast Refresh cell after the basis ABI changes", async () => {
    bridgeHost[LEGACY_BRIDGE_KEY] = Object.freeze({
      current: Object.freeze({ stateRevision: 99 }),
    });
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();

    const bridge = await import("./wiki-runtime-bridge");

    expect(bridge.readMatterWikiBasis()).toMatchObject({
      stateRevision: 0,
      confirmedSnapshot: { generation: 0, rules: [] },
    });
    expect(bridgeHost[BRIDGE_KEY]).toBeDefined();
  });

  it("keeps the Store reader on one published basis across module re-evaluation", async () => {
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();
    const first = await import("./wiki-runtime-bridge");
    const created = applyWikiEvent(createEmptyWikiState(), {
      type: "confirm-rule",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "engle bart",
      canonical: "Engelbart",
    });
    if (!created.ok) throw new Error(created.error.message);
    const compiled = compileWikiBasis(created.state, 1);
    if (!compiled.ok) throw new Error(compiled.error.message);

    expect(first.matterWikiBasisPublication.publishCompiled(compiled.basis)).toMatchObject({
      ok: true,
    });
    const captured = first.readMatterWikiBasis();

    vi.resetModules();
    const second = await import("./wiki-runtime-bridge");
    expect(second.readMatterWikiBasis()).toBe(captured);
    expect(second.matterWikiBasisPublication.publishCompiled(compiled.basis)).toMatchObject({
      ok: false,
      error: { code: "STALE_GENERATION" },
    });
  });

  it("does not load the runtime when both permissions are already disabled", async () => {
    const serialized = serializeWikiCapabilityPreferences({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      automaticCollection: false,
      phoneticFitting: false,
    });
    vi.stubGlobal("localStorage", {
      getItem: () => serialized,
    });
    const observe = vi.fn();
    vi.doMock("./wiki-runtime-core", () => ({
      observeMatterWikiCommittedMaterial: observe,
    }));
    const bridge = await import("./wiki-runtime-bridge");

    bridge.observeMatterWikiEvidence(ADMISSION);
    await vi.dynamicImportSettled();

    expect(observe).not.toHaveBeenCalled();
  });

  it("forwards no frozen permission snapshot to the lazy runtime", async () => {
    let serialized = serializeWikiCapabilityPreferences(
      DEFAULT_WIKI_CAPABILITY_PREFERENCES,
    );
    vi.stubGlobal("localStorage", {
      getItem: () => serialized,
    });
    const observe = vi.fn();
    vi.doMock("./wiki-runtime-core", () => ({
      observeMatterWikiCommittedMaterial: observe,
    }));
    const bridge = await import("./wiki-runtime-bridge");

    bridge.observeMatterWikiEvidence(ADMISSION);
    serialized = serializeWikiCapabilityPreferences({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      automaticCollection: false,
    });
    await vi.dynamicImportSettled();

    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(ADMISSION);
  });
});

const ADMISSION_TEXT = Object.freeze({
  locale: "en-US" as const,
  channel: "spoken" as const,
  text: "Englebart spoke",
});
const ADMISSION = Object.freeze({
  observed: ADMISSION_TEXT,
  committed: ADMISSION_TEXT,
});
