import { describe, expect, it } from "vitest";
import {
  PROVIDER_SESSION_PROTOCOL_VERSION,
  isValidUserProviderApiKey,
  isProviderSessionStatus,
  isProviderSessionTestResult,
  parseProviderSessionRequest,
  normalizeUserProviderEndpoint,
} from "./provider-session-contract";

const valid = Object.freeze({
  protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
  action: "save" as const,
  endpoint: "https://api.openai.com/v1",
  apiKey: "sk-example-key",
});

describe("provider-session contract", () => {
  it("accepts only an exact v4 test/save request with an optional replacement key", () => {
    expect(PROVIDER_SESSION_PROTOCOL_VERSION).toBe("4");
    expect(parseProviderSessionRequest(valid).ok).toBe(true);
    expect(parseProviderSessionRequest({
      protocolVersion: "4",
      action: "test",
      endpoint: valid.endpoint,
    })).toEqual({
      ok: true,
      request: { protocolVersion: "4", action: "test", endpoint: valid.endpoint },
    });
    expect(parseProviderSessionRequest({ ...valid, protocolVersion: "3" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, action: "connect" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, apiKey: "" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, provider: "openai" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, model: "gpt-4.1-mini" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, baseUrl: valid.endpoint }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, extra: true }).ok).toBe(false);
    expect(parseProviderSessionRequest({
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      apiKey: valid.apiKey,
    }).ok).toBe(false);
  });

  it.each([
    ["api.kfc.com", "https://api.kfc.com"],
    ["https://api.kfc.com", "https://api.kfc.com"],
    ["http://api.kfc.com/v1", "https://api.kfc.com/v1"],
    ["htps://api.kfc.com/v1", "https://api.kfc.com/v1"],
    ["https//api.kfc.com/v1", "https://api.kfc.com/v1"],
    ["https:/api.kfc.com/v1", "https://api.kfc.com/v1"],
    ["https://mirror.vendor.ai/v1/", "https://mirror.vendor.ai/v1"],
    ["https://MIRROR.vendor.ai:443/v1", "https://mirror.vendor.ai/v1"],
    [
      "https://mirror.vendor.ai/v1/chat/completions/",
      "https://mirror.vendor.ai/v1/chat/completions",
    ],
    [
      "https://mirror.vendor.ai/chat/completions",
      "https://mirror.vendor.ai/chat/completions",
    ],
    [
      "https://mirror.vendor.ai/v1/messages",
      "https://mirror.vendor.ai/v1/messages",
    ],
  ])("canonicalizes an HTTPS base or known operation endpoint (%s)", (input, expected) => {
    expect(normalizeUserProviderEndpoint(input)).toBe(expected);
    expect(parseProviderSessionRequest({ ...valid, endpoint: input })).toEqual({
      ok: true,
      request: {
        protocolVersion: "4",
        action: "save",
        endpoint: expected,
        apiKey: valid.apiKey,
      },
    });
  });

  it.each([
    "ftp://mirror.vendor.ai/v1",
    "https://user:secret@mirror.vendor.ai/v1",
    "https://mirror.vendor.ai:8443/v1",
    "https://127.0.0.1/v1",
    "https://[::1]/v1",
    "https://service.local/v1",
    "https://mirror.vendor.ai/v1?tenant=x",
    "https://mirror.vendor.ai/v1#fragment",
    "https://mirror.vendor.ai/v1/%2e%2e/admin",
    `https://mirror.vendor.ai/${"x".repeat(512)}`,
    "https://镜像.example/v1",
  ])("rejects an unsafe or ambiguous endpoint (%s)", (input) => {
    expect(normalizeUserProviderEndpoint(input)).toBeNull();
    expect(parseProviderSessionRequest({ ...valid, endpoint: input }).ok).toBe(false);
  });

  it("rejects secret whitespace, controls, and unbounded values", () => {
    expect(parseProviderSessionRequest({ ...valid, apiKey: " sk-example-key" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, apiKey: "sk-line\nbreak" }).ok).toBe(false);
    expect(parseProviderSessionRequest({ ...valid, apiKey: "x".repeat(513) }).ok).toBe(false);
    expect(isValidUserProviderApiKey("")).toBe(false);
    expect(isValidUserProviderApiKey("x")).toBe(true);
    expect(isValidUserProviderApiKey("x".repeat(512))).toBe(true);
    expect(isValidUserProviderApiKey("x".repeat(513))).toBe(false);
    expect(isValidUserProviderApiKey("密".repeat(170))).toBe(true);
    expect(isValidUserProviderApiKey("密".repeat(171))).toBe(false);
    expect(isValidUserProviderApiKey("opaque-key-without-sk-prefix")).toBe(true);
  });

  it("strictly recognizes saved-credential status without claiming remote connectivity", () => {
    const status = {
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      available: true,
      credentialPresent: true,
      resetRequired: false,
      credentialId: "AAAAAAAAAAAAAAAAAAAAAA",
      endpoint: valid.endpoint,
      expiresAt: "2026-09-11T08:00:00.000Z",
    };
    expect(isProviderSessionStatus(status)).toBe(true);
    expect(isProviderSessionStatus({ ...status, apiKey: "never" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, endpoint: "https://mirror.vendor.ai/v1/" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, provider: "openai" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, model: "gpt-4.1-mini" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, credentialId: "short" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, credentialPresent: false })).toBe(false);
    expect(isProviderSessionStatus({ ...status, endpoint: null })).toBe(false);
    expect(isProviderSessionStatus({ ...status, expiresAt: "0" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, expiresAt: "Thu, 11 Sep 2026 08:00:00 GMT" })).toBe(false);
    expect(isProviderSessionStatus({ ...status, expiresAt: "2026-09-11T08:00:00Z" })).toBe(false);
    expect(isProviderSessionStatus({
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      available: true,
      credentialPresent: false,
      resetRequired: false,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    })).toBe(true);
    expect(isProviderSessionStatus({
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      available: false,
      credentialPresent: false,
      resetRequired: false,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    })).toBe(true);
    expect(isProviderSessionStatus({
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      available: false,
      credentialPresent: true,
      resetRequired: false,
      credentialId: status.credentialId,
      endpoint: valid.endpoint,
      expiresAt: status.expiresAt,
    })).toBe(false);
    expect(isProviderSessionStatus({
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      available: true,
      credentialPresent: false,
      resetRequired: true,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    })).toBe(true);
    expect(isProviderSessionStatus({ ...status, resetRequired: true })).toBe(false);
  });

  it("strictly recognizes a non-secret test result", () => {
    const result = {
      protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
      verified: true,
      endpoint: "https://mirror.vendor.ai/v1",
    };
    expect(isProviderSessionTestResult(result)).toBe(true);
    expect(isProviderSessionTestResult({ ...result, verified: false })).toBe(false);
    expect(isProviderSessionTestResult({ ...result, endpoint: null })).toBe(false);
    expect(isProviderSessionTestResult({ ...result, endpoint: `${result.endpoint}/` })).toBe(false);
    expect(isProviderSessionTestResult({ ...result, apiKey: "never" })).toBe(false);
  });
});
