import { describe, expect, it } from "vitest";
import {
  findProtectedTranscriptLiteralSpans,
  MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL,
} from "./protected-transcript-literal";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

describe("protected transcript literal", () => {
  it("keeps maximum-length mixed-script prose on the literal-free fast path", () => {
    const text = "中A".repeat(MAX_NODE_TEXT_CODE_UNITS / 2);

    expect(text).toHaveLength(MAX_NODE_TEXT_CODE_UNITS);
    expect(MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL.test(text)).toBe(false);
    expect(findProtectedTranscriptLiteralSpans(text)).toEqual([]);
  });

  it.each([
    ["fenced code", "before ```const x = 1;``` after", "```const x = 1;```"],
    ["inline code", "before `node.id` after", "`node.id`"],
    ["curly quote", "before “quiet material” after", "“quiet material”"],
    ["curly single quote", "before ‘quiet material’ after", "‘quiet material’"],
    ["corner quote", "before 「quiet material」 after", "「quiet material」"],
    ["white corner quote", "before 『quiet material』 after", "『quiet material』"],
    ["straight quote", 'before "quiet material" after', '"quiet material"'],
    ["URL", "visit https://matter.ptoq.io/path", "https://matter.ptoq.io/path"],
    ["email", "write owner@example.com now", "owner@example.com"],
    ["POSIX path", "open ../matter/archive.json now", "../matter/archive.json"],
    ["Windows path", "open C:\\Matter\\archive.json now", "C:\\Matter\\archive.json"],
    ["flag", "run --profile now", "--profile"],
    ["IPv4 address", "use 127.0.0.1 locally", "127.0.0.1"],
    ["version", "ship v0.2.0 today", "v0.2.0"],
    ["dotted identifier", "read matter.runtime now", "matter.runtime"],
    ["snake identifier", "read material_node now", "material_node"],
    ["camel identifier", "read materialNode now", "materialNode"],
    ["acronym", "the URL stays literal", "URL"],
  ] as const)("admits and locates a %s", (_label, text, literal) => {
    expect(MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL.test(text)).toBe(true);
    expect(findProtectedTranscriptLiteralSpans(text).map(([start, end]) => text.slice(start, end)))
      .toContain(literal);
  });
});
