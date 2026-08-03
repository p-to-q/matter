import type { InteractionPhase, ToolMode } from "../store/arrow-store";

const phaseCopy: Partial<Record<InteractionPhase, string>> = {
  armed: "Place the thought.",
  selecting: "Circle the language.",
  selected: "Speak, then stretch the selection.",
  stretching: "Shape the degree.",
  "requesting-permission": "Opening the microphone…",
  listening: "Listening",
  transcribing: "Hearing the words…",
  planning: "Forming the thought…",
  applying: "Settling…",
};

type Props = {
  phase: InteractionPhase;
  tool: ToolMode;
  error: string | null;
  hasMaterial: boolean;
  onRetry: () => void;
};

export function LocalStatus({ phase, tool, error, hasMaterial, onRetry }: Props) {
  if (error) {
    return (
      <footer className="local-status" aria-live="polite">
        <button type="button" className="error-retry" onClick={onRetry}>
          <span>{error}</span>
          <span>Retry</span>
        </button>
      </footer>
    );
  }

  const toolCopy: Record<ToolMode, string> = {
    select: "Circle language to reshape it.",
    voice: "Speak, then place the thought.",
    branch: "Choose a thought to extend it.",
    move: "Drag a thought to move it.",
  };
  const copy = phaseCopy[phase] ?? (hasMaterial ? toolCopy[tool] : toolCopy.voice);

  return (
    <footer className="local-status" aria-live="polite">
      <span className={phase === "listening" ? "status-live" : undefined}>
        {copy}
      </span>
    </footer>
  );
}
