import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type InteractionEnvelope } from "../engine/protocol";
import { planInteraction } from "./planner";
import { transcribeAudio } from "./transcriber";

const originalEnvironment = { ...process.env };

function interaction(fixtureMode: boolean): InteractionEnvelope {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "int_fixture",
    mode: "create",
    experienceId: "elastic-language",
    sceneRevision: 3,
    voice: { transcript: "人为什么会对过去产生怀旧？", language: "zh-CN" },
    anchor: { x: 280, y: 240 },
    context: {
      nearbyObjectIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      document: { focus: [], ancestors: [], children: [], related: [] },
    },
    client: {
      locale: "zh-CN",
      fixtureMode,
      inputCapabilities: { pointer: true, touch: false },
    },
  };
}

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.unstubAllGlobals();
});

describe("server adapters", () => {
  it("returns a valid deterministic plan without provider access", async () => {
    process.env.ARROW_AGENT_ADAPTER = "mock";
    const plan = await planInteraction(interaction(false));

    expect(plan.sceneRevision).toBe(3);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ type: "create-thought" });
  });

  it("keeps fixture mode explicit when live adapters are configured", async () => {
    process.env.ARROW_AGENT_ADAPTER = "openai";
    process.env.ARROW_TRANSCRIPTION_ADAPTER = "openai";
    process.env.ARROW_DEMO_FIXTURES = "true";

    const transcription = await transcribeAudio(null, "zh-CN", 800, true);
    const plan = await planInteraction({
      ...interaction(true),
      voice: { transcript: transcription.transcript, language: "zh-CN" },
    });

    expect(transcription.transcript).toContain("怀旧");
    expect(plan.actions[0]).toMatchObject({ type: "create-thought" });
  });

  it("can disable deployed fixture access deliberately", async () => {
    process.env.ARROW_DEMO_FIXTURES = "false";
    await expect(planInteraction(interaction(true))).rejects.toMatchObject({
      code: "INVALID_INTERACTION",
      status: 403,
    });
  });

  it("returns a bounded in-place transform plan", async () => {
    process.env.ARROW_AGENT_ADAPTER = "mock";
    const plan = await planInteraction({
      ...interaction(false),
      mode: "transform",
      selection: {
        type: "text-range",
        objectId: "thought_1",
        start: 4,
        end: 12,
        selectedText: "允许我们想象其他",
        before: "过去仍然",
        after: "生活。",
        screenRects: [{ x: 10, y: 10, width: 120, height: 30 }],
      },
      gesture: {
        type: "stretch",
        axis: "vertical",
        amount: 0.72,
        startExtent: 120,
        endExtent: 206.4,
      },
      context: {
        nearbyObjectIds: ["thought_1"],
        viewport: { x: 0, y: 0, zoom: 1 },
        document: {
          focus: [
            {
              id: "thought_1",
              text: "过去仍然允许我们想象其他生活。",
              kind: "primary",
            },
          ],
          ancestors: [],
          children: [],
          related: [],
        },
      },
    });

    expect(plan.actions[0]).toMatchObject({
      type: "replace-text-range",
      objectId: "thought_1",
      start: 4,
      end: 12,
      intent: "expand",
    });
  });

  it("includes compact hierarchy in the live transform request", async () => {
    process.env.ARROW_AGENT_ADAPTER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            { content: [{ type: "output_text", text: '{"text":"新的语言"}' }] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await planInteraction({
      ...interaction(false),
      mode: "transform",
      selection: {
        type: "text-range",
        objectId: "thought_1",
        start: 0,
        end: 2,
        selectedText: "过去",
        before: "",
        after: "仍然允许我们想象其他生活。",
        screenRects: [{ x: 10, y: 10, width: 80, height: 30 }],
      },
      gesture: {
        type: "stretch",
        axis: "vertical",
        amount: 0.4,
        startExtent: 80,
        endExtent: 112,
      },
      context: {
        nearbyObjectIds: ["thought_1"],
        viewport: { x: 0, y: 0, zoom: 1 },
        document: {
          focus: [
            {
              id: "thought_1",
              text: "过去仍然允许我们想象其他生活。",
              kind: "primary",
            },
          ],
          ancestors: [{ id: "root", text: "我们如何记忆", kind: "primary" }],
          children: [
            {
              id: "child",
              text: "另一种生活",
              kind: "satellite",
              parentId: "thought_1",
            },
          ],
          related: [],
        },
      },
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      input: Array<{ role: string; content: string }>;
    };
    const userContent = request.input.find(
      (item) => item.role === "user",
    )?.content;
    expect(userContent).toContain("Document context (hierarchical JSON");
    expect(userContent).toContain("我们如何记忆");
    expect(userContent).toContain("另一种生活");
  });
});
