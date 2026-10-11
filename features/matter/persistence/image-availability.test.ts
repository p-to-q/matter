import { describe, expect, it } from "vitest";
import type { ImageBlobFailureCode, ImageBlobRead, ImageBlobResult } from "./image-blob-repository";
import { projectImageAvailability } from "./image-availability";

const ok = (value: ImageBlobRead): ImageBlobResult<ImageBlobRead> => ({ ok: true, value });
const failed = (code: ImageBlobFailureCode): ImageBlobResult<ImageBlobRead> => ({ ok: false, code });

describe("image availability", () => {
  it("names an intact row, no row, and an untrustworthy row distinctly", () => {
    const blob = { pointer: {} as never, bytes: new ArrayBuffer(1), storedAt: "t" };
    expect(projectImageAvailability(ok({ status: "found", blob }))).toBe("resident");
    expect(projectImageAvailability(ok({ status: "absent" }))).toBe("absent");
    expect(projectImageAvailability(ok({ status: "damaged" }))).toBe("damaged");
  });

  it.each(["STORAGE_FULL", "STORAGE_UNAVAILABLE", "REJECTED", "SUPERSEDED"] as const)(
    "reports %s as not knowing, never as absent",
    (code) => {
      expect(projectImageAvailability(failed(code))).toBe("unavailable");
    },
  );
});
