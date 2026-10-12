/** The one lowercase-hex SHA-256 shape: a picture's content hash and a receipt digest. */
export const SHA256_HEX = /^[0-9a-f]{64}$/u;

/**
 * The one SHA-256 of this codebase, over Web Crypto so the browser and the
 * server agree. It rejects where `crypto.subtle` is missing (an insecure
 * context); callers decide whether that means "refuse" or "unavailable".
 */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  // The cast narrows a possibly shared buffer type for BufferSource; digest reads, never writes.
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
