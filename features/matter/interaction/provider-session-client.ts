import { clientMatterBasePath } from "../config/base-path";
import {
  MAX_PROVIDER_SESSION_RESPONSE_BYTES,
  PROVIDER_SESSION_CLIENT_TIMEOUT_MS,
  PROVIDER_SESSION_PROTOCOL_VERSION,
  isProviderSessionErrorEnvelope,
  isProviderSessionStatus,
  isProviderSessionTestResult,
  type ProviderSessionErrorCode,
  type ProviderSessionStatus,
  type ProviderSessionTestResult,
} from "../protocol/provider-session-contract";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline, type RequestDeadline } from "./request-deadline";

export type ProviderSessionClientErrorCode = ProviderSessionErrorCode |
  "SAVE_SUPERSEDED" |
  "SAVE_UNCONFIRMED" |
  "REMOVE_UNCONFIRMED";

// This name follows the stable cookie resource, not the wire version. Tabs
// from adjacent rolling deployments must still serialize writes to the same
// browser jar.
const PROVIDER_SESSION_MUTATION_LOCK = "matter-provider-session:mutation";

export class ProviderSessionClientError extends Error {
  constructor(
    readonly code: ProviderSessionClientErrorCode,
    message: string,
    readonly retryable: boolean,
    /** Authoritative browser status read after a mutation race or boundary repair. */
    readonly currentStatus?: ProviderSessionStatus,
  ) {
    super(message);
    this.name = "ProviderSessionClientError";
  }
}

export function readProviderSession(signal: AbortSignal): Promise<ProviderSessionStatus> {
  return withProviderSessionDeadline(signal, (deadline) => (
    requestProviderSession("GET", undefined, signal, deadline, isProviderSessionStatus)
  ));
}

type UserProviderMutationInput = Readonly<{
  endpoint: string;
  apiKey?: string;
  signal: AbortSignal;
}>;

export function testUserProvider(input: UserProviderMutationInput): Promise<ProviderSessionTestResult> {
  return withProviderSessionDeadline(input.signal, (deadline) => requestProviderSession(
    "POST",
    mutationBody("test", input),
    input.signal,
    deadline,
    isProviderSessionTestResult,
  ));
}

export function saveUserProvider(input: UserProviderMutationInput): Promise<ProviderSessionStatus> {
  // The server intentionally keeps the credential stateless. Hold one
  // same-origin browser lock through POST and its confirming GET so an older
  // tab response cannot overwrite a newer confirmed Save or Remove cookie.
  return withProviderSessionMutationLock(input.signal, () => withProviderSessionDeadline(input.signal, async (deadline) => {
    const saved = await requestProviderSession(
      "POST",
      mutationBody("save", input),
      input.signal,
      deadline,
      isProviderSessionStatus,
    );
    let confirmed: ProviderSessionStatus;
    try {
      confirmed = await requestProviderSession(
        "GET",
        undefined,
        input.signal,
        deadline,
        isProviderSessionStatus,
      );
    } catch (error) {
      if (input.signal.aborted) throw input.signal.reason ?? error;
      throw new ProviderSessionClientError(
        "SAVE_UNCONFIRMED",
        "The provider was verified, but the saved state could not be confirmed.",
        false,
      );
    }
    if (
      !confirmed.credentialPresent ||
      confirmed.credentialId !== saved.credentialId ||
      confirmed.endpoint !== saved.endpoint
    ) {
      throw new ProviderSessionClientError(
        "SAVE_SUPERSEDED",
        "Another Model API action changed the saved access before confirmation.",
        false,
        confirmed,
      );
    }
    return confirmed;
  }));
}

function mutationBody(
  action: "test" | "save",
  input: UserProviderMutationInput,
): string {
  const apiKey = input.apiKey === undefined || input.apiKey.length === 0
    ? undefined
    : input.apiKey;
  return JSON.stringify({
    protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
    action,
    endpoint: input.endpoint,
    ...(apiKey === undefined ? {} : { apiKey }),
  });
}

export function removeUserProvider(signal: AbortSignal): Promise<ProviderSessionStatus> {
  return withProviderSessionMutationLock(signal, () => withProviderSessionDeadline(signal, async (deadline) => {
    await requestProviderSession("DELETE", undefined, signal, deadline, isProviderSessionStatus);
    let confirmed: ProviderSessionStatus;
    try {
      confirmed = await requestProviderSession(
        "GET",
        undefined,
        signal,
        deadline,
        isProviderSessionStatus,
      );
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      throw new ProviderSessionClientError(
        "REMOVE_UNCONFIRMED",
        "The saved access was removed, but the browser state could not be confirmed.",
        false,
      );
    }
    if (confirmed.credentialPresent || confirmed.resetRequired) {
      throw new ProviderSessionClientError(
        "REMOVE_UNCONFIRMED",
        "The browser still reports saved or damaged Model API access.",
        false,
        confirmed,
      );
    }
    return confirmed;
  }));
}

async function withProviderSessionMutationLock<T>(
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks === undefined) {
    throw new ProviderSessionClientError(
      "FEATURE_UNAVAILABLE",
      "This browser cannot safely coordinate saved Model API changes.",
      false,
    );
  }
  let acquired = false;
  try {
    return await locks.request(
      PROVIDER_SESSION_MUTATION_LOCK,
      { mode: "exclusive", signal },
      async () => {
        acquired = true;
        signal.throwIfAborted();
        return run();
      },
    );
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? error;
    if (acquired) throw error;
    throw new ProviderSessionClientError(
      "FEATURE_UNAVAILABLE",
      "This browser cannot safely coordinate saved Model API changes.",
      false,
    );
  }
}

async function requestProviderSession<T>(
  method: "GET" | "POST" | "DELETE",
  body: string | undefined,
  signal: AbortSignal,
  deadline: RequestDeadline,
  accepts: (value: unknown) => value is T,
): Promise<T> {
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await Promise.race([
      fetch(`${clientMatterBasePath()}/api/provider-session`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? error;
    if (deadline.didTimeout()) throw timedOut();
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ProviderSessionClientError("CONNECTION_FAILED", "Custom API access is unreachable.", true);
  }
  let payload: unknown;
  try {
    payload = await Promise.race([
      readBoundedJsonResponse(response, MAX_PROVIDER_SESSION_RESPONSE_BYTES, deadline.signal),
      deadline.settlement,
    ]);
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? error;
    if (deadline.didTimeout()) throw timedOut();
    if (error instanceof ProviderSessionClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ProviderSessionClientError("CONNECTION_FAILED", "The provider response could not be read.", false);
  }
  if (!response.ok) {
    if (isProviderSessionErrorEnvelope(payload)) {
      throw new ProviderSessionClientError(payload.error.code, payload.error.message, payload.error.retryable);
    }
    throw new ProviderSessionClientError("CONNECTION_FAILED", "The provider response was invalid.", true);
  }
  if (!accepts(payload)) {
    throw new ProviderSessionClientError("CONNECTION_FAILED", "The provider response was invalid.", false);
  }
  return payload;
}

async function withProviderSessionDeadline<T>(
  signal: AbortSignal,
  run: (deadline: RequestDeadline) => Promise<T>,
): Promise<T> {
  const deadline = createRequestDeadline(
    signal,
    PROVIDER_SESSION_CLIENT_TIMEOUT_MS,
    "The custom API request timed out.",
  );
  try {
    return await run(deadline);
  } finally {
    deadline.dispose();
  }
}

function timedOut(): ProviderSessionClientError {
  return new ProviderSessionClientError(
    "CONNECTION_FAILED",
    "The custom API request timed out.",
    true,
  );
}
