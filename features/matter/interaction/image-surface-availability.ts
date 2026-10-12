import { clientMatterBasePath } from "../config/base-path";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline, type RequestDeadline } from "./request-deadline";

/**
 * The picture control renders only on `available`. Everything else, and the
 * time before any answer, is `unavailable`: the server's `fixture` and
 * `user-configurable` states are deliberately not a reason to offer a paid
 * control. This is the server surface's word; the bytes behind a pointer have
 * their own, `ImageAvailability` in `persistence/image-availability.ts`.
 */
export type ImageSurfaceAvailability = "available" | "unavailable";

export type ImageSurfaceAvailabilityReadOptions = Readonly<{
  fetch?: typeof fetch;
  signal?: AbortSignal;
  deadlineMs?: number;
}>;

// The health document is a few hundred bytes of JSON.
const MAX_HEALTH_RESPONSE_BYTES = 8 * 1024;
const DEFAULT_DEADLINE_MS = 3_000;
const DEFAULT_TTL_MS = 60_000;
const AVAILABLE = "available";

/**
 * One health read for one question. It never throws, never retries, and
 * reads nothing but `surfaces.imageGeneration`: any failure to learn that the
 * surface is `available` is the answer `unavailable`.
 */
export async function readImageSurfaceAvailability(
  options: ImageSurfaceAvailabilityReadOptions = {},
): Promise<ImageSurfaceAvailability> {
  let deadline: RequestDeadline | undefined;
  try {
    deadline = createRequestDeadline(
      options.signal,
      options.deadlineMs ?? DEFAULT_DEADLINE_MS,
      "The availability read timed out.",
    );
    const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const response = await Promise.race([
      send(`${clientMatterBasePath()}/api/health`, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined);
      return "unavailable";
    }
    const payload = await Promise.race([
      readBoundedJsonResponse(response, MAX_HEALTH_RESPONSE_BYTES, deadline.signal),
      deadline.settlement,
    ]);
    return imageGenerationOf(payload) === AVAILABLE ? "available" : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    deadline?.dispose();
  }
}

function imageGenerationOf(payload: unknown): unknown {
  if (!isRecord(payload) || !isRecord(payload.surfaces)) return undefined;
  return payload.surfaces.imageGeneration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ImageSurfaceAvailabilityCacheOptions = Readonly<{
  read: () => Promise<ImageSurfaceAvailability>;
  ttlMs?: number;
  now?: () => number;
}>;

export type ImageSurfaceAvailabilityCache = Readonly<{
  /** The shared answer: a fresh one, the read already in flight, or one new read. */
  get(): Promise<ImageSurfaceAvailability>;
  /** What a render may use now: a fresh answer, else `unavailable`. */
  peek(): ImageSurfaceAvailability;
  /**
   * The newest answer this page has had, however old, else `unavailable`. A
   * field that opens decides its row from this, so an answer that lapsed a
   * moment ago never makes the control come and go; the read that renews it
   * runs beside the opening and is heard by the next one.
   */
  lastKnown(): ImageSurfaceAvailability;
  /** Forgets the answer and the read in flight; the next `get` reads again. */
  invalidate(): void;
}>;

/**
 * Many passages ask the same question; the server is asked once per window.
 * A failed read is an answer too, so a broken health route is not hammered.
 */
export function createImageSurfaceAvailabilityCache(
  options: ImageSurfaceAvailabilityCacheOptions,
): ImageSurfaceAvailabilityCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("The availability TTL must be positive and finite.");
  }
  const now = options.now ?? Date.now;
  let answer: Readonly<{ value: ImageSurfaceAvailability; expiresAt: number }> | null = null;
  let newest: ImageSurfaceAvailability = "unavailable";
  let inFlight: Promise<ImageSurfaceAvailability> | null = null;

  const fresh = () => (answer !== null && now() < answer.expiresAt ? answer.value : null);

  return Object.freeze({
    get() {
      const held = fresh();
      if (held !== null) return Promise.resolve(held);
      if (inFlight !== null) return inFlight;
      const flight: Promise<ImageSurfaceAvailability> = (async () => {
        try {
          return (await options.read()) === AVAILABLE ? AVAILABLE : "unavailable";
        } catch {
          return "unavailable";
        }
      })().then((value) => {
        // An invalidated read still answers its callers but is never remembered.
        if (inFlight === flight) {
          inFlight = null;
          answer = Object.freeze({ value, expiresAt: now() + ttlMs });
          newest = value;
        }
        return value;
      });
      inFlight = flight;
      return flight;
    },
    peek: () => fresh() ?? "unavailable",
    lastKnown: () => newest,
    invalidate() {
      answer = null;
      newest = "unavailable";
      inFlight = null;
    },
  });
}
