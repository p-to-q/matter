import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { ToolIntent } from "../tools/model";
import type { ProjectedToolSurface } from "../tools/project-tool-surface";
import type { CanvasLanguage } from "./canvas-preferences";
import {
  BranchIcon,
  LassoIcon,
  MoveIcon,
  UndoIcon,
  VoiceIcon,
} from "./icons";
import { toolRailCopy } from "./tool-rail-copy";

export type ToolRailProps = {
  interactionPending: boolean;
  lassoActive: boolean;
  lassoAvailable: boolean;
  locale: CanvasLanguage;
  onLasso: () => void;
  onMove: () => void;
  onIntent: (intent: ToolIntent) => void;
  onVoice: () => void;
  panActive: boolean;
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
  locale,
  onIntent,
  onLasso,
  onMove,
  onVoice,
  panActive,
  surface,
  voiceActive,
  voiceAvailable,
  voiceLabel,
}: ToolRailProps) {
  const { branch, undo } = surface.main;
  const copy = toolRailCopy(locale);

  return (
    <nav
      aria-label={copy.editingTools}
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
        shortLabel={copy.voice}
        toolId="voice"
      />
      <ToolSeparator between="admission-material" />
      <ToolButton
        active={lassoActive}
        disabled={!lassoAvailable || interactionPending}
        group="material"
        icon={<LassoIcon />}
        label={lassoActive ? copy.exitLanguageSelection : copy.circleSelectLanguage}
        onClick={!interactionPending && lassoAvailable ? onLasso : undefined}
        pressed={lassoActive}
        shortLabel={copy.lasso}
        toolId="lasso"
      />
      <ToolButton
        disabled={interactionPending || branch?.availability !== "available"}
        group="material"
        icon={<BranchIcon />}
        label={copy.extendRelatedThought}
        onClick={
          branch?.availability === "available"
            ? () => onIntent(branch.intent)
            : undefined
        }
        shortLabel={copy.branch}
        toolId="branch"
      />
      <ToolButton
        active={panActive}
        disabled={interactionPending}
        group="material"
        icon={<MoveIcon />}
        label={lassoActive ? copy.returnToCanvasPan : panActive ? copy.exitCanvasPan : copy.canvasPan}
        onClick={!interactionPending ? onMove : undefined}
        shortLabel={copy.pan}
        toolId="move"
        pressed={panActive}
      />
      <ToolSeparator between="material-history" />
      <ToolButton
        disabled={interactionPending || undo?.availability !== "available"}
        group="history"
        icon={<UndoIcon />}
        label={copy.undoLastChange}
        onClick={
          undo?.availability === "available"
            ? () => onIntent(undo.intent)
            : undefined
        }
        shortLabel={copy.undo}
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
