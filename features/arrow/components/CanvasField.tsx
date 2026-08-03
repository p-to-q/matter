import type { CSSProperties } from "react";
import type { Point, SceneObject, TextSelection } from "../engine/protocol";
import type { InteractionPhase } from "../store/arrow-store";
import { ThoughtText } from "./ThoughtText";

type Props = {
  objects: SceneObject[];
  anchor: Point | null;
  phase: InteractionPhase;
  audioLevel: number;
  transientTranscript: string;
  previewPosition: { objectId: string; position: Point } | null;
  onBranch: (objectId: string) => void;
  selection: TextSelection | null;
  stretchAmount: number;
  viewport: { x: number; y: number; zoom: number };
  fixtureMode: boolean;
};

export function CanvasField({
  objects,
  anchor,
  phase,
  audioLevel,
  transientTranscript,
  previewPosition,
  onBranch,
  selection,
  stretchAmount,
  viewport,
  fixtureMode,
}: Props) {
  return (
    <section
      className="canvas-field"
      aria-label="Matter canvas"
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      data-viewport-zoom={viewport.zoom}
      style={{
        transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
      }}
    >
      {objects.map((object) =>
        object.type === "thought" ? (
          <ThoughtText
            thought={object}
            previewPosition={
              previewPosition?.objectId === object.id ? previewPosition.position : undefined
            }
            onBranch={onBranch}
            selection={selection}
            stretchAmount={stretchAmount}
            flowShift={
              selection &&
              stretchAmount > 0 &&
              object.id !== selection.objectId &&
              (object.parentId === selection.objectId ||
                object.position.y > Math.max(...selection.screenRects.map((rect) => rect.y)))
                ? stretchAmount * 260
                : 0
            }
            viewportZoom={viewport.zoom}
            fixtureMode={fixtureMode}
            key={object.id}
          />
        ) : null,
      )}

      {anchor && phase !== "idle" ? (
        <div
          className="voice-draft"
          style={
            {
              left: anchor.x,
              top: anchor.y,
              "--voice-level": audioLevel,
            } as CSSProperties
          }
          data-state={phase}
          aria-live="polite"
        >
          <span className="voice-draft-plus" aria-hidden="true">+</span>
          <span className="voice-draft-frame" aria-hidden="true" />
          {transientTranscript ? (
            <p className="transient-language">{transientTranscript}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
