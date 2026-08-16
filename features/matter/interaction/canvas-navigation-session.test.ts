import { describe, expect, it } from "vitest";
import { INITIAL_CANVAS_VIEWPORT } from "./canvas-viewport";
import {
  createCanvasNavigationSession,
  reconcileCanvasNavigationSession,
} from "./canvas-navigation-session";

describe("canvas navigation session", () => {
  it("keeps one document session stable and resets every camera signal at a document boundary", () => {
    const current = Object.freeze({
      ...createCanvasNavigationSession(3),
      canvasMode: "pan" as const,
      viewport: Object.freeze({
        ...INITIAL_CANVAS_VIEWPORT,
        x: 420,
        y: -180,
        zoom: 1.6,
        userMoved: true,
        gesture: Object.freeze({
          pointerId: 8,
          pointerType: "mouse" as const,
          startX: 20,
          startY: 30,
          lastX: 80,
          lastY: 90,
          originX: 0,
          originY: 0,
          dragging: true,
        }),
      }),
      wheelMotionActive: true,
    });

    expect(reconcileCanvasNavigationSession(current, 3)).toBe(current);
    expect(reconcileCanvasNavigationSession(current, 4)).toEqual({
      canvasMode: "material",
      documentEpoch: 4,
      viewport: INITIAL_CANVAS_VIEWPORT,
      wheelMotionActive: false,
    });
  });
});
