import { beforeEach, describe, expect, it, vi } from "vitest";
import { admitTransformRequest, resetTransformAdmissionForTests } from "./transform-admission";

const PRODUCTION = Object.freeze({
  NODE_ENV: "production",
  MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io",
});

beforeEach(() => resetTransformAdmissionForTests());

describe("transform admission", () => {
  it("refuses every browser fetch site the shared perimeter refuses", () => {
    // A hand-rolled copy of this perimeter once refused only "cross-site",
    // leaving the two generative ports open to a sibling subdomain that the
    // inquiry, label, repair, and transcription ports already refused.
    expect(admitTransformRequest(request("https://matter.ptoq.io", "same-origin"), PRODUCTION).ok)
      .toBe(true);
    for (const fetchSite of ["same-site", "cross-site", "none"]) {
      expect(admitTransformRequest(request("https://matter.ptoq.io", fetchSite), PRODUCTION))
        .toMatchObject({ ok: false, reason: "ORIGIN" });
    }
    expect(admitTransformRequest(request("https://attacker.example", "same-origin"), PRODUCTION))
      .toMatchObject({ ok: false, reason: "ORIGIN" });
  });

  it("cancels a refused body before any route parser can retain it", () => {
    const cancelled = vi.fn();
    const denied = new Request("https://matter.ptoq.io/api/turn", {
      method: "POST",
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      body: new ReadableStream<Uint8Array>({ cancel: cancelled }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(admitTransformRequest(denied, PRODUCTION)).toMatchObject({ ok: false, reason: "ORIGIN" });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("keeps the transform port's own narrower budget", () => {
    const held = Array.from({ length: 3 }, (_, index) =>
      admitTransformRequest(request("https://matter.ptoq.io", "same-origin", `192.0.2.${index}`), PRODUCTION, () => 10));
    expect(held.every((entry) => entry.ok)).toBe(true);
    // Three concurrent transforms is the ceiling; inquiry allows four.
    expect(admitTransformRequest(request("https://matter.ptoq.io", "same-origin", "192.0.2.9"), PRODUCTION, () => 10))
      .toMatchObject({ ok: false, reason: "BUSY" });
    for (const entry of held) if (entry.ok) entry.release();

    for (let index = 0; index < 8; index += 1) {
      const result = admitTransformRequest(
        request("https://matter.ptoq.io", "same-origin", "192.0.2.9"), PRODUCTION, () => 10);
      expect(result.ok).toBe(true);
      if (result.ok) result.release();
    }
    expect(admitTransformRequest(request("https://matter.ptoq.io", "same-origin", "192.0.2.9"), PRODUCTION, () => 10))
      .toMatchObject({ ok: false, reason: "RATE" });
  });

  it("does not throttle fixture or development traffic", () => {
    const held = Array.from({ length: 8 }, () =>
      admitTransformRequest(request(null, null), { NODE_ENV: "test" }, () => 10));
    expect(held.every((entry) => entry.ok)).toBe(true);
  });
});

function request(origin: string | null, fetchSite: string | null, address = "192.0.2.1"): Request {
  const headers = new Headers({ "x-vercel-forwarded-for": address });
  if (origin !== null) headers.set("origin", origin);
  if (fetchSite !== null) headers.set("sec-fetch-site", fetchSite);
  return new Request("https://matter.ptoq.io/api/turn", { method: "POST", headers });
}
