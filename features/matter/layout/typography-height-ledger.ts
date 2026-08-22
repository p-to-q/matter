export const TYPOGRAPHY_HEIGHT_CACHE_LIMIT = 4_096;

export type TypographyHeightAuthorityBasis = Readonly<{
  authorityGeneration: number;
  documentEpoch: number;
  fontEpoch: number;
  grammarEpoch: number;
  projectionKey: string;
  styleEpoch: number;
}>;

export type TypographyHeightAuthorityToken = TypographyHeightAuthorityBasis;

/**
 * Disposable scalar cache used by one rendering-edge typography owner.
 * Tokens are instance capabilities: matching numbers from another owner do not
 * authorize a read or publication.
 */
export class TypographyHeightLedger {
  #generation = 0;
  #heights = new Map<string, number>();
  readonly #issued = new WeakSet<object>();
  readonly #limit: number;

  constructor(limit = TYPOGRAPHY_HEIGHT_CACHE_LIMIT) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError("Typography height cache limit must be a positive safe integer.");
    }
    this.#limit = limit;
  }

  get generation(): number {
    return this.#generation;
  }

  get limit(): number {
    return this.#limit;
  }

  get size(): number {
    return this.#heights.size;
  }

  begin(input: Omit<TypographyHeightAuthorityBasis, "authorityGeneration">): TypographyHeightAuthorityToken {
    assertBasis(input);
    const token = Object.freeze({
      ...input,
      authorityGeneration: this.#generation,
    });
    this.#issued.add(token);
    return token;
  }

  isCurrent(token: TypographyHeightAuthorityToken): boolean {
    return this.#issued.has(token) && token.authorityGeneration === this.#generation;
  }

  get(token: TypographyHeightAuthorityToken, key: string): number | undefined {
    if (!this.isCurrent(token)) return undefined;
    const height = this.#heights.get(key);
    if (height === undefined) return undefined;
    // Map insertion order is the LRU clock. A read is the only mutation a hit
    // may perform; the scalar and its authority remain unchanged.
    this.#heights.delete(key);
    this.#heights.set(key, height);
    return height;
  }

  peek(token: TypographyHeightAuthorityToken, key: string): number | undefined {
    return this.isCurrent(token) ? this.#heights.get(key) : undefined;
  }

  commit(
    token: TypographyHeightAuthorityToken,
    staged: ReadonlyMap<string, number>,
    accessedKeys: readonly string[] = [],
  ): boolean {
    if (!this.isCurrent(token)) return false;
    for (const key of accessedKeys) {
      if (key.length === 0) throw new TypeError("Typography height keys must be non-empty.");
    }
    for (const [key, height] of staged) {
      if (key.length === 0) throw new TypeError("Typography height keys must be non-empty.");
      assertPositiveHeight(height);
    }
    if (!this.isCurrent(token)) return false;

    // Publish by replacement so validation or a stale token can never expose a
    // prefix from an otherwise rejected measurement transaction.
    const next = new Map(this.#heights);
    for (const key of accessedKeys) {
      const height = next.get(key);
      if (height === undefined) continue;
      next.delete(key);
      next.set(key, height);
    }
    for (const [key, height] of staged) {
      next.delete(key);
      next.set(key, height);
    }
    while (next.size > this.#limit) {
      const oldest = next.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      next.delete(oldest);
    }
    if (!this.isCurrent(token)) return false;
    this.#heights = next;
    return true;
  }

  invalidate(): void {
    if (this.#generation >= Number.MAX_SAFE_INTEGER) {
      // A renderer cannot safely distinguish another epoch after exhaustion.
      // Clearing first keeps the fail-closed state free of reusable heights.
      this.#heights.clear();
      throw new RangeError("Typography authority generation is exhausted.");
    }
    this.#generation += 1;
    this.#heights.clear();
  }

  clear(): void {
    this.invalidate();
  }
}

export function assertPositiveHeight(height: number): void {
  if (!Number.isFinite(height) || height <= 0) {
    throw new TypeError("Typography height must be a finite positive scalar.");
  }
}

function assertBasis(
  input: Omit<TypographyHeightAuthorityBasis, "authorityGeneration">,
): void {
  for (const value of [input.documentEpoch, input.fontEpoch, input.grammarEpoch, input.styleEpoch]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("Typography authority epochs must be non-negative safe integers.");
    }
  }
  if (input.projectionKey.length === 0) {
    throw new TypeError("Typography authority requires a projection key.");
  }
}
