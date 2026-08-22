export type PublicRequestAdmission =
  | Readonly<{ ok: true; release: () => void }>
  | Readonly<{ ok: false; reason: "ORIGIN" | "RATE" | "BUSY" }>;

export type PublicRequestAdmissionPolicy = Readonly<{
  requestsPerWindow: number;
  maxConcurrent: number;
  maxIdentities?: number;
  windowMs?: number;
}>;

type WindowEntry = { startedAt: number; requests: number };
const DEVELOPMENT_ADMISSION = Object.freeze({
  ok: true as const,
  release: () => undefined,
});

/**
 * A process-local public-route perimeter. Deployment infrastructure remains
 * responsible for distributed limits because serverless instances share no RAM.
 */
export function createPublicRequestAdmission(policy: PublicRequestAdmissionPolicy): {
  admit: (
    request: Request,
    environment?: Readonly<Record<string, string | undefined>>,
    now?: () => number,
  ) => PublicRequestAdmission;
  resetForTests: () => void;
} {
  const windowMs = policy.windowMs ?? 60_000;
  const maxIdentities = policy.maxIdentities ?? 2_048;
  const windows = new Map<string, WindowEntry>();
  let active = 0;

  return Object.freeze({
    admit: (
      request,
      environment = process.env,
      now = Date.now,
    ): PublicRequestAdmission => {
      // Fixture, unit, and development traffic share one process and often no
      // forwarded identity. Production is the only environment where this
      // perimeter represents a meaningful instance-local admission signal.
      if (environment.NODE_ENV !== "production") return DEVELOPMENT_ADMISSION;
      if (!originAllowed(request, environment)) return refuse(request, "ORIGIN");

      const timestamp = now();
      const identity = requestIdentity(request);
      const entry = windows.get(identity);
      const fresh = entry === undefined || timestamp - entry.startedAt >= windowMs;
      if (!fresh && entry.requests >= policy.requestsPerWindow) {
        return refuse(request, "RATE");
      }
      // A request this instance refuses to serve has not consumed work. Do not
      // charge its source's window: otherwise a transient busy response makes
      // the next usable retry fail too.
      if (active >= policy.maxConcurrent) return refuse(request, "BUSY");

      if (fresh) {
        if (windows.size >= maxIdentities) evictOneIdentity(windows, timestamp, windowMs);
        windows.set(identity, { startedAt: timestamp, requests: 1 });
      } else {
        entry.requests += 1;
      }
      active += 1;
      let released = false;
      return Object.freeze({
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          active = Math.max(0, active - 1);
        },
      });
    },
    resetForTests: () => {
      windows.clear();
      active = 0;
    },
  });
}

function refuse(
  request: Request,
  reason: Extract<PublicRequestAdmission, { ok: false }>["reason"],
): PublicRequestAdmission {
  // Admission happens before parsing. Once refused, no later owner will read
  // this stream, so release its connection-side resources without waiting for
  // a hostile or already-broken source to acknowledge cancellation.
  try {
    void request.body?.cancel().catch(() => undefined);
  } catch {
    // A locked body is already owned elsewhere; refusal still remains final.
  }
  return Object.freeze({ ok: false, reason });
}

function originAllowed(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const origin = parseOrigin(request.headers.get("origin"));
  if (origin === null) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  return origin === parseOrigin(environment.MATTER_PUBLIC_ORIGIN ?? null) ||
    origin === parseOrigin(request.url);
}

function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? "unknown";
  return forwarded.split(",", 1)[0]!.trim().slice(0, 96) || "unknown";
}

function evictOneIdentity(
  windows: Map<string, WindowEntry>,
  nowMs: number,
  windowMs: number,
): void {
  for (const [identity, entry] of windows) {
    if (nowMs - entry.startedAt >= windowMs) {
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
