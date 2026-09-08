import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbLabelRepository } from "./label-repository";

vi.mock("idb", () => ({ openDB: vi.fn() }));

describe("IndexedDB label repository Unicode boundary", () => {
  beforeEach(() => vi.mocked(openDB).mockReset());

  it("accepts astral labels and rejects lone surrogates before opening storage", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    vi.mocked(openDB).mockResolvedValue({ put } as never);
    const repository = createIndexedDbLabelRepository();
    const base = {
      nodeId: "node_1",
      origin: "user" as const,
      basis: null,
      updatedAt: "2026-09-08T00:00:00.000Z",
    };

    await expect(repository.put("tree_1", { ...base, label: "思想🚀生长" }))
      .resolves.toEqual({ ok: true });
    for (const label of ["bad\uD800label", "bad\uDC00label"]) {
      await expect(repository.put("tree_1", { ...base, label }))
        .resolves.toEqual({ ok: false, code: "REJECTED" });
    }
    expect(put).toHaveBeenCalledTimes(1);

    await expect(repository.put("tree_1", {
      ...base,
      label: "valid model label",
      origin: "model",
      basis: "bad\uD800basis",
    })).resolves.toEqual({ ok: false, code: "REJECTED" });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("drops malformed restored labels and model bases whole", async () => {
    const base = {
      storageSchemaVersion: 1,
      key: "tree_1 node_1",
      treeId: "tree_1",
      nodeId: "node_1",
      origin: "model" as const,
      updatedAt: "2026-09-08T00:00:00.000Z",
    };
    const getAllFromIndex = vi.fn().mockResolvedValue([
      { ...base, label: "思想🚀生长", basis: "abcdef1234" },
      { ...base, nodeId: "node_2", label: "bad\uD800label", basis: "abcdef1234" },
      { ...base, nodeId: "node_3", label: "valid label", basis: "bad\uDC00basis" },
    ]);
    vi.mocked(openDB).mockResolvedValue({ getAllFromIndex } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.loadAll("tree_1")).resolves.toEqual([
      expect.objectContaining({ nodeId: "node_1", label: "思想🚀生长" }),
    ]);
  });
});
