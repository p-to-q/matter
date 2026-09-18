import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
const rooted = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");

describe("mobile canvas touch ownership", () => {
  it("gives custom gestures only to the material world", () => {
    expect(css).toMatch(/\.matter-shell \{[^}]*touch-action:\s*auto;/s);
    expect(css).toMatch(/\.matter-world \{[^}]*touch-action:\s*none;/s);
    expect(css).toMatch(/\.material-files \{[^}]*touch-action:\s*pan-y;/s);
  });

  it("leaves controls outside the canvas gesture domain", () => {
    const interactiveGuard = rooted.indexOf(
      'closest("[data-canvas-interactive], a")',
    );
    const contactRegistration = rooted.indexOf(
      "canvasTouchContactsRef.current.set(event.pointerId, contact)",
    );
    expect(interactiveGuard).toBeGreaterThan(-1);
    expect(contactRegistration).toBeGreaterThan(interactiveGuard);
  });

  it("cancels transient canvas ownership on browser lifecycle loss", () => {
    expect(rooted).toContain('window.addEventListener("pagehide", cancelCanvasPointerOwnership)');
    expect(rooted).toContain('window.addEventListener("blur", cancelCanvasPointerOwnership)');
    expect(rooted).toContain('window.addEventListener("orientationchange", cancelCanvasPointerOwnership)');
    expect(rooted).toContain('document.addEventListener("visibilitychange", handleVisibilityChange)');
  });
});
