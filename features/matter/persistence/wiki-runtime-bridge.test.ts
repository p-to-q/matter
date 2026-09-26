import { afterEach, describe, expect, it, vi } from "vitest";
import { compileWikiBasis } from "../wiki/wiki-basis";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";

const LEGACY_BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v1");
const BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v2");
const bridgeHost = globalThis as unknown as { [key: symbol]: unknown };

afterEach(() => {
  delete bridgeHost[LEGACY_BRIDGE_KEY];
  delete bridgeHost[BRIDGE_KEY];
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
});
