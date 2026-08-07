export type InquiryAdmission =
  | Readonly<{ ok: true; release: () => void }>
  | Readonly<{ ok: false; reason: "ORIGIN" | "RATE" | "BUSY" }>;

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 12;
const MAX_CONCURRENT = 4;
const MAX_IDENTITIES = 2_048;

type WindowEntry = { startedAt: number; requests: number };
const windows = new Map<string, WindowEntry>();
let active = 0;

/**
 * A process-local first line of defence. The deployment firewall remains the
 * owner of distributed limits because serverless instances do not share RAM.
 */
export function admitInquiryRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now: () => number = Date.now,
): InquiryAdmission {
  if (!originAllowed(request, environment)) {
    return Object.freeze({ ok: false, reason: "ORIGIN" });
  }
  const timestamp = now();
  const identity = requestIdentity(request);
  const entry = windows.get(identity);
  if (entry === undefined || timestamp - entry.startedAt >= WINDOW_MS) {
    if (windows.size >= MAX_IDENTITIES) windows.delete(windows.keys().next().value ?? "");
    windows.set(identity, { startedAt: timestamp, requests: 1 });
  } else {
    if (entry.requests >= REQUESTS_PER_WINDOW) {
      return Object.freeze({ ok: false, reason: "RATE" });
    }
    entry.requests += 1;
  }
  if (active >= MAX_CONCURRENT) {
    return Object.freeze({ ok: false, reason: "BUSY" });
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
}

export function resetInquiryAdmissionForTests(): void {
  windows.clear();
  active = 0;
}

function originAllowed(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (environment.NODE_ENV !== "production") return true;
  const origin = parseOrigin(request.headers.get("origin"));
  if (origin === null) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  const publicOrigin = parseOrigin(environment.MATTER_PUBLIC_ORIGIN ?? null);
  const requestOrigin = parseOrigin(request.url);
  return origin === publicOrigin || origin === requestOrigin;
}

function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? "unknown";
  return forwarded.split(",", 1)[0]!.trim().slice(0, 96) || "unknown";
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
