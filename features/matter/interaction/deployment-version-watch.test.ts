import { afterEach, describe, expect, it, vi } from "vitest";
import { materialIsIdle, IDLE_PAPER_ACTIVITY } from "../components/material-turn-activity";
import { createDeploymentVersionWatch, DEPLOYMENT_CHECK_INTERVAL_MS, readDeploymentVersion,
  type DeploymentVersion } from "./deployment-version-watch";
import { requestDeploymentReload, type DeploymentReloadState } from "./deployment-reload";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const flush = async () => { for (let count = 0; count < 8; count += 1) await Promise.resolve(); };
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => { resolve = settle; });
  return { promise, resolve };
}
const health = (overrides = {}) => ({ protocolVersion: "0.2", status: "ok", basePath: "/matter", buildId: "server_build", ...overrides });
const response = (value: unknown) => Response.json(value);

describe("bounded deployment identity read", () => {
  it("compares opaque artifact ids rather than package versions and sends no material or credential", async () => {
    const send = vi.fn<typeof fetch>(async () => response(health({ appVersion: "unchanged" })));
    expect(await readDeploymentVersion("client_build", { fetch: send })).toBe("different");
    expect(await readDeploymentVersion("server_build", { fetch: send })).toBe("same");
    expect(send.mock.calls[0]?.[0]).toBe("/matter/api/health");
    expect(send.mock.calls[0]?.[1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error" });
    expect(send.mock.calls[0]?.[1]?.body).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_MATTER_BASE_PATH", "");
    expect(await readDeploymentVersion("client_build", { fetch: async () => response(health({ basePath: "" })) })).toBe("different");
  });

  it("treats invalid or absent identities, protocol drift and failed reads as unknown", async () => {
    const send = vi.fn<typeof fetch>();
    expect(await readDeploymentVersion("", { fetch: send })).toBe("unknown");
    expect(send).not.toHaveBeenCalled();
    for (const value of [null, [], health({ buildId: null }), health({ buildId: "bad id" }),
      health({ protocolVersion: 1 }), health({ status: "failed" }), health({ basePath: "" })]) {
      expect(await readDeploymentVersion("client_build", { fetch: async () => response(value) })).toBe("unknown");
    }
    for (const result of [new Response("no", { status: 503 }), new Response("{}", { headers: { "content-type": "text/html" } }),
      new Response("not JSON", { headers: { "content-type": "application/json" } }),
      new Response("x".repeat(8_193), { headers: { "content-type": "application/json" } })]) {
      expect(await readDeploymentVersion("client_build", { fetch: async () => result })).toBe("unknown");
    }
    const redirected = response(health());
    Object.defineProperty(redirected, "redirected", { value: true });
    expect(await readDeploymentVersion("client_build", { fetch: async () => redirected })).toBe("unknown");
    expect(await readDeploymentVersion("client_build", { fetch: async () => { throw new Error("offline"); } })).toBe("unknown");
  });

  it("releases its deadline even when transport ignores abort, then cancels late bytes", async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const read = readDeploymentVersion("client_build", { fetch: () => pending.promise });
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(read).resolves.toBe("unknown");
    expect(vi.getTimerCount()).toBe(0);
    const cancel = vi.fn();
    pending.resolve(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
    await flush();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not let a non-settling stream or its cancellation retain the deadline or reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined), cancel });
    const read = readDeploymentVersion("client_build", { fetch: async () => new Response(body, { headers: { "content-type": "application/json" } }) });
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(read).resolves.toBe("unknown");
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses a pre-aborted read without sending and closes a post-abort response", async () => {
    const first = new AbortController(); first.abort();
    const send = vi.fn<typeof fetch>();
    expect(await readDeploymentVersion("client_build", { fetch: send, signal: first.signal })).toBe("unknown");
    expect(send).not.toHaveBeenCalled();
    const pending = deferred<Response>();
    const owner = new AbortController();
    const reading = readDeploymentVersion("client_build", { fetch: () => pending.promise, signal: owner.signal });
    await flush(); owner.abort();
    await expect(reading).resolves.toBe("unknown");
    const cancel = vi.fn();
    pending.resolve(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
    await flush(); expect(cancel).toHaveBeenCalledOnce();
  });
});

function watcher() {
  let now = 0; let available = true;
  let demand: () => void = () => undefined; let suspend: () => void = () => undefined;
  const unsubscribe = vi.fn();
  const reads: Array<ReturnType<typeof deferred<DeploymentVersion>> & { signal: AbortSignal }> = [];
  const publish = vi.fn();
  const watch = createDeploymentVersionWatch({ buildId: "client_build", publish,
    host: { now: () => now, isAvailable: () => available,
      subscribe(onDemand, onSuspend) { demand = onDemand; suspend = onSuspend; return unsubscribe; } },
    read: vi.fn((_id, signal) => { const read = { ...deferred<DeploymentVersion>(), signal }; reads.push(read); return read.promise; }),
  });
  publish.mockClear();
  return { watch, publish, reads, unsubscribe, demand: () => demand(), suspend: () => suspend(),
    available: (value: boolean) => { available = value; if (value) demand(); else suspend(); }, advance: () => { now += DEPLOYMENT_CHECK_INTERVAL_MS; } };
}

describe("demand-driven deployment observer", () => {
  it("coalesces demand, observes one flight and a 60-second floor without polling", async () => {
    const state = watcher();
    state.watch.setIdle(true); state.demand(); state.demand(); await flush();
    expect(state.reads).toHaveLength(1);
    state.advance(); state.demand(); await flush(); expect(state.reads).toHaveLength(1);
    state.reads[0]!.resolve("different"); await flush();
    expect(state.publish).toHaveBeenLastCalledWith("different");
    state.demand(); await flush(); expect(state.reads).toHaveLength(2);
    state.reads[1]!.resolve("same"); await flush();
    state.demand(); await flush(); expect(state.reads).toHaveLength(2);
    expect(state.publish).toHaveBeenLastCalledWith("same");
    state.watch.dispose(); expect(state.unsubscribe).toHaveBeenCalledOnce();
  });

  it("invalidates busy/hidden/closed flights and an old answer cannot clear the new one", async () => {
    const state = watcher(); state.watch.setIdle(true); await flush();
    state.watch.setIdle(false); expect(state.reads[0]!.signal.aborted).toBe(true);
    state.advance(); state.watch.setIdle(true); await flush(); expect(state.reads).toHaveLength(2);
    state.reads[0]!.resolve("different"); await flush();
    expect(state.publish).not.toHaveBeenCalled();
    state.demand(); await flush(); expect(state.reads).toHaveLength(2);
    state.available(false); expect(state.reads[1]!.signal.aborted).toBe(true);
    state.reads[1]!.resolve("different"); await flush(); expect(state.publish).not.toHaveBeenCalled();
    state.advance(); state.available(true); await flush(); expect(state.reads).toHaveLength(3);
    state.watch.dispose(); state.reads[2]!.resolve("different"); await flush();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("hides but does not forget a confirmed mismatch when idle/visibility temporarily ends", async () => {
    const state = watcher(); state.watch.setIdle(true); await flush(); state.reads[0]!.resolve("different"); await flush();
    state.watch.setIdle(false); expect(state.publish).toHaveBeenLastCalledWith("unknown");
    state.watch.setIdle(true); await flush(); expect(state.publish).toHaveBeenLastCalledWith("different");
    expect(state.reads).toHaveLength(1);
    state.available(false); expect(state.publish).toHaveBeenLastCalledWith("unknown");
    state.available(true); await flush(); expect(state.publish).toHaveBeenLastCalledWith("different");
    state.watch.dispose();
  });

  it("cleanup wins the initial microtask and missing identity opens no lifecycle", async () => {
    const state = watcher(); state.watch.setIdle(true); state.watch.dispose(); await flush();
    expect(state.reads).toHaveLength(0);
    const subscribe = vi.fn(); const read = vi.fn();
    const unknown = createDeploymentVersionWatch({ buildId: null, host: { now: () => 0, isAvailable: () => true, subscribe }, read, publish: vi.fn() });
    unknown.setIdle(true); await flush(); unknown.dispose();
    expect(subscribe).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
});

describe("manual deployment reload", () => {
  const safe: DeploymentReloadState = { different: true, idle: true, hydrated: true, unsaved: false, visible: true, current: true };
  it("reads every safety fact at the click and never reloads an unsafe basis", () => {
    let live = safe; const reload = vi.fn();
    for (const key of Object.keys(safe) as Array<keyof DeploymentReloadState>) {
      live = { ...safe, [key]: !safe[key] };
      expect(requestDeploymentReload(() => live, reload), key).toBe(false);
    }
    expect(reload).not.toHaveBeenCalled(); live = safe;
    expect(requestDeploymentReload(() => live, reload)).toBe(true); expect(reload).toHaveBeenCalledOnce();
  });

  it("reuses all existing draft, paid-picture, question, name and submitted-turn holds", () => {
    for (const paper of [
      { ...IDLE_PAPER_ACTIVITY, pictureHeld: true }, { ...IDLE_PAPER_ACTIVITY, inquiryHeld: true },
      { ...IDLE_PAPER_ACTIVITY, editingHeld: true }, { ...IDLE_PAPER_ACTIVITY, elastic: "requesting" as const },
      { ...IDLE_PAPER_ACTIVITY, textSwap: "ready" as const },
    ]) {
      const reload = vi.fn();
      expect(requestDeploymentReload(() => ({ ...safe, idle: materialIsIdle({ admission: "idle", paper }) }), reload)).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    }
  });
});
