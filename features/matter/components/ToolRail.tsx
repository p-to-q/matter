import type { PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import type { ProjectedTool, ToolIntent } from "../tools/model";
import {
  BranchIcon,
  FoldIcon,
  FocusIcon,
  LassoIcon,
  MoveIcon,
  ShowAllIcon,
  UndoIcon,
  UnfoldIcon,
  VoiceIcon,
} from "./icons";

export type ToolRailProps = {
  interactionPending: boolean;
  lassoActive: boolean;
  lassoAvailable: boolean;
  onLasso: () => void;
  onIntent: (intent: ToolIntent) => void;
  onVoice: () => void;
  tools: readonly ProjectedTool[];
  voiceActive: boolean;
  voiceAvailable: boolean;
  voiceLabel: string;
};

export function ToolRail({ interactionPending, lassoActive, lassoAvailable, onIntent, onLasso, onVoice, tools, voiceActive, voiceAvailable, voiceLabel }: ToolRailProps) {
  const branch = tools.find((tool) => tool.id === "add-child");
  const undo = tools.find((tool) => tool.id === "undo");
  const contextual = tools.filter(
    (tool) => tool.id !== "add-child" && tool.id !== "undo",
  );

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
        disabled={!voiceAvailable || interactionPending}
        icon={<VoiceIcon />}
        label={voiceLabel}
        onClick={voiceAvailable && !interactionPending ? onVoice : undefined}
        shortLabel="Voice"
        toolId="voice"
      />
      <span aria-hidden="true" className="tool-rail__separator" />
      <ToolButton
        active={lassoActive}
        disabled={!lassoAvailable || interactionPending}
        icon={<LassoIcon />}
        label={lassoActive ? "Leave language selection" : "Circle-select language"}
        onClick={!interactionPending && lassoAvailable ? onLasso : undefined}
        shortLabel="Lasso"
        toolId="lasso"
      />
      <ToolButton
        disabled={interactionPending || branch?.availability !== "available"}
        icon={<BranchIcon />}
        label="Extend related thought"
        onClick={branch?.availability === "available" ? () => onIntent(branch.intent) : undefined}
        shortLabel="Branch"
        toolId="branch"
      />
      {contextual.map((tool) => (
        <ToolButton
          disabled={interactionPending || tool.availability !== "available"}
          icon={iconForContextualTool(tool.id)}
          key={tool.id}
          label={tool.label}
          onClick={
            tool.availability === "available"
              ? () => onIntent(tool.intent)
              : undefined
          }
          shortLabel={tool.label}
          toolId={tool.id}
        />
      ))}
      <ToolButton active={!interactionPending && !lassoActive} disabled={interactionPending || lassoActive} icon={<MoveIcon />} label="Move through canvas" shortLabel="Move" toolId="move" />
      <span aria-hidden="true" className="tool-rail__separator" />
      <ToolButton
        disabled={interactionPending || undo?.availability !== "available"}
        icon={<UndoIcon />}
        label="Undo last change"
        onClick={undo?.availability === "available" ? () => onIntent(undo.intent) : undefined}
        shortLabel="Undo"
        toolId="undo"
      />
    </nav>
  );
}

function iconForContextualTool(toolId: ProjectedTool["id"]): ReactNode {
  switch (toolId) {
    case "focus":
      return <FocusIcon />;
    case "fold":
      return <FoldIcon />;
    case "unfold":
      return <UnfoldIcon />;
    case "show-all":
      return <ShowAllIcon />;
    case "add-child":
      return <BranchIcon />;
    case "undo":
      return <UndoIcon />;
    default:
      return assertNever(toolId);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled contextual tool: ${String(value)}`);
}

type ToolButtonProps = {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  shortLabel: string;
  toolId: string;
};

function ToolButton({ active, disabled, icon, label, onClick, shortLabel, toolId }: ToolButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active || undefined}
      className="tool-rail__button"
      data-active={active || undefined}
      data-tool-id={toolId}
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

function stopPointerPropagation(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopWheelPropagation(event: ReactWheelEvent<HTMLElement>) {
  event.stopPropagation();
}
