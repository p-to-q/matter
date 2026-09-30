import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useId, useState } from "react";
import type { ProjectedTool, ToolDisabledReason, ToolIntent } from "../tools/model";
import type { ProjectedToolSurface } from "../tools/project-tool-surface";
import type { CanvasLanguage } from "./canvas-preferences";
import {
  BranchIcon,
  LassoIcon,
  MoveIcon,
  UndoIcon,
  VoiceIcon,
} from "./icons";
import { toolRailCopy, type ToolRailCopy } from "./tool-rail-copy";

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
  const pendingReason = interactionPending ? copy.unavailableWhilePending : undefined;

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
        disabledReason={voiceAvailable ? pendingReason : undefined}
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
        disabledReason={pendingReason}
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
        disabledReason={pendingReason ?? projectedToolReason(branch, copy.unavailableWithoutSelection, copy)}
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
        disabledReason={pendingReason}
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
        disabledReason={pendingReason ?? projectedToolReason(undo, copy.unavailableWithoutHistory, copy)}
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

/** Each projected refusal names its own words; a new reason fails the type check. */
const DISABLED_REASON_COPY = Object.freeze({
  "history-empty": "unavailableWithoutHistory",
  "operation-pending": "unavailableWhilePending",
} satisfies Readonly<Record<ToolDisabledReason, keyof ToolRailCopy>>);

/** The projected capability says why a slot is unavailable; absence is its own reason. */
function projectedToolReason(
  tool: ProjectedTool | null,
  whenAbsent: string,
  copy: ToolRailCopy,
): string | undefined {
  if (tool === null) return whenAbsent;
  if (tool.availability === "available") return undefined;
  return copy[DISABLED_REASON_COPY[tool.reason]];
}

type ToolButtonProps = {
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
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
  disabledReason,
  group,
  icon,
  label,
  onClick,
  pressed,
  shortLabel,
  toolId,
}: ToolButtonProps) {
  const [clickMotion, setClickMotion] = useState<"a" | "b">();
  const reasonId = useId();
  const reason = disabled ? disabledReason : undefined;

  function handleClick() {
    if (disabled || !onClick) {
      return;
    }

    // Alternate animation names so every completed activation can replay the
    // same release motion without remounting the SVG and flashing its stroke.
    setClickMotion((current) => current === "a" ? "b" : "a");
    onClick();
  }

  // `aria-disabled` rather than `disabled`: an unavailable tool stays
  // focusable, so focus is not dropped when a pending operation flips it, and
  // it can say why it cannot act yet.
  return (
    <button
      aria-describedby={reason === undefined ? undefined : reasonId}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-pressed={pressed}
      className="tool-rail__button"
      data-active={active || undefined}
      data-click-motion={clickMotion}
      data-tool-emphasis={active ? "primary" : "quiet"}
      data-tool-group={group}
      data-tool-id={toolId}
      data-tool-state={disabled ? "disabled" : active ? "active" : "idle"}
      onClick={onClick && !disabled ? handleClick : undefined}
      title={reason === undefined ? label : label + " — " + reason}
      type="button"
    >
      {icon}
      <span className="tool-rail__label">{shortLabel}</span>
      {reason === undefined ? null : (
        <span className="tool-rail__label" id={reasonId}>{reason}</span>
      )}
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
