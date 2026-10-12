/**
 * What the browser must provide for a picture to be finished once the relay
 * has been paid: hashing the bytes, keeping them in the blob store, and
 * showing them. A page on an insecure origin has no `crypto.subtle`; offering
 * the control there would bill the person for a picture the client then
 * refuses. The question is asked of an environment value so it needs no
 * browser to be tested.
 */
export type PictureEnvironment = Readonly<{
  crypto?: { subtle?: unknown } | null;
  indexedDB?: unknown;
  Blob?: unknown;
  URL?: { createObjectURL?: unknown } | null;
}>;

export function pictureEnvironmentSupported(environment: PictureEnvironment): boolean {
  return typeof environment.crypto?.subtle === "object" &&
    environment.crypto.subtle !== null &&
    environment.indexedDB != null &&
    typeof environment.Blob === "function" &&
    typeof environment.URL?.createObjectURL === "function";
}
