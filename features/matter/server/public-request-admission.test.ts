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

function request(origin: string | null, address = "192.0.2.1"): Request {
  const headers = new Headers({ "x-vercel-forwarded-for": address });
  if (origin !== null) {
    headers.set("origin", origin);
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request("https://matter.ptoq.io/api/test", { method: "POST", headers });
}
