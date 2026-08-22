import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  normalize: vi.fn(),
  pipeline: vi.fn(),
  recognize: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({ pipeline: mocks.pipeline }));
vi.mock("../runtime/spoken-transcript", () => ({
  normalizeSpokenTranscript: mocks.normalize,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.normalize.mockReset();
  mocks.pipeline.mockReset();
  mocks.recognize.mockReset();
  mocks.normalize.mockImplementation((input: { text: string }) => input.text);
  mocks.pipeline.mockReturnValue(Promise.resolve(mocks.recognize));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local transcription worker result boundary", () => {
  it("reports blank recognition as no speech without entering punctuation", async () => {
    mocks.recognize.mockResolvedValue({ text: "   ", chunks: [] });
    const harness = await workerHarness();

    harness.send(request("silence"));

    await vi.waitFor(() => expect(harness.postMessage).toHaveBeenCalledWith({
      id: "silence",
      status: "no-speech",
    }));
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(harness.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      id: "silence",
      status: "failed",
    }));
  });

  it("rejects oversized model text before pause derivation or normalization", async () => {
    mocks.recognize.mockResolvedValue({ text: "念".repeat(2_001), chunks: [] });
    const harness = await workerHarness();

    harness.send(request("raw-oversized"));

    await vi.waitFor(() => expect(harness.postMessage).toHaveBeenCalledWith({
      id: "raw-oversized",
      status: "failed",
      stage: "punctuation",
    }));
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(harness.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      id: "raw-oversized",
      status: "complete",
    }));
  });

  it.each([
    ["empty", ""],
    ["oversized", "念".repeat(2_001)],
  ])("rejects a %s normalized result before completion", async (id, normalized) => {
    mocks.recognize.mockResolvedValue({ text: "有效转写", chunks: [] });
    mocks.normalize.mockReturnValue(normalized);
    const harness = await workerHarness();

    harness.send(request(id));

    await vi.waitFor(() => expect(harness.postMessage).toHaveBeenCalledWith({
      id,
      status: "failed",
      stage: "punctuation",
    }));
    expect(harness.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      id,
      status: "complete",
    }));
  });
});

async function workerHarness(): Promise<Readonly<{
  postMessage: ReturnType<typeof vi.fn>;
  send: (data: unknown) => void;
}>> {
  const postMessage = vi.fn();
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  vi.stubGlobal("postMessage", postMessage);
  vi.stubGlobal("addEventListener", vi.fn((type: string, next) => {
    if (type === "message") listener = next as (event: MessageEvent<unknown>) => void;
  }));

  await import("./local-transcription.worker");
  expect(postMessage).toHaveBeenCalledWith({ status: "ready" });
  if (listener === undefined) throw new Error("The worker did not install its message boundary.");
  return Object.freeze({
    postMessage,
    send: (data: unknown) => listener?.({ data } as MessageEvent<unknown>),
  });
}

function request(id: string) {
  return {
    type: "transcribe" as const,
    id,
    audio: new Float32Array([0.1, -0.1]),
    language: "chinese",
    locale: "zh-CN",
    purpose: "admission" as const,
  };
}
