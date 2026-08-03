import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyScene,
  type RelationshipObject,
  type ThoughtObject,
} from "../engine/protocol";
import { createInteractionEnvelope, createTransformEnvelope } from "./envelope";

function thought(id: string, parentId?: string): ThoughtObject {
  return {
    id,
    type: "thought",
    kind: parentId ? "satellite" : "primary",
    text: `Text for ${id}`,
    position: { x: 0, y: 0 },
    width: 320,
    parentId,
    revisions: [],
    style: { emphasis: 0.8, opacity: 1 },
  };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { language: "zh-CN", maxTouchPoints: 0 });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});

afterEach(() => vi.unstubAllGlobals());

describe("interaction document context", () => {
  it("keeps document groups empty for creation without a focus", () => {
    const envelope = createInteractionEnvelope({
      interactionId: "create_1",
      scene: createEmptyScene(),
      anchor: { x: 100, y: 100 },
      fixtureMode: true,
      transcript: "放在这里",
    });

    expect(envelope.context.document).toEqual({
      focus: [],
      ancestors: [],
      children: [],
      related: [],
    });
  });

  it("attaches compact hierarchy around the selected thought", () => {
    const nodes = [
      thought("root"),
      thought("focus", "root"),
      thought("child", "focus"),
      thought("related"),
    ];
    const edge: RelationshipObject = {
      id: "edge",
      type: "relationship",
      fromId: "focus",
      toId: "related",
    };
    const scene = {
      ...createEmptyScene(),
      objects: Object.fromEntries(
        [...nodes, edge].map((object) => [object.id, object]),
      ),
      order: [...nodes.map((node) => node.id), edge.id],
    };

    const envelope = createTransformEnvelope({
      interactionId: "transform_1",
      scene,
      selection: {
        type: "text-range",
        objectId: "focus",
        start: 0,
        end: 4,
        selectedText: "Text",
        before: "",
        after: " for focus",
        screenRects: [{ x: 10, y: 10, width: 20, height: 20 }],
      },
      gesture: {
        type: "stretch",
        axis: "vertical",
        amount: 0.5,
        startExtent: 20,
        endExtent: 30,
      },
      fixtureMode: true,
      transcript: "展开",
    });

    expect(envelope.context.document).toEqual({
      focus: [
        {
          id: "focus",
          text: "Text for focus",
          kind: "satellite",
          parentId: "root",
        },
      ],
      ancestors: [{ id: "root", text: "Text for root", kind: "primary" }],
      children: [
        {
          id: "child",
          text: "Text for child",
          kind: "satellite",
          parentId: "focus",
        },
      ],
      related: [{ id: "related", text: "Text for related", kind: "primary" }],
    });
  });
});
