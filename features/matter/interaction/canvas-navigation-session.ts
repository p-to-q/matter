import {
  INITIAL_CANVAS_VIEWPORT,
  type CanvasViewportState,
} from "./canvas-viewport";

export type CanvasNavigationSession = Readonly<{
  canvasMode: "material" | "pan";
  documentEpoch: number;
  viewport: CanvasViewportState;
  wheelMotionActive: boolean;
}>;

export function createCanvasNavigationSession(documentEpoch: number): CanvasNavigationSession {
  return Object.freeze({
    canvasMode: "material",
    documentEpoch,
    viewport: INITIAL_CANVAS_VIEWPORT,
    wheelMotionActive: false,
  });
}

/** A camera and every gesture presentation belong to exactly one document. */
export function reconcileCanvasNavigationSession(
  session: CanvasNavigationSession,
  documentEpoch: number,
): CanvasNavigationSession {
  return session.documentEpoch === documentEpoch
    ? session
    : createCanvasNavigationSession(documentEpoch);
}
