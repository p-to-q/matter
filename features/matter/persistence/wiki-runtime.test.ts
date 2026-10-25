import { afterEach, describe, expect, it, vi } from "vitest";

// Stub the wiki-configuration static import so we can import wiki-runtime
// without pulling the real implementation.
vi.mock("../wiki/wiki-configuration", () => ({
  projectWikiConfigurationRules: vi.fn(() => []),
}));

const makeRuntimeCoreStub = (overrides?: Record<string, unknown>) => ({
  readMatterWikiState: vi.fn(() => null),
  readMatterWikiDiagnostics: vi.fn(() => null),
  getMatterWikiStatus: vi.fn(() => ({ phase: "loading" as const })),
  decideMatterWiki: vi.fn(),
  resetCorruptMatterWiki: vi.fn(),
  retryMatterWikiAuthority: vi.fn(),
  startMatterWikiAuthority: vi.fn(),
  subscribeMatterWikiAuthority: vi.fn(() => () => undefined),
  ...overrides,
});

afterEach(() => {
  vi.doUnmock("../wiki/wiki-export");
  vi.doUnmock("./wiki-runtime-core");
  vi.resetModules();
});

describe("matterWikiConfiguration.exportFile", () => {
  it("returns NOT_READY when wiki state is null", async () => {
    vi.doMock("./wiki-runtime-core", () => makeRuntimeCoreStub());
    const { matterWikiConfiguration } = await import("./wiki-runtime");
    const result = await matterWikiConfiguration.exportFile();
    expect(result).toEqual({ ok: false, code: "NOT_READY" });
  });

  it("returns EXPORT_FAILED when the wiki-export chunk rejects", async () => {
    vi.doMock("./wiki-runtime-core", () =>
      makeRuntimeCoreStub({
        readMatterWikiState: vi.fn(() => Object.freeze({ revision: 1 })),
      }),
    );
    vi.doMock("../wiki/wiki-export", () => { throw new Error("offline"); });
    const { matterWikiConfiguration } = await import("./wiki-runtime");
    const result = await matterWikiConfiguration.exportFile();
    expect(result).toEqual({ ok: false, code: "EXPORT_FAILED" });
  });

  it("returns EXPORT_FAILED when encodeWikiExport signals failure", async () => {
    vi.doMock("./wiki-runtime-core", () =>
      makeRuntimeCoreStub({
        readMatterWikiState: vi.fn(() => Object.freeze({ revision: 1 })),
      }),
    );
    vi.doMock("../wiki/wiki-export", () => ({
      encodeWikiExport: vi.fn(() => ({ ok: false })),
      WIKI_EXPORT_FILE_NAME: "matter-wiki.bin",
    }));
    const { matterWikiConfiguration } = await import("./wiki-runtime");
    const result = await matterWikiConfiguration.exportFile();
    expect(result).toEqual({ ok: false, code: "EXPORT_FAILED" });
  });

  it("returns ok with bytes and fileName on a successful export", async () => {
    const fakeBytes = new Uint8Array([0x01, 0x02, 0x03]);
    vi.doMock("./wiki-runtime-core", () =>
      makeRuntimeCoreStub({
        readMatterWikiState: vi.fn(() => Object.freeze({ revision: 1 })),
      }),
    );
    vi.doMock("../wiki/wiki-export", () => ({
      encodeWikiExport: vi.fn(() => ({ ok: true, bytes: fakeBytes })),
      WIKI_EXPORT_FILE_NAME: "matter-wiki.bin",
    }));
    const { matterWikiConfiguration } = await import("./wiki-runtime");
    const result = await matterWikiConfiguration.exportFile();
    expect(result).toEqual({ ok: true, bytes: fakeBytes, fileName: "matter-wiki.bin" });
  });
});
