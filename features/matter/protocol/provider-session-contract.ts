/**
 * Public wire contract for the sealed user-provider preference.
 *
 * The browser supplies only the address it intends to use and, when replacing
 * credentials, its opaque key. A missing key can reuse one sealed credential
 * only at that credential's exact canonical endpoint. Provider format, model,
 * operation path, and response vocabulary remain server-owned.
 */

export const PROVIDER_SESSION_PROTOCOL_VERSION = "3" as const;
export const MAX_PROVIDER_SESSION_REQUEST_BYTES = 2 * 1_024;
export const MAX_PROVIDER_SESSION_RESPONSE_BYTES = 8 * 1_024;
/** Stays outside the route's 8s boundary and the platform's 10s ceiling. */
export const PROVIDER_SESSION_CLIENT_TIMEOUT_MS = 12_000;
export const MAX_USER_PROVIDER_API_KEY_CODE_UNITS = 512;
export const MAX_USER_PROVIDER_API_KEY_UTF8_BYTES = 512;
export const MIN_USER_PROVIDER_API_KEY_CODE_UNITS = 1;
export const MAX_USER_PROVIDER_ENDPOINT_CODE_UNITS = 512;

export type ProviderSessionAction = "test" | "save";

export type ProviderSessionRequest = Readonly<{
  protocolVersion: typeof PROVIDER_SESSION_PROTOCOL_VERSION;
  action: ProviderSessionAction;
  endpoint: string;
  apiKey?: string;
}>;

export type ProviderSessionStatus = Readonly<{
  protocolVersion: typeof PROVIDER_SESSION_PROTOCOL_VERSION;
  available: boolean;
  credentialPresent: boolean;
  endpoint: string | null;
  expiresAt: string | null;
}>;

export type ProviderSessionTestResult = Readonly<{
  protocolVersion: typeof PROVIDER_SESSION_PROTOCOL_VERSION;
  verified: true;
  endpoint: string;
}>;

export type ProviderSessionErrorCode =
  | "INVALID_REQUEST"
  | "FEATURE_UNAVAILABLE"
  | "CONNECTION_FAILED"
  | "RATE_LIMITED";

export type ProviderSessionErrorEnvelope = Readonly<{
  error: Readonly<{
    code: ProviderSessionErrorCode;
    message: string;
    retryable: boolean;
  }>;
}>;

export type ProviderSessionRequestParse =
  | Readonly<{ ok: true; request: ProviderSessionRequest }>
  | Readonly<{ ok: false; message: string }>;

export function parseProviderSessionRequest(value: unknown): ProviderSessionRequestParse {
  if (!isPlainObject(value)) return invalid("The provider request is not an object.");
  const hasApiKey = Object.hasOwn(value, "apiKey");
  if (!hasExactKeys(value, hasApiKey
    ? ["protocolVersion", "action", "endpoint", "apiKey"]
    : ["protocolVersion", "action", "endpoint"])) {
    return invalid("The provider request fields are invalid.");
  }
  if (value.protocolVersion !== PROVIDER_SESSION_PROTOCOL_VERSION) {
    return invalid("The provider protocol version is unsupported.");
  }
  if (value.action !== "test" && value.action !== "save") {
    return invalid("The provider action is invalid.");
  }
  const endpoint = normalizeUserProviderEndpoint(value.endpoint);
  if (endpoint === null) return invalid("The provider endpoint is invalid.");
  if (hasApiKey && !isValidUserProviderApiKey(value.apiKey)) {
    return invalid("The provider API key is invalid.");
  }
  return Object.freeze({
    ok: true,
    request: Object.freeze({
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      action: value.action,
      endpoint,
      ...(hasApiKey ? { apiKey: value.apiKey as string } : {}),
    }),
  });
}

export function isProviderSessionStatus(value: unknown): value is ProviderSessionStatus {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "protocolVersion", "available", "credentialPresent", "endpoint", "expiresAt",
  ])) return false;
  if (
    value.protocolVersion !== PROVIDER_SESSION_PROTOCOL_VERSION ||
    typeof value.available !== "boolean" ||
    typeof value.credentialPresent !== "boolean"
  ) return false;
  if (!value.available && value.credentialPresent) return false;
  if (!value.credentialPresent) return value.endpoint === null && value.expiresAt === null;
  return typeof value.endpoint === "string" &&
    normalizeUserProviderEndpoint(value.endpoint) === value.endpoint &&
    isCanonicalTimestamp(value.expiresAt);
}

export function isProviderSessionTestResult(value: unknown): value is ProviderSessionTestResult {
  return isPlainObject(value) && hasExactKeys(value, [
    "protocolVersion", "verified", "endpoint",
  ]) &&
    value.protocolVersion === PROVIDER_SESSION_PROTOCOL_VERSION &&
    value.verified === true &&
    typeof value.endpoint === "string" &&
    normalizeUserProviderEndpoint(value.endpoint) === value.endpoint;
}

export function isProviderSessionErrorEnvelope(value: unknown): value is ProviderSessionErrorEnvelope {
  if (!isPlainObject(value) || !hasExactKeys(value, ["error"]) || !isPlainObject(value.error)) {
    return false;
  }
  return hasExactKeys(value.error, ["code", "message", "retryable"]) &&
    isProviderSessionErrorCode(value.error.code) &&
    typeof value.error.message === "string" && value.error.message.length > 0 &&
    typeof value.error.retryable === "boolean";
}

/**
 * Canonicalises only a public-looking HTTPS endpoint. The server separately
 * resolves every DNS answer, pins the TLS socket, and admits only reviewed
 * model-list and completion paths derived from this value.
 */
export function normalizeUserProviderEndpoint(value: unknown): string | null {
  const normalized = normalizePublicProviderUrl(value, true);
  if (normalized === null) return null;
  const url = new URL(normalized);
  const endpoint = url.pathname === "/" ? `${url.origin}/v1` : normalized;
  return endpoint.length <= MAX_USER_PROVIDER_ENDPOINT_CODE_UNITS ? endpoint : null;
}

/**
 * Server-selected bases are already derived from a normalized endpoint. Unlike
 * user input, a root base can be meaningful when the person supplied an exact
 * `/chat/completions` operation, so this predicate never adds `/v1`.
 */
export function isCanonicalUserProviderBaseUrl(value: unknown): value is string {
  return typeof value === "string" && normalizePublicProviderUrl(value, false) === value;
}

function normalizePublicProviderUrl(value: unknown, allowMissingScheme: boolean): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_USER_PROVIDER_ENDPOINT_CODE_UNITS ||
    value.trim() !== value ||
    /[^\x20-\x7e]/u.test(value) ||
    /[\\]/u.test(value) ||
    /%(?:00|0a|0d|2e|2f|5c)/iu.test(value)
  ) return null;
  let candidate = value;
  if (!value.includes("://")) {
    const hostWithPort = /^[A-Za-z0-9.-]+:\d+(?:\/|$)/u.test(value);
    if (
      !allowMissingScheme ||
      value.startsWith("//") ||
      (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !hostWithPort)
    ) return null;
    candidate = `https://${value}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.port !== "" && url.port !== "443")
  ) return null;
  const hostname = url.hostname.toLowerCase();
  if (
    hostname.length === 0 ||
    hostname.length > 253 ||
    !hostname.includes(".") ||
    hostname.endsWith(".") ||
    hostname.startsWith("[") ||
    /^\d+(?:\.\d+){3}$/u.test(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".test") ||
    !hostname.split(".").every((label) => (
      label.length > 0 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
    ))
  ) return null;
  const path = url.pathname.replace(/\/+$/u, "");
  const normalized = `${url.origin}${path}`;
  return normalized.length <= MAX_USER_PROVIDER_ENDPOINT_CODE_UNITS ? normalized : null;
}

export function isValidUserProviderApiKey(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= MIN_USER_PROVIDER_API_KEY_CODE_UNITS &&
    value.length <= MAX_USER_PROVIDER_API_KEY_CODE_UNITS &&
    new TextEncoder().encode(value).byteLength <= MAX_USER_PROVIDER_API_KEY_UTF8_BYTES &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function isProviderSessionErrorCode(value: unknown): value is ProviderSessionErrorCode {
  return value === "INVALID_REQUEST" || value === "FEATURE_UNAVAILABLE" ||
    value === "CONNECTION_FAILED" || value === "RATE_LIMITED";
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function invalid(message: string): ProviderSessionRequestParse {
  return Object.freeze({ ok: false, message });
}
