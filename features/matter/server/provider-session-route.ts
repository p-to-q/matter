import "server-only";

import { randomBytes } from "node:crypto";

import {
  MAX_PROVIDER_SESSION_REQUEST_BYTES,
  PROVIDER_SESSION_PROTOCOL_VERSION,
  parseProviderSessionRequest,
  type ProviderSessionErrorCode,
  type ProviderSessionStatus,
} from "../protocol/provider-session-contract";
import {
  PROVIDER_SESSION_GENERATION_TTL_MS,
  createProviderSessionGeneration,
  expiredProviderSessionCookie,
  providerSessionAvailable,
  providerSessionCookie,
  providerSessionGenerationCookie,
  readProviderCredential,
  readProviderSessionGeneration,
  sealProviderCredential,
  type UserProviderCredential,
} from "./provider-session-crypto";
import {
  createUserProbeCandidate,
  resolveUserProviderSelections,
  type UserProviderSelection,
} from "./user-provider-registry";
import {
  probePoolCandidate,
} from "./model-pool";
import {
  CandidateAttemptTimeoutError,
  PoolDrainingError,
} from "./completion-outcome";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";
import {
  admitPublicMutationOrigin,
  createPublicRequestAdmission,
} from "./public-request-admission";

const ROUTE_TIMEOUT_MS = 8_000;
const SENTINEL_ATTEMPT_TIMEOUT_MS = 2_500;
const admission = createPublicRequestAdmission({
  requestsPerWindow: 8,
  maxConcurrent: 3,
  maxIdentities: 1_024,
});

export async function getProviderSessionStatus(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
): Promise<Response> {
  const available = providerSessionAvailable(environment);
  const headers = responseHeaders();
  const generation = available ? readProviderSessionGeneration(request) : null;
  const credential = available && generation?.kind !== "invalid"
    ? readProviderCredential(request, environment, nowMs)
    : null;
  // GET is deliberately write-free. A stale status response must never expire
  // a credential saved after that read began; the next explicit save or remove
  // replaces any malformed, expired, or generation-mismatched bearer.
  return Response.json(status(available, credential, generation?.kind === "invalid"), { headers });
}

export async function connectProviderSession(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const admitted = admission.admit(request, environment);
  if (!admitted.ok) return admissionFailure(admitted.reason);
  try {
    if (!providerSessionAvailable(environment)) {
      cancelRequestBody(request);
      return failure("FEATURE_UNAVAILABLE", "Custom API access is unavailable in this deployment.", false, 503);
    }
    const generation = readProviderSessionGeneration(request);
    if (generation.kind === "invalid") {
      cancelRequestBody(request);
      return failure(
        "INVALID_REQUEST",
        "Refresh the saved Model API status before testing or saving.",
        true,
        409,
      );
    }
    const generationId = generation.generationId;
    return await withBoundedJsonRequest(request, REQUEST_POLICY, async (payload, signal) => {
      const parsed = parseProviderSessionRequest(payload);
      if (!parsed.ok) return failure("INVALID_REQUEST", parsed.message, false, 400);

      const saved = parsed.request.apiKey === undefined
        ? readProviderCredential(request, environment, nowMs)
        : null;
      if (parsed.request.apiKey === undefined && (
        saved === null || saved.baseUrl !== parsed.request.endpoint
      )) {
        return failure(
          "INVALID_REQUEST",
          saved === null
            ? "Enter an API key before testing or saving this endpoint."
            : "Enter the API key again after changing the endpoint.",
          false,
          400,
        );
      }
      const apiKey = parsed.request.apiKey ?? saved!.apiKey;

      // Negotiation is deliberately connection-only: at most two bounded model
      // catalog reads select one reviewed profile, and exactly one sentinel
      // proves it. The resulting profile is sealed so runtime calls never
      // discover, guess, or renegotiate under user material.
      const selections: readonly UserProviderSelection[] = saved === null
        ? await resolveUserProviderSelections(
          parsed.request.endpoint,
          apiKey,
          signal,
          fetchImpl,
        )
        : Object.freeze([Object.freeze({
          profileId: saved.profileId,
          model: saved.model,
          baseUrl: saved.baseUrl,
        })]);
      if (selections.length === 0) {
        return failure(
          "CONNECTION_FAILED",
          "Matter could not find a text model at this endpoint.",
          true,
          502,
        );
      }
      let selection: UserProviderSelection | null = null;
      let onlyTimeouts = true;
      for (const proposed of selections) {
        const candidate = createUserProbeCandidate(
          proposed,
          apiKey,
          randomBytes(16).toString("base64url"),
        );
        if (candidate === null) continue;
        try {
          await probePoolCandidate(candidate, signal, fetchImpl, SENTINEL_ATTEMPT_TIMEOUT_MS);
          selection = proposed;
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          if (error instanceof PoolDrainingError) {
            return failure("RATE_LIMITED", "Matter is busy. Try again shortly.", true, 503);
          }
          if (!(error instanceof CandidateAttemptTimeoutError)) onlyTimeouts = false;
        }
      }
      if (selection === null) {
        return failure(
          "CONNECTION_FAILED",
          "Matter could not verify this endpoint and key.",
          true,
          onlyTimeouts ? 504 : 502,
        );
      }
      if (parsed.request.action === "test") {
        return Response.json(Object.freeze({
          protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
          verified: true,
          endpoint: selection.baseUrl,
        }), { headers: responseHeaders() });
      }
      const sealed = sealProviderCredential(
        selection,
        apiKey,
        generationId,
        environment,
        nowMs,
        randomBytes,
      );
      if (sealed === null) {
        return failure("FEATURE_UNAVAILABLE", "Custom API access is unavailable in this deployment.", false, 503);
      }
      const headers = responseHeaders();
      headers.set("Set-Cookie", providerSessionCookie(sealed.token, sealed.credential.expiresAtMs, environment));
      return Response.json(status(true, sealed.credential, false), { headers });
    });
  } catch (error) {
    if (error instanceof ProviderSessionBoundaryError) return error.response;
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return failure("CONNECTION_FAILED", "The provider check timed out.", true, 504);
    }
    return failure("CONNECTION_FAILED", "Matter could not verify this endpoint and key.", true, 500);
  } finally {
    admitted.release();
  }
}

export function removeProviderSession(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
): Response {
  const admitted = admitPublicMutationOrigin(request, environment);
  if (!admitted.ok) return admissionFailure(admitted.reason);
  try {
    cancelRequestBody(request);
    const headers = responseHeaders();
    headers.append("Set-Cookie", expiredProviderSessionCookie(environment));
    const generation = createProviderSessionGeneration(randomBytes);
    if (generation !== null) {
      headers.append("Set-Cookie", providerSessionGenerationCookie(
        generation,
        nowMs + PROVIDER_SESSION_GENERATION_TTL_MS,
        environment,
      ));
    }
    return Response.json(status(providerSessionAvailable(environment), null, false), { headers });
  } finally {
    admitted.release();
  }
}

export function resetProviderSessionAdmissionForTests(): void {
  admission.resetForTests();
}

const REQUEST_POLICY: BoundedRequestPolicy = Object.freeze({
  maxBytes: MAX_PROVIDER_SESSION_REQUEST_BYTES,
  timeoutMs: ROUTE_TIMEOUT_MS,
  fail: (reason) => new ProviderSessionBoundaryError(boundaryFailure(reason)),
});

class ProviderSessionBoundaryError extends Error {
  constructor(readonly response: Response) {
    super("The provider-session request boundary refused the request.");
    this.name = "ProviderSessionBoundaryError";
  }
}

function status(
  available: boolean,
  credential: Pick<UserProviderCredential, "baseUrl" | "expiresAtMs" | "scopeId"> | null,
  resetRequired: boolean,
): ProviderSessionStatus {
  return Object.freeze({
    protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
    available,
    credentialPresent: credential !== null,
    resetRequired: available && resetRequired,
    credentialId: credential?.scopeId ?? null,
    endpoint: credential?.baseUrl ?? null,
    expiresAt: credential === null ? null : new Date(credential.expiresAtMs).toISOString(),
  });
}

function boundaryFailure(reason: BoundedRequestFailure): Response {
  if (reason === "too-large") return failure("INVALID_REQUEST", "The provider request is too large.", false, 413);
  if (reason === "unsupported-media-type") return failure("INVALID_REQUEST", "The provider request format is invalid.", false, 415);
  if (reason === "timed-out") return failure("CONNECTION_FAILED", "The provider check timed out.", true, 504);
  if (reason === "cancelled") return failure("CONNECTION_FAILED", "The provider check was cancelled.", true, 499);
  return failure("INVALID_REQUEST", "The provider request could not be read.", false, 400);
}

function admissionFailure(reason: "ORIGIN" | "RATE" | "BUSY"): Response {
  if (reason === "ORIGIN") return failure("INVALID_REQUEST", "This request origin is not allowed.", false, 403);
  return failure(
    "RATE_LIMITED",
    reason === "RATE" ? "Please wait before checking another key." : "Matter is busy. Please try again shortly.",
    true,
    reason === "RATE" ? 429 : 503,
  );
}

function failure(
  code: ProviderSessionErrorCode,
  message: string,
  retryable: boolean,
  httpStatus: number,
): Response {
  return Response.json(Object.freeze({ error: Object.freeze({ code, message, retryable }) }), {
    status: httpStatus,
    headers: responseHeaders(),
  });
}

function responseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Cookie",
  });
}

function cancelRequestBody(request: Request): void {
  try {
    void request.body?.cancel().catch(() => undefined);
  } catch {
    // A pre-locked stream already has an owner; the route still refuses to
    // parse or retain it.
  }
}
