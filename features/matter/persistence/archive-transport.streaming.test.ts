import { afterEach, describe, expect, it, vi } from "vitest";
import { deflateSync, zipSync } from "fflate";
import { createSeededDocument } from "../material/seeded-document";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { exportSnapshotArchive, importSnapshotArchive } from "./archive-transport";
import { treeToBundle } from "./snapshot-codec";

// The same local calendar date production stamps; UTC midnight is 1979 west of UTC.
const MTIME = new Date(1980, 0, 1);

afterEach(() => {
  vi.doUnmock("fflate");
  vi.resetModules();
});

function seededFiles(): Record<string, Uint8Array> {
  const encoder = new TextEncoder();
  return Object.fromEntries(
    Object.entries(treeToBundle(createSeededDocument().tree).files)
      .map(([path, content]) => [path, encoder.encode(content)] as const),
  );
}

function archive(level: 0 | 6): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(seededFiles()).map(([path, bytes]) => [path, [bytes, { level, mtime: MTIME }]])),
    { mtime: MTIME },
  );
}

/**
 * Rewrites an archive the way a streaming writer produces it (Python's
 * zipfile on a pipe, Java's ZipOutputStream, macOS ditto): general-purpose
 * flag bit 3 set, the local header's CRC and sizes zeroed, and a data
 * descriptor after each entry's data. Only the central directory then knows
 * the sizes. Built from raw bytes so no ZIP writer is needed in CI.
 */
function withDataDescriptors(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries: Array<{ central: number; local: number; length: number; compressed: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const length = 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    entries.push({ central: cursor, local: view.getUint32(cursor + 42, true), length, compressed: view.getUint32(cursor + 20, true) });
    cursor += length;
  }
  entries.sort((left, right) => left.local - right.local);
  const parts: Uint8Array[] = [];
  const newOffsets = new Map<number, number>();
  let position = 0;
  for (const entry of entries) {
    const headerLength = 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
    const header = zip.slice(entry.local, entry.local + headerLength);
    const headerView = new DataView(header.buffer);
    header[6] = header[6]! | 8;
    headerView.setUint32(14, 0, true);
    headerView.setUint32(18, 0, true);
    headerView.setUint32(22, 0, true);
    const descriptor = new Uint8Array(16);
    const descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint32(0, 0x08074b50, true);
    descriptorView.setUint32(4, view.getUint32(entry.central + 16, true), true);
    descriptorView.setUint32(8, entry.compressed, true);
    descriptorView.setUint32(12, view.getUint32(entry.central + 24, true), true);
    newOffsets.set(entry.central, position);
    parts.push(header, zip.subarray(entry.local + headerLength, entry.local + headerLength + entry.compressed), descriptor);
    position += headerLength + entry.compressed + 16;
  }
  const centralStart = position;
  for (const entry of entries) {
    const copy = zip.slice(entry.central, entry.central + entry.length);
    copy[8] = copy[8]! | 8;
    new DataView(copy.buffer).setUint32(42, newOffsets.get(entry.central)!, true);
    parts.push(copy);
    position += entry.length;
  }
  const tail = zip.slice(end, end + 22);
  new DataView(tail.buffer).setUint32(16, centralStart, true);
  parts.push(tail);
  return concatenate(parts);
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function centralFields(zip: Uint8Array): number[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  const offsets: number[] = [];
  let cursor = view.getUint32(end + 16, true);
  for (let index = 0; index < view.getUint16(end + 10, true); index += 1) {
    offsets.push(cursor);
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return offsets;
}

describe("ZIPs written by streaming writers", () => {
  it.each([0, 6] as const)(
    "imports an archive written at compression level %s with data descriptors, to the same tree",
    async (level) => {
      const streamed = withDataDescriptors(archive(level));
      // Prove the fixture is what it claims to be: flag 3 set, local sizes empty.
      const view = new DataView(streamed.buffer, streamed.byteOffset);
      expect(view.getUint16(6, true) & 8).toBe(8);
      expect(view.getUint32(18, true)).toBe(0);
      expect(view.getUint32(22, true)).toBe(0);

      const expected = await importSnapshotArchive(archive(level));
      const imported = await importSnapshotArchive(streamed);
      expect(imported).toMatchObject({ ok: true });
      expect(imported).toEqual(expected);
    },
  );

  it("still checks a descriptor entry against the central CRC and size", async () => {
    const streamed = withDataDescriptors(archive(6));
    const crc = new Uint8Array(streamed);
    const [first] = centralFields(crc);
    crc[first! + 16] = crc[first! + 16]! ^ 0xff;
    await expect(importSnapshotArchive(crc)).resolves.toMatchObject({ ok: false, error: { code: "ARCHIVE_INVALID" } });

    const shortSize = new Uint8Array(streamed);
    new DataView(shortSize.buffer).setUint32(centralFields(shortSize)[0]! + 24, 1, true);
    await expect(importSnapshotArchive(shortSize)).resolves.toMatchObject({ ok: false, error: { code: "ARCHIVE_INVALID" } });
  });

  it("keeps every bound when the central directory is the only declaration", async () => {
    const huge = withDataDescriptors(zipSync({ "matter/index.md": new Uint8Array(18_000_001) }, { level: 6 }));
    await expect(importSnapshotArchive(huge)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
    // A central size that lies low cannot hide a larger stream either.
    const lying = new Uint8Array(huge);
    new DataView(lying.buffer).setUint32(centralFields(lying)[0]! + 24, 1, true);
    await expect(importSnapshotArchive(lying)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
  });
});

describe("a text entry's declared size is judged before anything is inflated", () => {
  it("refuses a central size over the text bound without reading the entry", async () => {
    const zip = new Uint8Array(archive(6));
    const [first] = centralFields(zip);
    new DataView(zip.buffer).setUint32(first! + 24, 18_000_001, true);
    await expect(importSnapshotArchive(zip)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
  });

  it("refuses entries that are each small but together over the text bound", async () => {
    const zip = new Uint8Array(archive(6));
    const view = new DataView(zip.buffer);
    for (const offset of centralFields(zip)) view.setUint32(offset + 24, 9_000_000, true);
    await expect(importSnapshotArchive(zip)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
  });
});

describe("a local header and the central directory must agree", () => {
  it.each([
    ["uncompressed", 24],
    ["compressed", 20],
  ] as const)("refuses a text entry whose central %s size differs from its local header", async (_name, field) => {
    const zip = new Uint8Array(archive(6));
    const view = new DataView(zip.buffer);
    const [first] = centralFields(zip);
    view.setUint32(first! + field, view.getUint32(first! + field, true) + 1, true);
    await expect(importSnapshotArchive(zip)).resolves.toMatchObject({ ok: false, error: { code: "ARCHIVE_INVALID" } });
  });
});

describe("a Blob is judged by its size before it is read", () => {
  it("refuses an oversize Blob without reading any of it", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    const blob = Object.assign(Object.create(Blob.prototype) as Blob, {});
    Object.defineProperty(blob, "size", { value: Number.MAX_SAFE_INTEGER });
    Object.defineProperty(blob, "arrayBuffer", { value: arrayBuffer });
    await expect(importSnapshotArchive(blob)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("still reads a Blob within the bound", async () => {
    const bytes = archive(6);
    const result = await importSnapshotArchive(new Blob([bytes as BlobPart]));
    expect(result).toMatchObject({ ok: true });
  });
});

/**
 * A hostile archive: `count` text entries whose headers claim one byte, whose
 * deflate streams inflate to `expandsTo` bytes, and whose compressed streams
 * are padded past the 320,000 bytes at which fflate's asynchronous inflater
 * would give every entry a Worker of its own.
 */
function inflationBomb(count: number, expandsTo: number): Uint8Array {
  const body = deflateSync(new Uint8Array(expandsTo), { level: 6 });
  // Empty, non-final stored blocks decode to nothing and keep the stream valid.
  const emptyStored = Uint8Array.from([0x00, 0x00, 0x00, 0xff, 0xff]);
  const padding = new Uint8Array(emptyStored.length * 64_000);
  for (let offset = 0; offset < padding.length; offset += emptyStored.length) padding.set(emptyStored, offset);
  const stream = concatenate([padding, body]);
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let position = 0;
  for (let index = 0; index < count; index += 1) {
    const name = encoder.encode(`matter/${String(index).padStart(4, "0")}/index.md`);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 8, true);
    view.setUint32(18, stream.length, true);
    view.setUint32(22, 1, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(20, stream.length, true);
    centralView.setUint32(24, 1, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, position, true);
    central.set(name, 46);
    parts.push(local, stream);
    centrals.push(central);
    position += local.length + stream.length;
  }
  const centralBytes = concatenate(centrals);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, count, true);
  endView.setUint16(10, count, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, position, true);
  return concatenate([...parts, centralBytes, end]);
}

describe("an inflation bomb", () => {
  it("is refused at the first entry that breaks a bound, long before the archive is read", async () => {
    const bomb = inflationBomb(20, 60_000_000);
    expect(bomb.length).toBeGreaterThan(20 * 320_000);

    let pushes = 0;
    vi.resetModules();
    vi.doMock("fflate", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fflate")>();
      return {
        ...actual,
        Unzip: class extends actual.Unzip {
          override push(chunk: Uint8Array, final: boolean) {
            pushes += 1;
            super.push(chunk, final);
          }
        },
      };
    });
    const transport = await import("./archive-transport");

    const before = process.memoryUsage();
    const result = await transport.importSnapshotArchive(bomb);
    const after = process.memoryUsage();

    expect(result).toMatchObject({ ok: false, error: { code: "ARCHIVE_BOUND_EXCEEDED" } });
    // The feed stopped as soon as the first entry broke the bound, rather than
    // pushing the whole archive into inflaters first.
    const totalPushes = Math.ceil(bomb.length / (16 * 1024));
    expect(pushes).toBeLessThan(totalPushes / 4);
    // 20 entries of 60 MB would be 1.2 GB if inflated; one entry's overshoot is far below this.
    expect(after.rss - before.rss).toBeLessThan(400 * 1024 * 1024);
    expect(after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers)
      .toBeLessThan(400 * 1024 * 1024);
  }, 60_000);
});

describe("the largest legitimate text archive", () => {
  it("round-trips a document at the node, text, and byte limits", async () => {
    const stamp = "2026-10-12T00:00:00.000Z";
    const nodes: Record<string, ThoughtNode> = {};
    const groups = 30;
    const leaves = 64;
    const root: ThoughtNode = {
      id: "doc",
      role: "document-root",
      text: "",
      parentId: null,
      children: Array.from({ length: groups }, (_, group) => `group_${group}`),
      createdAt: stamp,
      updatedAt: stamp,
    };
    nodes.doc = root;
    const text = (seed: number) => Array.from({ length: 2_000 }, (_, index) =>
      String.fromCodePoint(0x4e00 + ((seed * 7_919 + index * 31) % 20_000))).join("");
    for (let group = 0; group < groups; group += 1) {
      const children = Array.from({ length: leaves }, (_, leaf) => `leaf_${group}_${leaf}`);
      nodes[`group_${group}`] = {
        id: `group_${group}`, text: text(group), parentId: "doc", children, createdAt: stamp, updatedAt: stamp,
      };
      children.forEach((id, leaf) => {
        nodes[id] = { id, text: text(1_000 + group * leaves + leaf), parentId: `group_${group}`, children: [], createdAt: stamp, updatedAt: stamp };
      });
    }
    const tree: ThoughtTree = { ...createEmptyTree("largest", 1), rootId: "doc", nodes };
    const bundle = treeToBundle(tree);
    const exported = await exportSnapshotArchive(bundle);
    if (!exported.ok) throw new Error(exported.error.message);

    const imported = await importSnapshotArchive(exported.bytes);
    expect(imported).toMatchObject({ ok: true });
    if (!imported.ok) return;
    expect(imported.tree).toEqual(tree);
    // Streamed by a descriptor writer, it is the same document.
    const streamed = await importSnapshotArchive(withDataDescriptors(exported.bytes));
    expect(streamed).toMatchObject({ ok: true });
  }, 60_000);
});
