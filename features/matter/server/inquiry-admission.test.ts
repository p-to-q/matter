import { beforeEach, describe, expect, it } from "vitest";
import { admitInquiryRequest, resetInquiryAdmissionForTests } from "./inquiry-admission";

beforeEach(resetInquiryAdmissionForTests);
const PRODUCTION = Object.freeze({
  NODE_ENV: "production",
  MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io",
});

describe("public inquiry admission", () => {
  it("requires the deployed same origin in production", () => {
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION).ok).toBe(true);
    expect(admitInquiryRequest(request("https://attacker.example"), PRODUCTION)).toMatchObject({
      ok: false,
      reason: "ORIGIN",
    });
    expect(admitInquiryRequest(request(null), PRODUCTION)).toMatchObject({ ok: false, reason: "ORIGIN" });
  });

  it("bounds a source to twelve requests per minute", () => {
    for (let index = 0; index < 12; index += 1) {
      const result = admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 10);
      expect(result.ok).toBe(true);
      if (result.ok) result.release();
    }
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 10))
      .toMatchObject({ ok: false, reason: "RATE" });
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 60_011).ok).toBe(true);
  });

  it("bounds concurrent provider work and releases idempotently", () => {
    const held = Array.from({ length: 4 }, (_, index) =>
      admitInquiryRequest(request("https://matter.ptoq.io", `192.0.2.${index}`), PRODUCTION));
    expect(held.every((entry) => entry.ok)).toBe(true);
    expect(admitInquiryRequest(request("https://matter.ptoq.io", "192.0.2.9"), PRODUCTION))
      .toMatchObject({ ok: false, reason: "BUSY" });
    const first = held[0];
    if (first?.ok) {
      first.release();
      first.release();
    }
    expect(admitInquiryRequest(request("https://matter.ptoq.io", "192.0.2.9"), PRODUCTION).ok).toBe(true);
  });

  it("does not spend a source's minute on a request it refuses to serve", () => {
    const held = Array.from({ length: 4 }, (_, index) =>
      admitInquiryRequest(request("https://matter.ptoq.io", `192.0.2.${index + 10}`), PRODUCTION, () => 10));
    expect(held.every((entry) => entry.ok)).toBe(true);
    for (let index = 0; index < 30; index += 1) {
      expect(admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 10))
        .toMatchObject({ ok: false, reason: "BUSY" });
    }
    for (const entry of held) if (entry.ok) entry.release();
    // The refused burst charged nothing, so the whole window is still theirs.
    for (let index = 0; index < 12; index += 1) {
      const result = admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 10);
      expect(result.ok).toBe(true);
      if (result.ok) result.release();
    }
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 10))
      .toMatchObject({ ok: false, reason: "RATE" });
  });

  it("refuses a rate-limited source before it can occupy a concurrency slot", () => {
    for (let index = 0; index < 12; index += 1) {
      const result = admitInquiryRequest(request("https://matter.ptoq.io"), PRODUCTION, () => 10);
      if (result.ok) result.release();
    }
    // Four other sources may still be served: a rate refusal took no slot.
    const held = Array.from({ length: 4 }, (_, index) =>
      admitInquiryRequest(request("https://matter.ptoq.io", `198.51.100.${index}`), PRODUCTION, () => 10));
    expect(held.every((entry) => entry.ok)).toBe(true);
  });
});

function request(origin: string | null, address = "192.0.2.1"): Request {
  const headers = new Headers({ "x-vercel-forwarded-for": address });
  if (origin !== null) {
    headers.set("origin", origin);
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request("https://matter.ptoq.io/api/inquiry", { method: "POST", headers });
}
