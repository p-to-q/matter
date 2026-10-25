import type { ImagePointer } from "../tree/image-pointer";
import { sha256Hex } from "../tree/sha256";
import { inspectImageStructure } from "./image-structure";

/**
 * Why bytes are not the picture a pointer names. `digest-unavailable` is not a
 * verdict on the bytes: where `crypto.subtle` is missing nothing can be proven,
 * and unproven bytes are refused or reported by each caller in its own words.
 */
export type PictureBytesFault =
  | "size-mismatch"
  | "hash-mismatch"
  | "structure-invalid"
  | "digest-unavailable";

export type PictureBytesVerdict =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; fault: PictureBytesFault }>;

const VERIFIED: PictureBytesVerdict = Object.freeze({ ok: true });

/**
 * The one answer to "are these bytes the picture this pointer says?": exact
 * length, then SHA-256, then the real structure with the pointer's type and
 * dimensions. The client that receives bytes, the store that keeps them and the
 * archive that carries them all call this, so a picture one of them accepts is
 * one the others accept.
 */
export async function verifyPictureBytes(
  pointer: ImagePointer,
  bytes: Uint8Array | ArrayBuffer,
): Promise<PictureBytesVerdict> {
  if (bytes.byteLength !== pointer.byteLength) return fault("size-mismatch");
  let digest: string;
  try {
    digest = await sha256Hex(bytes);
  } catch {
    return fault("digest-unavailable");
  }
  if (digest !== pointer.contentHash) return fault("hash-mismatch");
  const structure = inspectImageStructure(
    ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes),
    pointer.mediaType,
  );
  return structure.ok && structure.width === pointer.width && structure.height === pointer.height
    ? VERIFIED
    : fault("structure-invalid");
}

function fault(reason: PictureBytesFault): PictureBytesVerdict {
  return Object.freeze({ ok: false, fault: reason });
}
