"use client";

import { useMemo } from "react";
import { useVoiceTurn } from "../interaction/use-voice-turn";
import { useTextSelection } from "../interaction/use-text-selection";
import { useThoughtMovement } from "../interaction/use-thought-movement";
import { useCanvasViewport } from "../interaction/use-canvas-viewport";
import { useArrowStore } from "../store/arrow-store";
import { CanvasField } from "./CanvasField";
import { ControlIsland } from "./ControlIsland";
import { LocalStatus } from "./LocalStatus";
import { PaperTexture } from "./PaperTexture";
import { SelectionOverlay } from "./SelectionOverlay";
import { FixtureRail } from "./FixtureRail";

export function ArrowApp() {
  const scene = useArrowStore((state) => state.scene);
  const phase = useArrowStore((state) => state.phase);
  const tool = useArrowStore((state) => state.tool);
  const anchor = useArrowStore((state) => state.anchor);
  const audioLevel = useArrowStore((state) => state.audioLevel);
  const transcript = useArrowStore((state) => state.transientTranscript);
  const selection = useArrowStore((state) => state.selection);
  const stretchAmount = useArrowStore((state) => state.stretchAmount);
  const error = useArrowStore((state) => state.error);
  const canUndo = useArrowStore((state) => state.history.length > 0);
  const undo = useArrowStore((state) => state.undo);
  const setTool = useArrowStore((state) => state.setTool);
  const createRelatedThought = useArrowStore((state) => state.createRelatedThought);
  const { fixtureMode, finishVoice, placeAnchor, toggleVoice } = useVoiceTurn();
  const textSelection = useTextSelection();
  const { viewport, attachSurface } = useCanvasViewport();
  const thoughtMovement = useThoughtMovement(viewport.zoom);

  const objects = useMemo(
    () => scene.order.map((id) => scene.objects[id]).filter(Boolean),
    [scene],
  );

  return (
    <main
      className="arrow-shell"
      ref={attachSurface}
      data-phase={phase}
      data-tool={tool}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        if (thoughtMovement.beginMove(event)) return;
        if (tool === "branch") {
          const objectId = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-material]",
          )?.dataset.objectId;
          if (objectId) createRelatedThought(objectId);
          return;
        }
        if (textSelection.beginLasso(event)) return;
        placeAnchor({
          x: (event.clientX - viewport.x) / viewport.zoom,
          y: (event.clientY - viewport.y) / viewport.zoom,
        });
      }}
      onPointerMove={(event) => {
        thoughtMovement.move(event);
        textSelection.moveLasso(event);
      }}
      onPointerUp={(event) => {
        thoughtMovement.endMove(event);
        textSelection.endLasso(event);
      }}
      onPointerCancel={textSelection.cancelLasso}
      onLostPointerCapture={(event) => {
        if (useArrowStore.getState().phase === "selecting") {
          textSelection.endLasso(event);
        }
      }}
    >
      <PaperTexture />
      <header className="brand-mark">
        <a href="https://www.ptoq.io/" aria-label="p to q home">
          [p → q]
        </a>
        <span className="brand-divider" aria-hidden="true" />
        <span>matter</span>
      </header>
      <p className="product-line">Make thought matter.</p>

      <CanvasField
        objects={objects}
        anchor={anchor}
        phase={phase}
        audioLevel={audioLevel}
        transientTranscript={transcript}
        previewPosition={thoughtMovement.previewPosition}
        onBranch={createRelatedThought}
        selection={selection}
        stretchAmount={stretchAmount}
        viewport={viewport}
        fixtureMode={fixtureMode}
      />
      <SelectionOverlay
        lassoPoints={textSelection.lassoPoints}
        selection={selection}
        stretchAmount={stretchAmount}
        stretching={textSelection.stretching}
        phase={phase}
        audioLevel={audioLevel}
        transcript={transcript}
        viewportZoom={viewport.zoom}
        onStretchStart={textSelection.beginStretch}
        onStretchMove={textSelection.moveStretch}
        onStretchEnd={(event) => {
          textSelection.endStretch(event);
          if (useArrowStore.getState().phase === "listening") void finishVoice();
        }}
      />
      <ControlIsland
        phase={phase}
        tool={tool}
        canUndo={canUndo}
        onToggleVoice={toggleVoice}
        onUndo={undo}
        onToolChange={setTool}
      />
      <LocalStatus
        phase={phase}
        tool={tool}
        error={error}
        hasMaterial={objects.length > 0}
        onRetry={toggleVoice}
      />
      {fixtureMode ? <FixtureRail /> : null}
    </main>
  );
}
