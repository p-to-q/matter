import { describe, expect, it } from "vitest";
import { LOCAL_TRANSCRIPTION_MODEL } from "./local-transcription-model";

describe("local transcription model identity", () => {
  it("pins one immutable browser-cache key instead of following a mutable branch", () => {
    expect(LOCAL_TRANSCRIPTION_MODEL).toEqual({
      id: "onnx-community/whisper-tiny",
      revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
      device: "wasm",
      dtype: "q8",
    });
    expect(LOCAL_TRANSCRIPTION_MODEL.revision).toMatch(/^[a-f0-9]{40}$/u);
    expect(Object.isFrozen(LOCAL_TRANSCRIPTION_MODEL)).toBe(true);
  });
});
