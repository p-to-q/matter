import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { ToolIntent } from "../tools/model";
import type { ProjectedToolSurface } from "../tools/project-tool-surface";
import {
  BranchIcon,
  LassoIcon,
  MoveIcon,
  UndoIcon,
  VoiceIcon,
} from "./icons";

export type ToolRailProps = {
  interactionPending: boolean;
  lassoActive: boolean;
  lassoAvailable: boolean;
  onLasso: () => void;
  onMove: () => void;
  onIntent: (intent: ToolIntent) => void;
  onVoice: () => void;
  surface: ProjectedToolSurface;
  voiceActive: boolean;
  voiceAvailable: boolean;
  voiceLabel: string;
};

type ToolRailGroup = "admission" | "material" | "history";

// This fixed, paper-adjacent instrument is the only visible editing vocabulary.
// Do not mirror its controls into the unfinished left material field.
export function ToolRail({
  interactionPending,
  lassoActive,
  lassoAvailable,
  onIntent,
  onLasso,
  onMove,
  onVoice,
  surface,
  voiceActive,
  voiceAvailable,
  voiceLabel,
}: ToolRailProps) {
  const { branch, undo } = surface.main;

  return (
    <nav
      aria-label="Editing tools"
      className="tool-rail"
      data-canvas-interactive
      onPointerDown={stopPointerPropagation}
      onWheel={stopWheelPropagation}
    >
      <ToolButton
        active={voiceActive}
        disabled={!voiceAvailable || (interactionPending && !voiceActive)}
        group="admission"
        icon={<VoiceIcon />}
        label={voiceLabel}
        onClick={voiceAvailable && (!interactionPending || voiceActive) ? onVoice : undefined}
        shortLabel="Voice"
        toolId="voice"
      />
      <ToolSeparator between="admission-material" />
      <ToolButton
        active={lassoActive}
        disabled={!lassoAvailable || interactionPending}
        group="material"
        icon={<LassoIcon />}
        label={lassoActive ? "Leave language selection" : "Circle-select language"}
        onClick={!interactionPending && lassoAvailable ? onLasso : undefined}
        pressed={lassoActive}
        shortLabel="Lasso"
        toolId="lasso"
      />
      <ToolButton
        disabled={interactionPending || branch?.availability !== "available"}
        group="material"
        icon={<BranchIcon />}
        label="Extend related thought"
        onClick={
          branch?.availability === "available"
            ? () => onIntent(branch.intent)
            : undefined
        }
        shortLabel="Branch"
        toolId="branch"
      />
      <ToolButton
        disabled={interactionPending}
        group="material"
        icon={<MoveIcon />}
        label={lassoActive ? "Return to canvas pan" : "Canvas pan"}
        onClick={!interactionPending ? onMove : undefined}
        shortLabel="Move"
        toolId="move"
      />
      <ToolSeparator between="material-history" />
      <ToolButton
        disabled={interactionPending || undo?.availability !== "available"}
        group="history"
        icon={<UndoIcon />}
        label="Undo last change"
        onClick={
          undo?.availability === "available"
            ? () => onIntent(undo.intent)
            : undefined
        }
        shortLabel="Undo"
        toolId="undo"
      />
    </nav>
  );
}

type ToolButtonProps = {
  active?: boolean;
  disabled?: boolean;
  group: ToolRailGroup;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  shortLabel: string;
  toolId: string;
};

function ToolButton({
  active,
  disabled,
  group,
  icon,
  label,
  onClick,
  pressed,
  shortLabel,
  toolId,
}: ToolButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="tool-rail__button"
      data-active={active || undefined}
      data-tool-emphasis={active ? "primary" : "quiet"}
      data-tool-group={group}
      data-tool-id={toolId}
      data-tool-state={disabled ? "disabled" : active ? "active" : "idle"}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      <span className="tool-rail__label">{shortLabel}</span>
    </button>
  );
}

function ToolSeparator({
  between,
}: {
  between: "admission-material" | "material-history";
}) {
  return (
    <span
      aria-hidden="true"
      className="tool-rail__separator"
      data-tool-separator={between}
    />
  );
}

function stopPointerPropagation(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopWheelPropagation(event: ReactWheelEvent<HTMLElement>) {
  event.stopPropagation();
}
