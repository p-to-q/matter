import { afterEach, describe, expect, it, vi } from "vitest";

const port = vi.hoisted(() => ({
  created: 0,
  repair: vi.fn(async () => Object.freeze({ text: "我觉得可以。", source: "rules" as const })),
}));

function workingPortModule() {
  return {
    createTranscriptRepairPort: () => {
      port.created += 1;
      return { repair: port.repair, dispose: () => undefined };
    },
  };
}

afterEach(() => {
  port.created = 0;
  port.repair.mockClear();
  vi.doUnmock("./transcript-repair-port");
  vi.resetModules();
});

const INPUT = Object.freeze({
  operationId: "voice_1",
  attempt: 1,
  text: "呃，我觉得可以",
  locale: "zh-CN" as const,
  signal: new AbortController().signal,
});

describe("transcript repair runtime", () => {
  it("makes the store's adjudicator readable before any repair returns a candidate", async () => {
    vi.doMock("./transcript-repair-port", workingPortModule);
    const runtime = await import("./transcript-repair-runtime");
    expect(runtime.readAdmissionRepairAdjudicator()).toBeNull();
    const repairPort = runtime.createLazyTranscriptRepairPort();

    port.repair.mockImplementationOnce(async () => {
      // The candidate exists only now, and the adjudicator already does.
      expect(runtime.readAdmissionRepairAdjudicator()).toBeTypeOf("function");
      return Object.freeze({ text: "我觉得可以。", source: "rules" as const });
    });
    await expect(repairPort.repair(INPUT)).resolves.toEqual({ text: "我觉得可以。", source: "rules" });
    await repairPort.repair(INPUT);

    const { adjudicateAdmissionRepair } = await import("../runtime/admission-repair-adjudication");
    expect(runtime.readAdmissionRepairAdjudicator()).toBe(adjudicateAdmissionRepair);
    expect(port.created).toBe(1);
  });

  it("rejects a repair whose runtime cannot load and fetches it again next time", async () => {
    vi.doMock("./transcript-repair-port", () => {
      throw new Error("chunk load failed");
    });
    const runtime = await import("./transcript-repair-runtime");
    const repairPort = runtime.createLazyTranscriptRepairPort();

    await expect(repairPort.repair(INPUT)).rejects.toThrow();
    expect(runtime.readAdmissionRepairAdjudicator()).toBeNull();

    vi.doMock("./transcript-repair-port", workingPortModule);
    await expect(repairPort.repair(INPUT)).resolves.toMatchObject({ source: "rules" });
    expect(runtime.readAdmissionRepairAdjudicator()).toBeTypeOf("function");
  });
});
