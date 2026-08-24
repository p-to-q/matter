import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldPresentAmbientMotion } from "./ambient-motion-policy";

describe("ambient motion policy", () => {
  it("keeps ordinary and unknown connections on the normal path", () => {
    expect(shouldPresentAmbientMotion({ reducedMotion: false })).toBe(true);
    expect(shouldPresentAmbientMotion({
      reducedMotion: false,
      connection: { effectiveType: "4g", saveData: false },
    })).toBe(true);
    expect(shouldPresentAmbientMotion({
      reducedMotion: false,
      connection: { effectiveType: "future-network" },
    })).toBe(true);
  });

  it("keeps the poster instead of motion for explicit cost preferences", () => {
    expect(shouldPresentAmbientMotion({ reducedMotion: true })).toBe(false);
    expect(shouldPresentAmbientMotion({
      reducedMotion: false,
      connection: { saveData: true },
    })).toBe(false);
    expect(shouldPresentAmbientMotion({
      reducedMotion: false,
      connection: { effectiveType: "slow-2g" },
    })).toBe(false);
    expect(shouldPresentAmbientMotion({
      reducedMotion: false,
      connection: { effectiveType: "2G" },
    })).toBe(false);
    expect(shouldPresentAmbientMotion({
      forcedColors: true,
      reducedMotion: false,
    })).toBe(false);
  });

  it("keeps one native media presentation on the calibrated composition path", () => {
    const css = readFileSync(new URL("./AmbientWorkbench.module.css", import.meta.url), "utf8");
    expect(css.match(/filter:\s*grayscale\(1\) contrast\(0\.84\) brightness\(1\.08\);/g)).toHaveLength(1);
    expect(css).toMatch(/\.poster,\s*\.video\s*\{[^}]*z-index:\s*var\(--paper-leaf-pass-z\)[^}]*mix-blend-mode:\s*multiply[^}]*opacity:\s*0\.32/s);
    expect(css).toMatch(/\.wash\s*\{[^}]*z-index:\s*3/s);
    expect(css).toMatch(/:global\([^)]*dark[^)]*\) \.poster,\s*:global\([^)]*dark[^)]*\) \.video\s*\{[^}]*filter:\s*grayscale\(1\) contrast\(0\.9\) brightness\(1\.31\)[^}]*mix-blend-mode:\s*normal[^}]*opacity:\s*0\.24/s);
    expect(css).not.toMatch(/\.root\s*\{[^}]*(?:z-index|isolation):/s);
    expect(css).not.toContain("foregroundPass");
  });
});
