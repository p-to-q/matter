import { beforeEach, describe, expect, it } from "vitest";
import { admitInquiryRequest, resetInquiryAdmissionForTests } from "./inquiry-admission";

beforeEach(resetInquiryAdmissionForTests);

describe("public inquiry admission", () => {
  it("requires the deployed same origin in production", () => {
    const environment = { NODE_ENV: "production", MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io" };
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), environment).ok).toBe(true);
    expect(admitInquiryRequest(request("https://attacker.example"), environment)).toMatchObject({
      ok: false,
      reason: "ORIGIN",
    });
    expect(admitInquiryRequest(request(null), environment)).toMatchObject({ ok: false, reason: "ORIGIN" });
  });

  it("bounds a source to twelve requests per minute", () => {
    for (let index = 0; index < 12; index += 1) {
      const result = admitInquiryRequest(request("https://matter.ptoq.io"), {}, () => 10);
      expect(result.ok).toBe(true);
      if (result.ok) result.release();
    }
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), {}, () => 10))
      .toMatchObject({ ok: false, reason: "RATE" });
    expect(admitInquiryRequest(request("https://matter.ptoq.io"), {}, () => 60_011).ok).toBe(true);
  });

  it("bounds concurrent provider work and releases idempotently", () => {
    const held = Array.from({ length: 4 }, (_, index) =>
      admitInquiryRequest(request("https://matter.ptoq.io", `192.0.2.${index}`)));
    expect(held.every((entry) => entry.ok)).toBe(true);
    expect(admitInquiryRequest(request("https://matter.ptoq.io", "192.0.2.9")))
      .toMatchObject({ ok: false, reason: "BUSY" });
    const first = held[0];
    if (first?.ok) {
      first.release();
      first.release();
    }
    expect(admitInquiryRequest(request("https://matter.ptoq.io", "192.0.2.9")).ok).toBe(true);
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
