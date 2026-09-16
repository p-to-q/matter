import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { normalizeMatterBasePath } from "../config/base-path";
import { isValidUserProviderApiKey } from "../protocol/provider-session-contract";
import {
  isUserProviderSelection,
  type UserProviderCandidateCredential,
  type UserProviderProfileId,
  type UserProviderSelection,
} from "./user-provider-registry";

export const PROVIDER_SESSION_COOKIE = "__Secure-matter-provider";
// A saved provider is a deliberate device-level preference. Keep the lease
// persistent across browser restarts, but fixed and finite rather than silently
// extending it on every status read.
export const PROVIDER_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
export const PROVIDER_SESSION_KEYS_ENV = "MATTER_PROVIDER_SESSION_KEYS";
const TOKEN_VERSION = "v3";
const PAYLOAD_VERSION = 3;
const IV_BYTES = 12;
const TAG_BYTES = 16;
// These ceilings admit the protocol's maximum endpoint and escaping-heavy key
// while keeping the complete Set-Cookie field safely below 4 KiB.
const MAX_TOKEN_CODE_UNITS = 3_072;
const MAX_CIPHERTEXT_BYTES = 2_304;
const MAX_SEALING_KEYS = 4;
const MAX_DATE_MS = 8_640_000_000_000_000;

export type UserProviderCredential = UserProviderCandidateCredential & Readonly<{
  issuedAtMs: number;
  expiresAtMs: number;
}>;

type SealedPayload = Readonly<{
  v: typeof PAYLOAD_VERSION;
  profileId: UserProviderProfileId;
  model: string;
  baseUrl: string;
  apiKey: string;
  scopeId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

export function providerSessionAvailable(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return readSealingKeys(environment) !== null;
}

/**
 * Seals the single profile that completed connection negotiation. Runtime
 * requests consume this profile verbatim and never repeat model discovery.
 */
export function sealProviderCredential(
  selection: UserProviderSelection,
  apiKey: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
  random: (size: number) => Buffer = randomBytes,
): Readonly<{ token: string; credential: UserProviderCredential }> | null {
  const keys = readSealingKeys(environment);
  if (
    keys === null ||
    !isUserProviderSelection(selection) ||
    !isValidUserProviderApiKey(apiKey) ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    nowMs > MAX_DATE_MS - PROVIDER_SESSION_TTL_MS
  ) return null;
  const key = keys[0]!;
  const scopeId = random(16).toString("base64url");
  if (!/^[A-Za-z0-9_-]{22}$/u.test(scopeId)) return null;
  const issuedAtMs = nowMs;
  const expiresAtMs = nowMs + PROVIDER_SESSION_TTL_MS;
  const payload: SealedPayload = Object.freeze({
    v: PAYLOAD_VERSION,
    profileId: selection.profileId,
    model: selection.model,
    baseUrl: selection.baseUrl,
    apiKey,
    scopeId,
    issuedAtMs,
    expiresAtMs,
  });
  const iv = random(IV_BYTES);
  if (iv.length !== IV_BYTES) return null;
  const cipher = createCipheriv("aes-256-gcm", key.value, iv);
  cipher.setAAD(additionalData(key.id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const token = [
    TOKEN_VERSION,
    key.id,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
  if (token.length > MAX_TOKEN_CODE_UNITS) return null;
  return Object.freeze({ token, credential: Object.freeze(stripPayloadVersion(payload)) });
}

export function unsealProviderCredential(
  token: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
): UserProviderCredential | null {
  const keys = readSealingKeys(environment);
  if (keys === null || token.length > MAX_TOKEN_CODE_UNITS || !Number.isSafeInteger(nowMs)) return null;
  const parts = token.split(".");
  // v1/v2 and any future schema fail closed. The status route expires their
  // cookie rather than attempting an ambiguous in-place migration.
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION || !/^[A-Za-z0-9_-]{1,16}$/u.test(parts[1]!)) {
    return null;
  }
  const key = keys.find((entry) => entry.id === parts[1]);
  const iv = decodeBase64Url(parts[2]!, IV_BYTES);
  const ciphertext = decodeBase64Url(parts[3]!, 1, MAX_CIPHERTEXT_BYTES);
  const tag = decodeBase64Url(parts[4]!, TAG_BYTES);
  if (key === undefined || iv === null || ciphertext === null || tag === null) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.value, iv);
    decipher.setAAD(additionalData(key.id));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = parsePayload(JSON.parse(plaintext) as unknown);
    if (payload === null || payload.expiresAtMs <= nowMs) return null;
    // A forged or future schema cannot extend this fixed lease indefinitely.
    if (
      payload.issuedAtMs > nowMs + 60_000 ||
      payload.expiresAtMs - payload.issuedAtMs !== PROVIDER_SESSION_TTL_MS
    ) return null;
    return Object.freeze(stripPayloadVersion(payload));
  } catch {
    return null;
  }
}

export function readProviderCredential(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
): UserProviderCredential | null {
  const cookie = readSingleCookie(request.headers.get("cookie"), PROVIDER_SESSION_COOKIE);
  return cookie === null ? null : unsealProviderCredential(cookie, environment, nowMs);
}

export function providerSessionCookiePath(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  // Deployment configuration owns this boundary. A request or client-provided
  // path must never widen where the credential-bearing cookie is attached.
  const configured = environment.MATTER_BASE_PATH;
  const normalized = normalizeMatterBasePath(configured);
  const safe = configured === undefined || configured === "" || configured === "/" ||
    (normalized === configured && isSafeCookiePathBase(normalized));
  return `${safe ? normalized : normalizeMatterBasePath(undefined)}/api`;
}

export function providerSessionCookie(
  token: string,
  expiresAtMs: number,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return [
    `${PROVIDER_SESSION_COOKIE}=${token}`,
    `Path=${providerSessionCookiePath(environment)}`,
    `Expires=${new Date(expiresAtMs).toUTCString()}`,
    `Max-Age=${Math.floor(PROVIDER_SESSION_TTL_MS / 1_000)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function expiredProviderSessionCookie(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return [
    `${PROVIDER_SESSION_COOKIE}=`,
    `Path=${providerSessionCookiePath(environment)}`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

type SealingKey = Readonly<{ id: string; value: Buffer }>;

function readSealingKeys(
  environment: Readonly<Record<string, string | undefined>>,
): readonly SealingKey[] | null {
  const configured = environment[PROVIDER_SESSION_KEYS_ENV];
  if (configured === undefined || configured.length === 0 || configured.length > 512) return null;
  const entries = configured.split(",");
  if (entries.length < 1 || entries.length > MAX_SEALING_KEYS) return null;
  const ids = new Set<string>();
  const keys: SealingKey[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 1 || separator !== entry.lastIndexOf(":")) return null;
    const id = entry.slice(0, separator);
    const encoded = entry.slice(separator + 1);
    if (!/^[A-Za-z0-9_-]{1,16}$/u.test(id) || ids.has(id) || !/^[A-Za-z0-9_-]{43}$/u.test(encoded)) {
      return null;
    }
    const value = Buffer.from(encoded, "base64url");
    if (value.length !== 32 || value.toString("base64url") !== encoded) return null;
    ids.add(id);
    keys.push(Object.freeze({ id, value }));
  }
  return Object.freeze(keys);
}

function additionalData(keyId: string): Buffer {
  return Buffer.from(`matter/provider-session/v3/${keyId}`, "utf8");
}

function isSafeCookiePathBase(value: string): boolean {
  if (value === "") return true;
  const segments = value.slice(1).split("/");
  return segments.every((segment) => (
    segment !== "." &&
    segment !== ".." &&
    /^[A-Za-z0-9_-]+$/u.test(segment)
  ));
}

function decodeBase64Url(value: string, exactBytes: number): Buffer | null;
function decodeBase64Url(value: string, minimumBytes: number, maximumBytes: number): Buffer | null;
function decodeBase64Url(value: string, minimumBytes: number, maximumBytes = minimumBytes): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length < minimumBytes || decoded.length > maximumBytes) return null;
  return decoded.toString("base64url") === value ? decoded : null;
}

function parsePayload(value: unknown): SealedPayload | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "v", "profileId", "model", "baseUrl", "apiKey", "scopeId", "issuedAtMs", "expiresAtMs",
  ])) return null;
  if (
    value.v !== PAYLOAD_VERSION ||
    !isUserProviderSelection({
      profileId: value.profileId,
      model: value.model,
      baseUrl: value.baseUrl,
    }) ||
    !isValidUserProviderApiKey(value.apiKey)
  ) return null;
  if (typeof value.scopeId !== "string" || !/^[A-Za-z0-9_-]{22}$/u.test(value.scopeId)) return null;
  if (
    typeof value.issuedAtMs !== "number" ||
    typeof value.expiresAtMs !== "number" ||
    !Number.isSafeInteger(value.issuedAtMs) ||
    !Number.isSafeInteger(value.expiresAtMs) ||
    value.issuedAtMs < 0 ||
    value.expiresAtMs > MAX_DATE_MS
  ) return null;
  return value as SealedPayload;
}

function stripPayloadVersion(payload: SealedPayload): UserProviderCredential {
  return {
    profileId: payload.profileId,
    model: payload.model,
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
    scopeId: payload.scopeId,
    issuedAtMs: payload.issuedAtMs,
    expiresAtMs: payload.expiresAtMs,
  };
}

function readSingleCookie(header: string | null, name: string): string | null {
  if (header === null || header.length > 8 * 1_024) return null;
  const matches: string[] = [];
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    matches.push(pair.slice(separator + 1).trim());
  }
  return matches.length === 1 && matches[0]!.length > 0 ? matches[0]! : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
