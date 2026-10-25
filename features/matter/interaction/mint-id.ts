export type IdEntropySource = Readonly<{
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}>;

const ID_PREFIX = /^[A-Za-z][A-Za-z0-9_]{0,94}$/u;
const UUID_HEX = /^[0-9a-f]{32}$/u;

/** Mints a bounded browser id from Web Crypto, or fails closed without CSPRNG. */
export function mintId(
  prefix: string,
  source: IdEntropySource | undefined = typeof globalThis.crypto === "undefined"
    ? undefined
    : globalThis.crypto,
): string | null {
  if (!ID_PREFIX.test(prefix) || source === undefined) return null;

  const uuidHex = randomUuidHex(source);
  if (uuidHex !== null) return `${prefix}_${uuidHex}`;

  if (typeof source.getRandomValues !== "function") return null;
  try {
    const bytes = new Uint8Array(16);
    source.getRandomValues(bytes);
    const entropy = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${entropy}`;
  } catch {
    return null;
  }
}

function randomUuidHex(source: IdEntropySource): string | null {
  if (typeof source.randomUUID !== "function") return null;
  try {
    const value = source.randomUUID().replaceAll("-", "").toLowerCase();
    return UUID_HEX.test(value) ? value : null;
  } catch {
    return null;
  }
}
