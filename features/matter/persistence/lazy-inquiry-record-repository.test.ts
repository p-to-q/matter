import { describe, expect, it, vi } from "vitest";
import type { InquiryRecordRepository } from "./inquiry-record-repository";
import { inquiryRecordVersion } from "./inquiry-record-policy";
import { createLazyInquiryRecordRepository } from "./lazy-inquiry-record-repository";

function fakeRepository(): InquiryRecordRepository {
  return {
    load: vi.fn(async () => Object.freeze({ ok: true as const, value: null })),
    save: vi.fn(async () => Object.freeze({ ok: true as const, value: inquiryRecordVersion(null) })),
    clear: vi.fn(async () => Object.freeze({ ok: true as const, value: inquiryRecordVersion(null) })),
    close: vi.fn(),
  };
}

describe("lazy Ask Matter record repository", () => {
  it("loads the store once on first work and forwards every operation", async () => {
    const loaded = fakeRepository();
    const load = vi.fn(async () => loaded);
    const repository = createLazyInquiryRecordRepository(load);

    await Promise.all([repository.load("tree_1"), repository.load("tree_1")]);
    await repository.clear("tree_1", inquiryRecordVersion(null));

    expect(load).toHaveBeenCalledOnce();
    expect(loaded.load).toHaveBeenCalledTimes(2);
    expect(loaded.clear).toHaveBeenCalledExactlyOnceWith("tree_1", inquiryRecordVersion(null));
  });

  it("reads a chunk that cannot load as unavailable storage and fetches it again next time", async () => {
    const loaded = fakeRepository();
    let attempts = 0;
    const load = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("chunk unavailable");
      return loaded;
    });
    const repository = createLazyInquiryRecordRepository(load);

    await expect(repository.load("tree_1")).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE" },
    });
    await expect(repository.load("tree_1")).resolves.toEqual({ ok: true, value: null });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("closes the store's connection like the store itself, leaving later work possible", async () => {
    const loaded = fakeRepository();
    let release: (() => void) | null = null;
    const load = vi.fn(() => new Promise<InquiryRecordRepository>((resolve) => {
      release = () => resolve(loaded);
    }));
    const repository = createLazyInquiryRecordRepository(load);

    const pending = repository.load("tree_1");
    repository.close();
    release!();

    await expect(pending).resolves.toEqual({ ok: true, value: null });
    expect(loaded.close).toHaveBeenCalledOnce();
    // The store reopens its connection for the next operation.
    await expect(repository.load("tree_1")).resolves.toEqual({ ok: true, value: null });
    expect(load).toHaveBeenCalledOnce();
  });
});
