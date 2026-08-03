import { create } from "zustand";
import type { Point, SceneCommand, TextSelection } from "../engine/protocol";
import { createInitialScene } from "../engine/protocol";
import { applySceneCommand } from "../engine/scene-engine";

export type InteractionPhase =
  | "idle"
  | "armed"
  | "selecting"
  | "selected"
  | "stretching"
  | "requesting-permission"
  | "listening"
  | "transcribing"
  | "planning"
  | "applying"
  | "error";

export type ToolMode = "select" | "voice" | "branch" | "move";

type HistoryEntry = {
  forward: SceneCommand;
  inverse: SceneCommand;
};

type ArrowState = {
  scene: ReturnType<typeof createInitialScene>;
  phase: InteractionPhase;
  tool: ToolMode;
  anchor: Point | null;
  selection: TextSelection | null;
  stretchAmount: number;
  audioLevel: number;
  transientTranscript: string;
  error: string | null;
  history: HistoryEntry[];
  setPhase: (phase: InteractionPhase) => void;
  setTool: (tool: ToolMode) => void;
  setAnchor: (anchor: Point | null) => void;
  setSelection: (selection: TextSelection | null) => void;
  setStretchAmount: (amount: number) => void;
  setAudioLevel: (level: number) => void;
  setTransientTranscript: (transcript: string) => void;
  setError: (message: string) => void;
  clearInteraction: () => void;
  commit: (command: SceneCommand) => string[];
  createRelatedThought: (parentId: string) => void;
  undo: () => void;
};

export const useArrowStore = create<ArrowState>((set, get) => ({
  scene: createInitialScene(),
  phase: "idle",
  tool: "select",
  anchor: null,
  selection: null,
  stretchAmount: 0,
  audioLevel: 0,
  transientTranscript: "",
  error: null,
  history: [],
  setPhase: (phase) => set({ phase, error: phase === "error" ? get().error : null }),
  setTool: (tool) =>
    set({
      tool,
      phase: "idle",
      anchor: null,
      selection: null,
      stretchAmount: 0,
      audioLevel: 0,
      transientTranscript: "",
      error: null,
    }),
  setAnchor: (anchor) => set({ anchor }),
  setSelection: (selection) => set({ selection, stretchAmount: 0 }),
  setStretchAmount: (stretchAmount) => set({ stretchAmount }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setTransientTranscript: (transientTranscript) => set({ transientTranscript }),
  setError: (error) => set({ phase: "error", error, audioLevel: 0 }),
  clearInteraction: () =>
    set({
      phase: "idle",
      anchor: null,
      selection: null,
      stretchAmount: 0,
      audioLevel: 0,
      transientTranscript: "",
      error: null,
    }),
  commit: (command) => {
    const result = applySceneCommand(get().scene, command);
    set((state) => ({
      scene: result.scene,
      history: [...state.history, { forward: command, inverse: result.inverse }],
    }));
    return result.affectedObjectIds;
  },
  createRelatedThought: (parentId) => {
    const scene = get().scene;
    const parent = scene.objects[parentId];
    if (!parent || parent.type !== "thought") return;
    const relatedCount = Object.values(scene.objects).filter(
      (object) => object.type === "thought" && object.parentId === parentId,
    ).length;
    const id = `thought_related_${scene.revision + 1}_${relatedCount + 1}`;
    const createdAt = new Date().toISOString();
    const thought = {
      id,
      type: "thought" as const,
      kind: "satellite" as const,
      parentId,
      text:
        relatedCount === 0
          ? "也许真正被保存下来的，不是过去本身，而是仍可被重新选择的可能。"
          : "另一种生活并不需要被证明存在过，才足以改变我们对现在的判断。",
      position: {
        x: Math.min(window.innerWidth - 330, window.innerWidth * 0.66),
        y: Math.min(window.innerHeight - 150, window.innerHeight * 0.52 + relatedCount * 92),
      },
      width: 300,
      revisions: [
        {
          id: `revision_${id}`,
          text:
            relatedCount === 0
              ? "也许真正被保存下来的，不是过去本身，而是仍可被重新选择的可能。"
              : "另一种生活并不需要被证明存在过，才足以改变我们对现在的判断。",
          createdAt,
          source: "fixture" as const,
        },
      ],
      style: { emphasis: 0.62, opacity: 0.82 },
    };
    const command: SceneCommand = {
      id: `command_related_${id}`,
      interactionId: `related_${id}`,
      createdAt,
      mutations: [{ type: "insert-object", object: thought, index: scene.order.length }],
    };
    get().commit(command);
    set({ phase: "idle", tool: "select" });
  },
  undo: () => {
    const entry = get().history.at(-1);
    if (!entry) return;
    const result = applySceneCommand(get().scene, entry.inverse);
    set((state) => ({
      scene: result.scene,
      history: state.history.slice(0, -1),
      phase: "idle",
      anchor: null,
      selection: null,
      stretchAmount: 0,
      transientTranscript: "",
      error: null,
    }));
  },
}));
