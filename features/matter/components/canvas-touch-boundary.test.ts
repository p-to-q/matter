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

    const lifecycleCancellation = rooted.slice(
      rooted.indexOf("const cancelCanvasPointerOwnership"),
      rooted.indexOf("const cancelViewportGesture"),
    );
    expect(lifecycleCancellation).toContain("const lassoPointerId = lasso.cancelActiveStroke()");
    expect(lifecycleCancellation).toContain("shell.releasePointerCapture(lassoPointerId)");
    expect(lifecycleCancellation).toContain("cancelNodeDragOwnership()");
  });

  it("retires node-drag ownership before Lasso or Pan takes the canvas", () => {
    const cancellation = rooted.slice(
      rooted.indexOf("const cancelNodeDragOwnership"),
      rooted.indexOf("const markPerformance"),
    );
    expect(cancellation).toContain("const gesture = nodeDragRef.current");
    expect(cancellation).toContain("suppressClickRef.current = true");
    expect(cancellation).toContain("clearNodeDrag()");
    expect(cancellation).toContain("shell.releasePointerCapture(gesture.pointerId)");

    const toolRailStart = rooted.indexOf("<ToolRail");
    const toolRail = rooted.slice(
      toolRailStart,
      rooted.indexOf("onIntent={(intent)", toolRailStart),
    );
    const lassoTransfer = toolRail.slice(
      toolRail.indexOf("onLasso={() =>"),
      toolRail.indexOf("onMove={() =>"),
    );
    expect(lassoTransfer.indexOf("cancelNodeDragOwnership()")).toBeGreaterThan(-1);
    expect(lassoTransfer.indexOf("cancelNodeDragOwnership()")).toBeLessThan(
      lassoTransfer.indexOf("lasso.activate()"),
    );
    const panTransfer = toolRail.slice(toolRail.indexOf("onMove={() =>"));
    expect(panTransfer.indexOf("cancelNodeDragOwnership()")).toBeGreaterThan(-1);
    expect(panTransfer.indexOf("cancelNodeDragOwnership()")).toBeLessThan(
      panTransfer.indexOf('setCanvasMode("pan")'),
    );
  });

  it("compares a touch release in the same material-plane coordinates as its start", () => {
    expect(rooted).toContain("const releaseX = finalTrackedTouch?.x ?? event.clientX");
    expect(rooted).toContain("const releaseY = finalTrackedTouch?.y ?? event.clientY");
    expect(rooted).toContain("releaseX - viewport.gesture.startX");
    expect(rooted).toContain("releaseY - viewport.gesture.startY");
  });
});
