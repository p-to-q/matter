import { MODEL_DEADLINES } from "../config/model-deadlines";
import {
  IMAGE_RESPONSE_HEADERS,
  MAX_IMAGE_REQUEST_BYTES,
  parseImageRequestEnvelope,
  type ImageRequestEnvelope,
} from "../protocol/image-contract";
import { sha256Hex } from "../tree/sha256";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";
import {
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type ScenarioAdapter,
  type ScenarioFallback,
  type ScenarioGovernorLimits,
  DEFAULT_GOVERNOR_LIMITS,
} from "./harness";
import { admitImageRequest } from "./image-admission";
import {
  IMAGE_BRIEF_MAX_OUTPUT_TOKENS,
  IMAGE_BRIEF_SCENARIO,
} from "./image-brief-harness";
import { ImageServerError, invalidImageRequest } from "./image-errors";
import { fixtureImageAdapter, fixtureImageBriefAdapter } from "./image-fixtures";
import { IMAGE_SCENARIO } from "./image-harness";
import { imageSurfaceMode } from "./image-surface";
import {
  DEFAULT_POOL_LIMITS,
  IMAGE_POOL_LIMITS,
  createPoolAdapter,
  readImagePool,
  resolvePoolAdapter,
  type PoolLimits,
} from "./model-pool";

export const IMAGE_ROUTE_TIMEOUT_MS = MODEL_DEADLINES.image.routeMs;

// One governor per scenario, so concurrency on the renderer is counted apart
// from concurrency on the text step. Only the concurrency ceiling does anything
// here: a pool adapter owns its own candidate health, and the harness skips the
// surface-wide failure cooldown for such an adapter, so a cooldown configured
// on these governors would be inert for every live request. The pool's
// per-scenario, per-candidate health is what actually cools a failing relay.
const briefGovernor = new ScenarioGovernor();
const imageGovernor = new ScenarioGovernor();
const BRIEF_LIMITS_GOVERNOR: ScenarioGovernorLimits = Object.freeze({
  ...DEFAULT_GOVERNOR_LIMITS,
  maxConcurrentModelCalls: 2,
});
const IMAGE_LIMITS_GOVERNOR: ScenarioGovernorLimits = Object.freeze({
  ...DEFAULT_GOVERNOR_LIMITS,
  maxConcurrentModelCalls: 2,
});

/**
 * Room the route leaves between the end of the renderer and its own deadline,
 * the same margin the deadline lattice already requires between neighbouring
 * owners. Without it the route's timer can fire during the last second of a
 * render the relay will still bill.
 */
const ROUTE_SETTLE_MARGIN_MS = 1_000;
const BRIEF_POOL_LIMITS: PoolLimits = Object.freeze({
  ...DEFAULT_POOL_LIMITS,
  maxResponseBytes: 8 * 1_024,
  maxOutputTokens: IMAGE_BRIEF_MAX_OUTPUT_TOKENS,
});

export type ImageAdapters = Readonly<{
  brief: ScenarioAdapter | null;
  image: ScenarioAdapter | null;
}>;

export type ImageRouteOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
}>;

/**
 * Passage in, the relay's own image bytes out, in two steps that never meet.
 *
 * The brief step is the only one that reads the person's passage. If it does
 * not return an adjudicated brief the request ends there: the renderer is not
 * called, so a hostile passage costs one text call and no generation. The
 * renderer receives the validated brief and nothing the person wrote.
 */
export async function handleImageRequest(
  request: Request,
  adapters?: ImageAdapters,
  options: ImageRouteOptions = {},
): Promise<Response> {
  const environment = options.environment ?? process.env;
  const routeEndsAt = Date.now() + IMAGE_ROUTE_TIMEOUT_MS;
  // A closed surface is a deployment fact, not a request: refuse it before
  // admission accounting so it cannot spend a caller's rate window.
  if (imageSurfaceMode(environment) === "off") {
    cancelBody(request.body);
    throw new ImageServerError("IMAGE_UNAVAILABLE", "Image drawing is not available.", false, 503);
  }
  const admission = admitImageRequest(request, environment);
  if (!admission.ok) throw admissionError(admission.reason);
  try {
    const resolved = adapters ?? resolveAdapters(environment);
    if (resolved === null || resolved.brief === null || resolved.image === null) {
      cancelBody(request.body);
      throw unavailable();
    }
    const { brief, image } = resolved;
    const progress: RequestProgress = { renderStarted: false };
    return await withBoundedJsonRequest(request, requestPolicy(progress), async (payload, signal) => {
      const parsed = parseImageRequestEnvelope(payload);
      if (!parsed.ok) throw invalidImageRequest(parsed.message);
      return await drawImage(parsed.envelope, brief, image, signal, routeEndsAt, progress);
    });
  } catch (error) {
    // withBoundedJsonRequest lets a caller's disconnect propagate bare.
    if (error instanceof DOMException && error.name === "AbortError") throw cancelledError();
    throw error;
  } finally {
    admission.release();
  }
}

async function drawImage(
  envelope: ImageRequestEnvelope,
  briefAdapter: ScenarioAdapter,
  imageAdapter: ScenarioAdapter,
  signal: AbortSignal,
  routeEndsAt: number,
  progress: RequestProgress,
): Promise<Response> {
  const briefed = await withRequestSignal(
    runScenario(IMAGE_BRIEF_SCENARIO, Object.freeze({
      locale: envelope.locale,
      passage: envelope.passage.text,
      direction: envelope.direction?.text ?? "",
    }), briefAdapter, briefGovernor, { limits: BRIEF_LIMITS_GOVERNOR, signal }),
    signal,
  );
  // Central guarantee: no adjudicated brief, no image call.
  if (!briefed.ok) throw outcomeError(briefed.fallback, "brief");

  // The renderer's own deadline is fixed, but the route's is not: a slow body
  // read or a slow brief leaves less than the renderer would take. Starting it
  // anyway would let the route abort mid-render, so the relay bills a picture
  // nobody receives. Refuse before paying instead, and never let the renderer
  // run past the time that is actually left.
  const remainingMs = routeEndsAt - Date.now() - ROUTE_SETTLE_MARGIN_MS;
  if (remainingMs < IMAGE_POOL_LIMITS.minimumAttemptMs) {
    throw new ImageServerError("IMAGE_UNAVAILABLE", "Drawing took too long.", false, 504);
  }
  progress.renderStarted = true;
  const drawn = await withRequestSignal(
    runScenario(IMAGE_SCENARIO, Object.freeze({
      locale: envelope.locale,
      brief: briefed.value,
    }), imageAdapter, imageGovernor, {
      limits: IMAGE_LIMITS_GOVERNOR,
      signal,
      deadlineCeilingMs: remainingMs,
    }),
    signal,
  );
  if (!drawn.ok) throw outcomeError(drawn.fallback, "image");

  // The relay's bytes exactly as inspected: re-encoding would destroy the
  // provider's embedded provenance manifest.
  const { bytes, mediaType, width, height, byteLength } = drawn.value;
  const sha256 = await sha256Hex(bytes);
  // A plain copy only narrows the buffer type for BodyInit; no byte changes.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mediaType,
      "Content-Length": String(byteLength),
      "Cache-Control": "no-store",
      [IMAGE_RESPONSE_HEADERS.width]: String(width),
      [IMAGE_RESPONSE_HEADERS.height]: String(height),
      [IMAGE_RESPONSE_HEADERS.sha256]: sha256,
    },
  });
}

function resolveAdapters(
  environment: Readonly<Record<string, string | undefined>>,
): ImageAdapters | null {
  if (imageSurfaceMode(environment) === "fixture") {
    return Object.freeze({ brief: fixtureImageBriefAdapter, image: fixtureImageAdapter });
  }
  // Live: both steps must be configured. A missing relay is unavailable, never
  // a fixture picture that would look like a working surface.
  const brief = resolvePoolAdapter(environment, BRIEF_POOL_LIMITS);
  const imagePool = readImagePool(environment);
  if (brief === null || imagePool.length === 0) return null;
  return Object.freeze({ brief, image: createPoolAdapter(imagePool, IMAGE_POOL_LIMITS) });
}

export function resetImageGovernors(): void {
  briefGovernor.reset();
  imageGovernor.reset();
}

/**
 * Whether a failure invites another try depends on what it already cost. A
 * brief failure spent a fraction of a cent on a text call, so trying another
 * passage is fair. A renderer failure may have been billed already — a relay can
 * finish, bill, and then return something unusable — so telling a client it is
 * retryable would invite it to pay again for the same picture. Only a shed that
 * never reached a relay is safe to retry.
 */
function outcomeError(reason: ScenarioFallback, step: "brief" | "image"): ImageServerError {
  const retryable = step === "brief";
  switch (reason) {
    case "MODEL_REJECTED":
      return new ImageServerError(
        "IMAGE_REJECTED",
        step === "brief"
          ? "Matter could not draw this passage. Try another passage or direction."
          : "Matter could not finish this drawing.",
        retryable,
        422,
      );
    case "MODEL_TIMEOUT":
      return new ImageServerError("IMAGE_UNAVAILABLE", "Drawing took too long.", retryable, 504);
    case "MODEL_BUSY":
      // Shed before any relay was contacted, so nothing was spent.
      return unavailable(true);
    case "MODEL_UNAVAILABLE":
      return unavailable(retryable);
  }
}

function unavailable(retryable = true): ImageServerError {
  return new ImageServerError("IMAGE_UNAVAILABLE", "Matter could not draw this passage just now.", retryable, 503);
}

function cancelledError(): ImageServerError {
  // The caller left, possibly after a relay had already been paid; there is no
  // one to invite a retry, and a later one must not assume the first was free.
  return new ImageServerError("IMAGE_FAILED", "The image request was cancelled.", false, 499);
}

/** What one request has already spent, which decides whether a timeout invites a retry. */
type RequestProgress = { renderStarted: boolean };

function requestPolicy(progress: RequestProgress): BoundedRequestPolicy {
  return Object.freeze({
    maxBytes: MAX_IMAGE_REQUEST_BYTES,
    timeoutMs: IMAGE_ROUTE_TIMEOUT_MS,
    fail: (reason) => boundaryError(reason, progress),
  });
}

function boundaryError(reason: BoundedRequestFailure, progress: RequestProgress): ImageServerError {
  switch (reason) {
    case "too-large":
      return new ImageServerError("INVALID_REQUEST", "The image request is too large.", false, 413);
    case "unsupported-media-type":
      return new ImageServerError("INVALID_REQUEST", "The image request format is invalid.", false, 415);
    case "invalid-content-length":
      return invalidImageRequest("The image content length is invalid.");
    case "missing-body":
      return invalidImageRequest("The image request has no body.");
    case "not-json":
      return invalidImageRequest("The image request could not be read.");
    case "not-utf8":
      return invalidImageRequest("The image request is not valid UTF-8.");
    case "timed-out":
      // The renderer may already have been paid by the time the timer fired, and
      // a retry would pay for a second picture; only a timeout before it began
      // cost nothing but a text call.
      return new ImageServerError("IMAGE_UNAVAILABLE", "Drawing took too long.", !progress.renderStarted, 504);
    case "cancelled":
      return cancelledError();
  }
}

function admissionError(reason: "ORIGIN" | "RATE" | "BUSY"): ImageServerError {
  if (reason === "ORIGIN") {
    return new ImageServerError("INVALID_REQUEST", "This image origin is not allowed.", false, 403);
  }
  return new ImageServerError(
    "RATE_LIMITED",
    reason === "RATE" ? "Please wait before drawing again." : "Matter is busy. Please try again shortly.",
    true,
    reason === "RATE" ? 429 : 503,
  );
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) return;
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // A locked body is already owned elsewhere; the refusal stays final.
  }
}
