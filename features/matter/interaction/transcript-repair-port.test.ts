import { describe, expect, it, vi } from "vitest";
import { TRANSCRIPT_REPAIR_PROMPT_VERSION } from "../material/transcript-repair";
import { createTranscriptRepairPort } from "./transcript-repair-port";

const input = (text: string, signal = new AbortController().signal) => ({
  operationId: "voice_1",
  attempt: 1,
  text,
  locale: "en-US" as const,
  vocabulary: ["Matter"],
  signal,
});

describe("TranscriptRepairPort", () => {
  it("always computes the stronger rule floor without a remote gate", async () => {
    const request = vi.fn();
    const port = createTranscriptRepairPort({ request, remoteEnabled: () => false });

    await expect(port.repair(input("uh i i think this works"))).resolves.toEqual({
      text: "I think this works.",
      source: "rules",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the rule floor and accepts one adjudicated model improvement", async () => {
    const request = vi.fn(async (requestInput) => Object.freeze({
      protocolVersion: "0.2" as const,
      promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
      operationId: requestInput.operationId,
      attempt: requestInput.attempt,
      text: "I think this works, and it still needs testing.",
      source: "model" as const,
    }));
    const port = createTranscriptRepairPort({ request, remoteEnabled: () => true });

    await expect(port.repair(input("i think this works and it still needs testing")))
      .resolves.toEqual({
        text: "I think this works, and it still needs testing.",
        source: "model",
      });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      operationId: "voice_1",
      attempt: 1,
      text: "I think this works and it still needs testing.",
      vocabulary: ["Matter"],
    }));
  });

  it("judges a model fix after a large deterministic restart removal", async () => {
    const request = vi.fn(async (requestInput) => Object.freeze({
      protocolVersion: "0.2" as const,
      promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
      operationId: requestInput.operationId,
      attempt: requestInput.attempt,
      text: "I think we need to ship the module.",
      source: "model" as const,
    }));
    const port = createTranscriptRepairPort({ request, remoteEnabled: () => true });

    await expect(port.repair(input(
      "i think we need to i think we need to ship teh module",
    ))).resolves.toEqual({
      text: "I think we need to ship the module.",
      source: "model",
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      text: "I think we need to ship teh module.",
    }));
  });

  it("keeps the rule floor when the remote proposal is rejected", async () => {
    const request = vi.fn(async (requestInput) => Object.freeze({
      protocolVersion: "0.2" as const,
      promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
      operationId: requestInput.operationId,
      attempt: requestInput.attempt,
      text: "This is now a polished recommendation with a different meaning.",
      source: "model" as const,
    }));
    const port = createTranscriptRepairPort({ request, remoteEnabled: () => true });

    await expect(port.repair(input("uh i i think this works"))).resolves.toEqual({
      text: "I think this works.",
      source: "rules",
    });
  });

  it("contains remote failure and fallback responses", async () => {
    const failed = createTranscriptRepairPort({
      request: vi.fn(async () => { throw new Error("offline"); }),
      remoteEnabled: () => true,
    });
    await expect(failed.repair(input("uh i i think this works"))).resolves.toEqual({
      text: "I think this works.",
      source: "rules",
    });

    const fallback = createTranscriptRepairPort({
      request: vi.fn(async (requestInput) => Object.freeze({
        protocolVersion: "0.2" as const,
        promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
        operationId: requestInput.operationId,
        attempt: requestInput.attempt,
        text: requestInput.text,
        source: "verbatim" as const,
        fallbackReason: "MODEL_TIMEOUT" as const,
      })),
      remoteEnabled: () => true,
    });
    await expect(fallback.repair(input("uh i i think this works"))).resolves.toEqual({
      text: "I think this works.",
      source: "rules",
    });
  });

  it("propagates caller cancellation instead of disguising it as fallback", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const port = createTranscriptRepairPort({
      request: vi.fn(),
      remoteEnabled: () => true,
    });

    await expect(port.repair(input("this sentence is long enough", controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
