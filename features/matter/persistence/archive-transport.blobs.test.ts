import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { createSeededDocument } from "../material/seeded-document";
import {
  IMAGE_POINTER_MEDIA_TYPES,
  MAX_IMAGE_POINTER_BYTES,
  MAX_TREE_IMAGE_BYTES,
  MAX_TREE_IMAGE_NODES,
  type ImagePointer,
} from "../tree/image-pointer";
import type { ThoughtTree } from "../tree/model";
import { treeToBundle } from "./snapshot-codec";
import { BLOB_EXTENSIONS, exportSnapshotArchive, importSnapshotArchive } from "./archive-transport";

// The same local calendar date production stamps; UTC midnight is 1979 west of UTC.
const MTIME = new Date(1980, 0, 1);

function png(width: number, height: number, fill = 0, filler = 64): Uint8Array {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const end = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  return Uint8Array.from([...header, ...new Array<number>(filler).fill(fill), ...end]);
}

function jpeg(width: number, height: number, fill = 0, filler = 64): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x01, 0x01, 0x11, 0x00, ...new Array<number>(filler).fill(fill), 0xff, 0xd9,
  ]);
}

function webp(width: number, height: number, fill = 0, filler = 64): Uint8Array {
  const payload = [0x2f, 0, 0, 0, 0, ...new Array<number>(filler).fill(fill)];
  const packed = (width - 1) | ((height - 1) << 14);
  payload[1] = packed & 0xff;
  payload[2] = (packed >>> 8) & 0xff;
  payload[3] = (packed >>> 16) & 0xff;
  payload[4] = (packed >>> 24) & 0xff;
  const out = new Uint8Array(20 + payload.length);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46]);
  view.setUint32(4, out.length - 8, true);
  out.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c], 8);
  view.setUint32(16, payload.length, true);
  out.set(payload, 20);
  return out;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

type Picture = Readonly<{ bytes: Uint8Array; pointer: ImagePointer }>;

function pictureOf(
  bytes: Uint8Array,
  mediaType: ImagePointer["mediaType"],
  width: number,
  height: number,
): Picture {
  return {
    bytes,
    pointer: { mediaType, byteLength: bytes.byteLength, width, height, contentHash: sha256(bytes) },
  };
}

function pathOf(pointer: ImagePointer): string {
  return `matter/blobs/${pointer.contentHash}.${BLOB_EXTENSIONS[pointer.mediaType]}`;
}

function treeWith(pointers: readonly ImagePointer[]): ThoughtTree {
  const tree = createSeededDocument().tree;
  const targets = Object.keys(tree.nodes).filter((id) => id !== tree.rootId);
  if (targets.length < pointers.length) throw new Error("fixture tree is too small");
  const nodes = { ...tree.nodes };
  pointers.forEach((pointer, index) => {
    nodes[targets[index]!] = { ...nodes[targets[index]!]!, image: pointer };
  });
  return { ...tree, nodes };
}

function blobMap(pictures: readonly Picture[]): Map<string, Uint8Array> {
  return new Map(pictures.map((picture) => [picture.pointer.contentHash, picture.bytes]));
}

/** A hand-built archive: the tree's real text plus whatever entries the case needs. */
function archiveOf(
  tree: ThoughtTree,
  entries: Readonly<Record<string, Uint8Array>>,
  level: 0 | 6 = 0,
  extraText: Readonly<Record<string, Uint8Array>> = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6; mtime: Date }]> = {};
  for (const [path, content] of Object.entries(treeToBundle(tree).files)) files[path] = encoder.encode(content);
  for (const [path, content] of Object.entries(extraText)) files[path] = content;
  for (const [path, content] of Object.entries(entries)) files[path] = [content, { level, mtime: MTIME }];
  return zipSync(files, { mtime: MTIME });
}

async function exported(tree: ThoughtTree, blobs?: ReadonlyMap<string, Uint8Array>) {
  const result = await exportSnapshotArchive(treeToBundle(tree), blobs);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

function code(result: Awaited<ReturnType<typeof importSnapshotArchive>>): string {
  return result.ok ? "ok" : result.error.code;
}

type CentralRecord = Readonly<{ name: string; central: number; local: number; method: number }>;

function centralRecords(bytes: Uint8Array): CentralRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  const count = view.getUint16(end + 10, true);
  const records: CentralRecord[] = [];
  let cursor = view.getUint32(end + 16, true);
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    records.push({
      name: new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)),
      central: cursor,
      local: view.getUint32(cursor + 42, true),
      method: view.getUint16(cursor + 10, true),
    });
    cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return records;
}

/** Rewrites the declared uncompressed size in the central directory and/or the local header. */
function forgeSize(
  bytes: Uint8Array,
  name: string,
  sizes: Readonly<{ central?: number; local?: number }>,
): Uint8Array {
  const forged = new Uint8Array(bytes);
  const view = new DataView(forged.buffer);
  const record = centralRecords(forged).find((candidate) => candidate.name === name);
  if (record === undefined) throw new Error(`no entry ${name}`);
  if (sizes.central !== undefined) view.setUint32(record.central + 24, sizes.central, true);
  if (sizes.local !== undefined) view.setUint32(record.local + 22, sizes.local, true);
  return forged;
}

const HASH_A = "a".repeat(64);

describe("archive pictures: media type table", () => {
  const builders = {
    "image/jpeg": () => pictureOf(jpeg(800, 600, 5), "image/jpeg", 800, 600),
    "image/png": () => pictureOf(png(1024, 768, 3), "image/png", 1024, 768),
    "image/webp": () => pictureOf(webp(512, 512, 7), "image/webp", 512, 512),
  } as const satisfies Record<ImagePointer["mediaType"], () => Picture>;

  it("has exactly one extension per media type the tree allows, and no other", () => {
    expect(Object.keys(BLOB_EXTENSIONS).sort()).toEqual([...IMAGE_POINTER_MEDIA_TYPES].sort());
    expect(Object.keys(builders).sort()).toEqual([...IMAGE_POINTER_MEDIA_TYPES].sort());
    expect(new Set(Object.values(BLOB_EXTENSIONS)).size).toBe(IMAGE_POINTER_MEDIA_TYPES.length);
  });

  it.each(IMAGE_POINTER_MEDIA_TYPES)("exports and re-imports %s under its own extension", async (mediaType) => {
    const picture = builders[mediaType]();
    const tree = treeWith([picture.pointer]);
    const result = await exported(tree, blobMap([picture]));
    expect(centralRecords(result.bytes).map((record) => record.name))
      .toContain(`matter/blobs/${picture.pointer.contentHash}.${BLOB_EXTENSIONS[mediaType]}`);
    const imported = await importSnapshotArchive(result.bytes);
    expect(code(imported)).toBe("ok");
  });

  it("refuses a picture path whose extension is not in the table", async () => {
    const picture = builders["image/png"]();
    const tree = treeWith([picture.pointer]);
    for (const extension of ["jpeg", "gif", "PNG", "png ", "bin", ""]) {
      const result = await importSnapshotArchive(
        archiveOf(tree, { [`matter/blobs/${picture.pointer.contentHash}.${extension}`]: picture.bytes }),
      );
      expect(code(result), extension).toBe("ARCHIVE_UNSUPPORTED_ENTRY");
    }
  });
});

describe("archive pictures: export", () => {
  it("writes each referenced picture once, stored, in code-unit order, and imports it back byte for byte", async () => {
    const pictures = [
      pictureOf(png(1024, 768, 3), "image/png", 1024, 768),
      pictureOf(jpeg(800, 600, 5), "image/jpeg", 800, 600),
      pictureOf(webp(512, 512, 7), "image/webp", 512, 512),
      pictureOf(png(640, 480, 9), "image/png", 640, 480),
    ];
    const tree = treeWith(pictures.map((picture) => picture.pointer));
    const blobs = blobMap(pictures);
    const before = [...blobs.values()].map((bytes) => new Uint8Array(bytes));

    const result = await exported(tree, blobs);

    expect(result.missingImages).toBe(0);
    const blobNames = centralRecords(result.bytes).filter((record) => record.name.startsWith("matter/blobs/"));
    expect(blobNames.map((record) => record.name)).toEqual(pictures.map((picture) => pathOf(picture.pointer)).sort());
    // The fixture must not already be in sorted order, or ordering proves nothing.
    expect(pictures.map((picture) => pathOf(picture.pointer))).not.toEqual(pictures.map((picture) => pathOf(picture.pointer)).sort());
    expect(blobNames.every((record) => record.method === 0)).toBe(true);
    expect([...blobs.values()].map((bytes) => [...bytes])).toEqual(before.map((bytes) => [...bytes]));

    const imported = await importSnapshotArchive(result.bytes);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.tree).toEqual(tree);
    expect(imported.blobs.size).toBe(4);
    for (const picture of pictures) {
      expect([...imported.blobs.get(picture.pointer.contentHash)!]).toEqual([...picture.bytes]);
    }
  });

  it("is byte-deterministic with pictures, whatever order the caller built its map in", async () => {
    const pictures = [
      pictureOf(png(1024, 768, 3), "image/png", 1024, 768),
      pictureOf(jpeg(800, 600, 5), "image/jpeg", 800, 600),
      pictureOf(webp(512, 512, 7), "image/webp", 512, 512),
    ];
    const tree = treeWith(pictures.map((picture) => picture.pointer));

    const first = await exported(tree, blobMap(pictures));
    const second = await exported(tree, blobMap(pictures));
    const reversed = await exported(tree, blobMap([...pictures].reverse()));

    expect(second.bytes).toEqual(first.bytes);
    expect(reversed.bytes).toEqual(first.bytes);
  });

  it("stores one picture once however many passages point at it", async () => {
    const shared = pictureOf(png(1024, 768, 3), "image/png", 1024, 768);
    const tree = treeWith([shared.pointer, shared.pointer]);

    const result = await exported(tree, blobMap([shared]));

    expect(centralRecords(result.bytes).filter((record) => record.name.startsWith("matter/blobs/"))).toHaveLength(1);
    expect(result.missingImages).toBe(0);
    await expect(importSnapshotArchive(result.bytes)).resolves.toMatchObject({ ok: true });
  });

  it("never fails for missing bytes: it counts the distinct hashes it could not write", async () => {
    const present = pictureOf(png(1024, 768, 3), "image/png", 1024, 768);
    const absent = pictureOf(jpeg(800, 600, 5), "image/jpeg", 800, 600);
    const alsoAbsent = pictureOf(webp(512, 512, 7), "image/webp", 512, 512);
    const tree = treeWith([present.pointer, absent.pointer, absent.pointer, alsoAbsent.pointer]);

    const none = await exported(tree);
    const empty = await exported(tree, new Map());
    const some = await exported(tree, blobMap([present]));

    expect([none.missingImages, empty.missingImages, some.missingImages]).toEqual([3, 3, 2]);
    expect(none.bytes).toEqual(empty.bytes);
    expect(centralRecords(none.bytes).some((record) => record.name.startsWith("matter/blobs/"))).toBe(false);
    const imported = await importSnapshotArchive(none.bytes);
    expect(imported).toMatchObject({ ok: true, tree });
    if (imported.ok) expect(imported.blobs.size).toBe(0);
    const partial = await importSnapshotArchive(some.bytes);
    if (!partial.ok) throw new Error(partial.error.message);
    expect([...partial.blobs.keys()]).toEqual([present.pointer.contentHash]);
  });

  it("does not write pictures no pointer refers to", async () => {
    const referenced = pictureOf(png(1024, 768, 3), "image/png", 1024, 768);
    const stray = pictureOf(png(640, 480, 9), "image/png", 640, 480);
    const tree = treeWith([referenced.pointer]);

    const result = await exported(tree, blobMap([referenced, stray]));

    const names = centralRecords(result.bytes).map((record) => record.name);
    expect(names).toContain(pathOf(referenced.pointer));
    expect(names).not.toContain(pathOf(stray.pointer));
    await expect(importSnapshotArchive(result.bytes)).resolves.toMatchObject({ ok: true });
  });

  it("leaves out bytes the importer would refuse, so a damaged picture cannot poison the archive", async () => {
    const good = pictureOf(png(1024, 768, 3), "image/png", 1024, 768);
    const damaged = pictureOf(jpeg(800, 600, 5), "image/jpeg", 800, 600);
    const flipped = new Uint8Array(damaged.bytes);
    flipped[40] ^= 0xff;
    const notAnImage = pictureOf(new Uint8Array(500).fill(7), "image/png", 1024, 768);
    const tree = treeWith([good.pointer, damaged.pointer, notAnImage.pointer]);

    const result = await exported(tree, new Map([
      [good.pointer.contentHash, good.bytes],
      [damaged.pointer.contentHash, flipped],
      [notAnImage.pointer.contentHash, notAnImage.bytes],
    ]));

    expect(result.missingImages).toBe(2);
    const imported = await importSnapshotArchive(result.bytes);
    if (!imported.ok) throw new Error(imported.error.message);
    expect([...imported.blobs.keys()]).toEqual([good.pointer.contentHash]);
  });
});

describe("archive pictures: import", () => {
  const picture = pictureOf(png(1024, 768, 3), "image/png", 1024, 768);
  const tree = treeWith([picture.pointer]);

  it("accepts a pointer with no picture: missing bytes are a legal state", async () => {
    const result = await importSnapshotArchive(archiveOf(tree, {}));
    expect(result).toMatchObject({ ok: true, tree });
    if (result.ok) expect(result.blobs.size).toBe(0);
  });

  it("accepts a picture re-zipped with deflate by another tool", async () => {
    const result = await importSnapshotArchive(archiveOf(tree, { [pathOf(picture.pointer)]: picture.bytes }, 6));
    expect(code(result)).toBe("ok");
  });

  it("never decodes picture bytes as text", async () => {
    // A PNG signature starts with 0x89, which is not valid UTF-8.
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(picture.bytes)).toThrow();
    const result = await importSnapshotArchive(archiveOf(tree, { [pathOf(picture.pointer)]: picture.bytes }));
    expect(code(result)).toBe("ok");
  });

  it("still decodes text entries as strict UTF-8", async () => {
    const result = await importSnapshotArchive(archiveOf(tree, { [pathOf(picture.pointer)]: picture.bytes }, 0, {
      "matter/index.md": new Uint8Array([0xff, 0xfe]),
    }));
    expect(code(result)).toBe("ARCHIVE_INVALID");
  });

  it("rejects bytes whose SHA-256 is not the file name hash", async () => {
    const other = pictureOf(png(1024, 768, 4), "image/png", 1024, 768);
    expect(other.bytes.byteLength).toBe(picture.bytes.byteLength);
    const result = await importSnapshotArchive(archiveOf(tree, { [pathOf(picture.pointer)]: other.bytes }));
    expect(code(result)).toBe("ARCHIVE_BLOB_HASH_MISMATCH");
  });

  it("rejects a picture whose length is not the pointer byteLength", async () => {
    const longer = { ...picture.pointer, byteLength: picture.bytes.byteLength + 1 };
    const result = await importSnapshotArchive(archiveOf(treeWith([longer]), { [pathOf(longer)]: picture.bytes }));
    expect(code(result)).toBe("ARCHIVE_BLOB_SIZE_MISMATCH");
  });

  it("rejects bytes that are not a whole image of the declared type", async () => {
    const junk = pictureOf(new Uint8Array(500).fill(7), "image/png", 1024, 768);
    const cut = pictureOf(png(1024, 768, 3).subarray(0, 60), "image/png", 1024, 768);
    for (const candidate of [junk, cut]) {
      const result = await importSnapshotArchive(
        archiveOf(treeWith([candidate.pointer]), { [pathOf(candidate.pointer)]: candidate.bytes }),
      );
      expect(code(result)).toBe("ARCHIVE_BLOB_STRUCTURE_INVALID");
    }
  });

  it("rejects an image whose real dimensions differ from the pointer", async () => {
    const wrongBox = pictureOf(png(512, 512, 3), "image/png", 1024, 768);
    const result = await importSnapshotArchive(
      archiveOf(treeWith([wrongBox.pointer]), { [pathOf(wrongBox.pointer)]: wrongBox.bytes }),
    );
    expect(code(result)).toBe("ARCHIVE_BLOB_STRUCTURE_INVALID");
  });

  it("rejects a picture no pointer refers to", async () => {
    const stray = pictureOf(png(640, 480, 9), "image/png", 640, 480);
    const result = await importSnapshotArchive(archiveOf(tree, {
      [pathOf(picture.pointer)]: picture.bytes,
      [pathOf(stray.pointer)]: stray.bytes,
    }));
    expect(code(result)).toBe("ARCHIVE_BLOB_ORPHAN");
    expect(code(await importSnapshotArchive(archiveOf(treeWith([]), { [pathOf(stray.pointer)]: stray.bytes }))))
      .toBe("ARCHIVE_BLOB_ORPHAN");
  });

  it("rejects two entries for one hash", async () => {
    const result = await importSnapshotArchive(archiveOf(tree, {
      [`matter/blobs/${picture.pointer.contentHash}.png`]: picture.bytes,
      [`matter/blobs/${picture.pointer.contentHash}.jpg`]: picture.bytes,
    }));
    expect(code(result)).toBe("ARCHIVE_BLOB_DUPLICATE");
  });

  it("rejects a picture whose pointers disagree about it, before any picture is judged", async () => {
    const otherBox = { ...picture.pointer, width: 800, height: 600 };
    const otherType = { ...picture.pointer, mediaType: "image/webp" as const };
    const agreeing = archiveOf(treeWith([picture.pointer, picture.pointer]), {
      [pathOf(picture.pointer)]: picture.bytes,
    });
    expect((await importSnapshotArchive(agreeing)).ok).toBe(true);
    for (const disagreeing of [otherBox, otherType]) {
      // The writer refuses such a tree, so the text is rewritten after encoding.
      const files = unzipSync(agreeing);
      const decoder = new TextDecoder();
      const second = Object.keys(files).filter((path) => decoder.decode(files[path]!).includes("image: "))[1]!;
      const line = `image: ${JSON.stringify({
        byteLength: disagreeing.byteLength,
        contentHash: disagreeing.contentHash,
        height: disagreeing.height,
        mediaType: disagreeing.mediaType,
        width: disagreeing.width,
      })}\n`;
      files[second] = new TextEncoder().encode(decoder.decode(files[second]!).replace(/image: .*\n/u, line));
      const result = await importSnapshotArchive(zipSync(files, { mtime: MTIME }));
      expect(code(result)).toBe("ARCHIVE_INVALID");
    }
  });

  it("rejects an extension that contradicts the pointer media type", async () => {
    const result = await importSnapshotArchive(archiveOf(tree, {
      [`matter/blobs/${picture.pointer.contentHash}.jpg`]: picture.bytes,
    }));
    expect(code(result)).toBe("ARCHIVE_BLOB_TYPE_MISMATCH");
  });

  it("accepts only the exact picture path vocabulary", async () => {
    const hash = picture.pointer.contentHash;
    const rejected = [
      `matter/blobs/${hash.toUpperCase()}.png`,
      `matter/blobs/${hash}.PNG`,
      `matter/blobs/${hash}.jpeg`,
      `matter/blobs/${hash}.gif`,
      `matter/blobs/${hash}.png.zip`,
      `matter/blobs/${hash}`,
      `matter/blobs/${hash.slice(1)}.png`,
      `matter/blobs/${hash}0.png`,
      `matter/blobs/sub/${hash}.png`,
      `matter/blobs/${hash}.png/extra`,
      `matter/blobs/${hash}/index.md`,
      `matter/blobs/index.md`,
      `matter/blobs/readme.txt`,
      `matter/blobs.png`,
      `matter/other/${hash}.png`,
      `blobs/${hash}.png`,
    ];
    for (const path of rejected) {
      const result = await importSnapshotArchive(archiveOf(tree, { [path]: picture.bytes }));
      expect([path, code(result)]).toEqual([path, "ARCHIVE_UNSUPPORTED_ENTRY"]);
    }
  });

  it("rejects an entry the central directory does not list", async () => {
    const bytes = archiveOf(tree, { [pathOf(picture.pointer)]: picture.bytes });
    const record = centralRecords(bytes).find((candidate) => candidate.name === pathOf(picture.pointer))!;
    const renamed = new Uint8Array(bytes);
    // Same length, still a valid picture path, but not the name the local header carries.
    renamed[record.central + 46 + "matter/blobs/".length] = "b".charCodeAt(0);
    expect(code(await importSnapshotArchive(renamed))).toBe("ARCHIVE_INVALID");
  });
});

describe("archive pictures: bounds", () => {
  const picture = pictureOf(png(1024, 768, 3), "image/png", 1024, 768);
  const tree = treeWith([picture.pointer]);
  const path = pathOf(picture.pointer);

  it("judges declared picture sizes in the central directory before inflating anything", async () => {
    const honest = archiveOf(tree, { [path]: picture.bytes });
    expect(code(await importSnapshotArchive(forgeSize(honest, path, { central: MAX_IMAGE_POINTER_BYTES + 1 }))))
      .toBe("ARCHIVE_BOUND_EXCEEDED");

    const oversize = new Uint8Array(MAX_IMAGE_POINTER_BYTES + 1);
    const deflated = archiveOf(tree, { [`matter/blobs/${HASH_A}.png`]: oversize }, 6);
    const record = centralRecords(deflated).find((candidate) => candidate.name.includes(HASH_A))!;
    // A corrupt stream would report corrupt data if anything were inflated first.
    const corrupt = new Uint8Array(deflated);
    corrupt.fill(0xff, record.local + 30 + record.name.length + 4, record.local + 30 + record.name.length + 12);
    expect(code(await importSnapshotArchive(corrupt))).toBe("ARCHIVE_BOUND_EXCEEDED");
  });

  it("judges the local header's declared size too, and refuses a header that disagrees with the directory", async () => {
    const honest = archiveOf(tree, { [path]: picture.bytes });
    expect(code(await importSnapshotArchive(forgeSize(honest, path, { local: MAX_IMAGE_POINTER_BYTES + 1 }))))
      .toBe("ARCHIVE_BOUND_EXCEEDED");
    expect(code(await importSnapshotArchive(forgeSize(honest, path, { local: picture.bytes.byteLength - 1 }))))
      .toBe("ARCHIVE_INVALID");
    expect(code(await importSnapshotArchive(forgeSize(honest, path, { central: picture.bytes.byteLength - 1 }))))
      .toBe("ARCHIVE_INVALID");
  });

  it("re-checks the inflated size against the cap and against what it declared", { timeout: 15_000 }, async () => {
    const bomb = archiveOf(tree, { [path]: new Uint8Array(MAX_IMAGE_POINTER_BYTES + 4096) }, 6);
    const lies = forgeSize(bomb, path, { central: 10, local: 10 });
    expect(code(await importSnapshotArchive(lies))).toBe("ARCHIVE_BOUND_EXCEEDED");

    const modest = archiveOf(tree, { [path]: new Uint8Array(4096) }, 6);
    expect(code(await importSnapshotArchive(forgeSize(modest, path, { central: 10, local: 10 }))))
      .toBe("ARCHIVE_INVALID");
  });

  it("refuses more pictures than a tree may carry, before decoding", async () => {
    const entries: Record<string, Uint8Array> = {};
    for (let index = 0; index <= MAX_TREE_IMAGE_NODES; index += 1) {
      entries[`matter/blobs/${index.toString(16).padStart(64, "0")}.png`] = new Uint8Array(1);
    }
    expect(code(await importSnapshotArchive(archiveOf(treeWith([]), entries)))).toBe("ARCHIVE_BOUND_EXCEEDED");
    delete entries[`matter/blobs/${MAX_TREE_IMAGE_NODES.toString(16).padStart(64, "0")}.png`];
    expect(code(await importSnapshotArchive(archiveOf(treeWith([]), entries)))).toBe("ARCHIVE_BLOB_ORPHAN");
  });

  it("refuses more picture bytes in total than a tree may carry, before inflating", async () => {
    const entries: Record<string, Uint8Array> = {};
    const count = MAX_TREE_IMAGE_BYTES / MAX_IMAGE_POINTER_BYTES + 1;
    for (let index = 0; index < count; index += 1) {
      entries[`matter/blobs/${index.toString(16).padStart(64, "0")}.png`] = new Uint8Array(1);
    }
    let forged = archiveOf(treeWith([]), entries);
    for (const name of Object.keys(entries)) forged = forgeSize(forged, name, { central: MAX_IMAGE_POINTER_BYTES });
    expect(code(await importSnapshotArchive(forged))).toBe("ARCHIVE_BOUND_EXCEEDED");
  });

  it("keeps the picture allowance out of the text allowance", { timeout: 15_000 }, async () => {
    // 17 MB of text plus 2 MiB of picture exceeds the 18 MB text bound only if
    // the two were counted together. The tree is nonsense, so reaching tree
    // decoding (ARCHIVE_INVALID) is the proof that no bound fired.
    const text = new Uint8Array(17_000_000).fill(0x61);
    const result = await importSnapshotArchive(archiveOf(treeWith([]), {
      [`matter/blobs/${HASH_A}.png`]: new Uint8Array(MAX_IMAGE_POINTER_BYTES),
    }, 6, { "matter/index.md": text }));
    expect(code(result)).toBe("ARCHIVE_INVALID");
  });

  it("does not let text spend the picture allowance either", { timeout: 15_000 }, async () => {
    const text = new Uint8Array(18_000_001).fill(0x61);
    const result = await importSnapshotArchive(archiveOf(treeWith([]), {}, 6, { "matter/index.md": text }));
    expect(code(result)).toBe("ARCHIVE_BOUND_EXCEEDED");
  });

  it("feeds the unzipper small slices so one chunk cannot inflate far past its checks", async () => {
    const pushes: Array<Readonly<{ length: number; final: boolean }>> = [];
    vi.resetModules();
    vi.doMock("fflate", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fflate")>();
      class RecordingUnzip extends actual.Unzip {
        override push(chunk: Uint8Array, final?: boolean) {
          pushes.push({ length: chunk.length, final: final === true });
          super.push(chunk, final);
        }
      }
      return { ...actual, Unzip: RecordingUnzip };
    });
    try {
      const transport = await import("./archive-transport");
      const bytes = archiveOf(tree, {
        [path]: picture.bytes,
        [`matter/blobs/${HASH_A}.png`]: new Uint8Array(100_000),
      });
      const result = await transport.importSnapshotArchive(bytes);
      expect(result.ok ? "ok" : result.error.code).toBe("ARCHIVE_BLOB_ORPHAN");
      expect(pushes.length).toBeGreaterThan(1);
      expect(Math.max(...pushes.map((push) => push.length))).toBeLessThanOrEqual(16 * 1024);
      expect(pushes[pushes.length - 1]!.final).toBe(true);
    } finally {
      vi.doUnmock("fflate");
      vi.resetModules();
    }
  });

  it("round-trips archives through fflate's own reader as plain stored files", async () => {
    const result = await exported(tree, blobMap([picture]));
    expect([...unzipSync(result.bytes)[path]!]).toEqual([...picture.bytes]);
  });
});
