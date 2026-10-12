import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The popup's action row is judged in a browser (`e2e/picture-control.spec.ts`
 * measures it in five locales); these pin the rules that make those
 * measurements true, so a stylesheet edit cannot quietly undo one.
 */
const css = readFileSync(new URL("./PointTalkComposer.css", import.meta.url), "utf8");
const SCALE = "var(--point-talk-scale)";

function rule(selector: string, source: string = css): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, "u"));
  if (match === null) throw new Error(`no rule for ${selector}`);
  return match[1]!;
}

describe("the field's width", () => {
  it("is its base plus the room the picture control lends it, scaled, bounded by the screen and the placement", () => {
    expect(rule(".point-talk")).toContain(
      `width: min(calc((264px + var(--point-talk-control-reserve, 0px)) * ${SCALE}), calc(100vw - 24px), var(--point-talk-available-width, calc(100vw - 24px)))`,
    );
  });

  it("keeps the touch base and takes the same room", () => {
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(coarse).toContain(
      `.point-talk { width: min(calc((280px + var(--point-talk-control-reserve, 0px)) * ${SCALE}), calc(100vw - 24px), var(--point-talk-available-width, calc(100vw - 24px))); }`,
    );
  });

  it("is the base alone without a control: the reserve defaults to nothing", () => {
    expect(rule(".point-talk")).toContain("var(--point-talk-control-reserve, 0px)");
  });
});

describe("the action row", () => {
  it("lets no button shrink or break its label", () => {
    const buttons = rule(".point-talk button");
    expect(buttons).toMatch(/flex: 0 0 auto/u);
    expect(buttons).toMatch(/white-space: nowrap/u);
    expect(css).not.toMatch(/\.point-talk[^{]*button[^{]*\{[^}]*flex-shrink: [1-9]/u);
    expect(css).not.toMatch(/\.point-talk[^{]*button[^{]*\{[^}]*(?:overflow: hidden|text-overflow)/u);
  });

  it("keeps every button at least 30px square, 48px on a touch screen, with room around its label", () => {
    const buttons = rule(".point-talk button");
    expect(buttons).toContain(`min-width: calc(30px * ${SCALE})`);
    expect(buttons).toContain(`min-height: calc(30px * ${SCALE})`);
    expect(buttons).toContain(`padding: 0 calc(8px * ${SCALE})`);
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(coarse).toContain(".point-talk button { min-width: 48px; min-height: 48px; }");
    expect(coarse).toContain(".point-talk__voice { width: 48px; }");
  });

  it("keeps the voice button a 30px icon square", () => {
    expect(rule(".point-talk__voice")).toContain(`width: calc(30px * ${SCALE})`);
    expect(rule(".point-talk__voice")).toMatch(/padding: 0 !important/u);
  });

  it("lets only the direction input flex, down to a floor of 112px", () => {
    const input = rule(".point-talk__composer input");
    expect(input).toContain(`min-width: calc(112px * ${SCALE})`);
    expect(input).toContain(`flex: 1 1 calc(112px * ${SCALE})`);
  });

  it("wraps the whole cluster, not single buttons, under the input when the floor cannot be kept", () => {
    expect(rule(".point-talk__composer")).toMatch(/flex-wrap: wrap/u);
    const actions = rule(".point-talk__actions");
    expect(actions).toMatch(/flex: 0 0 auto/u);
    expect(actions).toMatch(/margin-inline-start: auto/u);
  });

  it("spaces controls by one rhythm: 4px at the field's scale", () => {
    expect(rule(".point-talk__actions")).toContain(`gap: calc(4px * ${SCALE})`);
    expect(css).toMatch(/\.point-talk__feedback,\s*\.point-talk__picture \{[^}]*gap: calc\(4px \* var\(--point-talk-scale\)\)/u);
    expect(rule(".point-talk__picture-actions")).toContain(`gap: calc(4px * ${SCALE})`);
  });

  it("keeps the picture control plain text: no plate at rest, hover, or focus", () => {
    const plain = rule(".point-talk .point-talk__text-button");
    expect(plain).toMatch(/background: transparent/u);
    expect(plain).toMatch(/white-space: nowrap/u);
    expect(css).toMatch(/\.point-talk \.point-talk__text-button:hover \{ background: transparent; color: var\(--ink\); \}/u);
    expect(css).not.toMatch(/\.point-talk \.point-talk__text-button:focus-visible \{[^}]*background/u);
  });
});

describe("focus", () => {
  it("is one ring for every control in the field: 2px in the ink, one pixel off, inside the gaps", () => {
    expect(css).toContain(".point-talk button:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }");
    const rings = css.match(/[^\n]*:focus-visible[^\n]*/gu) ?? [];
    for (const line of rings) {
      expect(line, line).not.toMatch(/outline-offset: (?!1px)/u);
      expect(line, line).not.toMatch(/outline: (?!2px solid var\(--ink\)|0|none)/u);
    }
  });

  it("keeps the ring in a system colour under forced colors", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain(".point-talk button:focus-visible { outline-color: Highlight; }");
  });
});

describe("the picture preview", () => {
  it("is capped at 248px at the field's scale and takes its width from the ratio", () => {
    expect(css).toContain(
      `.point-talk__picture .passage-picture { --picture-cap: calc(248px * ${SCALE}); margin: 0 auto; }`,
    );
    expect(css).not.toMatch(/\.point-talk__picture \.passage-picture \{[^}]*(?:width:|max-height:)/u);
  });
});

describe("the drawing step", () => {
  it("says how long the wait may be in one quiet muted line", () => {
    const quiet = rule(".point-talk__quiet");
    expect(quiet).toMatch(/color: var\(--muted\)/u);
    expect(quiet).toContain(`font-size: calc(10px * ${SCALE})`);
    expect(css).toContain(".point-talk__quiet { font-size: 12px; line-height: 16px; }");
  });
});
