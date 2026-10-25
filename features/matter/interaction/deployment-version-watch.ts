import { parseMatterBuildId } from "../config/build-identity";
import { clientMatterBasePath } from "../config/base-path";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline } from "./request-deadline";

export type DeploymentVersion = "unknown" | "same" | "different";
export const DEPLOYMENT_CHECK_INTERVAL_MS = 60_000;

/** Configuration-only health read: it sends no credential, material or model request. */
export async function readDeploymentVersion(
  buildId: string,
  options: Readonly<{ fetch?: typeof fetch; signal?: AbortSignal; deadlineMs?: number }> = {},
): Promise<DeploymentVersion> {
  if (parseMatterBuildId(buildId) === null) return "unknown";
  const deadline = createRequestDeadline(options.signal, options.deadlineMs ?? 3_000, "Build identity read timed out.");
  let accepting = true;
  try {
    const send = options.fetch ?? globalThis.fetch;
    const request = Promise.resolve().then(() => {
      deadline.signal.throwIfAborted();
      return send(`${clientMatterBasePath()}/api/health`, {
        method: "GET", headers: { accept: "application/json" }, cache: "no-store",
        credentials: "omit", redirect: "error", signal: deadline.signal,
      });
    }).then((response) => {
      if (!accepting || deadline.signal.aborted) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error("Build identity read is no longer owned.");
      }
      return response;
    });
    const response = await Promise.race([
      request, deadline.settlement,
    ]);
    if (response.status !== 200 || response.redirected ||
        response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      void response.body?.cancel().catch(() => undefined);
      return "unknown";
    }
    const value = await Promise.race([
      readBoundedJsonResponse(response, 8 * 1_024, deadline.signal), deadline.settlement,
    ]);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return "unknown";
    const health = value as Record<string, unknown>;
    if (health.protocolVersion !== "0.2" || health.status !== "ok" || health.basePath !== clientMatterBasePath()) return "unknown";
    const observed = parseMatterBuildId(health.buildId);
    return observed === null ? "unknown" : observed === buildId ? "same" : "different";
  } catch {
    return "unknown";
  } finally {
    accepting = false;
    deadline.dispose();
  }
}

export type DeploymentVersionHost = Readonly<{
  now: () => number;
  isAvailable: () => boolean;
  subscribe: (demand: () => void, suspend: () => void) => () => void;
}>;

/** One page-lifetime observer; no polling timer or authority to navigate. */
export function createDeploymentVersionWatch(options: Readonly<{
  buildId: string | null;
  host: DeploymentVersionHost;
  read: (buildId: string, signal: AbortSignal) => Promise<DeploymentVersion>;
  publish: (version: DeploymentVersion) => void;
  /** Retained by the hook across effect-owner replacement, never persisted. */
  clock?: { lastAttempt: number };
}>) {
  const buildId = parseMatterBuildId(options.buildId);
  let idle = false;
  let disposed = false;
  let scheduled = false;
  const clock = options.clock ?? { lastAttempt: Number.NEGATIVE_INFINITY };
  let flight: AbortController | null = null;
  let observed: DeploymentVersion = "unknown";
  let presented: DeploymentVersion = "unknown";
  // A new effect owner cannot inherit a disposed owner's displayed answer.
  options.publish("unknown");
  const present = (version: DeploymentVersion) => {
    if (!disposed && presented !== version) { presented = version; options.publish(version); }
  };
  const cancel = () => {
    const previous = flight;
    flight = null;
    previous?.abort();
    present("unknown");
  };
  const attempt = () => {
    scheduled = false;
    if (disposed || !idle || !options.host.isAvailable()) { cancel(); return; }
    present(observed);
    if (flight !== null || options.host.now() - clock.lastAttempt < DEPLOYMENT_CHECK_INTERVAL_MS || buildId === null) return;
    clock.lastAttempt = options.host.now();
    const owner = new AbortController();
    flight = owner;
    const current = () => !disposed && flight === owner && idle && options.host.isAvailable();
    void Promise.resolve().then(() => current()
      ? options.read(buildId, owner.signal)
      : "unknown" as const).catch(() => "unknown" as const).then((version) => {
        if (!current()) { if (flight === owner) flight = null; return; }
        flight = null;
        observed = version;
        present(version);
      });
  };
  const demand = () => {
    if (disposed) return;
    if (!idle || !options.host.isAvailable()) { cancel(); return; }
    if (scheduled) return;
    scheduled = true;
    // Strict Mode's immediate cleanup can revoke the opening before any fetch.
    queueMicrotask(attempt);
  };
  const unsubscribe = buildId === null ? () => undefined : options.host.subscribe(demand, cancel);
  return Object.freeze({
    setIdle(next: boolean) { idle = next; demand(); },
    dispose() { disposed = true; cancel(); unsubscribe(); },
  });
}

export type DeploymentReloadState = Readonly<{
  different: boolean;
  idle: boolean;
  hydrated: boolean;
  unsaved: boolean;
  visible: boolean;
  current: boolean;
}>;

/** Read at the actual click, not at the render that enabled the button. */
export function requestDeploymentReload(read: () => DeploymentReloadState, reload: () => void): boolean {
  const state = read();
  if (!state.different || !state.idle || !state.hydrated || state.unsaved || !state.visible || !state.current) return false;
  reload();
  return true;
}
