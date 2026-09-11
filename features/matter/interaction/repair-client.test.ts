import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSCRIPT_REPAIR_PROMPT_VERSION } from "../material/transcript-repair";
import { RepairUnavailable, requestTranscriptRepair } from "./repair-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestTranscriptRepair", () => {
  it("keeps the deadline active while a response body is stalled", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    let bodyCancelled = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Response(new ReadableStream({
        start: () => undefined,
        cancel: () => {
          bodyCancelled = true;
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
    const controller = new AbortController();
    const request = requestTranscriptRepair({
      operationId: "voice_stalled_body",
      attempt: 1,
      locale: "en-US",
      text: "this response body never finishes",
      signal: controller.signal,
      timeoutMs: 25,
    });
    const assertion = expect(request).rejects.toBeInstanceOf(RepairUnavailable);

    await vi.advanceTimersByTimeAsync(26);

    await assertion;
    expect(observedSignal?.aborted).toBe(true);
    expect(bodyCancelled).toBe(true);
  });

  it("still accepts a complete strict response before the deadline", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        operationId: string;
        attempt: number;
      };
      return Response.json({
        protocolVersion: "0.2",
        promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
        operationId: body.operationId,
        attempt: body.attempt,
        text: "This response is complete.",
        source: "model",
      });
    }));
    const controller = new AbortController();

    await expect(requestTranscriptRepair({
      operationId: "voice_complete_body",
      attempt: 1,
      locale: "en-US",
      text: "this response is complete",
      signal: controller.signal,
      timeoutMs: 100,
    })).resolves.toMatchObject({
      operationId: "voice_complete_body",
      text: "This response is complete.",
      source: "model",
    });
  });

  it("owns streamed bytes before a producer reuses its buffer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseFromReusedByteView(JSON.stringify({
      protocolVersion: "0.2",
      promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
      operationId: "voice_reused_buffer",
      attempt: 1,
      text: "The bytes remain exact.",
      source: "model",
    }))));

    await expect(requestTranscriptRepair({
      operationId: "voice_reused_buffer",
      attempt: 1,
      locale: "en-US",
      text: "the bytes remain exact",
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).resolves.toMatchObject({
      operationId: "voice_reused_buffer",
      text: "The bytes remain exact.",
    });
  });
});

function responseFromReusedByteView(text: string): Response {
  const encoded = new TextEncoder().encode(text);
  const backing = new Uint8Array(8);
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset === encoded.byteLength) {
        controller.close();
        return;
      }
      const length = Math.min(backing.byteLength, encoded.byteLength - offset);
      backing.set(encoded.subarray(offset, offset + length));
      offset += length;
      controller.enqueue(backing.subarray(0, length));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  }));
}
