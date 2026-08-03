import type {
  CreateInteractionEnvelope,
  EmptyDocumentContext,
  FocusedDocumentContext,
  Point,
  SceneDocument,
  StretchGesture,
  TextSelection,
  TransformInteractionEnvelope,
} from "../engine/protocol";
import { PROTOCOL_VERSION } from "../engine/protocol";
import { readDocumentContext } from "../engine/document-context";

function emptyDocumentContext(): EmptyDocumentContext {
  return { focus: [], ancestors: [], children: [], related: [] };
}

function compactDocumentContext(
  scene: SceneDocument,
  focusId: string,
): FocusedDocumentContext {
  const context = readDocumentContext(scene, focusId);
  if (!context)
    throw new Error(`Thought ${focusId} is not available for context.`);
  const compact = ({ id, text, kind, parentId }: typeof context.focus) => ({
    id,
    text,
    kind,
    ...(parentId ? { parentId } : {}),
  });

  return {
    focus: [compact(context.focus)],
    ancestors: context.ancestors.map(compact),
    children: context.children.map(compact),
    related: context.related.map(compact),
  };
}

type EnvelopeInput = {
  interactionId: string;
  scene: SceneDocument;
  anchor: Point;
  fixtureMode: boolean;
  transcript: string;
  language?: string;
  durationMs?: number;
};

export function createInteractionEnvelope({
  interactionId,
  scene,
  anchor,
  fixtureMode,
  transcript,
  language,
  durationMs,
}: EnvelopeInput): CreateInteractionEnvelope {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: interactionId,
    mode: "create",
    experienceId: "elastic-language",
    sceneRevision: scene.revision,
    voice: { transcript, language, durationMs },
    anchor,
    context: {
      nearbyObjectIds: [],
      viewport: scene.viewport,
      document: emptyDocumentContext(),
    },
    client: {
      locale: navigator.language,
      fixtureMode,
      inputCapabilities: {
        pointer: matchMedia("(pointer: fine)").matches,
        touch: navigator.maxTouchPoints > 0,
      },
    },
  };
}

type TransformEnvelopeInput = Omit<EnvelopeInput, "anchor"> & {
  selection: TextSelection;
  gesture: StretchGesture;
};

export function createTransformEnvelope({
  interactionId,
  scene,
  selection,
  gesture,
  fixtureMode,
  transcript,
  language,
  durationMs,
}: TransformEnvelopeInput): TransformInteractionEnvelope {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: interactionId,
    mode: "transform",
    experienceId: "elastic-language",
    sceneRevision: scene.revision,
    voice: { transcript, language, durationMs },
    selection,
    gesture,
    context: {
      nearbyObjectIds: [selection.objectId],
      viewport: scene.viewport,
      document: compactDocumentContext(scene, selection.objectId),
    },
    client: {
      locale: navigator.language,
      fixtureMode,
      inputCapabilities: {
        pointer: matchMedia("(pointer: fine)").matches,
        touch: navigator.maxTouchPoints > 0,
      },
    },
  };
}
