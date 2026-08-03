import { describe, expect, it } from "vitest";
import { interactionEnvelopeSchema } from "./schemas";

const validInteraction = {
  protocolVersion: "0.1",
  id: "int_1",
  mode: "create",
  experienceId: "elastic-language",
  sceneRevision: 0,
  voice: { transcript: "把思想放在这里。", language: "zh-CN" },
  anchor: { x: 300, y: 240 },
  context: {
    nearbyObjectIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    document: { focus: [], ancestors: [], children: [], related: [] },
  },
  client: {
    locale: "zh-CN",
    fixtureMode: true,
    inputCapabilities: { pointer: true, touch: false },
  },
};

describe("interaction schema", () => {
  it("accepts the bounded fixture envelope", () => {
    expect(interactionEnvelopeSchema.parse(validInteraction)).toEqual(
      validInteraction,
    );
  });

  it("rejects oversized transcripts and unbounded coordinates", () => {
    expect(
      interactionEnvelopeSchema.safeParse({
        ...validInteraction,
        voice: { transcript: "x".repeat(2_001) },
        anchor: { x: Number.POSITIVE_INFINITY, y: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects document context on an unfocused create turn", () => {
    expect(
      interactionEnvelopeSchema.safeParse({
        ...validInteraction,
        context: {
          ...validInteraction.context,
          document: {
            focus: [{ id: "thought_1", text: "不应出现", kind: "primary" }],
            ancestors: [],
            children: [],
            related: [],
          },
        },
      }).success,
    ).toBe(false);
  });

  it("requires bounded context focused on the transformed thought", () => {
    const node = {
      id: "thought_1",
      text: "一段思考",
      kind: "primary",
    } as const;
    const transform = {
      ...validInteraction,
      mode: "transform",
      anchor: undefined,
      selection: {
        type: "text-range",
        objectId: "thought_1",
        start: 0,
        end: 2,
        selectedText: "一段",
        before: "",
        after: "思考",
        screenRects: [{ x: 1, y: 1, width: 10, height: 10 }],
      },
      gesture: {
        type: "stretch",
        axis: "vertical",
        amount: 0.5,
        startExtent: 20,
        endExtent: 30,
      },
      context: {
        ...validInteraction.context,
        nearbyObjectIds: ["thought_1"],
        document: {
          focus: [node],
          ancestors: [],
          children: Array.from({ length: 7 }, (_, index) => ({
            ...node,
            id: `child_${index}`,
          })),
          related: [],
        },
      },
    };

    expect(interactionEnvelopeSchema.safeParse(transform).success).toBe(false);
    expect(
      interactionEnvelopeSchema.safeParse({
        ...transform,
        context: {
          ...transform.context,
          document: {
            ...transform.context.document,
            focus: [{ ...node, id: "wrong_focus" }],
            children: [],
          },
        },
      }).success,
    ).toBe(false);
  });
});
