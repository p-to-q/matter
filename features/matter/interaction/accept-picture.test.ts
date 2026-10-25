import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ImageBlobFailureCode, ImageBlobRepository } from "../persistence/image-blob-repository";
import type { GeneratedPicture } from "../runtime/picture-turn";
import { applyTreeCommand } from "../tree/engine";
import type { ImagePointer } from "../tree/image-pointer";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import {
  acceptPicture,
  type AcceptPictureInput,
  type PictureCommit,
  type ReplaceImageMutation,
} from "./accept-picture";
import { createPictureSessionCache, type PictureSessionCache } from "./picture-session-cache";

const T0 = "2026-10-12T00:00:00.000Z";

describe("acceptPicture", () => {
  describe("the order is the invariant", () => {
    it("holds the bytes durably before the tree is asked to name them", async () => {
      const harness = createHarness();
      await acceptPicture(harness.input());
      expect(harness.calls).toEqual(["put-blob", "commit"]);
    });

    it("does not call commit while the blob write is still pending", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const harness = createHarness({ blob: async () => { await gate; return { ok: true, value: "written" }; } });

      const accepting = acceptPicture(harness.input());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(harness.calls).toEqual(["put-blob"]);
      expect(harness.commit).not.toHaveBeenCalled();

      release();
      await expect(accepting).resolves.toEqual({ ok: true });
      expect(harness.calls).toEqual(["put-blob", "commit"]);
    });

    it.each(["written", "present"] as const)("commits when the blob is %s", async (value) => {
      const harness = createHarness({ blob: async () => ({ ok: true, value }) });
      await expect(acceptPicture(harness.input())).resolves.toEqual({ ok: true });
      expect(harness.commit).toHaveBeenCalledOnce();
    });
  });

  describe("what is written and committed", () => {
    it("writes the pointer and an exact copy of the bytes as an ArrayBuffer", async () => {
      const harness = createHarness();
      const held = picture(1, 300);
      await acceptPicture(harness.input({ picture: held }));

      const [pointer, buffer] = harness.put.mock.calls[0]!;
      expect(pointer).toEqual(held.pointer);
      expect(Object.prototype.toString.call(buffer)).toBe("[object ArrayBuffer]");
      expect(buffer.byteLength).toBe(300);
      expect(Buffer.from(buffer).equals(Buffer.from(held.bytes))).toBe(true);
      expect(buffer).not.toBe(held.bytes.buffer);
    });

    it("copies only the picture's own bytes when they are a view into a larger buffer", async () => {
      const harness = createHarness();
      const held = picture(1, 300);
      const arena = new Uint8Array(1000);
      arena.set(held.bytes, 400);
      const view = arena.subarray(400, 700);
      await acceptPicture(harness.input({ picture: { bytes: view, pointer: held.pointer } }));

      const buffer = harness.put.mock.calls[0]![1];
      expect(buffer.byteLength).toBe(300);
      expect(Buffer.from(buffer).equals(Buffer.from(held.bytes))).toBe(true);
    });

    it("hands the repository bytes the caller can no longer change", async () => {
      const harness = createHarness();
      const held = picture(1, 300);
      const expected = held.bytes.slice();
      await acceptPicture(harness.input({ picture: held }));
      held.bytes.fill(0);
      expect(Buffer.from(harness.put.mock.calls[0]![1]).equals(Buffer.from(expected))).toBe(true);
    });

    it("attaches a first picture: expectedImage is null", async () => {
      const harness = createHarness();
      const held = picture(1, 300);
      await acceptPicture(harness.input({ picture: held, expectedImage: null }));
      expect(harness.commit).toHaveBeenCalledWith({
        type: "replace-image",
        nodeId: "node-1",
        expectedUpdatedAt: T0,
        expectedImage: null,
        image: held.pointer,
      });
    });

    it("replaces an existing picture: expectedImage is the pointer the node carries", async () => {
      const harness = createHarness();
      const held = picture(2, 300);
      const current = picture(1, 300).pointer;
      await acceptPicture(harness.input({ picture: held, expectedImage: current }));
      expect(harness.commit).toHaveBeenCalledWith({
        type: "replace-image",
        nodeId: "node-1",
        expectedUpdatedAt: T0,
        expectedImage: current,
        image: held.pointer,
      });
    });

    it("builds a mutation the tree engine accepts, for attach, replace, and its exact inverse", async () => {
      const first = picture(1, 300);
      const second = picture(2, 300);
      let tree = treeWith(null);
      const commit: PictureCommit = (mutation) => {
        const result = applyTreeCommand(tree, {
          id: `c${tree.revision}`,
          source: "human",
          expectedTreeId: tree.id,
          expectedRevision: tree.revision,
          mutation,
          createdAt: T0,
        });
        if (!result.ok) return "stale";
        tree = result.tree;
        return "committed";
      };

      const harness = createHarness({ commit });
      await expect(acceptPicture(harness.input({ picture: first, expectedImage: null, commit }))).resolves.toEqual({ ok: true });
      expect(tree.nodes["node-1"]!.image).toEqual(first.pointer);
      await expect(acceptPicture(harness.input({
        picture: second, expectedImage: first.pointer, commit,
      }))).resolves.toEqual({ ok: true });
      expect(tree.nodes["node-1"]!.image).toEqual(second.pointer);
      expect(tree.nodes["node-1"]!.updatedAt).toBe(T0);
    });
  });

  describe("the bytes cannot be made durable", () => {
    it.each<ImageBlobFailureCode>(["STORAGE_FULL", "STORAGE_UNAVAILABLE"])(
      "%s keeps the bytes for this session and commits nothing",
      async (code) => {
        const harness = createHarness({ blob: async () => ({ ok: false, code }) });
        const held = picture(1, 300);

        const result = await acceptPicture(harness.input({ picture: held }));

        expect(result).toEqual({ ok: false, reason: "not-saved", keptInSession: true });
        expect(harness.commit).not.toHaveBeenCalled();
        const kept = harness.cache.get(held.pointer.contentHash)!;
        expect(kept.pointer).toEqual(held.pointer);
        expect(Buffer.from(kept.bytes).equals(Buffer.from(held.bytes))).toBe(true);
      },
    );

    it("lets the same picture be kept again at no cost once storage recovers", async () => {
      let healthy = false;
      const harness = createHarness({
        blob: async () => healthy ? { ok: true, value: "written" } : { ok: false, code: "STORAGE_FULL" },
      });
      const held = picture(1, 300);

      expect(await acceptPicture(harness.input({ picture: held }))).toMatchObject({ ok: false, reason: "not-saved" });
      healthy = true;
      expect(await acceptPicture(harness.input({ picture: held }))).toEqual({ ok: true });
      expect(harness.commit).toHaveBeenCalledOnce();
      expect(harness.put).toHaveBeenCalledTimes(2);
    });

    it("says so when even the session could not keep the bytes", async () => {
      const refusing: PictureSessionCache = { ...createPictureSessionCache(), putBatchIfRoom: () => false };
      const harness = createHarness({ blob: async () => ({ ok: false, code: "STORAGE_FULL" }) });
      const result = await acceptPicture(harness.input({ cache: refusing }));
      expect(result).toEqual({ ok: false, reason: "not-saved", keptInSession: false });
    });

    it.each<[ImageBlobFailureCode, string]>([
      ["REJECTED", "blob-rejected"],
      ["SUPERSEDED", "blob-superseded"],
    ])("%s is %s: nothing committed and nothing cached", async (code, reason) => {
      const harness = createHarness({ blob: async () => ({ ok: false, code }) });
      const held = picture(1, 300);
      const result = await acceptPicture(harness.input({ picture: held }));
      expect(result).toEqual({ ok: false, reason });
      expect(harness.commit).not.toHaveBeenCalled();
      expect(harness.cache.has(held.pointer.contentHash)).toBe(false);
    });
  });

  describe("the commit fails after the bytes are held", () => {
    it("reports stale, leaves the blob alone, and does not cache", async () => {
      const harness = createHarness({ commit: () => "stale" });
      const held = picture(1, 300);

      const result = await acceptPicture(harness.input({ picture: held }));

      expect(result).toEqual({ ok: false, reason: "stale" });
      expect(harness.put).toHaveBeenCalledOnce();
      expect(harness.untouched).toEqual([]);
      expect(harness.cache.has(held.pointer.contentHash)).toBe(false);
    });

    it("reports a rejected commit apart from a stale one", async () => {
      const harness = createHarness({ commit: () => "rejected" });
      await expect(acceptPicture(harness.input())).resolves.toEqual({ ok: false, reason: "commit-rejected" });
      expect(harness.cache.snapshot().size).toBe(0);
    });
  });

  describe("success", () => {
    it("does not evict another passage's only bytes while warming a durable Keep", async () => {
      const old = picture(1, 300);
      const incoming = picture(2, 300);
      const cache = createPictureSessionCache({ maxEntries: 1, maxBytes: 300 });
      cache.put(old);
      const harness = createHarness();
      expect(await acceptPicture(harness.input({ picture: incoming, cache }))).toEqual({ ok: true });
      expect(harness.commit).toHaveBeenCalledOnce();
      expect(cache.get(old.pointer.contentHash)?.bytes).toEqual(old.bytes);
      expect(cache.has(incoming.pointer.contentHash)).toBe(false);
    });

    it("truthfully refuses failed Keep retention rather than evicting current material", async () => {
      const old = picture(1, 300);
      const incoming = picture(2, 300);
      const cache = createPictureSessionCache({ maxEntries: 1, maxBytes: 300 });
      cache.put(old);
      const harness = createHarness({ blob: async () => ({ ok: false, code: "STORAGE_FULL" }) });
      expect(await acceptPicture(harness.input({ picture: incoming, cache })))
        .toEqual({ ok: false, reason: "not-saved", keptInSession: false });
      expect(harness.commit).not.toHaveBeenCalled();
      expect(cache.get(old.pointer.contentHash)?.bytes).toEqual(old.bytes);
    });

    it("mirrors the accepted bytes into the session cache for export", async () => {
      const harness = createHarness();
      const held = picture(1, 300);
      await acceptPicture(harness.input({ picture: held }));
      expect(harness.cache.has(held.pointer.contentHash)).toBe(true);
      const exported = harness.cache.snapshot().get(held.pointer.contentHash)!;
      expect(Buffer.from(exported).equals(Buffer.from(held.bytes))).toBe(true);
    });

    it("caches only after the commit has succeeded", async () => {
      const harness = createHarness();
      const held = picture(1, 300);
      const during: boolean[] = [];
      harness.commit.mockImplementation(() => {
        during.push(harness.cache.has(held.pointer.contentHash));
        return "committed";
      });
      await acceptPicture(harness.input({ picture: held }));
      expect(during).toEqual([false]);
    });
  });
});

function createHarness(overrides: Readonly<{
  blob?: () => Promise<{ ok: true; value: "written" | "present" } | { ok: false; code: ImageBlobFailureCode }>;
  commit?: PictureCommit;
}> = {}) {
  const calls: string[] = [];
  const blob = overrides.blob ?? (async () => ({ ok: true as const, value: "written" as const }));
  const put = vi.fn(async (pointer: ImagePointer, bytes: ArrayBuffer) => {
    void pointer; void bytes;
    calls.push("put-blob");
    return blob();
  });
  const other = {
    getImageBlob: vi.fn(),
    listImageBlobHashes: vi.fn(),
  };
  const commit = vi.fn((mutation: ReplaceImageMutation) => {
    calls.push("commit");
    return (overrides.commit ?? (() => "committed" as const))(mutation);
  });
  const cache = createPictureSessionCache();
  const blobRepository = { putImageBlob: put, ...other } as unknown as ImageBlobRepository;
  return {
    calls,
    put,
    commit,
    cache,
    // Any call to a method Keep must not use lands here.
    get untouched() {
      return Object.entries(other).flatMap(([name, spy]) => spy.mock.calls.length > 0 ? [name] : []);
    },
    input(overrides: Partial<AcceptPictureInput> = {}): AcceptPictureInput {
      return {
        picture: picture(1, 300),
        nodeId: "node-1",
        expectedUpdatedAt: T0,
        expectedImage: null,
        blobRepository,
        commit,
        cache,
        ...overrides,
      };
    },
  };
}

function picture(seed: number, length: number): GeneratedPicture {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = (index * 31 + seed * 17 + length) % 251;
  return {
    bytes,
    pointer: {
      mediaType: "image/png",
      byteLength: length,
      width: 512,
      height: 384,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function treeWith(image: ImagePointer | null): ThoughtTree {
  return {
    ...createEmptyTree("tree-1", 3),
    rootId: "doc",
    nodes: {
      doc: { id: "doc", text: "", parentId: null, children: ["node-1"], createdAt: T0, updatedAt: T0, role: "document-root" },
      "node-1": {
        id: "node-1", text: "a passage", parentId: "doc", children: [], createdAt: T0, updatedAt: T0,
        ...(image === null ? {} : { image }),
      },
    },
  };
}
