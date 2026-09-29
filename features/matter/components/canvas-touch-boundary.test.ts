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

  it("arbitrates pen and touch before any canvas gesture can start", () => {
    const downStart = rooted.indexOf("onPointerDown={(event) => {");
    const interactiveGuard = rooted.indexOf('closest("[data-canvas-interactive], a")', downStart);
    const claim = rooted.indexOf("pointerArbiter.claim(arbitratedPointer(event))", downStart);
    const rejection = rooted.indexOf('if (claim?.kind === "reject")', downStart);
    const contactRegistration = rooted.indexOf(
      "canvasTouchContactsRef.current.set(event.pointerId, contact)",
      downStart,
    );
    const lassoStart = rooted.indexOf("if (lasso.pointerDown(event))", downStart);
    expect(interactiveGuard).toBeGreaterThan(downStart);
    expect(claim).toBeGreaterThan(interactiveGuard);
    expect(rejection).toBeGreaterThan(claim);
    expect(contactRegistration).toBeGreaterThan(rejection);
    expect(lassoStart).toBeGreaterThan(rejection);
    // The per-type isPrimary gate is replaced by the one gesture owner.
    expect(rooted.slice(downStart, rooted.indexOf("onPointerMove={(event) => {"))).not.toContain(
      "!event.isPrimary",
    );

    // Every later event of a rejected pointer returns before any owner work.
    for (const [handler, guard] of [
      ["onPointerMove={(event) => {", "if (pointerArbiter.isRejected(event.pointerId)) return;"],
      ["onPointerUp={(event) => {", "if (pointerArbiter.isRejected(event.pointerId)) return;"],
      ["onLostPointerCapture={(event) => {", "if (pointerArbiter.isRejected(event.pointerId)) return;"],
      ["onPointerCancel={(event) => {", "if (pointerArbiter.ignoresCancel(arbitratedPointer(event))) return;"],
    ] as const) {
      const start = rooted.indexOf(handler);
      const body = rooted.slice(start, start + 260);
      expect(body).toContain(guard);
    }
    expect(rooted).toContain('window.addEventListener("pointerup", noteEnd, true)');
    expect(rooted).toContain('window.addEventListener("pointercancel", noteEnd, true)');
  });

  it("lets a palm that lands first dismiss nothing until it commits", () => {
    const downStart = rooted.indexOf("onPointerDown={(event) => {");
    const down = rooted.slice(downStart, rooted.indexOf("onPointerMove={(event) => {"));
    const founder = down.indexOf('if (event.pointerType === "touch" && claim?.kind === "accept" && claim.founder)');
    const deferral = down.indexOf("deferUntilTouchCommits(", founder);
    const immediate = down.indexOf("dismissPaperPresentations();", deferral);
    expect(founder).toBeGreaterThan(-1);
    expect(deferral).toBeGreaterThan(founder);
    expect(down.slice(founder, deferral)).toContain("const effects: (() => void)[] = [dismissPaperPresentations];");
    // Mouse and pen founders still act at once.
    expect(down.slice(deferral, immediate + 40)).toContain("} else {\n          dismissPaperPresentations();");
    // Camera interruption loses nothing and stays immediate.
    expect(down.indexOf("interruptIndexCameraMotion()")).toBeLessThan(founder);
    // A pinch commits; Lasso's repair dismissal joins the pending effects.
    expect(down).toMatch(/size >= 2\) \{\s*\/\/[^\n]*\n\s*settleTouchFounderEffects\(true\);/u);
    expect(down).toContain("pendingTouchEffects.effects.push(props.admission.clearRepairPresentations)");
    const revoke = rooted.slice(
      rooted.indexOf("const revokeTouchesForPen"),
      rooted.indexOf("}, [cancelNodeDragOwnership, lasso, settleTouchFounderEffects, updateViewport]);"),
    );
    expect(revoke).toContain("settleTouchFounderEffects(false);");
  });

  it("applies the palm rule on the Elastic grips and in Point and Talk dismissal", () => {
    const grip = rooted.slice(rooted.indexOf("function StretchHandleButton"));
    const gripDown = grip.slice(grip.indexOf("onPointerDown={(event) => {"), grip.indexOf("onPointerMove="));
    expect(gripDown.indexOf('if (event.pointerType === "touch" && penActive(event.timeStamp)) return;'))
      .toBeLessThan(gripDown.indexOf("stretch.pointerDown(handle, event)"));
    const composer = readFileSync(new URL("./PointTalkComposer.tsx", import.meta.url), "utf8");
    expect(composer).toContain("if (penActive(event.timeStamp)) return;");
    expect(composer).toContain("pendingTouchDismissal = deferUntilTouchCommits(");
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
