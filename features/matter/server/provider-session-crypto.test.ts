import { createCipheriv } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PROVIDER_SESSION_COOKIE,
  PROVIDER_SESSION_GENERATION_COOKIE,
  PROVIDER_SESSION_GENERATION_TTL_MS,
  PROVIDER_SESSION_INITIAL_GENERATION,
  PROVIDER_SESSION_TTL_MS,
  createProviderSessionGeneration,
  expiredProviderSessionCookie,
  providerSessionAvailable,
  providerSessionCookie,
  providerSessionCookiePath,
  providerSessionGenerationCookie,
  readProviderCredential,
  readProviderSessionGeneration,
  sealProviderCredential,
  unsealProviderCredential,
} from "./provider-session-crypto";
import type { UserProviderSelection } from "./user-provider-registry";

const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 9).toString("base64url");
const NOW = Date.UTC(2026, 8, 11, 0, 0, 0);
const API_KEY = "sk-user-secret";
const GENERATION_ID = Buffer.alloc(16, 6).toString("base64url");
const official: UserProviderSelection = Object.freeze({
  profileId: "openai-current",
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
});

beforeEach(() => vi.restoreAllMocks());

describe("provider credential v4 sealing", () => {
  it("uses one fixed 30-day device lease", () => {
    expect(PROVIDER_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60_000);
  });

  it("uses the first key to write and every configured key to read during rotation", () => {
    const oldEnvironment = { MATTER_PROVIDER_SESSION_KEYS: `old:${KEY_A}` };
    const sealed = sealProviderCredential(
      official,
      API_KEY,
      GENERATION_ID,
      oldEnvironment,
      NOW,
      (size: number) => Buffer.alloc(size, 3),
    );
    expect(sealed).not.toBeNull();
    expect(sealed!.token.startsWith("v4.old.")).toBe(true);
    expect(sealed!.token).not.toContain(API_KEY);

    const rotated = { MATTER_PROVIDER_SESSION_KEYS: `new:${KEY_B},old:${KEY_A}` };
    expect(unsealProviderCredential(sealed!.token, rotated, NOW + 1_000)).toMatchObject({
      profileId: "openai-current",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: API_KEY,
    });
    expect(sealProviderCredential(
      official,
      API_KEY,
      GENERATION_ID,
      rotated,
      NOW,
    )!.token.startsWith("v4.new."))
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
      expect(sealProviderCredential(
        official,
        API_KEY,
        GENERATION_ID,
        environment,
        NOW,
      )).toBeNull();
    }
    expect(sealProviderCredential(
      official,
      API_KEY,
      GENERATION_ID,
      { MATTER_PROVIDER_SESSION_KEYS: `a:${KEY_A}` },
      Number.MAX_SAFE_INTEGER,
    )).toBeNull();
  });

  it("rejects tampering, old protocol tokens, a missing rotation key, and expiry", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const sealed = sealProviderCredential(
      official,
      API_KEY,
      GENERATION_ID,
      environment,
      NOW,
      (size: number) => Buffer.alloc(size, 4),
    )!;
    const tampered = `${sealed.token.slice(0, -1)}${sealed.token.endsWith("A") ? "B" : "A"}`;
    expect(unsealProviderCredential(tampered, environment, NOW)).toBeNull();
    expect(unsealProviderCredential(sealed.token.replace(/^v4/u, "v3"), environment, NOW)).toBeNull();
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
      GENERATION_ID,
      environment,
      NOW,
      (size: number) => Buffer.alloc(size, 5),
    );
    expect(sealed).not.toBeNull();
    expect(unsealProviderCredential(sealed!.token, environment, NOW)).toEqual({
      ...custom,
      apiKey: API_KEY,
      scopeId: Buffer.alloc(16, 5).toString("base64url"),
      generationId: GENERATION_ID,
      issuedAtMs: NOW,
      expiresAtMs: NOW + PROVIDER_SESSION_TTL_MS,
    });
    expect(sealProviderCredential(
      { ...custom, profileId: "openai-compatible" },
      API_KEY,
      GENERATION_ID,
      environment,
      NOW,
    )).not.toBeNull();
    expect(sealProviderCredential(
      { ...custom, profileId: "openai-compatible", model: "text-embedding-4-small" },
      API_KEY,
      GENERATION_ID,
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
    const sealed = sealProviderCredential(
      accepted,
      apiKey,
      GENERATION_ID,
      environment,
      NOW,
    );
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
    const sealed = sealProviderCredential(
      official,
      API_KEY,
      GENERATION_ID,
      environment,
      NOW,
    )!;
    expect(readProviderCredential(new Request("https://matter.example/api/label", {
      headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
        "other=value",
      ].join("; ") },
    }), environment, NOW)).not.toBeNull();
    expect(readProviderCredential(new Request("https://matter.example/api/label", {
      headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
      ].join("; ") },
    }), environment, NOW)).toBeNull();
  });

  it.each([
    ["the largest accepted three-byte key", "密".repeat(170)],
    ["the largest escaping-heavy ASCII key", "\\".repeat(512)],
  ])("round-trips %s inside the bounded cookie envelope", (_name, apiKey) => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const sealed = sealProviderCredential(
      official,
      apiKey,
      GENERATION_ID,
      environment,
      NOW,
    );
    expect(sealed).not.toBeNull();
    expect(sealed!.token.length).toBeLessThanOrEqual(3_072);
    expect(unsealProviderCredential(sealed!.token, environment, NOW)).toMatchObject({ apiKey });
  });

  it("rejects authenticated payloads outside the exact v4 schema", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const common = {
      v: 4,
      profileId: "openai-current",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: API_KEY,
      scopeId: Buffer.alloc(16, 3).toString("base64url"),
      generationId: GENERATION_ID,
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
  cipher.setAAD(Buffer.from("matter/provider-session/v4/active", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [
    "v4",
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
    const generation = providerSessionGenerationCookie(
      GENERATION_ID,
      NOW + PROVIDER_SESSION_GENERATION_TTL_MS,
      environment,
    );
    const expire = expiredProviderSessionCookie(environment);
    expect(set).toContain(`Path=${expected}`);
    expect(generation).toContain(`Path=${expected}`);
    expect(expire).toContain(`Path=${expected}`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("Secure");
    expect(set).toContain("SameSite=Strict");
    expect(set).toContain(`Max-Age=${PROVIDER_SESSION_TTL_MS / 1_000}`);
    expect(generation).toContain(`Max-Age=${PROVIDER_SESSION_GENERATION_TTL_MS / 1_000}`);
    expect(set).toContain("Priority=Low");
    expect(expire).toContain("Priority=Low");
    expect(generation).toContain("Priority=High");
  });
});

describe("provider-session removal generation", () => {
  it("treats an absent generation as the implicit initial value and malformed or duplicate values as invalid", () => {
    expect(readProviderSessionGeneration(new Request("https://matter.example/api/label"))).toEqual({
      kind: "initial",
      generationId: PROVIDER_SESSION_INITIAL_GENERATION,
    });
    expect(readProviderSessionGeneration(new Request("https://matter.example/api/label", {
      headers: { cookie: `${PROVIDER_SESSION_GENERATION_COOKIE}=not-a-generation` },
    }))).toEqual({ kind: "invalid" });
    const generationId = createProviderSessionGeneration((size) => Buffer.alloc(size, 6))!;
    expect(readProviderSessionGeneration(new Request("https://matter.example/api/label", {
      headers: { cookie: [
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${generationId}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${generationId}`,
      ].join("; ") },
    }))).toEqual({ kind: "invalid" });
  });

  it("creates an opaque high-water mark and binds credentials to the current generation", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const generationId = createProviderSessionGeneration((size) => Buffer.alloc(size, 8))!;
    expect(generationId).toMatch(/^[A-Za-z0-9_-]{22}$/u);

    const credential = sealProviderCredential(
      official,
      API_KEY,
      generationId,
      environment,
      NOW,
    )!;
    const request = new Request("https://matter.example/api/label", {
      headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${credential.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${generationId}`,
      ].join("; ") },
    });
    expect(readProviderSessionGeneration(request)).toEqual({ kind: "valid", generationId });
    expect(readProviderCredential(request, environment, NOW)).toMatchObject({
      apiKey: API_KEY,
      generationId,
    });
  });

  it("rejects an older credential under a newer removal generation", () => {
    const environment = { MATTER_PROVIDER_SESSION_KEYS: `active:${KEY_A}` };
    const older = createProviderSessionGeneration((size) => Buffer.alloc(size, 2))!;
    const newer = createProviderSessionGeneration((size) => Buffer.alloc(size, 3))!;
    const credential = sealProviderCredential(
      official,
      API_KEY,
      older,
      environment,
      NOW,
    )!;
    const request = new Request("https://matter.example/api/label", {
      headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${credential.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${newer}`,
      ].join("; ") },
    });
    expect(readProviderCredential(request, environment, NOW + 1)).toBeNull();
  });

  it("does not couple a current generation to retired credential-sealing keys", () => {
    const generationId = createProviderSessionGeneration((size) => Buffer.alloc(size, 4))!;
    const rotated = { MATTER_PROVIDER_SESSION_KEYS: `new:${KEY_B},old:${KEY_A}` };
    const issuedAt = NOW + 20 * 24 * 60 * 60_000;
    const credential = sealProviderCredential(
      official,
      API_KEY,
      generationId,
      rotated,
      issuedAt,
    )!;
    expect(credential.token).toMatch(/^v4\.new\./u);

    const request = new Request("https://matter.example/api/label", {
      headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${credential.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${generationId}`,
      ].join("; ") },
    });
    expect(readProviderCredential(
      request,
      { MATTER_PROVIDER_SESSION_KEYS: `new:${KEY_B}` },
      NOW + 31 * 24 * 60 * 60_000,
    )).toMatchObject({ apiKey: API_KEY, generationId });
  });
});
