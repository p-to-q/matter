import { describe, expect, it } from "vitest";
import {
  canonicalizeMaterialText,
  captureMaterialLexicalSession,
  IDENTITY_MATERIAL_LEXICAL_SESSION,
  type MaterialLexicalPort,
  type MaterialLexicalSession,
} from "./material-lexical-port";

const REQUEST = Object.freeze({
  locale: "en-US" as const,
  channel: "spoken" as const,
  text: "code x",
});

describe("Material lexical port", () => {
  it("fails open when capture is unavailable or malformed", () => {
    const throwing: MaterialLexicalPort = {
      capture: () => {
        throw new Error("storage unavailable");
      },
    };
    const malformed = {
      capture: () => ({
        snapshot: { generation: -1, sourceRevision: 0 },
        canonicalize: () => ({
          status: "changed",
          patches: [{ start: 0, end: 6, replacement: "Codex" }],
        }),
      }),
    } as MaterialLexicalPort;

    expect(captureMaterialLexicalSession(throwing))
      .toBe(IDENTITY_MATERIAL_LEXICAL_SESSION);
    expect(captureMaterialLexicalSession(malformed))
      .toBe(IDENTITY_MATERIAL_LEXICAL_SESSION);
  });

  it("fails open when a captured adapter throws or breaks its result contract", () => {
    const throwing: MaterialLexicalSession = Object.freeze({
      snapshot: Object.freeze({ generation: 1, sourceRevision: 1 }),
      canonicalize: () => {
        throw new Error("matcher unavailable");
      },
    });
    const malformed: MaterialLexicalSession = Object.freeze({
      snapshot: Object.freeze({ generation: 1, sourceRevision: 1 }),
      canonicalize: () => Object.freeze({
        status: "changed",
        patches: Object.freeze([
          Object.freeze({ start: 0, end: 6, replacement: "code x" }),
        ]),
      }),
    });

    expect(canonicalizeMaterialText(throwing, REQUEST)).toEqual({
      status: "unchanged",
      text: "code x",
      changed: false,
      editCount: 0,
    });
    expect(canonicalizeMaterialText(malformed, REQUEST)).toEqual({
      status: "unchanged",
      text: "code x",
      changed: false,
      editCount: 0,
    });
  });

  it("accepts one coherent suggestion without granting commit authority", () => {
    const session: MaterialLexicalSession = Object.freeze({
      snapshot: Object.freeze({ generation: 2, sourceRevision: 3 }),
      canonicalize: () => Object.freeze({
        status: "changed",
        patches: Object.freeze([
          Object.freeze({ start: 0, end: 6, replacement: "Codex" }),
        ]),
      }),
    });

    const result = canonicalizeMaterialText(session, REQUEST);
    expect(result).toEqual({
      status: "changed",
      text: "Codex",
      changed: true,
      editCount: 1,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects patches outside eligible ranges, across grapheme seams, or out of order", () => {
    const request = Object.freeze({
      locale: "en-US" as const,
      channel: "written" as const,
      text: "source 😀 generated",
      eligibleRanges: Object.freeze([Object.freeze({ start: 10, end: 19 })]),
    });
    const session = (patches: readonly {
      start: number;
      end: number;
      replacement: string;
    }[]): MaterialLexicalSession => Object.freeze({
      snapshot: Object.freeze({ generation: 1, sourceRevision: 1 }),
      canonicalize: () => Object.freeze({ status: "changed", patches }),
    });

    expect(canonicalizeMaterialText(session([
      { start: 0, end: 6, replacement: "changed" },
    ]), request).changed).toBe(false);
    expect(canonicalizeMaterialText(session([
      { start: 8, end: 9, replacement: "x" },
    ]), { ...request, eligibleRanges: [{ start: 7, end: 10 }] }).changed).toBe(false);
    expect(canonicalizeMaterialText(session([
      { start: 14, end: 19, replacement: "term" },
      { start: 10, end: 13, replacement: "new" },
    ]), request).changed).toBe(false);
  });

  it("owns the request before calling an adapter", () => {
    const ranges = [{ start: 0, end: 6 }];
    const session: MaterialLexicalSession = Object.freeze({
      snapshot: Object.freeze({ generation: 1, sourceRevision: 1 }),
      canonicalize: (request) => {
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.eligibleRanges)).toBe(true);
        expect(request.eligibleRanges).not.toBe(ranges);
        return Object.freeze({ status: "unchanged" });
      },
    });

    expect(canonicalizeMaterialText(session, {
      ...REQUEST,
      eligibleRanges: ranges,
    }).changed).toBe(false);
  });
});
