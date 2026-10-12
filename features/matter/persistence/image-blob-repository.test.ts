import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createImageBlobRepository,
  type ImageBlobDatabaseHandle,
  type ImageBlobRepository,
} from "./image-blob-repository";
import { MAX_IMAGE_POINTER_BYTES, type ImagePointer } from "../tree/image-pointer";

const STORED_AT = "2026-10-12T00:00:00.000Z";

describe("image blob repository", () => {
  let database: MemoryBlobDatabase;
  let open: ReturnType<typeof vi.fn>;
  let repository: ImageBlobRepository;

  beforeEach(() => {
    database = new MemoryBlobDatabase();
    open = vi.fn(async () => database);
    const handle: ImageBlobDatabaseHandle = { open: open as never };
    repository = createImageBlobRepository(handle, () => STORED_AT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("storing and reading", () => {
    it("round-trips the exact bytes with the pointer that names them", async () => {
      const { pointer, bytes } = picture(1);

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: true, value: "written" });

      const read = await repository.getImageBlob(pointer.contentHash);
      if (!read.ok || read.value.status !== "found") throw new Error("blob expected");
      expect(read.value.blob.pointer).toEqual(pointer);
      expect(read.value.blob.storedAt).toBe(STORED_AT);
      expect(new Uint8Array(read.value.blob.bytes)).toEqual(new Uint8Array(bytes));
    });

    it("stores one row per hash, with exactly the documented fields", async () => {
      const { pointer, bytes } = picture(1);
      await repository.putImageBlob(pointer, bytes);

      expect(database.rows()).toHaveLength(1);
      const row = database.row(pointer.contentHash)!;
      expect(Object.keys(row).sort()).toEqual([
        "byteLength", "bytes", "contentHash", "height", "mediaType", "storageSchemaVersion", "storedAt", "width",
      ]);
      expect(row).toMatchObject({
        storageSchemaVersion: 1,
        contentHash: pointer.contentHash,
        byteLength: pointer.byteLength,
        mediaType: "image/png",
        width: 512,
        height: 384,
        storedAt: STORED_AT,
      });
      expect(Object.prototype.toString.call(row.bytes)).toBe("[object ArrayBuffer]");
    });

    it("reports absent for a hash it never stored", async () => {
      const hash = picture(1).pointer.contentHash;

      await expect(repository.getImageBlob(hash)).resolves.toEqual({ ok: true, value: { status: "absent" } });
    });

    it("lists the hash of every stored blob", async () => {
      await expect(repository.listImageBlobHashes()).resolves.toEqual({ ok: true, value: [] });
      const first = picture(1);
      const second = picture(2);
      await repository.putImageBlob(second.pointer, second.bytes);
      await repository.putImageBlob(first.pointer, first.bytes);

      const listed = await repository.listImageBlobHashes();
      if (!listed.ok) throw new Error(listed.code);
      expect([...listed.value].sort()).toEqual([first.pointer.contentHash, second.pointer.contentHash].sort());
    });

    it("treats a second put of the same hash as a no-op success", async () => {
      const { pointer, bytes } = picture(1);
      await repository.putImageBlob(pointer, bytes);
      database.puts = 0;

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: true, value: "present" });

      expect(database.puts).toBe(0);
      expect(database.rows()).toHaveLength(1);
    });

    it("stores what the caller handed over even if the caller reuses the buffer at once", async () => {
      const { pointer, bytes } = picture(1);
      const original = new Uint8Array(bytes).slice();

      const pending = repository.putImageBlob(pointer, bytes);
      new Uint8Array(bytes).fill(0);

      await expect(pending).resolves.toEqual({ ok: true, value: "written" });
      expect(new Uint8Array(database.row(pointer.contentHash)!.bytes as ArrayBuffer)).toEqual(original);
    });
  });

  describe("verification before any write", () => {
    const refused = async (pointer: unknown, bytes: unknown) => {
      await expect(repository.putImageBlob(pointer as ImagePointer, bytes as ArrayBuffer))
        .resolves.toEqual({ ok: false, code: "REJECTED" });
      expect(open).not.toHaveBeenCalled();
      expect(database.puts).toBe(0);
      expect(database.rows()).toEqual([]);
    };

    it("refuses bytes that do not hash to the pointer", async () => {
      const { pointer, bytes } = picture(1);
      const tampered = bytes.slice(0);
      new Uint8Array(tampered)[10] ^= 0xff;

      await refused(pointer, tampered);
      await refused({ ...pointer, contentHash: picture(2).pointer.contentHash }, bytes);
    });

    it("refuses bytes whose length differs from the pointer", async () => {
      const { pointer, bytes } = picture(1);

      await refused({ ...pointer, byteLength: pointer.byteLength + 1 }, bytes);
      await refused({ ...pointer, byteLength: pointer.byteLength - 1 }, bytes);
      await refused(pointer, bytes.slice(0, pointer.byteLength - 1));
      await refused(pointer, new ArrayBuffer(0));
    });

    it("refuses an oversize image even when pointer and bytes agree", async () => {
      const bytes = png(512, 384, new Uint8Array(MAX_IMAGE_POINTER_BYTES + 1 - 45));
      const pointer = pointerFor(bytes);

      await refused(pointer, bytes);
    });

    it("accepts an image of exactly the maximum size", async () => {
      const bytes = png(512, 384, new Uint8Array(MAX_IMAGE_POINTER_BYTES - 45));
      const pointer = pointerFor(bytes);
      expect(bytes.byteLength).toBe(MAX_IMAGE_POINTER_BYTES);

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: true, value: "written" });
    });

    it("refuses bytes that hash to the pointer but are not the picture it describes", async () => {
      const { bytes } = picture(1);
      const notAnImage = fillerOf(300, 5).buffer;
      const cutShort = bytes.slice(0, bytes.byteLength - 12);

      await refused(pointerFor(notAnImage), notAnImage);
      await refused(pointerFor(cutShort), cutShort);
      await refused(pointerFor(bytes, { width: 513 }), bytes);
      await refused(pointerFor(bytes, { height: 385 }), bytes);
      await refused(pointerFor(bytes, { mediaType: "image/jpeg" }), bytes);
    });

    it("refuses a content hash that is not 64 lowercase hex digits", async () => {
      const { pointer, bytes } = picture(1);

      for (const contentHash of [
        pointer.contentHash.toUpperCase(),
        pointer.contentHash.slice(1),
        `${pointer.contentHash}0`,
        `g${pointer.contentHash.slice(1)}`,
        "",
      ]) await refused({ ...pointer, contentHash }, bytes);
    });

    it("refuses a pointer that fails the pointer contract", async () => {
      const { pointer, bytes } = picture(1);

      await refused({ ...pointer, mediaType: "image/gif" }, bytes);
      await refused({ ...pointer, width: 100 }, bytes);
      await refused({ ...pointer, height: 5_000 }, bytes);
      await refused({ ...pointer, extra: true }, bytes);
      await refused(null, bytes);
      await refused("pointer", bytes);
    });

    it("refuses anything that is not an ArrayBuffer", async () => {
      const { pointer, bytes } = picture(1);

      await refused(pointer, new Uint8Array(bytes));
      await refused(pointer, Buffer.from(bytes));
      await refused(pointer, null);
      await refused(pointer, undefined);
    });

    it("refuses a malformed hash on read without opening storage", async () => {
      for (const hash of ["", "ab", "A".repeat(64), "g".repeat(64), 7, null]) {
        await expect(repository.getImageBlob(hash as string)).resolves.toEqual({ ok: false, code: "REJECTED" });
      }
      expect(open).not.toHaveBeenCalled();
    });

    it("never stores bytes it could not verify when no digest is available", async () => {
      vi.stubGlobal("crypto", {});
      const { pointer, bytes } = picture(1);

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({
        ok: false,
        code: "STORAGE_UNAVAILABLE",
      });
      expect(open).not.toHaveBeenCalled();
      expect(database.puts).toBe(0);
    });
  });

  describe("damage", () => {
    it("reports a row whose bytes do not match its byte count as damaged, never absent", async () => {
      const { pointer, bytes } = picture(1);
      await repository.putImageBlob(pointer, bytes);
      database.mutate(pointer.contentHash, (row) => ({ ...row, bytes: bytes.slice(0, 40) }));

      await expect(repository.getImageBlob(pointer.contentHash)).resolves.toEqual({
        ok: true,
        value: { status: "damaged" },
      });
    });

    it("reports every other broken row shape as damaged", async () => {
      const { pointer, bytes } = picture(1);
      await repository.putImageBlob(pointer, bytes);
      const intact = database.row(pointer.contentHash)!;
      const broken: readonly (readonly [string, (row: Record<string, unknown>) => unknown])[] = [
        ["bytes missing", (row) => omit(row, "bytes")],
        ["bytes not a buffer", (row) => ({ ...row, bytes: new Uint8Array(bytes) })],
        ["byteLength changed", (row) => ({ ...row, byteLength: pointer.byteLength + 1 })],
        ["media type unknown", (row) => ({ ...row, mediaType: "image/gif" })],
        ["width out of bounds", (row) => ({ ...row, width: 1 })],
        ["key and hash disagree", (row) => ({ ...row, contentHash: picture(2).pointer.contentHash })],
        ["storedAt missing", (row) => omit(row, "storedAt")],
        ["stamp unknown", (row) => ({ ...row, storageSchemaVersion: 0 })],
        ["not a record", () => "not a row"],
      ];

      for (const [label, change] of broken) {
        database.seed(intact);
        database.mutate(pointer.contentHash, change as never);
        await expect(repository.getImageBlob(pointer.contentHash), label)
          .resolves.toEqual({ ok: true, value: { status: "damaged" } });
      }
    });

    it("rewrites a damaged row from verified bytes", async () => {
      const { pointer, bytes } = picture(1);
      await repository.putImageBlob(pointer, bytes);
      database.mutate(pointer.contentHash, (row) => ({ ...row, bytes: new ArrayBuffer(3) }));

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: true, value: "written" });

      const read = await repository.getImageBlob(pointer.contentHash);
      expect(read).toMatchObject({ ok: true, value: { status: "found" } });
    });
  });

  describe("a newer build's row", () => {
    it("is superseded for get and put, and is never overwritten", async () => {
      const { pointer, bytes } = picture(1);
      database.seed({ contentHash: pointer.contentHash, storageSchemaVersion: 2, layout: "from a newer build" });
      const before = database.rows();

      await expect(repository.getImageBlob(pointer.contentHash)).resolves.toEqual({ ok: false, code: "SUPERSEDED" });
      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: false, code: "SUPERSEDED" });

      expect(database.rows()).toEqual(before);
    });

    it("is superseded when the database itself is newer", async () => {
      const error = new Error("A newer Matter schema owns this database.");
      error.name = "MatterDatabaseSupersededError";
      open.mockRejectedValue(error);
      const { pointer, bytes } = picture(1);

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: false, code: "SUPERSEDED" });
      await expect(repository.getImageBlob(pointer.contentHash)).resolves.toEqual({ ok: false, code: "SUPERSEDED" });
      await expect(repository.listImageBlobHashes()).resolves.toEqual({ ok: false, code: "SUPERSEDED" });
    });
  });

  describe("storage failures", () => {
    it("maps a quota refusal on the request, on the commit, and WebKit's full disk to STORAGE_FULL", async () => {
      const { pointer, bytes } = picture(1);
      const quota = () => new DOMException("quota", "QuotaExceededError");

      database.failPut = quota();
      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: false, code: "STORAGE_FULL" });

      database.failPut = null;
      database.failCommit = quota();
      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: false, code: "STORAGE_FULL" });

      database.failCommit = null;
      database.failPut = new DOMException("The disk is full.", "UnknownError");
      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: false, code: "STORAGE_FULL" });

      expect(database.rows()).toEqual([]);
    });

    it("reads a quota abort that only the transaction reports", async () => {
      const { pointer, bytes } = picture(1);
      database.failCommit = new Error("aborted");
      database.transactionError = new DOMException("quota", "QuotaExceededError");

      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({ ok: false, code: "STORAGE_FULL" });
    });

    it("maps any other failure to STORAGE_UNAVAILABLE and writes nothing", async () => {
      const { pointer, bytes } = picture(1);

      database.failPut = new DOMException("denied", "SecurityError");
      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({
        ok: false,
        code: "STORAGE_UNAVAILABLE",
      });
      database.failPut = null;
      open.mockRejectedValueOnce(new Error("blocked"));
      await expect(repository.putImageBlob(pointer, bytes)).resolves.toEqual({
        ok: false,
        code: "STORAGE_UNAVAILABLE",
      });
      open.mockRejectedValueOnce(new Error("blocked"));
      await expect(repository.getImageBlob(pointer.contentHash)).resolves.toEqual({
        ok: false,
        code: "STORAGE_UNAVAILABLE",
      });
      open.mockRejectedValueOnce(new Error("blocked"));
      await expect(repository.listImageBlobHashes()).resolves.toEqual({ ok: false, code: "STORAGE_UNAVAILABLE" });
      expect(database.rows()).toEqual([]);
    });

    it("does not leave an unhandled rejection when a failed request aborts its transaction", async () => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const { pointer, bytes } = picture(1);
      database.failPut = new DOMException("quota", "QuotaExceededError");

      await repository.putImageBlob(pointer, bytes);
      await new Promise((resolve) => setTimeout(resolve, 10));
      process.off("unhandledRejection", unhandled);

      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});

/** A structurally valid PNG: signature, IHDR, `filler` payload bytes, and the closing IEND. */
function png(width: number, height: number, filler: Uint8Array): ArrayBuffer {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const end = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  return Uint8Array.from([...header, ...filler, ...end]).buffer;
}

function fillerOf(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const filler = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) filler[index] = (index * 31 + seed * 17) % 251;
  return filler;
}

function picture(seed: number): { pointer: ImagePointer; bytes: ArrayBuffer } {
  const bytes = png(512, 384, fillerOf(300, seed));
  return { pointer: pointerFor(bytes), bytes };
}

function pointerFor(bytes: ArrayBuffer, overrides: Partial<ImagePointer> = {}): ImagePointer {
  return {
    mediaType: "image/png",
    byteLength: bytes.byteLength,
    width: 512,
    height: 384,
    contentHash: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    ...overrides,
  };
}

type Row = Record<string, unknown>;

function omit(row: Row, key: string): Row {
  return Object.fromEntries(Object.entries(row).filter(([name]) => name !== key));
}

/**
 * The part of IndexedDB the repository uses: structured clones, writes that
 * land only when the transaction commits, and a commit that can be refused.
 */
class MemoryBlobDatabase {
  puts = 0;
  failPut: unknown = null;
  failCommit: unknown = null;
  transactionError: DOMException | null = null;
  private readonly store = new Map<string, Row>();

  transaction(name: string, mode: "readonly" | "readwrite") {
    if (name !== "blobs") throw new DOMException("store outside transaction", "NotFoundError");
    const staged = new Map<string, Row>();
    const committed = this.store;
    const injected = () => ({ put: this.failPut, commit: this.failCommit, error: this.transactionError });
    const counted = () => { this.puts += 1; };
    let settle!: { resolve: () => void; reject: (reason: unknown) => void };
    const done = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    const transaction = {
      error: null as DOMException | null,
      done,
      store: {
        get: async (key: string) => {
          const value = staged.get(key) ?? committed.get(key);
          return value === undefined ? undefined : structuredClone(value);
        },
        put: async (value: Row) => {
          if (mode !== "readwrite") throw new DOMException("read-only", "ReadOnlyError");
          const { put, error } = injected();
          if (put !== null) {
            transaction.error = error;
            settle.reject(put);
            throw put;
          }
          counted();
          staged.set(value.contentHash as string, structuredClone(value));
          return value.contentHash;
        },
        getAllKeys: async () => [...committed.keys()],
      },
    };
    setTimeout(() => {
      const { commit, error } = injected();
      if (commit !== null && mode === "readwrite") {
        transaction.error = error;
        settle.reject(commit);
        return;
      }
      for (const [key, value] of staged) committed.set(key, value);
      settle.resolve();
    }, 0);
    return transaction;
  }

  rows(): Row[] {
    return [...this.store.values()];
  }

  row(hash: string): Row | undefined {
    return this.store.get(hash);
  }

  seed(row: Row) {
    this.store.set(row.contentHash as string, row);
  }

  mutate(hash: string, change: (row: Row) => unknown) {
    this.store.set(hash, change(this.store.get(hash)!) as Row);
  }
}

// The handle can open a transaction on `blobs` and nothing else: the type, not
// a convention, keeps this module away from the Wiki store.
async function neverRun(handle: ImageBlobDatabaseHandle): Promise<void> {
  const database = await handle.open();
  database.transaction("blobs", "readonly");
  // @ts-expect-error `wiki` is not a store this handle can open.
  database.transaction("wiki", "readonly");
}
void neverRun;
