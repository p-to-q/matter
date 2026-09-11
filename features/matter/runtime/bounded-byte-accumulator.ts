/**
 * Owns bytes at an external streaming boundary.
 *
 * A ReadableStream is allowed to reuse or later mutate the Uint8Array view it
 * yields. Keeping those views until EOF therefore keeps neither byte identity
 * nor bounded fragment metadata. This owner snapshots each fragment while it
 * is current and retains only one geometrically growing buffer.
 *
 * Reader cancellation, deadlines, decoding, and product errors stay with the
 * adapter that owns the external operation.
 */
export class BoundedByteAccumulator {
  readonly #maxBytes: number;
  #bytes = new Uint8Array(0);
  #length = 0;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError("Invalid byte limit.");
    }
    this.#maxBytes = maxBytes;
  }

  /** Returns false without retaining any part of a fragment that crosses the bound. */
  append(fragment: Uint8Array): boolean {
    if (!(fragment instanceof Uint8Array)) {
      throw new TypeError("Expected bytes.");
    }
    if (fragment.byteLength > this.#maxBytes - this.#length) return false;
    if (fragment.byteLength === 0) return true;

    const required = this.#length + fragment.byteLength;
    if (required > this.#bytes.byteLength) {
      const grown = new Uint8Array(Math.min(
        this.#maxBytes,
        Math.max(required, this.#bytes.byteLength * 2, 256),
      ));
      grown.set(this.#bytes.subarray(0, this.#length));
      this.#bytes = grown;
    }
    this.#bytes.set(fragment, this.#length);
    this.#length = required;
    return true;
  }

  /** Returns an exact independent snapshot; unused capacity never escapes. */
  snapshot(): Uint8Array<ArrayBuffer> {
    return this.#bytes.slice(0, this.#length);
  }
}
