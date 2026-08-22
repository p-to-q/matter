import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { createSeededDocument } from "../material/seeded-document";
import { treeToBundle } from "./snapshot-codec";
import { exportSnapshotArchive, importSnapshotArchive } from "./archive-transport";

describe("material ZIP transport", () => {
  it("exports deterministic bytes and imports the exact validated tree", async () => {
    const bundle = treeToBundle(createSeededDocument().tree);
    const first = await exportSnapshotArchive(bundle);
    const second = await exportSnapshotArchive(bundle);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (!first.ok || !second.ok) throw new Error("archive export failed");
    expect(first.bytes).toEqual(second.bytes);

    await expect(importSnapshotArchive(first.bytes)).resolves.toEqual({
      ok: true,
      bundle,
      tree: createSeededDocument().tree,
    });
  });

  it("rejects unsafe paths, directory records, and normalized collisions before decoding", async () => {
    const valid = treeToBundle(createSeededDocument().tree);
    const root = valid.files["matter/index.md" as keyof typeof valid.files];
    const metadata = valid.files["matter/matter.json" as keyof typeof valid.files];
    const unsafe = zip({
      "matter/matter.json": metadata,
      "matter/../escape/index.md": root,
    });
    const directory = zip({
      "matter/": new Uint8Array(),
      "matter/matter.json": metadata,
      "matter/index.md": root,
    });
    const collision = zip({
      "matter/matter.json": metadata,
      "matter/index.md": root,
      "matter/001-A/index.md": root,
      "matter/001-a/index.md": root,
    });

    await expect(importSnapshotArchive(unsafe)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_UNSUPPORTED_ENTRY" },
    });
    await expect(importSnapshotArchive(directory)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_UNSUPPORTED_ENTRY" },
    });
    await expect(importSnapshotArchive(collision)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_INVALID" },
    });
  });

  it("rejects invalid UTF-8 and complete-but-invalid bundles without producing a tree", async () => {
    const valid = treeToBundle(createSeededDocument().tree);
    const invalidUtf8 = zip({
      "matter/matter.json": valid.files["matter/matter.json" as keyof typeof valid.files],
      "matter/index.md": new Uint8Array([0xff, 0xfe]),
    });
    const invalidMetadata = zip({
      "matter/matter.json": "{\"treeId\":\"missing-protocol\"}\n",
    });

    await expect(importSnapshotArchive(invalidUtf8)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_INVALID" },
    });
    await expect(importSnapshotArchive(invalidMetadata)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_INVALID" },
    });
  });

  it("rejects a central-directory CRC that does not match streamed material", async () => {
    const exported = await exportSnapshotArchive(treeToBundle(createSeededDocument().tree));
    if (!exported.ok) throw new Error("archive export failed");
    const corrupt = new Uint8Array(exported.bytes);
    const end = corrupt.length - 22;
    const centralOffset = corrupt[end + 16]! | (corrupt[end + 17]! << 8) | (corrupt[end + 18]! << 16) | (corrupt[end + 19]! << 24);
    corrupt[centralOffset + 16] ^= 0xff;
    await expect(importSnapshotArchive(corrupt)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_INVALID" },
    });
  });

  it("rejects an archive with too many central-directory entries before decoding", async () => {
    const files: Record<string, Uint8Array> = { "matter/matter.json": new Uint8Array() };
    for (let index = 0; index < 2_002; index += 1) {
      files[`matter/${String(index).padStart(4, "0")}/index.md`] = new Uint8Array();
    }

    await expect(importSnapshotArchive(zipSync(files))).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
  });

  it("rejects material paths beyond the transport depth before decoding", async () => {
    const valid = treeToBundle(createSeededDocument().tree);
    const tooDeep = `matter/${Array.from({ length: 33 }, (_, index) => `level-${index}`).join("/")}/index.md`;

    await expect(importSnapshotArchive(zip({
      "matter/matter.json": valid.files["matter/matter.json" as keyof typeof valid.files],
      [tooDeep]: valid.files["matter/index.md" as keyof typeof valid.files],
    }))).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_UNSUPPORTED_ENTRY" },
    });
  });

  it("bounds compressed input before ZIP parsing", async () => {
    const maxArchiveBytes = 18_000_000 + (2_002 * (2_048 + 76)) + 22;

    await expect(importSnapshotArchive(new Uint8Array(maxArchiveBytes + 1))).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
  });

  it("bounds declared and streamed expanded bytes independently", async () => {
    const expandedOverBound = new Uint8Array(18_000_001);
    const declaredOverBound = zipSync({ "matter/index.md": expandedOverBound }, { level: 6 });
    const actualOverBound = rewriteZipUncompressedSize(declaredOverBound, 1);

    await expect(importSnapshotArchive(declaredOverBound)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
    await expect(importSnapshotArchive(actualOverBound)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_BOUND_EXCEEDED" },
    });
  });

  it("terminates every started inflater when one entry fails", async () => {
    const terminated: string[] = [];
    class FakeUnzip {
      constructor(private readonly onfile: (file: {
        name: string;
        originalSize: number;
        compression: number;
        terminate: () => void;
        start: () => void;
        ondata: (error: Error | null, chunk: Uint8Array, final: boolean) => void;
      }) => void) {}

      register() {}

      push() {
        for (const name of ["matter/matter.json", "matter/index.md"]) {
          const file = {
            name,
            originalSize: 1,
            compression: 0,
            terminate: () => terminated.push(name),
            start: () => queueMicrotask(() => file.ondata(new Error("corrupt"), new Uint8Array(), false)),
            ondata: (error: Error | null, chunk: Uint8Array, final: boolean) => {
              void error;
              void chunk;
              void final;
            },
          };
          this.onfile(file);
        }
      }
    }

    vi.resetModules();
    vi.doMock("fflate", () => ({ AsyncUnzipInflate: class {}, Unzip: FakeUnzip }));
    try {
      const transport = await import("./archive-transport");
      await expect(transport.importSnapshotArchive(zip({
        "matter/matter.json": "{}",
        "matter/index.md": "x",
      }))).resolves.toMatchObject({
        ok: false,
        error: { code: "ARCHIVE_INVALID" },
      });
      expect(terminated).toEqual(["matter/matter.json", "matter/index.md"]);
    } finally {
      vi.doUnmock("fflate");
      vi.resetModules();
    }
  });
});

function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [
    path,
    typeof value === "string" ? encoder.encode(value) : value,
  ])), { mtime: new Date(Date.UTC(1980, 0, 1)) });
}

function rewriteZipUncompressedSize(bytes: Uint8Array, size: number): Uint8Array {
  const rewritten = new Uint8Array(bytes);
  for (let offset = 0; offset <= rewritten.length - 4; offset += 1) {
    const signature = read32(rewritten, offset);
    if (signature === 0x04034b50) write32(rewritten, offset + 22, size);
    if (signature === 0x02014b50) write32(rewritten, offset + 24, size);
  }
  return rewritten;
}

function read32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function write32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
