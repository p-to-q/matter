import { bundleToTree, type SnapshotBundle } from "./snapshot-codec";
import type { ThoughtTree } from "../tree/model";

/**
 * The ZIP boundary owns transport validation only. It never writes storage or
 * changes the live document; callers receive a fully validated tree or a
 * stable failure before any durable import may begin.
 */
export type ArchiveErrorCode =
  | "ARCHIVE_UNAVAILABLE"
  | "ARCHIVE_READ_FAILED"
  | "ARCHIVE_INVALID"
  | "ARCHIVE_BOUND_EXCEEDED"
  | "ARCHIVE_UNSUPPORTED_ENTRY";

export type ArchiveExportResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; error: ArchiveError }>;

export type ArchiveImportResult =
  | Readonly<{ ok: true; bundle: SnapshotBundle; tree: ThoughtTree }>
  | Readonly<{ ok: false; error: ArchiveError }>;

export type ArchiveError = Readonly<{ code: ArchiveErrorCode; message: string }>;

type ArchiveInput = Blob | ArrayBuffer | Uint8Array;

const MAX_BUNDLE_FILES = 2_002;
const MAX_BUNDLE_BYTES = 18_000_000;
const MAX_PATH_BYTES = 2_048;
const MAX_PATH_DEPTH = 34;
// A stored ZIP repeats every file path in local and central headers. This bound
// admits every supported logical bundle while ruling out arbitrarily large input.
const MAX_ARCHIVE_BYTES = MAX_BUNDLE_BYTES + (MAX_BUNDLE_FILES * (MAX_PATH_BYTES + 76)) + 22;
const ARCHIVE_MTIME = new Date(Date.UTC(1980, 0, 1));

type Fflate = typeof import("fflate");

export async function exportSnapshotArchive(bundle: SnapshotBundle): Promise<ArchiveExportResult> {
  const decoded = bundleToTree(bundle);
  if (!decoded.ok) return failure("ARCHIVE_INVALID", "Only a valid complete material snapshot can be exported.");

  const fflate = await loadFflate();
  if (!fflate.ok) return fflate;
  try {
    const encoder = new TextEncoder();
    const files = Object.fromEntries(
      Object.keys(bundle.files)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((path) => [path, encoder.encode(bundle.files[path as keyof typeof bundle.files])]),
    );
    const bytes = await zipFiles(fflate.value, files);
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
      return failure("ARCHIVE_BOUND_EXCEEDED", "The exported archive exceeds the supported transport bound.");
    }
    return Object.freeze({ ok: true, bytes });
  } catch {
    return failure("ARCHIVE_INVALID", "The material snapshot could not be archived.");
  }
}

function zipFiles(fflate: Fflate, files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    fflate.zip(files, { level: 6, mtime: ARCHIVE_MTIME }, (error, bytes) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(bytes);
    });
  });
}

export async function importSnapshotArchive(input: ArchiveInput): Promise<ArchiveImportResult> {
  const source = await readInput(input);
  if (!source.ok) return source;
  const fflate = await loadFflate();
  if (!fflate.ok) return fflate;

  const expectedCrc = readCentralCrc(source.bytes);
  if (!expectedCrc.ok) return expectedCrc;
  const expanded = await unzipBundle(source.bytes, fflate.value, expectedCrc.value);
  if (!expanded.ok) return expanded;
  const decoded = bundleToTree(expanded.bundle);
  if (!decoded.ok) return failure("ARCHIVE_INVALID", "The archive does not contain a valid complete material snapshot.");
  return Object.freeze({ ok: true, bundle: expanded.bundle, tree: decoded.tree });
}

async function loadFflate(): Promise<Readonly<{ ok: true; value: Fflate }> | Extract<ArchiveExportResult, { ok: false }>> {
  try {
    return Object.freeze({ ok: true, value: await import("fflate") });
  } catch {
    return failure("ARCHIVE_UNAVAILABLE", "Archive support is unavailable in this browser.");
  }
}

async function readInput(input: ArchiveInput): Promise<
  Readonly<{ ok: true; bytes: Uint8Array }> | Extract<ArchiveImportResult, { ok: false }>
> {
  try {
    const bytes = input instanceof Uint8Array
      ? input
      : new Uint8Array(input instanceof ArrayBuffer ? input : await input.arrayBuffer());
    if (bytes.byteLength === 0) return failure("ARCHIVE_INVALID", "The archive is empty.");
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
      return failure("ARCHIVE_BOUND_EXCEEDED", "The archive exceeds the compressed-byte bound.");
    }
    return Object.freeze({ ok: true, bytes });
  } catch {
    return failure("ARCHIVE_READ_FAILED", "The archive could not be read.");
  }
}

async function unzipBundle(
  bytes: Uint8Array,
  fflate: Fflate,
  expectedCrc: ReadonlyMap<string, number>,
): Promise<Readonly<{ ok: true; bundle: SnapshotBundle }> | Extract<ArchiveImportResult, { ok: false }>> {
  return new Promise((resolve) => {
    let settled = false;
    let inputFinished = false;
    let openEntries = 0;
    let declaredBytes = 0;
    let actualBytes = 0;
    const files = Object.create(null) as Record<string, string>;
    const collisionKeys = new Set<string>();

    const finish = (result: Readonly<{ ok: true; bundle: SnapshotBundle }> | Extract<ArchiveImportResult, { ok: false }>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const completeWhenReady = () => {
      if (!settled && inputFinished && openEntries === 0) {
        finish(Object.freeze({ ok: true, bundle: Object.freeze({ files: Object.freeze(files) }) }));
      }
    };

    const unzip = new fflate.Unzip((file) => {
      if (settled) return;
      const pathError = validateArchiveEntry(file.name);
      if (pathError !== null) {
        file.terminate();
        finish(Object.freeze({ ok: false, error: pathError }));
        return;
      }
      if (Object.keys(files).length + openEntries >= MAX_BUNDLE_FILES) {
        file.terminate();
        finish(failure("ARCHIVE_BOUND_EXCEEDED", "The archive has too many entries."));
        return;
      }
      const collisionKey = file.name.normalize("NFC").toLocaleLowerCase("und");
      if (collisionKeys.has(collisionKey)) {
        file.terminate();
        finish(failure("ARCHIVE_INVALID", "Archive paths collide after Unicode or case normalization."));
        return;
      }
      collisionKeys.add(collisionKey);
      const declaredSize = file.originalSize;
      if (!Number.isSafeInteger(declaredSize) || declaredSize === undefined || declaredSize < 0 || declaredSize > MAX_BUNDLE_BYTES) {
        file.terminate();
        finish(failure("ARCHIVE_BOUND_EXCEEDED", "An archive entry has an unsupported declared size."));
        return;
      }
      declaredBytes += declaredSize;
      if (declaredBytes > MAX_BUNDLE_BYTES || file.compression !== 0 && file.compression !== 8) {
        file.terminate();
        finish(file.compression !== 0 && file.compression !== 8
          ? failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive contains an unsupported compression method.")
          : failure("ARCHIVE_BOUND_EXCEEDED", "The archive exceeds the expanded-byte bound."));
        return;
      }

      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      openEntries += 1;
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error !== null) {
          finish(failure("ARCHIVE_INVALID", "The archive contains corrupt compressed data."));
          return;
        }
        entryBytes += chunk.byteLength;
        actualBytes += chunk.byteLength;
        if (entryBytes > MAX_BUNDLE_BYTES || actualBytes > MAX_BUNDLE_BYTES) {
          finish(failure("ARCHIVE_BOUND_EXCEEDED", "The archive exceeds the expanded-byte bound."));
          return;
        }
        chunks.push(chunk);
        if (!final) return;
        if (entryBytes !== declaredSize) {
          finish(failure("ARCHIVE_INVALID", "An archive entry does not match its declared size."));
          return;
        }
        if (crc32(chunks) !== expectedCrc.get(file.name)) {
          finish(failure("ARCHIVE_INVALID", "An archive entry fails its CRC check."));
          return;
        }
        try {
          files[file.name] = new TextDecoder("utf-8", { fatal: true }).decode(joinChunks(chunks, entryBytes));
        } catch {
          finish(failure("ARCHIVE_INVALID", "Archive text must be valid UTF-8."));
          return;
        }
        openEntries -= 1;
        completeWhenReady();
      };
      file.start();
    });
    unzip.register(fflate.AsyncUnzipInflate);
    try {
      unzip.push(bytes, true);
      inputFinished = true;
      completeWhenReady();
    } catch {
      finish(failure("ARCHIVE_INVALID", "The archive is not a readable ZIP file."));
    }
  });
}

function readCentralCrc(bytes: Uint8Array):
  | Readonly<{ ok: true; value: ReadonlyMap<string, number> }>
  | Extract<ArchiveImportResult, { ok: false }> {
  const end = findEndOfCentralDirectory(bytes);
  if (end < 0 || read32(bytes, end) !== 0x06054b50) return failure("ARCHIVE_INVALID", "The archive has no readable central directory.");
  const count = read16(bytes, end + 10);
  const size = read32(bytes, end + 12);
  const offset = read32(bytes, end + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff || offset + size > bytes.length) {
    return failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive uses unsupported ZIP64 metadata.");
  }
  if (count > MAX_BUNDLE_FILES) {
    return failure("ARCHIVE_BOUND_EXCEEDED", "The archive has too many entries.");
  }
  const result = new Map<string, number>();
  let cursor = offset;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > offset + size || read32(bytes, cursor) !== 0x02014b50) throw new Error();
      const nameLength = read16(bytes, cursor + 28);
      const extraLength = read16(bytes, cursor + 30);
      const commentLength = read16(bytes, cursor + 32);
      const nameEnd = cursor + 46 + nameLength;
      if (nameEnd > offset + size) throw new Error();
      const name = decoder.decode(bytes.subarray(cursor + 46, nameEnd));
      if (result.has(name)) throw new Error();
      result.set(name, read32(bytes, cursor + 16));
      cursor = nameEnd + extraLength + commentLength;
    }
  } catch {
    return failure("ARCHIVE_INVALID", "The archive central directory is invalid.");
  }
  return cursor === offset + size
    ? Object.freeze({ ok: true, value: result })
    : failure("ARCHIVE_INVALID", "The archive central directory is invalid.");
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (read32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function read16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function read32(bytes: Uint8Array, offset: number): number {
  return (read16(bytes, offset) | (read16(bytes, offset + 2) << 16)) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let shift = 0; shift < 8; shift += 1) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(chunks: readonly Uint8Array[]): number {
  let value = 0xffffffff;
  for (const chunk of chunks) for (const byte of chunk) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff]!;
  return (value ^ 0xffffffff) >>> 0;
}

function validateArchiveEntry(path: string): ArchiveError | null {
  if (
    path.length === 0
    || path.endsWith("/")
    || path !== path.normalize("NFC")
    || path.startsWith("/")
    || /^[A-Za-z]:/u.test(path)
    || path.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(path)
    || new TextEncoder().encode(path).byteLength > MAX_PATH_BYTES
  ) return failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive contains an unsafe path or directory entry.").error;
  const components = path.split("/");
  if (
    components.length > MAX_PATH_DEPTH
    || components.some((component) => component.length === 0 || component === "." || component === "..")
    || components[0] !== "matter"
    || (path !== "matter/matter.json" && !path.endsWith("/index.md"))
  ) return failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive contains an unexpected material path.").error;
  return null;
}

function joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function failure(code: ArchiveErrorCode, message: string): Extract<ArchiveExportResult, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
