import { describe, expect, it, vi } from "vitest";
import type { LabelRepository } from "./label-repository";
import { createLazyLabelRepository } from "./lazy-label-repository";

function fakeRepository(): LabelRepository {
  return {
    loadAll: vi.fn(async () => Object.freeze([])),
    put: vi.fn(async () => Object.freeze({ ok: true as const })),
    remove: vi.fn(async () => Object.freeze({ ok: true as const })),
    clear: vi.fn(async () => undefined),
    close: vi.fn(),
  };
}

describe("lazy label repository", () => {
  it("loads once on first work and forwards every later operation", async () => {
    const loaded = fakeRepository();
    const load = vi.fn(async () => loaded);
    const repository = createLazyLabelRepository(load);

    await repository.loadAll("tree_1", ["node_1"]);
    await repository.put("tree_1", {
      nodeId: "node_1",
      label: "Name",
      origin: "user",
      basis: null,
      updatedAt: "2026-09-09T00:00:00.000Z",
    });

    expect(load).toHaveBeenCalledOnce();
    expect(loaded.loadAll).toHaveBeenCalledExactlyOnceWith("tree_1", ["node_1"]);
    expect(loaded.put).toHaveBeenCalledOnce();
  });

  it("shares an in-flight load and retries a transient loader failure", async () => {
    const loaded = fakeRepository();
    let attempts = 0;
    const load = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("chunk unavailable");
      return loaded;
    });
    const repository = createLazyLabelRepository(load);

    await expect(Promise.all([
      repository.loadAll("tree_1", ["node_1"]),
      repository.loadAll("tree_1", ["node_1"]),
    ])).resolves.toEqual([[], []]);
    expect(load).toHaveBeenCalledOnce();
    await expect(repository.put("tree_1", {
      nodeId: "node_1",
      label: "Name",
      origin: "user",
      basis: null,
      updatedAt: "2026-09-09T00:00:00.000Z",
    })).resolves.toEqual({ ok: true });
    expect(load).toHaveBeenCalledTimes(2);
    expect(loaded.put).toHaveBeenCalledOnce();
  });

  it("closes a load that settles after its owner and fails closed", async () => {
    const loaded = fakeRepository();
    let resolveLoad: ((repository: LabelRepository) => void) | undefined;
    const load = vi.fn(() => new Promise<LabelRepository>((resolve) => {
      resolveLoad = resolve;
    }));
    const repository = createLazyLabelRepository(load);
    const pending = repository.loadAll("tree_1", ["node_1"]);

    repository.close();
    resolveLoad?.(loaded);

    await expect(pending).resolves.toEqual([]);
    expect(loaded.close).toHaveBeenCalledOnce();
    await expect(repository.put("tree_1", {
      nodeId: "node_1",
      label: "Name",
      origin: "user",
      basis: null,
      updatedAt: "2026-09-09T00:00:00.000Z",
    })).resolves.toEqual({ ok: false, code: "STORAGE_UNAVAILABLE" });
  });

  it("turns loader failure into the repository's best-effort receipts", async () => {
    const repository = createLazyLabelRepository(async () => {
      throw new Error("chunk unavailable");
    });

    await expect(repository.loadAll("tree_1", ["node_1"])).resolves.toEqual([]);
    await expect(repository.remove("tree_1", ["node_1"])).resolves.toEqual({
      ok: false,
      code: "STORAGE_UNAVAILABLE",
    });
    await expect(repository.clear("tree_1")).resolves.toBeUndefined();
  });
});
