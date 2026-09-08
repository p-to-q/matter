const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** Text is serializable without UTF-8 replacing an unpaired UTF-16 surrogate. */
export function isWellFormedUnicodeText(value: string): boolean {
  return !LONE_SURROGATE.test(value);
}
