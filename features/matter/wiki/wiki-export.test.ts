import { describe, expect, it } from "vitest";
import { applyWikiEvent, createEmptyWikiState } from "./wiki-evidence";
import { decodeWikiExport, encodeWikiExport } from "./wiki-export";

describe("Wiki export", () => {
  it("round-trips deterministic UTF-8 bytes without device metadata", () => {
    const transitioned = applyWikiEvent(createEmptyWikiState(), {
      type: "confirm-rule",
      locale: "zh-CN",
      channel: "spoken",
      boundary: "literal",
      form: "科德克斯",
      canonical: "Codex",
    });
    if (!transitioned.ok) throw new Error(transitioned.error.message);

    const first = encodeWikiExport(transitioned.state);
    const second = encodeWikiExport(transitioned.state);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.bytes).toEqual(second.bytes);
    expect(new TextDecoder().decode(first.bytes)).not.toMatch(/exportedAt|device|origin/);
    expect(decodeWikiExport(first.bytes)).toEqual({
      ok: true,
      envelope: first.envelope,
    });
  });

  it("rejects unknown versions, extra fields, invalid UTF-8, and malformed state", () => {
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(decodeWikiExport(bytes({
      format: "matter-wiki",
      formatVersion: 3,
      state: createEmptyWikiState(),
    }))).toEqual({ ok: false, code: "INVALID_FORMAT" });
    expect(decodeWikiExport(bytes({
      format: "matter-wiki",
      formatVersion: 1,
      state: createEmptyWikiState(),
      extra: true,
    }))).toEqual({ ok: false, code: "INVALID_FORMAT" });
    expect(decodeWikiExport(Uint8Array.from([0xc3, 0x28])))
      .toEqual({ ok: false, code: "INVALID_ENCODING" });
    expect(decodeWikiExport(bytes({
      format: "matter-wiki",
      formatVersion: 1,
      state: { rawMaterial: "private passage" },
    }))).toEqual({ ok: false, code: "INVALID_FORMAT" });
  });
});
