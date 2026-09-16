import { createCipheriv } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PROVIDER_SESSION_COOKIE,
  PROVIDER_SESSION_TTL_MS,
  expiredProviderSessionCookie,
  providerSessionAvailable,
  providerSessionCookie,
  providerSessionCookiePath,
  readProviderCredential,
  sealProviderCredential,
  unsealProviderCredential,
} from "./provider-session-crypto";
import type { UserProviderSelection } from "./user-provider-registry";

const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 9).toString("base64url");
const NOW = Date.UTC(2026, 8, 11, 0, 0, 0);
const API_KEY = "sk-user-secret";
const official: UserProviderSelection = Object.freeze({
  profileId: "openai-current",
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
});

beforeEach(() => vi.restoreAllMocks());

describe("provider-session v3 sealing", () => {
  it("uses one fixed 30-day device lease", () => {
    expect(PROVIDER_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60_000);
  });

  it("uses the first key to write and every configured key to read during rotation", () => {
    const oldEnvironment = { MATTER_PROVIDER_SESSION_KEYS: `old:${KEY_A}` };
    const sealed = sealProviderCredential(
      official,
      API_KEY,
      oldEnvironment,
      NOW,
      (size: number) => Buffer.alloc(size, 3),
    );
    expect(sealed).not.toBeNull();
    expect(sealed!.token.startsWith("v3.old.")).toBe(true);
    expect(sealed!.token).not.toContain(API_KEY);

    const rotated = { MATTER_PROVIDER_SESSION_KEYS: `new:${KEY_B},old:${KEY_A}` };
    expect(unsealProviderCredential(sealed!.token, rotated, NOW + 1_000)).toMatchObject({
      profileId: "openai-current",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: API_KEY,
    });
    expect(sealProviderCredential(official, API_KEY, rotated, NOW)!.token.startsWith("v3.new."))
      .toBe(true);
  });

  it("fails closed for absent, malformed, duplicate, or oversized key rings", () => {
    const invalid = [
      {},
      { MATTER_PROVIDER_SESSION_KEYS: `bad:${KEY_A},bad:${KEY_B}` },
      { MATTER_PROVIDER_SESSION_KEYS: `bad key:${KEY_A}` },
      { MATTER_PROVIDER_SESSION_KEYS: `a:${KEY_A},b:${KEY_B},c:${KEY_A},d:${KEY_B},e:${KEY_A}` },
      { MATTER_PROVIDER_SESSION_KEYS: `a:${KEY_A},broken` },
    ];
    for (const environment of invalid) {
      expect(providerSessionAvailable(environment)).toBe(false);
      expect(sealProviderCredential(official, API_KEY, environment, NOW)).toBeNull();
    }
    expect(sealProviderCredential(
      official,
      API_KEY,
      { MATTER_PROVIDER_SESSION_KEYS: `a:${KEY_A}` },
      Number.MAX_SAFE_INTEGER,
    )).toBeNull();
  });

  it("rejects tampering, old protocol tokens, a missing rotation key, and expiry", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const sealed = sealProviderCredential(
      official,
      API_KEY,
      environment,
      NOW,
      (size: number) => Buffer.alloc(size, 4),
    )!;
    const tampered = `${sealed.token.slice(0, -1)}${sealed.token.endsWith("A") ? "B" : "A"}`;
    expect(unsealProviderCredential(tampered, environment, NOW)).toBeNull();
    expect(unsealProviderCredential(sealed.token.replace(/^v3/u, "v2"), environment, NOW)).toBeNull();
    expect(unsealProviderCredential(sealed.token, { MATTER_PROVIDER_SESSION_KEYS: `next:${KEY_B}` }, NOW)).toBeNull();
    expect(unsealProviderCredential(sealed.token, environment, NOW + PROVIDER_SESSION_TTL_MS)).toBeNull();
  });

  it("round-trips one server-selected custom profile without renegotiation fields", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const custom: UserProviderSelection = {
      profileId: "anthropic-compatible",
      model: "claude-fable-5",
      baseUrl: "https://mirror.vendor.ai/gateway/v1",
    };
    const sealed = sealProviderCredential(
      custom,
      API_KEY,
      environment,
      NOW,
      (size: number) => Buffer.alloc(size, 5),
    );
    expect(sealed).not.toBeNull();
    expect(unsealProviderCredential(sealed!.token, environment, NOW)).toEqual({
      ...custom,
      apiKey: API_KEY,
      scopeId: Buffer.alloc(16, 5).toString("base64url"),
      issuedAtMs: NOW,
      expiresAtMs: NOW + PROVIDER_SESSION_TTL_MS,
    });
    expect(sealProviderCredential(
      { ...custom, profileId: "openai-compatible" },
      API_KEY,
      environment,
      NOW,
    )).not.toBeNull();
    expect(sealProviderCredential(
      { ...custom, profileId: "openai-compatible", model: "text-embedding-4-small" },
      API_KEY,
      environment,
      NOW,
    )).toBeNull();
  });

  it("seals the endpoint and escaping-heavy key maxima within one cookie", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const accepted: UserProviderSelection = {
      profileId: "openai-compatible",
      model: "gpt-4.1-mini",
      baseUrl: `https://mirror.vendor.ai/${"x".repeat(487)}`,
    };
    const apiKey = "\\".repeat(512);
    expect(accepted.baseUrl).toHaveLength(512);
    const sealed = sealProviderCredential(accepted, apiKey, environment, NOW);
    expect(sealed).not.toBeNull();
    expect(sealed!.token.length).toBeLessThanOrEqual(3_072);
    expect(providerSessionCookie(sealed!.token, sealed!.credential.expiresAtMs, environment).length)
      .toBeLessThan(4_096);
    expect(unsealProviderCredential(sealed!.token, environment, NOW)).toMatchObject({
      ...accepted,
      apiKey,
    });
  });

  it("reads exactly one bounded cookie occurrence", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const sealed = sealProviderCredential(official, API_KEY, environment, NOW)!;
    expect(readProviderCredential(new Request("https://matter.example/api/label", {
      headers: { cookie: `${PROVIDER_SESSION_COOKIE}=${sealed.token}; other=value` },
    }), environment, NOW)).not.toBeNull();
    expect(readProviderCredential(new Request("https://matter.example/api/label", {
      headers: { cookie: `${PROVIDER_SESSION_COOKIE}=${sealed.token}; ${PROVIDER_SESSION_COOKIE}=${sealed.token}` },
    }), environment, NOW)).toBeNull();
  });

  it.each([
    ["the largest accepted three-byte key", "密".repeat(170)],
    ["the largest escaping-heavy ASCII key", "\\".repeat(512)],
  ])("round-trips %s inside the bounded cookie envelope", (_name, apiKey) => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const sealed = sealProviderCredential(official, apiKey, environment, NOW);
    expect(sealed).not.toBeNull();
    expect(sealed!.token.length).toBeLessThanOrEqual(3_072);
    expect(unsealProviderCredential(sealed!.token, environment, NOW)).toMatchObject({ apiKey });
  });

  it("rejects authenticated payloads outside the exact v3 schema", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const common = {
      v: 3,
      profileId: "openai-current",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: API_KEY,
      scopeId: Buffer.alloc(16, 3).toString("base64url"),
      issuedAtMs: NOW,
      expiresAtMs: NOW + PROVIDER_SESSION_TTL_MS,
    };
    expect(unsealProviderCredential(authenticatedToken({ ...common, provider: "openai" }), environment, NOW))
      .toBeNull();
    expect(unsealProviderCredential(authenticatedToken({ ...common, profileId: "future" }), environment, NOW))
      .toBeNull();
    expect(unsealProviderCredential(authenticatedToken({ ...common, model: "client-model" }), environment, NOW))
      .toBeNull();
    expect(unsealProviderCredential(authenticatedToken({ ...common, apiKey: "密".repeat(171) }), environment, NOW))
      .toBeNull();
  });
});

function authenticatedToken(payload: unknown): string {
  const iv = Buffer.alloc(12, 4);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(KEY_A, "base64url"), iv);
  cipher.setAAD(Buffer.from("matter/provider-session/v3/active", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [
    "v3",
    "active",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

describe("provider-session cookie", () => {
  it.each([
    [undefined, "/matter/api"],
    ["", "/api"],
    ["/workspace", "/workspace/api"],
    ["client/supplied", "/matter/api"],
    ["/matter; Secure", "/matter/api"],
    ["/matter\nattack", "/matter/api"],
    ["/matter/../admin", "/matter/api"],
    ["/matter/./admin", "/matter/api"],
    ["/matter/%2e%2e", "/matter/api"],
  ])("uses only the normalized deployment base path (%s)", (basePath, expected) => {
    const environment = { MATTER_BASE_PATH: basePath };
    expect(providerSessionCookiePath(environment)).toBe(expected);
    const set = providerSessionCookie("sealed", NOW + PROVIDER_SESSION_TTL_MS, environment);
    const expire = expiredProviderSessionCookie(environment);
    expect(set).toContain(`Path=${expected}`);
    expect(expire).toContain(`Path=${expected}`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("Secure");
    expect(set).toContain("SameSite=Strict");
    expect(set).toContain(`Max-Age=${PROVIDER_SESSION_TTL_MS / 1_000}`);
  });
});
