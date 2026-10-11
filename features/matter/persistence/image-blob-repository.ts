import type { IDBPDatabase } from "idb";
import type { MatterDatabase, MatterDatabaseHandle, StoredImageBlob } from "./matter-database";
import { isQuotaError, SUPERSEDED_DATABASE_ERROR } from "./storage-errors";
import { isPlainRecord } from "./stored-value";
import { parseImagePointer, type ImagePointer } from "../tree/image-pointer";

/**
 * Durable storage for the bytes behind image pointers.
 *
 * A picture is not derived: nothing regenerates it, so a row here is never
 * evicted by cache pressure and is removed only by an explicit compaction of
 * hashes no document names. The document owns the pointer; this owns the
 * bytes, addressed by the SHA-256 the pointer carries.
 *
 * The database handle is injected rather than opened here. This module is held
 * to the same Wiki-free rule as the other persisted-material modules, and the
 * module that creates the handle also names the Wiki schema.
 */

export type ImageBlob = Readonly<{
  pointer: ImagePointer;
  bytes: ArrayBuffer;
  storedAt: string;
}>;

export type ImageBlobFailureCode =
  | "STORAGE_FULL"
  | "STORAGE_UNAVAILABLE"
  | "REJECTED"
  | "SUPERSEDED";

export type ImageBlobResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; code: ImageBlobFailureCode }>;

/** `damaged` is a row that exists but cannot be trusted; it is never `absent`. */
export type ImageBlobRead =
  | Readonly<{ status: "found"; blob: ImageBlob }>
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "damaged" }>;

export type ImageBlobRepository = Readonly<{
  /** Verifies the bytes against the pointer, then stores them; a held hash is a no-op. */
  putImageBlob(pointer: ImagePointer, bytes: ArrayBuffer): Promise<ImageBlobResult<"written" | "present">>;
  getImageBlob(contentHash: string): Promise<ImageBlobResult<ImageBlobRead>>;
  /** True only for an intact row, so a damaged one is rewritten by the next put. */
  hasImageBlob(contentHash: string): Promise<ImageBlobResult<boolean>>;
  listImageBlobHashes(): Promise<ImageBlobResult<readonly string[]>>;
}>;

const STORED_BLOB_SCHEMA_VERSION = 1;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

type TransactionLike = Readonly<{ error: DOMException | null; done: Promise<unknown> }>;

export function createImageBlobRepository(
  handle: MatterDatabaseHandle,
  now: () => string = () => new Date().toISOString(),
): ImageBlobRepository {
  const run = async <Value>(
    operation: (
      database: IDBPDatabase<MatterDatabase>,
      track: <Transaction extends TransactionLike>(transaction: Transaction) => Transaction,
    ) => Promise<ImageBlobResult<Value>>,
  ): Promise<ImageBlobResult<Value>> => {
    let transaction: TransactionLike | null = null;
    try {
      return await operation(await handle.open(), (tracked) => {
        transaction = tracked;
        // Observe completion before any request can reject, so a failed
        // request that aborts the transaction is not also unhandled.
        void tracked.done.catch(() => undefined);
        return tracked;
      });
    } catch (error) {
      return failed(classify(error, transaction));
    }
  };

  return Object.freeze({
    async putImageBlob(pointer, bytes) {
      const parsed = parseImagePointer(pointer);
      if (parsed === null || !isArrayBuffer(bytes) || bytes.byteLength !== parsed.byteLength) {
        return failed("REJECTED");
      }
      // The caller may reuse its buffer while the digest is pending.
      const owned = bytes.slice(0);
      let digest: string;
      try {
        digest = await sha256Hex(owned);
      } catch {
        // An insecure context has no digest; unverified bytes are never stored.
        return failed("STORAGE_UNAVAILABLE");
      }
      if (digest !== parsed.contentHash) return failed("REJECTED");
      const row: StoredImageBlob = Object.freeze({
        storageSchemaVersion: STORED_BLOB_SCHEMA_VERSION,
        contentHash: parsed.contentHash,
        byteLength: parsed.byteLength,
        mediaType: parsed.mediaType,
        width: parsed.width,
        height: parsed.height,
        bytes: owned,
        storedAt: now(),
      });
      return run(async (database, track) => {
        const transaction = track(database.transaction("blobs", "readwrite"));
        const existing: unknown = await transaction.store.get(parsed.contentHash);
        if (isNewerSchema(existing)) {
          await transaction.done;
          return failed("SUPERSEDED");
        }
        if (inspect(existing, parsed.contentHash).status === "found") {
          await transaction.done;
          return succeeded("present");
        }
        await transaction.store.put(row);
        await transaction.done;
        return succeeded("written");
      });
    },

    getImageBlob(contentHash) {
      if (!isContentHash(contentHash)) return Promise.resolve(failed("REJECTED"));
      return run(async (database, track) => {
        const transaction = track(database.transaction("blobs", "readonly"));
        const stored: unknown = await transaction.store.get(contentHash);
        await transaction.done;
        return isNewerSchema(stored) ? failed("SUPERSEDED") : succeeded(inspect(stored, contentHash));
      });
    },

    hasImageBlob(contentHash) {
      if (!isContentHash(contentHash)) return Promise.resolve(failed("REJECTED"));
      return run(async (database, track) => {
        const transaction = track(database.transaction("blobs", "readonly"));
        const stored: unknown = await transaction.store.get(contentHash);
        await transaction.done;
        return isNewerSchema(stored)
          ? failed("SUPERSEDED")
          : succeeded(inspect(stored, contentHash).status === "found");
      });
    },

    listImageBlobHashes() {
      return run(async (database, track) => {
        const transaction = track(database.transaction("blobs", "readonly"));
        const keys = await transaction.store.getAllKeys();
        await transaction.done;
        return succeeded(Object.freeze(keys.map(String)));
      });
    },
  });
}

/**
 * A row is trusted only when its key, metadata, and byte count agree. The hash
 * was verified when the bytes were written; re-hashing every read would spend
 * the budget the size check already protects.
 */
function inspect(stored: unknown, contentHash: string): ImageBlobRead {
  if (stored === undefined) return ABSENT;
  if (!isPlainRecord(stored) || stored.storageSchemaVersion !== STORED_BLOB_SCHEMA_VERSION) return DAMAGED;
  const pointer = parseImagePointer({
    mediaType: stored.mediaType,
    byteLength: stored.byteLength,
    width: stored.width,
    height: stored.height,
    contentHash: stored.contentHash,
  });
  if (
    pointer === null ||
    pointer.contentHash !== contentHash ||
    !isArrayBuffer(stored.bytes) ||
    stored.bytes.byteLength !== pointer.byteLength ||
    typeof stored.storedAt !== "string"
  ) return DAMAGED;
  return Object.freeze({
    status: "found",
    blob: Object.freeze({ pointer, bytes: stored.bytes, storedAt: stored.storedAt }),
  });
}

const ABSENT: ImageBlobRead = Object.freeze({ status: "absent" });
const DAMAGED: ImageBlobRead = Object.freeze({ status: "damaged" });

/** A row from a newer build is valid material this build cannot read, not damage. */
function isNewerSchema(stored: unknown): boolean {
  return isPlainRecord(stored) &&
    Number.isSafeInteger(stored.storageSchemaVersion) &&
    (stored.storageSchemaVersion as number) > STORED_BLOB_SCHEMA_VERSION;
}

function isContentHash(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/** Realm-safe: bytes may come from a worker, a frame, or a decoded response. */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function classify(error: unknown, transaction: TransactionLike | null): ImageBlobFailureCode {
  if (error instanceof Error && error.name === SUPERSEDED_DATABASE_ERROR) return "SUPERSEDED";
  return isQuotaError(error) || isQuotaError(transactionError(transaction))
    ? "STORAGE_FULL"
    : "STORAGE_UNAVAILABLE";
}

function transactionError(transaction: TransactionLike | null): unknown {
  try {
    return transaction?.error ?? null;
  } catch {
    // Reading `error` on a still-active transaction throws in some engines.
    return null;
  }
}

function succeeded<Value>(value: Value): ImageBlobResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failed(code: ImageBlobFailureCode): Extract<ImageBlobResult<never>, { ok: false }> {
  return Object.freeze({ ok: false, code });
}
