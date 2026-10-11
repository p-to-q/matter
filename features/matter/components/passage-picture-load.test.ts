import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { PictureBytesRead, PictureBytesSource } from "../interaction/picture-bytes-source";
import type { ImagePointer } from "../tree/image-pointer";
import { startPictureLoad, type PictureLoadState } from "./passage-picture-load";

const BYTES = Uint8Array.from([9, 8, 7, 6, 5]);
const POINTER: ImagePointer = {
  mediaType: "image/webp",
  byteLength: BYTES.byteLength,
  width: 512,
  height: 512,
  contentHash: "c".repeat(64),
};

function harness(read: () => Promise<PictureBytesRead>) {
  const blobs: Blob[] = [];
  let next = 0;
  const create = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return `blob:picture-${(next += 1)}`;
  });
  const revoke = vi.fn();
  const changes: PictureLoadState[] = [];
  const source: PictureBytesSource = { read: vi.fn(read) };
  const start = (pointer: ImagePointer = POINTER) => startPictureLoad({
    pointer,
    source,
    urls: { create, revoke },
    onChange: (state) => changes.push(state),
  });
  return { blobs, changes, create, revoke, source, start };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const resident = () => Promise.resolve<PictureBytesRead>({ status: "resident", bytes: BYTES });

describe("passage picture load", () => {
  it("creates exactly one object URL for resident bytes and revokes it on dispose", async () => {
    const { changes, create, revoke, start } = harness(resident);
    const dispose = start();
    await settle();

    expect(create).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([{ phase: "resident", url: "blob:picture-1" }]);
    expect(revoke).not.toHaveBeenCalled();

    dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:picture-1");
    dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("hands the stored bytes to the Blob unchanged and typed by the pointer", async () => {
    const { blobs, start } = harness(resident);
    start();
    await settle();

    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe("image/webp");
    expect(Array.from(new Uint8Array(await blobs[0]!.arrayBuffer()))).toEqual([9, 8, 7, 6, 5]);
  });

  it("revokes the old URL and creates a new one when the pointer changes", async () => {
    const { changes, create, revoke, start } = harness(resident);
    const disposeFirst = start();
    await settle();
    disposeFirst();
    const second = { ...POINTER, contentHash: "d".repeat(64) };
    const disposeSecond = start(second);
    await settle();

    expect(revoke).toHaveBeenCalledWith("blob:picture-1");
    expect(create).toHaveBeenCalledTimes(2);
    expect(changes.at(-1)).toEqual({ phase: "resident", url: "blob:picture-2" });
    disposeSecond();
    expect(revoke).toHaveBeenCalledWith("blob:picture-2");
  });

  it("creates no URL for a placeholder state and has nothing to revoke", async () => {
    for (const status of ["absent", "damaged", "unavailable"] as const) {
      const { changes, create, revoke, start } = harness(() => Promise.resolve({ status }));
      const dispose = start();
      await settle();
      dispose();

      expect(changes).toEqual([{ phase: "missing", reason: status }]);
      expect(create).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    }
  });

  it("reads a source that rejects as unavailable", async () => {
    const { changes, create, start } = harness(() => Promise.reject(new Error("boom")));
    start();
    await settle();

    expect(changes).toEqual([{ phase: "missing", reason: "unavailable" }]);
    expect(create).not.toHaveBeenCalled();
  });

  it("ignores bytes that arrive after disposal and creates no URL for them", async () => {
    let deliver: (read: PictureBytesRead) => void = () => undefined;
    const { changes, create, revoke, start } = harness(
      () => new Promise<PictureBytesRead>((resolve) => { deliver = resolve; }),
    );
    const dispose = start();
    dispose();
    deliver({ status: "resident", bytes: BYTES });
    await settle();

    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it("keeps the browser URL calls in one adapter that only the loader drives", () => {
    const component = readFileSync(new URL("./PassagePicture.tsx", import.meta.url), "utf8");
    const loader = readFileSync(new URL("./passage-picture-load.ts", import.meta.url), "utf8");
    expect(component.match(/createObjectURL/gu)).toHaveLength(1);
    expect(component.match(/revokeObjectURL/gu)).toHaveLength(1);
    expect(loader.match(/urls\.create\(/gu)).toHaveLength(1);
    expect(loader.match(/urls\.revoke\(/gu)).toHaveLength(1);
    expect(loader).not.toMatch(/createObjectURL|revokeObjectURL/u);
  });
});
