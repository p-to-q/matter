export const PROTOCOL_VERSION = "0.1" as const;

export const INITIAL_SAMPLE =
  "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";

export const ELASTIC_FIXTURE_EXPANSION =
  "那个过去像一扇没有真正打开过的门：更慢的时间、更少被量化的关系，以及一些我们并不确定是否存在、却仍愿意相信曾经存在的生活方式";

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextRevision = {
  id: string;
  text: string;
  createdAt: string;
  source: "human" | "agent" | "fixture";
};

export type ThoughtKind = "primary" | "satellite" | "whisper";

export type ThoughtObject = {
  id: string;
  type: "thought";
  kind: ThoughtKind;
  text: string;
  position: Point;
  width: number;
  parentId?: string;
  revisions: TextRevision[];
  style: {
    emphasis: number;
    opacity: number;
  };
};

export type RelationshipObject = {
  id: string;
  type: "relationship";
  fromId: string;
  toId: string;
  role?: "expands" | "contrasts" | "supports" | "questions" | "relates";
  label?: string;
};

export type SceneObject = ThoughtObject | RelationshipObject;

export type SceneDocument = {
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  objects: Record<string, SceneObject>;
  order: string[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  revision: number;
};

export type TextSelection = {
  type: "text-range";
  objectId: string;
  start: number;
  end: number;
  selectedText: string;
  before: string;
  after: string;
  screenRects: Rect[];
};

export type StretchGesture = {
  type: "stretch";
  axis: "vertical";
  amount: number;
  startExtent: number;
  endExtent: number;
};

export type CompactDocumentNode = Pick<
  ThoughtObject,
  "id" | "text" | "kind" | "parentId"
>;

export type CompactDocumentContext = {
  focus: CompactDocumentNode[];
  ancestors: CompactDocumentNode[];
  children: CompactDocumentNode[];
  related: CompactDocumentNode[];
};

export type EmptyDocumentContext = {
  focus: [];
  ancestors: [];
  children: [];
  related: [];
};

export type FocusedDocumentContext = CompactDocumentContext & {
  focus: [CompactDocumentNode];
};

type InteractionEnvelopeBase = {
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  experienceId: "elastic-language";
  sceneRevision: number;
  voice: {
    transcript: string;
    language?: string;
    durationMs?: number;
  };
  client: {
    locale: string;
    fixtureMode: boolean;
    inputCapabilities: {
      pointer: boolean;
      touch: boolean;
    };
  };
};

export type CreateInteractionEnvelope = InteractionEnvelopeBase & {
  mode: "create";
  anchor: Point;
  context: {
    nearbyObjectIds: string[];
    viewport: SceneDocument["viewport"];
    document: EmptyDocumentContext;
  };
};

export type TransformInteractionEnvelope = InteractionEnvelopeBase & {
  mode: "transform";
  selection: TextSelection;
  gesture: StretchGesture;
  context: {
    nearbyObjectIds: string[];
    viewport: SceneDocument["viewport"];
    document: FocusedDocumentContext;
  };
};

export type InteractionEnvelope =
  CreateInteractionEnvelope | TransformInteractionEnvelope;

/** Public actions an agent is allowed to propose. */
export type CanvasAction =
  | {
      id: string;
      type: "create-thought";
      thought: ThoughtObject;
    }
  | {
      id: string;
      type: "replace-text-range";
      objectId: string;
      start: number;
      end: number;
      text: string;
      intent: "expand" | "compress" | "reinterpret" | "refine";
    }
  | {
      id: string;
      type: "create-related-thought";
      thought: ThoughtObject;
      parentId: string;
    };

export type ActionPlan = {
  protocolVersion: typeof PROTOCOL_VERSION;
  interactionId: string;
  sceneRevision: number;
  actions: CanvasAction[];
  presentation?: {
    focusObjectIds?: string[];
    motionHint?: "grow" | "compress" | "settle";
  };
};

/** Private mutations used by the reducer, including exact inverse operations. */
export type SceneMutation =
  | { type: "insert-object"; object: SceneObject; index: number }
  | { type: "remove-object"; objectId: string }
  | { type: "replace-object"; object: SceneObject };

export type SceneCommand = {
  id: string;
  interactionId?: string;
  mutations: SceneMutation[];
  createdAt: string;
};

export type CommandResult = {
  scene: SceneDocument;
  inverse: SceneCommand;
  affectedObjectIds: string[];
};

export type ArrowApiErrorCode =
  | "MICROPHONE_UNAVAILABLE"
  | "TRANSCRIPTION_FAILED"
  | "AGENT_TIMEOUT"
  | "INVALID_INTERACTION"
  | "INVALID_ACTION_PLAN"
  | "SCENE_REVISION_CONFLICT"
  | "INTERNAL_ERROR";

export type ArrowApiError = {
  error: {
    code: ArrowApiErrorCode;
    message: string;
    retryable: boolean;
    interactionId?: string;
  };
};

export function createEmptyScene(): SceneDocument {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "scene_empty",
    objects: {},
    order: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    revision: 0,
  };
}

export function createInitialScene(): SceneDocument {
  const createdAt = "2026-08-02T00:00:00.000Z";
  const sample: ThoughtObject = {
    id: "thought_sample",
    type: "thought",
    kind: "primary",
    text: INITIAL_SAMPLE,
    position: { x: 0, y: 0 },
    width: 520,
    revisions: [
      {
        id: "revision_sample",
        text: INITIAL_SAMPLE,
        createdAt,
        source: "fixture",
      },
    ],
    style: { emphasis: 0.9, opacity: 1 },
  };

  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "scene_matter",
    objects: { [sample.id]: sample },
    order: [sample.id],
    viewport: { x: 0, y: 0, zoom: 1 },
    revision: 0,
  };
}
