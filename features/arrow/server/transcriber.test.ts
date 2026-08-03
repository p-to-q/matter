import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "./transcriber";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.unstubAllGlobals();
});

describe("transcriber boundary", () => {
  it("keeps fixture mode deterministic without audio", async () => {
    process.env.ARROW_TRANSCRIPTION_ADAPTER = "openai";
    process.env.ARROW_DEMO_FIXTURES = "true";

    await expect(
      transcribeAudio(null, "zh-CN", 800, true, "transform"),
    ).resolves.toMatchObject({ language: "zh-CN", durationMs: 800 });
  });

  it("rejects invalid duration and audio type before provider access", async () => {
    process.env.ARROW_TRANSCRIPTION_ADAPTER = "openai";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudio(
        new File(["voice"], "voice.webm", { type: "video/webm" }),
        "zh-CN",
        900,
      ),
    ).rejects.toMatchObject({ status: 415, retryable: false });
    await expect(
      transcribeAudio(
        new File(["voice"], "voice.webm", { type: "audio/webm" }),
        "zh-CN",
        0,
      ),
    ).rejects.toMatchObject({ status: 400, retryable: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the browser file and parses an OpenAI transcription", async () => {
    process.env.ARROW_TRANSCRIPTION_ADAPTER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_TRANSCRIPTION_MODEL;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      expect(file.name).toBe("matter-voice.mp4");
      expect(file.type).toBe("audio/mp4");
      expect(form.get("model")).toBe("gpt-4o-transcribe");
      expect(form.get("language")).toBe("zh");
      return Response.json({ text: "  这是一个真实的转写。  " });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudio(
        new File(["voice"], "matter-voice.mp4", { type: "audio/mp4" }),
        "zh-CN",
        1_240,
      ),
    ).resolves.toEqual({
      transcript: "这是一个真实的转写。",
      language: "zh-CN",
      durationMs: 1_240,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("repairs a generic multipart filename using the audio MIME type", async () => {
    process.env.ARROW_TRANSCRIPTION_ADAPTER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect((form.get("file") as File).name).toBe("matter-voice.webm");
      return Response.json({ text: "修复后的文件名" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudio(
        new File(["voice"], "blob", { type: "audio/webm;codecs=opus" }),
        "zh-CN",
        900,
      ),
    ).resolves.toMatchObject({ transcript: "修复后的文件名" });
  });

  it("turns an invalid provider payload into a stable retryable error", async () => {
    process.env.ARROW_TRANSCRIPTION_ADAPTER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );

    await expect(
      transcribeAudio(
        new File(["voice"], "voice.webm", { type: "audio/webm" }),
        "zh-CN",
        900,
      ),
    ).rejects.toMatchObject({ status: 502, retryable: true });
  });
});
