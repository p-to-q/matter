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
import { createRequestDeadline } from "./request-deadline";

export class ProviderSessionClientError extends Error {
  constructor(
    readonly code: ProviderSessionErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderSessionClientError";
  }
}

export function readProviderSession(signal: AbortSignal): Promise<ProviderSessionStatus> {
  return requestProviderSession("GET", undefined, signal, isProviderSessionStatus);
}

type UserProviderMutationInput = Readonly<{
  endpoint: string;
  apiKey?: string;
  signal: AbortSignal;
}>;

export function testUserProvider(input: UserProviderMutationInput): Promise<ProviderSessionTestResult> {
  return mutateUserProvider("test", input, isProviderSessionTestResult);
}

export function saveUserProvider(input: UserProviderMutationInput): Promise<ProviderSessionStatus> {
  return mutateUserProvider("save", input, isProviderSessionStatus);
}

function mutateUserProvider<T>(
  action: "test" | "save",
  input: UserProviderMutationInput,
  accepts: (value: unknown) => value is T,
): Promise<T> {
  const apiKey = input.apiKey === undefined || input.apiKey.length === 0
    ? undefined
    : input.apiKey;
  return requestProviderSession("POST", JSON.stringify({
    protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
    action,
    endpoint: input.endpoint,
    ...(apiKey === undefined ? {} : { apiKey }),
  }), input.signal, accepts);
}

export function removeUserProvider(signal: AbortSignal): Promise<ProviderSessionStatus> {
  return requestProviderSession("DELETE", undefined, signal, isProviderSessionStatus);
}

async function requestProviderSession<T>(
  method: "GET" | "POST" | "DELETE",
  body: string | undefined,
  signal: AbortSignal,
  accepts: (value: unknown) => value is T,
): Promise<T> {
  signal.throwIfAborted();
  const deadline = createRequestDeadline(
    signal,
    PROVIDER_SESSION_CLIENT_TIMEOUT_MS,
    "The custom API request timed out.",
  );
  try {
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
