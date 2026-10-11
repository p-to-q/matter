import { inspectImageStructure } from "../protocol/image-structure";
import {
  equalImagePointers,
  MAX_IMAGE_POINTER_BYTES,
  MAX_TREE_IMAGE_BYTES,
  MAX_TREE_IMAGE_NODES,
  type ImagePointer,
  type ImagePointerMediaType,
} from "../tree/image-pointer";
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
  | "ARCHIVE_UNSUPPORTED_ENTRY"
  | "ARCHIVE_BLOB_DUPLICATE"
  | "ARCHIVE_BLOB_ORPHAN"
  | "ARCHIVE_BLOB_POINTER_CONFLICT"
  | "ARCHIVE_BLOB_TYPE_MISMATCH"
  | "ARCHIVE_BLOB_SIZE_MISMATCH"
  | "ARCHIVE_BLOB_HASH_MISMATCH"
  | "ARCHIVE_BLOB_STRUCTURE_INVALID";

export type ArchiveExportResult =
  | Readonly<{ ok: true; bytes: Uint8Array; missingImages: number }>
  | Readonly<{ ok: false; error: ArchiveError }>;

export type ArchiveImportResult =
  | Readonly<{
      ok: true;
      bundle: SnapshotBundle;
      tree: ThoughtTree;
      blobs: ReadonlyMap<string, Uint8Array>;
    }>
  | Readonly<{ ok: false; error: ArchiveError }>;

export type ArchiveError = Readonly<{ code: ArchiveErrorCode; message: string }>;

type ArchiveInput = Blob | ArrayBuffer | Uint8Array;
type Blobs = ReadonlyMap<string, Uint8Array>;

const MAX_BUNDLE_FILES = 2_002;
const MAX_BUNDLE_BYTES = 18_000_000;
const MAX_PATH_BYTES = 2_048;
const MAX_PATH_DEPTH = 34;
const BLOBS_PREFIX = "matter/blobs/";
const BLOB_PATH = /^matter\/blobs\/([0-9a-f]{64})\.(jpg|png|webp)$/u;
const BLOB_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<ImagePointerMediaType, string>);
type BlobExtension = (typeof BLOB_EXTENSIONS)[ImagePointerMediaType];
// Local and central headers both carry the path, plus 30 and 46 fixed bytes.
const BLOB_ENTRY_OVERHEAD = 2 * (BLOBS_PREFIX.length + 64 + ".webp".length) + 76;
// A stored ZIP repeats every file path in local and central headers. This bound
// admits every supported logical bundle and its pictures while ruling out
// arbitrarily large input.
const MAX_ARCHIVE_BYTES = MAX_BUNDLE_BYTES + (MAX_BUNDLE_FILES * (MAX_PATH_BYTES + 76)) + 22
  + MAX_TREE_IMAGE_BYTES + (MAX_TREE_IMAGE_NODES * BLOB_ENTRY_OVERHEAD);
// Inflating one pushed chunk allocates its whole output before any size check
// can run, so input is fed in slices that keep a bomb's first allocation small.
const INFLATE_FEED_BYTES = 16 * 1024;
const ARCHIVE_MTIME = new Date(Date.UTC(1980, 0, 1));
const NO_BLOBS: Blobs = new Map();

type Fflate = typeof import("fflate");
type Zippable = import("fflate").Zippable;
type ArchivePath =
  | Readonly<{ kind: "text" }>
  | Readonly<{ kind: "blob"; hash: string; extension: BlobExtension }>;

/**
 * Pictures are optional passengers: a hash without bytes in `blobs`, or with
 * bytes the importer would refuse, is simply left out and counted in
 * `missingImages`, so missing bytes can never cost the person their archive.
 */
export async function exportSnapshotArchive(
  bundle: SnapshotBundle,
  blobs: Blobs = NO_BLOBS,
): Promise<ArchiveExportResult> {
  const decoded = bundleToTree(bundle);
  if (!decoded.ok) return failure("ARCHIVE_INVALID", "Only a valid complete material snapshot can be exported.");

  const fflate = await loadFflate();
  if (!fflate.ok) return fflate;
  try {
    const pointers = collectPointers(decoded.tree);
    const pictures: Array<readonly [string, Uint8Array]> = [];
    for (const [hash, referenced] of pointers) {
      const bytes = blobs.get(hash);
      if (bytes === undefined || await checkBlob(hash, bytes, referenced) !== null) continue;
      pictures.push([`${BLOBS_PREFIX}${hash}.${BLOB_EXTENSIONS[referenced[0]!.mediaType]}`, bytes]);
    }
    pictures.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

    const encoder = new TextEncoder();
    const files: Zippable = Object.fromEntries([
      ...Object.keys(bundle.files)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((path) => [path, encoder.encode(bundle.files[path as keyof typeof bundle.files])] as const),
      ...pictures.map(([path, bytes]) => [path, [bytes, { level: 0, mtime: ARCHIVE_MTIME }]] as const),
    ]);
    const bytes = await zipFiles(fflate.value, files);
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
      return failure("ARCHIVE_BOUND_EXCEEDED", "The exported archive exceeds the supported transport bound.");
    }
    return Object.freeze({ ok: true, bytes, missingImages: pointers.size - pictures.length });
  } catch {
    return failure("ARCHIVE_INVALID", "The material snapshot could not be archived.");
  }
}

function zipFiles(fflate: Fflate, files: Zippable): Promise<Uint8Array> {
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

  const central = readCentralDirectory(source.bytes);
  if (!central.ok) return central;
  const expanded = await unzipBundle(source.bytes, fflate.value, central.value);
  if (!expanded.ok) return expanded;
  const decoded = bundleToTree(expanded.bundle);
  if (!decoded.ok) return failure("ARCHIVE_INVALID", "The archive does not contain a valid complete material snapshot.");
  const blobs = await verifyBlobs(decoded.tree, expanded.pictures);
  if (!blobs.ok) return blobs;
  return Object.freeze({ ok: true, bundle: expanded.bundle, tree: decoded.tree, blobs: blobs.value });
}

/**
 * Starts the zip codec for an archive gesture the person is about to make.
 * Export and import await the same import, so a failure surfaces there.
 */
export function preloadArchiveCodec(): Promise<unknown> {
  return import("fflate");
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

type PictureEntry = Readonly<{ extension: BlobExtension; bytes: Uint8Array }>;
type Expanded = Readonly<{
  ok: true;
  bundle: SnapshotBundle;
  pictures: ReadonlyMap<string, PictureEntry>;
}>;

/** Text and picture bytes are budgeted apart so neither can spend the other's allowance. */
function byteBudget(entryLimit: number, totalLimit: number) {
  return { entryLimit, totalLimit, declared: 0, actual: 0 };
}

async function unzipBundle(
  bytes: Uint8Array,
  fflate: Fflate,
  central: ReadonlyMap<string, CentralEntry>,
): Promise<Expanded | Extract<ArchiveImportResult, { ok: false }>> {
  return new Promise((resolve) => {
    let settled = false;
    let inputFinished = false;
    let openEntries = 0;
    const text = byteBudget(MAX_BUNDLE_BYTES, MAX_BUNDLE_BYTES);
    const picture = byteBudget(MAX_IMAGE_POINTER_BYTES, MAX_TREE_IMAGE_BYTES);
    const files = Object.create(null) as Record<string, string>;
    const pictures = new Map<string, PictureEntry>();
    const collisionKeys = new Set<string>();
    const activeEntries = new Set<Readonly<{ terminate: () => void }>>();

    const terminateActiveEntries = () => {
      // A ZIP may have several asynchronous inflaters in flight. Resolving the
      // import promise alone leaves those entries retaining compressed chunks
      // after a later entry has already made the archive invalid.
      for (const entry of activeEntries) {
        try {
          entry.terminate();
        } catch {
          // Termination is best-effort cleanup; the validated failure below is
          // still the only result this transport boundary publishes.
        }
      }
      activeEntries.clear();
    };

    const finish = (result: Expanded | Extract<ArchiveImportResult, { ok: false }>) => {
      if (settled) return;
      settled = true;
      if (!result.ok) terminateActiveEntries();
      resolve(result);
    };
    const completeWhenReady = () => {
      if (!settled && inputFinished && openEntries === 0) {
        finish(Object.freeze({
          ok: true,
          bundle: Object.freeze({ files: Object.freeze(files) }),
          pictures,
        }));
      }
    };

    const unzip = new fflate.Unzip((file) => {
      if (settled) return;
      const entry = central.get(file.name);
      if (entry === undefined) {
        file.terminate();
        finish(failure("ARCHIVE_INVALID", "An archive entry is missing from the central directory."));
        return;
      }
      const budget = entry.path.kind === "blob" ? picture : text;
      const collisionKey = file.name.normalize("NFC").toLocaleLowerCase("und");
      if (collisionKeys.has(collisionKey)) {
        file.terminate();
        finish(failure("ARCHIVE_INVALID", "Archive paths collide after Unicode or case normalization."));
        return;
      }
      collisionKeys.add(collisionKey);
      const declaredSize = file.originalSize;
      if (!Number.isSafeInteger(declaredSize) || declaredSize === undefined || declaredSize < 0 || declaredSize > budget.entryLimit) {
        file.terminate();
        finish(failure("ARCHIVE_BOUND_EXCEEDED", "An archive entry has an unsupported declared size."));
        return;
      }
      if (entry.path.kind === "blob" && declaredSize !== entry.size) {
        file.terminate();
        finish(failure("ARCHIVE_INVALID", "An archive entry disagrees with the central directory about its size."));
        return;
      }
      budget.declared += declaredSize;
      if (budget.declared > budget.totalLimit || file.compression !== 0 && file.compression !== 8) {
        file.terminate();
        finish(file.compression !== 0 && file.compression !== 8
          ? failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive contains an unsupported compression method.")
          : failure("ARCHIVE_BOUND_EXCEEDED", "The archive exceeds the expanded-byte bound."));
        return;
      }

      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      openEntries += 1;
      activeEntries.add(file);
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error !== null) {
          finish(failure("ARCHIVE_INVALID", "The archive contains corrupt compressed data."));
          return;
        }
        entryBytes += chunk.byteLength;
        budget.actual += chunk.byteLength;
        if (entryBytes > budget.entryLimit || budget.actual > budget.totalLimit) {
          finish(failure("ARCHIVE_BOUND_EXCEEDED", "The archive exceeds the expanded-byte bound."));
          return;
        }
        chunks.push(chunk);
        if (!final) return;
        if (entryBytes !== declaredSize) {
          finish(failure("ARCHIVE_INVALID", "An archive entry does not match its declared size."));
          return;
        }
        if (crc32(chunks) !== entry.crc) {
          finish(failure("ARCHIVE_INVALID", "An archive entry fails its CRC check."));
          return;
        }
        const joined = joinChunks(chunks, entryBytes);
        if (entry.path.kind === "blob") {
          pictures.set(entry.path.hash, Object.freeze({ extension: entry.path.extension, bytes: joined }));
        } else {
          try {
            files[file.name] = new TextDecoder("utf-8", { fatal: true }).decode(joined);
          } catch {
            finish(failure("ARCHIVE_INVALID", "Archive text must be valid UTF-8."));
            return;
          }
        }
        activeEntries.delete(file);
        openEntries -= 1;
        completeWhenReady();
      };
      file.start();
    });
    unzip.register(fflate.AsyncUnzipInflate);
    try {
      for (let offset = 0; offset < bytes.length && !settled; offset += INFLATE_FEED_BYTES) {
        const end = Math.min(offset + INFLATE_FEED_BYTES, bytes.length);
        unzip.push(bytes.subarray(offset, end), end === bytes.length);
      }
      inputFinished = true;
      completeWhenReady();
    } catch {
      finish(failure("ARCHIVE_INVALID", "The archive is not a readable ZIP file."));
    }
  });
}

type CentralEntry = Readonly<{ crc: number; size: number; path: ArchivePath }>;

/**
 * Every bound that needs only names and declared sizes is judged here, before
 * a single byte is inflated: entry counts, picture sizes, and duplicate hashes.
 */
function readCentralDirectory(bytes: Uint8Array):
  | Readonly<{ ok: true; value: ReadonlyMap<string, CentralEntry> }>
  | Extract<ArchiveImportResult, { ok: false }> {
  const end = findEndOfCentralDirectory(bytes);
  if (end < 0 || read32(bytes, end) !== 0x06054b50) return failure("ARCHIVE_INVALID", "The archive has no readable central directory.");
  const count = read16(bytes, end + 10);
  const size = read32(bytes, end + 12);
  const offset = read32(bytes, end + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff || offset + size > bytes.length) {
    return failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive uses unsupported ZIP64 metadata.");
  }
  const result = new Map<string, CentralEntry>();
  const pictureHashes = new Set<string>();
  let textEntries = 0;
  let pictureBytes = 0;
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
      const path = classifyArchivePath(name);
      if ("error" in path) return Object.freeze({ ok: false, error: path.error });
      const entrySize = read32(bytes, cursor + 24);
      if (path.kind === "blob") {
        pictureBytes += entrySize;
        if (pictureHashes.size >= MAX_TREE_IMAGE_NODES || entrySize > MAX_IMAGE_POINTER_BYTES || pictureBytes > MAX_TREE_IMAGE_BYTES) {
          return failure("ARCHIVE_BOUND_EXCEEDED", "The archive pictures exceed the supported bound.");
        }
        if (pictureHashes.has(path.hash)) {
          return failure("ARCHIVE_BLOB_DUPLICATE", "The archive carries one picture more than once.");
        }
        pictureHashes.add(path.hash);
      } else {
        textEntries += 1;
        if (textEntries > MAX_BUNDLE_FILES) return failure("ARCHIVE_BOUND_EXCEEDED", "The archive has too many entries.");
      }
      result.set(name, Object.freeze({ crc: read32(bytes, cursor + 16), size: entrySize, path }));
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

function classifyArchivePath(path: string): ArchivePath | Readonly<{ error: ArchiveError }> {
  if (
    path.length === 0
    || path.endsWith("/")
    || path !== path.normalize("NFC")
    || path.startsWith("/")
    || /^[A-Za-z]:/u.test(path)
    || path.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(path)
    || new TextEncoder().encode(path).byteLength > MAX_PATH_BYTES
  ) return { error: failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive contains an unsafe path or directory entry.").error };
  const components = path.split("/");
  const unexpected = { error: failure("ARCHIVE_UNSUPPORTED_ENTRY", "The archive contains an unexpected material path.").error };
  if (
    components.length > MAX_PATH_DEPTH
    || components.some((component) => component.length === 0 || component === "." || component === "..")
    || components[0] !== "matter"
  ) return unexpected;
  // Nothing else may live under blobs/, so a picture name never reads as a node.
  if (components[1] === "blobs") {
    const match = BLOB_PATH.exec(path);
    return match === null ? unexpected : { kind: "blob", hash: match[1]!, extension: match[2] as BlobExtension };
  }
  return path === "matter/matter.json" || path.endsWith("/index.md") ? { kind: "text" } : unexpected;
}

function collectPointers(tree: ThoughtTree): Map<string, ImagePointer[]> {
  const pointers = new Map<string, ImagePointer[]>();
  for (const node of Object.values(tree.nodes)) {
    if (node.image === undefined) continue;
    const referenced = pointers.get(node.image.contentHash);
    if (referenced === undefined) pointers.set(node.image.contentHash, [node.image]);
    else referenced.push(node.image);
  }
  return pointers;
}

async function verifyBlobs(
  tree: ThoughtTree,
  pictures: ReadonlyMap<string, PictureEntry>,
): Promise<Readonly<{ ok: true; value: Blobs }> | Extract<ArchiveImportResult, { ok: false }>> {
  const pointers = collectPointers(tree);
  for (const hash of pictures.keys()) {
    if (!pointers.has(hash)) return failure("ARCHIVE_BLOB_ORPHAN", "The archive carries a picture no material refers to.");
  }
  const blobs = new Map<string, Uint8Array>();
  for (const [hash, picture] of pictures) {
    const fault = await checkBlob(hash, picture.bytes, pointers.get(hash)!, picture.extension);
    if (fault !== null) return Object.freeze({ ok: false, error: fault });
    blobs.set(hash, picture.bytes);
  }
  return Object.freeze({ ok: true, value: blobs });
}

/**
 * The one judgement of picture bytes against what the tree says about them,
 * shared by export and import so the archive never carries a picture it would
 * refuse. The lookup by hash already makes the pointer hash equal the name.
 */
async function checkBlob(
  hash: string,
  bytes: Uint8Array,
  pointers: readonly ImagePointer[],
  extension?: BlobExtension,
): Promise<ArchiveError | null> {
  const pointer = pointers[0]!;
  if (pointers.some((other) => !equalImagePointers(pointer, other))) {
    return failure("ARCHIVE_BLOB_POINTER_CONFLICT", "Material disagrees about one picture.").error;
  }
  if (extension !== undefined && extension !== BLOB_EXTENSIONS[pointer.mediaType]) {
    return failure("ARCHIVE_BLOB_TYPE_MISMATCH", "A picture file name contradicts its declared type.").error;
  }
  if (bytes.byteLength !== pointer.byteLength) {
    return failure("ARCHIVE_BLOB_SIZE_MISMATCH", "A picture does not have the size material declares.").error;
  }
  let digest: string;
  try {
    digest = await sha256Hex(bytes);
  } catch {
    return failure("ARCHIVE_UNAVAILABLE", "Archive support is unavailable in this browser.").error;
  }
  if (digest !== hash) {
    return failure("ARCHIVE_BLOB_HASH_MISMATCH", "A picture does not match its content hash.").error;
  }
  const structure = inspectImageStructure(bytes, pointer.mediaType);
  if (!structure.ok || structure.width !== pointer.width || structure.height !== pointer.height) {
    return failure("ARCHIVE_BLOB_STRUCTURE_INVALID", "A picture is not the image material declares.").error;
  }
  return null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
