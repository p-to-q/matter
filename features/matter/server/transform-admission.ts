export type TransformAdmission =
  | Readonly<{ ok: true; release: () => void }>
  | Readonly<{ ok: false; reason: "ORIGIN" | "RATE" | "BUSY" }>;

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 8;
const MAX_CONCURRENT = 3;
const MAX_IDENTITIES = 2_048;

type WindowEntry = { startedAt: number; requests: number };
const windows = new Map<string, WindowEntry>();
let active = 0;

/** A process-local perimeter; deployment infrastructure owns distributed rate limits. */
export function admitTransformRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now: () => number = Date.now,
): TransformAdmission {
  if (!originAllowed(request, environment)) return Object.freeze({ ok: false, reason: "ORIGIN" });
  const timestamp = now();
  const identity = requestIdentity(request);
  const entry = windows.get(identity);
  const fresh = entry === undefined || timestamp - entry.startedAt >= WINDOW_MS;
  if (!fresh && entry.requests >= REQUESTS_PER_WINDOW) return Object.freeze({ ok: false, reason: "RATE" });
  if (active >= MAX_CONCURRENT) return Object.freeze({ ok: false, reason: "BUSY" });
  if (fresh) {
    if (windows.size >= MAX_IDENTITIES) evictOneIdentity(timestamp);
    windows.set(identity, { startedAt: timestamp, requests: 1 });
  } else {
    entry.requests += 1;
  }
  active += 1;
  let released = false;
  return Object.freeze({ ok: true, release: () => {
    if (released) return;
    released = true;
    active = Math.max(0, active - 1);
  } });
}

export function resetTransformAdmissionForTests(): void {
  windows.clear();
  active = 0;
}

function originAllowed(request: Request, environment: Readonly<Record<string, string | undefined>>): boolean {
  if (environment.NODE_ENV !== "production") return true;
  const origin = parseOrigin(request.headers.get("origin"));
  if (origin === null || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const publicOrigin = parseOrigin(environment.MATTER_PUBLIC_ORIGIN ?? null);
  return origin === publicOrigin || origin === parseOrigin(request.url);
}

function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  return forwarded.split(",", 1)[0]!.trim().slice(0, 96) || "unknown";
}

function evictOneIdentity(nowMs: number): void {
  for (const [identity, entry] of windows) {
    if (nowMs - entry.startedAt >= WINDOW_MS) {
      windows.delete(identity);
      return;
    }
  }
  windows.delete(windows.keys().next().value ?? "");
}

function parseOrigin(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
