const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** True only when every UTF-16 surrogate belongs to one Unicode scalar value. */
export function isWellFormedUnicodeText(value: string): boolean {
  return !LONE_SURROGATE.test(value);
}
