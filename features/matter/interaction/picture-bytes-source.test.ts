import { describe, expect, it, vi } from "vitest";
import type { ImageBlobFailureCode, ImageBlobRead, ImageBlobRepository } from "../persistence/image-blob-repository";
import type { ImagePointer } from "../tree/image-pointer";
import { createPictureBytesSource, UNAVAILABLE_PICTURE_BYTES } from "./picture-bytes-source";
import { createPictureSessionCache } from "./picture-session-cache";

const BYTES = Uint8Array.from([1, 2, 3, 4]);
const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: BYTES.byteLength,
  width: 512,
  height: 256,
  contentHash: "a".repeat(64),
};

function repositoryReturning(
  result: Awaited<ReturnType<ImageBlobRepository["getImageBlob"]>>,
) {
  const getImageBlob = vi.fn(() => Promise.resolve(result));
  const repository = { getImageBlob } as unknown as ImageBlobRepository;
  return { getImageBlob, repository };
}

const read = (value: ImageBlobRead) => ({ ok: true, value }) as const;
const failure = (code: ImageBlobFailureCode) => ({ ok: false, code }) as const;

describe("picture bytes source", () => {
  it("reports an intact row as resident with its exact bytes", async () => {
    const { repository } = repositoryReturning(read({
      status: "found",
      blob: { pointer: POINTER, bytes: BYTES.slice().buffer, storedAt: "2026-10-12T00:00:00.000Z" },
    }));
    const source = createPictureBytesSource({ cache: createPictureSessionCache(), repository });

    const result = await source.read(POINTER);

    expect(result.status).toBe("resident");
    expect(result.status === "resident" ? Array.from(result.bytes) : null).toEqual([1, 2, 3, 4]);
  });

  it("maps absent, damaged, and every refusal through the one availability projection", async () => {
    const cases = [
      [read({ status: "absent" }), "absent"],
      [read({ status: "damaged" }), "damaged"],
      [failure("STORAGE_UNAVAILABLE"), "unavailable"],
      [failure("STORAGE_FULL"), "unavailable"],
      [failure("REJECTED"), "unavailable"],
      [failure("SUPERSEDED"), "unavailable"],
    ] as const;
    for (const [stored, expected] of cases) {
      const { repository } = repositoryReturning(stored);
      const source = createPictureBytesSource({ cache: createPictureSessionCache(), repository });
      expect(await source.read(POINTER)).toEqual({ status: expected });
    }
  });

  it("answers from the session cache without consulting the store", async () => {
    const cache = createPictureSessionCache();
    expect(cache.put({ bytes: BYTES, pointer: POINTER })).toBe(true);
    const { getImageBlob, repository } = repositoryReturning(read({ status: "absent" }));

    const result = await createPictureBytesSource({ cache, repository }).read(POINTER);

    expect(result.status).toBe("resident");
    expect(getImageBlob).not.toHaveBeenCalled();
  });

  it("lets the store decide when the cache holds a different picture", async () => {
    const cache = createPictureSessionCache();
    const other = { ...POINTER, contentHash: "b".repeat(64) };
    cache.put({ bytes: BYTES, pointer: other });
    const { getImageBlob, repository } = repositoryReturning(read({ status: "absent" }));

    expect(await createPictureBytesSource({ cache, repository }).read(POINTER)).toEqual({ status: "absent" });
    expect(getImageBlob).toHaveBeenCalledWith(POINTER.contentHash);
  });

  it("reads every picture as unavailable when no store is provided", async () => {
    expect(await UNAVAILABLE_PICTURE_BYTES.read(POINTER)).toEqual({ status: "unavailable" });
  });
});
