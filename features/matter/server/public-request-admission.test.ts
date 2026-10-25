import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicRequestAdmission } from "./public-request-admission";

const admission = createPublicRequestAdmission({ requestsPerWindow: 2, maxConcurrent: 2 });
const PRODUCTION = Object.freeze({
  NODE_ENV: "production",
  MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io",
});

beforeEach(() => admission.resetForTests());

describe("public request admission", () => {
  it("requires a same-origin browser request only in production", () => {
    expect(admission.admit(request("https://matter.ptoq.io"), PRODUCTION).ok).toBe(true);
    expect(admission.admit(request("https://attacker.example"), PRODUCTION)).toMatchObject({
      ok: false,
      reason: "ORIGIN",
    });
    expect(admission.admit(request(null), PRODUCTION)).toMatchObject({ ok: false, reason: "ORIGIN" });
    expect(admission.admit(request(null), { NODE_ENV: "test" }).ok).toBe(true);
  });

  it("does not let fixture concurrency or one unknown identity throttle development", () => {
    const held = Array.from({ length: 8 }, () =>
      admission.admit(request(null), { NODE_ENV: "development" }, () => 10));
    expect(held.every((entry) => entry.ok)).toBe(true);
    expect(admission.admit(request(null), { NODE_ENV: "development" }, () => 10).ok).toBe(true);
  });

  it("bounds an identity window without charging busy requests", () => {
    const first = admission.admit(request("https://matter.ptoq.io", "192.0.2.1"), PRODUCTION, () => 10);
    const second = admission.admit(request("https://matter.ptoq.io", "192.0.2.2"), PRODUCTION, () => 10);
    expect(first.ok && second.ok).toBe(true);
    expect(admission.admit(request("https://matter.ptoq.io", "192.0.2.9"), PRODUCTION, () => 10))
      .toMatchObject({ ok: false, reason: "BUSY" });
    if (first.ok) first.release();
    if (second.ok) second.release();

    for (let index = 0; index < 2; index += 1) {
      const result = admission.admit(request("https://matter.ptoq.io", "192.0.2.9"), PRODUCTION, () => 10);
      expect(result.ok).toBe(true);
      if (result.ok) result.release();
    }
    expect(admission.admit(request("https://matter.ptoq.io", "192.0.2.9"), PRODUCTION, () => 10))
      .toMatchObject({ ok: false, reason: "RATE" });
    expect(admission.admit(request("https://matter.ptoq.io", "192.0.2.9"), PRODUCTION, () => 60_011).ok).toBe(true);
  });

  it("releases a concurrency slot exactly once on every accepted request path", () => {
    const first = admission.admit(request("https://matter.ptoq.io", "192.0.2.1"), PRODUCTION);
    const second = admission.admit(request("https://matter.ptoq.io", "192.0.2.2"), PRODUCTION);
    expect(admission.admit(request("https://matter.ptoq.io", "192.0.2.3"), PRODUCTION))
      .toMatchObject({ ok: false, reason: "BUSY" });
    if (first.ok) {
      first.release();
      first.release();
    }
    expect(admission.admit(request("https://matter.ptoq.io", "192.0.2.3"), PRODUCTION).ok).toBe(true);
    if (second.ok) second.release();
  });

  it("cancels a refused body before any route parser can retain it", () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const denied = new Request("https://matter.ptoq.io/api/test", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(admission.admit(denied, PRODUCTION)).toMatchObject({ ok: false, reason: "ORIGIN" });
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

describe("an explicit metering rule", () => {
  const staged = createPublicRequestAdmission({
    requestsPerWindow: 1,
    maxConcurrent: 2,
    metered: (environment) => environment.METERED === "yes",
  });

  it("replaces the NODE_ENV default in both directions, without rewriting the environment", () => {
    const staging = Object.freeze({ NODE_ENV: "staging", METERED: "yes" });
    expect(staged.admit(request(null), staging)).toMatchObject({ ok: false, reason: "ORIGIN" });
    // Production that the rule does not meter is not metered.
    expect(staged.admit(request(null), { ...PRODUCTION, METERED: "no" }).ok).toBe(true);
    expect(staged.admit(request(null), { ...PRODUCTION, METERED: "no" }).ok).toBe(true);
    expect(Object.keys(staging).sort()).toEqual(["METERED", "NODE_ENV"]);
  });

  it("applies the rate window to what it meters", () => {
    const environment = { METERED: "yes", MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io" };
    expect(staged.admit(request("https://matter.ptoq.io"), environment, () => 1).ok).toBe(true);
    expect(staged.admit(request("https://matter.ptoq.io"), environment, () => 2))
      .toMatchObject({ ok: false, reason: "RATE" });
  });
});

describe("who a request is counted as", () => {
  const SAME = { origin: "https://matter.ptoq.io", "sec-fetch-site": "same-origin" };
  const from = (headers: Record<string, string>) =>
    new Request("https://matter.ptoq.io/api/test", { method: "POST", headers: { ...SAME, ...headers } });
  const spend = (lane: ReturnType<typeof createPublicRequestAdmission>, headers: Record<string, string>) => {
    const result = lane.admit(from(headers), PRODUCTION, () => 10);
    if (result.ok) result.release();
    return result;
  };

  it("lets the default lane tell callers apart by x-forwarded-for, as it always has", () => {
    const lane = createPublicRequestAdmission({ requestsPerWindow: 1, maxConcurrent: 4 });
    expect(spend(lane, { "x-forwarded-for": "198.51.100.1" }).ok).toBe(true);
    expect(spend(lane, { "x-forwarded-for": "198.51.100.1" })).toMatchObject({ ok: false, reason: "RATE" });
    expect(spend(lane, { "x-forwarded-for": "198.51.100.2" }).ok).toBe(true);
  });

  it("does not let a platform-only lane be reset by an address the client invented", () => {
    const lane = createPublicRequestAdmission({ requestsPerWindow: 1, maxConcurrent: 4, identity: "platform" });
    expect(spend(lane, { "x-forwarded-for": "198.51.100.1" }).ok).toBe(true);
    for (const invented of ["198.51.100.2", "198.51.100.3", "203.0.113.9"]) {
      expect(spend(lane, { "x-forwarded-for": invented }), invented).toMatchObject({ ok: false, reason: "RATE" });
    }
  });

  it("counts a platform-only lane's callers by the headers the platform sets", () => {
    const lane = createPublicRequestAdmission({ requestsPerWindow: 1, maxConcurrent: 4, identity: "platform" });
    expect(spend(lane, { "x-vercel-forwarded-for": "198.51.100.1" }).ok).toBe(true);
    expect(spend(lane, { "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "evil" }))
      .toMatchObject({ ok: false, reason: "RATE" });
    expect(spend(lane, { "x-vercel-forwarded-for": "198.51.100.2" }).ok).toBe(true);
    expect(spend(lane, { "x-real-ip": "198.51.100.3" }).ok).toBe(true);
    expect(spend(lane, { "x-real-ip": "198.51.100.3", "x-forwarded-for": "other" }))
      .toMatchObject({ ok: false, reason: "RATE" });
    expect(spend(lane, { "x-real-ip": "198.51.100.77" }).ok).toBe(true);
    // The platform's own header outranks the one a client could add.
    expect(spend(lane, { "x-vercel-forwarded-for": "198.51.100.4", "x-real-ip": "198.51.100.3" }).ok).toBe(true);
  });
});

function request(origin: string | null, address = "192.0.2.1"): Request {
  const headers = new Headers({ "x-vercel-forwarded-for": address });
  if (origin !== null) {
    headers.set("origin", origin);
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request("https://matter.ptoq.io/api/test", { method: "POST", headers });
}
