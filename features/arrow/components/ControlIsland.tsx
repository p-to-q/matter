import type { InteractionPhase, ToolMode } from "../store/arrow-store";
import { BranchIcon, LassoIcon, MoveIcon, StopIcon, UndoIcon, VoiceIcon } from "./icons";

type Props = {
  phase: InteractionPhase;
  tool: ToolMode;
  canUndo: boolean;
  onToggleVoice: () => void;
  onUndo: () => void;
  onToolChange: (tool: ToolMode) => void;
};

export function ControlIsland({
  phase,
  tool,
  canUndo,
  onToggleVoice,
  onUndo,
  onToolChange,
}: Props) {
  const locked = [
    "requesting-permission",
    "transcribing",
    "planning",
    "applying",
  ].includes(phase);
  const voiceLabel =
    phase === "listening"
      ? "Finish speaking"
      : phase === "armed"
        ? "Cancel voice"
        : phase === "selected"
          ? "Speak to transform"
        : "Speak";

  return (
    <aside className="control-island" aria-label="Canvas controls">
      <button
        type="button"
        className="tool-button"
        data-active={phase === "armed" || phase === "listening"}
        aria-label={voiceLabel}
        title={voiceLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggleVoice}
        disabled={locked}
      >
        {phase === "listening" ? <StopIcon /> : <VoiceIcon />}
      </button>
      <span className="tool-separator" aria-hidden="true" />
      <button
        type="button"
        className="tool-button"
        data-active={tool === "select"}
        aria-label="Circle-select language"
        title="Circle-select language"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onToolChange("select")}
        disabled={locked || phase === "listening"}
      >
        <LassoIcon />
      </button>
      <button
        type="button"
        className="tool-button"
        data-active={tool === "branch"}
        aria-label="Extend related thought"
        title="Extend related thought"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onToolChange("branch")}
        disabled={locked || phase === "listening"}
      >
        <BranchIcon />
      </button>
      <button
        type="button"
        className="tool-button"
        data-active={tool === "move"}
        aria-label="Move thought"
        title="Move thought"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onToolChange("move")}
        disabled={locked || phase === "listening"}
      >
        <MoveIcon />
      </button>
      <span className="tool-separator" aria-hidden="true" />
      <button
        type="button"
        className="tool-button"
        aria-label="Undo last change"
        title="Undo"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onUndo}
        disabled={!canUndo || locked || phase === "listening"}
      >
        <UndoIcon />
      </button>
    </aside>
  );
}
