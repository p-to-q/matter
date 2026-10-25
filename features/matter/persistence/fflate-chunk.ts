import {
  zip as encodeZip,
  type AsyncTerminable,
  type AsyncZippable,
  type AsyncZipOptions,
  type FlateCallback,
} from "fflate";

export { Unzip, UnzipInflate } from "fflate";

/** The archive's narrow asynchronous encoder, not a second ZIP policy. */
export function zip(
  data: AsyncZippable,
  options: AsyncZipOptions,
  callback: FlateCallback,
): AsyncTerminable {
  return encodeZip(data, options, callback);
}

Object.defineProperty(zip, "matterCapability", { value: "matter-capability:archive-codec" });
