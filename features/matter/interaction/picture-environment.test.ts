import { afterEach, describe, expect, it, vi } from "vitest";
import { pictureEnvironmentSupported, type PictureEnvironment } from "./picture-environment";

const COMPLETE: PictureEnvironment = {
  crypto: { subtle: {} },
  indexedDB: {},
  Blob: class {},
  URL: { createObjectURL: () => "blob:" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("picture environment", () => {
  it("is supported when hashing, storing, and showing bytes are all present", () => {
    expect(pictureEnvironmentSupported(COMPLETE)).toBe(true);
  });

  it.each<readonly [string, PictureEnvironment]>([
    ["no crypto at all", { ...COMPLETE, crypto: undefined }],
    ["crypto without subtle (an insecure origin)", { ...COMPLETE, crypto: {} }],
    ["subtle that is null", { ...COMPLETE, crypto: { subtle: null } }],
    ["no IndexedDB", { ...COMPLETE, indexedDB: undefined }],
    ["null IndexedDB", { ...COMPLETE, indexedDB: null }],
    ["no Blob", { ...COMPLETE, Blob: undefined }],
    ["a Blob that is not constructible", { ...COMPLETE, Blob: {} }],
    ["no URL", { ...COMPLETE, URL: undefined }],
    ["a URL without createObjectURL", { ...COMPLETE, URL: {} }],
    ["an empty environment", {}],
  ])("is not supported with %s", (_name, environment) => {
    expect(pictureEnvironmentSupported(environment)).toBe(false);
  });

  it("is judged from the globals the app hands it", () => {
    vi.stubGlobal("indexedDB", {});
    vi.stubGlobal("crypto", { subtle: {} });
    expect(pictureEnvironmentSupported(globalThis as PictureEnvironment)).toBe(true);
    // An insecure origin keeps the rest of the browser but loses crypto.subtle.
    vi.stubGlobal("crypto", {});
    expect(pictureEnvironmentSupported(globalThis as PictureEnvironment)).toBe(false);
    vi.stubGlobal("crypto", { subtle: {} });
    vi.stubGlobal("indexedDB", undefined);
    expect(pictureEnvironmentSupported(globalThis as PictureEnvironment)).toBe(false);
  });
});
