import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribe } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

describe("transcription client", () => {
  it("uploads the real recording extension and metadata", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      const audio = form.get("audio") as File;
      expect(audio.name).toBe("matter-voice.mp4");
      expect(audio.type).toBe("audio/mp4;codecs=mp4a.40.2");
      expect(form.get("durationMs")).toBe("812");
      expect(form.get("purpose")).toBe("transform");
      return Response.json({ transcript: "继续向外展开" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribe(
      new Blob(["voice"], { type: "audio/mp4;codecs=mp4a.40.2" }),
      "zh-CN",
      812,
      false,
      "transform",
    );

    expect(result.transcript).toBe("继续向外展开");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an empty live recording before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribe(new Blob([], { type: "audio/webm" }), "zh-CN", 900, false, "create"),
    ).rejects.toThrow("No speech was recorded");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the audio-free fixture request independent of browser MIME output", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const audio = (init?.body as FormData).get("audio") as File;
      expect(audio.name).toBe("matter-voice.webm");
      return Response.json({ transcript: "fixture" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribe(new Blob([]), "zh-CN", 800, true, "create"),
    ).resolves.toMatchObject({ transcript: "fixture" });
  });
});
