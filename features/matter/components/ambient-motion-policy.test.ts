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
  });

  it("keeps base media and the bounded foreground pass color treatment aligned", () => {
    const css = readFileSync(new URL("./AmbientWorkbench.module.css", import.meta.url), "utf8");
    expect(css.match(/filter:\s*grayscale\(1\) contrast\(0\.84\) brightness\(1\.08\);/g)).toHaveLength(3);
    expect(css).toMatch(/:global\([^)]*dark[^)]*\) \.poster,\s*:global\([^)]*dark[^)]*\) \.video\s*\{[^}]*filter:\s*grayscale\(1\) contrast\(0\.9\) brightness\(0\.9\)/s);
    expect(css).toMatch(/:global\([^)]*dark[^)]*\) \.foregroundPass\s*\{[^}]*filter:\s*grayscale\(1\) contrast\(0\.9\) brightness\(0\.9\)/s);
  });
});
