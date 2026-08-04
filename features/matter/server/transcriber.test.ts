import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import type { TranscriptionRequest } from "./transcription-contract";
import { TranscriptionServerError } from "./transcription-errors";
import { transcribeRecording } from "./transcriber";

const REQUEST: TranscriptionRequest = {
  protocolVersion: PROTOCOL_VERSION,
  interactionId: "voice_01",
  attempt: 1,
  purpose: "admission",
  locale: "zh-CN",
  durationMs: 800,
  audio: new File(["voice"], "voice.webm", { type: "audio/webm" }),
};

describe("transcribeRecording", () => {
  it("echoes the operation identity and preserves transcript bytes", async () => {
    const result = await transcribeRecording(
      REQUEST,
      new AbortController().signal,
      async () => ({ transcript: "  这句话保留原来的停顿。  " }),
    );
    expect(result).toEqual({
      protocolVersion: "0.2",
      interactionId: "voice_01",
      attempt: 1,
      transcript: "  这句话保留原来的停顿。  ",
    });
  });

  it.each([
    ["empty", "   ", "NO_SPEECH"],
    ["oversize", "念".repeat(2_001), "INVALID_PROVIDER_RESPONSE"],
  ] as const)("rejects an %s transcript whole", async (_name, transcript, code) => {
    await expect(
      transcribeRecording(REQUEST, new AbortController().signal, async () => ({ transcript })),
    ).rejects.toMatchObject({ code });
  });

  it("translates unknown adapter failures without leaking their message", async () => {
    const adapter = vi.fn(async () => {
      throw new Error("provider-secret-body");
    });
    await expect(
      transcribeRecording(REQUEST, new AbortController().signal, adapter),
    ).rejects.toEqual(
      new TranscriptionServerError(
        "TRANSCRIPTION_FAILED",
        "The recording could not be transcribed.",
        true,
        502,
        "voice_01",
        1,
      ),
    );
  });

  it("passes request cancellation to the adapter and returns a stable cancellation", async () => {
    const controller = new AbortController();
    const adapter = vi.fn(
      async (_request: TranscriptionRequest, signal: AbortSignal) =>
        await new Promise<{ transcript: string }>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = transcribeRecording(REQUEST, controller.signal, adapter);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "TRANSCRIPTION_FAILED", status: 499 });
  });

  it("settles cancellation even when the adapter ignores its signal", async () => {
    const controller = new AbortController();
    const adapter = vi.fn(async () => await new Promise<{ transcript: string }>(() => undefined));
    const pending = transcribeRecording(REQUEST, controller.signal, adapter);
    const assertion = expect(pending).rejects.toMatchObject({
      code: "TRANSCRIPTION_FAILED",
      status: 499,
    });

    controller.abort();

    await assertion;
    expect(adapter).toHaveBeenCalledOnce();
  });
});
