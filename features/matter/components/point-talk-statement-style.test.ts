import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./PointTalkComposer.css", import.meta.url), "utf8");

function rule(selector: string, source = css): string {
  const escaped = selector.replaceAll(".", "\\.");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u").exec(source)?.[1] ?? "";
}

describe("the picture cost and privacy statement", () => {
  it("is read at the field's input size and in ink, not as quiet 10 px muted status text", () => {
    const statement = rule(".point-talk__statement");
    const size = /font-size:\s*calc\((\d+)px \* var\(--point-talk-scale\)\)/u.exec(statement)?.[1];
    expect(Number(size)).toBeGreaterThanOrEqual(12);
    expect(statement).toMatch(/color:\s*var\(--ink\)/u);
    expect(statement).not.toMatch(/var\(--muted\)/u);
    // It must wrap inside the field rather than widen it.
    expect(statement).toMatch(/overflow-wrap:\s*anywhere/u);
  });

  it("is at least as large as the typed direction on touch screens", () => {
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"), css.indexOf("@media (forced-colors"));
    const sized = /\.point-talk__statement,\s*\.point-talk__warning\s*\{[^}]*font-size:\s*(\d+)px/u.exec(coarse);
    expect(Number(sized?.[1])).toBeGreaterThanOrEqual(14);
  });

  it("gives the billed warning a line of its own, in ink and heavier than the statement", () => {
    const warning = rule(".point-talk__warning");
    expect(warning).toMatch(/color:\s*var\(--ink\)/u);
    expect(warning).toMatch(/font-weight:\s*500/u);
    expect(Number(/calc\((\d+)px/u.exec(/font-size:[^;]*/u.exec(warning)?.[0] ?? "")?.[1])).toBeGreaterThanOrEqual(12);
  });
});
