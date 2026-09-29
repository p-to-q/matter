import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import { PROTOCOL_VERSION } from "../tree/model";
import type { LabelRequest } from "../protocol/label-contract";
import type { ScenarioAdapter } from "./harness";
import { generateLabel, resetLabelGeneratorState } from "./label-generator";

const PAST = "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。";
const FORECAST = "呃，我觉得季度营收预测需要重新检查一下数据来源。";

function labelRequest(
  operationId: string,
  text: string,
  reference: LabelRequest["reference"] = {},
): LabelRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    operationId,
    basis: { treeId: "tree-1", nodeId: operationId, revision: 4 },
    locale: "zh-CN",
    maxGraphemes: 9,
    text,
    reference,
  };
}

afterEach(() => resetLabelGeneratorState());

describe("label cache", () => {
  it("serves each cached label only to the question it answered", async () => {
    let calls = 0;
    const adapter: ScenarioAdapter = async (call) => {
      calls += 1;
      const text = (call.input as { text: string }).text;
      return { text: text.includes("季度营收预测") ? "季度营收预测" : "想象的生活" };
    };

    await generateLabel(labelRequest("first", PAST), new AbortController().signal, adapter);
    await generateLabel(labelRequest("second", FORECAST), new AbortController().signal, adapter);
    const past = await generateLabel(labelRequest("third", PAST), new AbortController().signal, adapter);
    const forecast = await generateLabel(
      labelRequest("fourth", FORECAST),
      new AbortController().signal,
      adapter,
    );

    expect(calls).toBe(2);
    expect(past).toMatchObject({ source: "model", label: "想象的生活" });
    expect(forecast).toMatchObject({ source: "model", label: "季度营收预测" });
  });

  it("never shows a cached label to a question that would refuse it", async () => {
    const adapter: ScenarioAdapter = async () => ({ text: "想象的生活" });
    await generateLabel(labelRequest("first", PAST), new AbortController().signal, adapter);

    // The same material beside a sibling already named that way must not
    // inherit the name: the label would blur into its sibling.
    const beside = await generateLabel(
      labelRequest("second", PAST, { siblingLabels: ["想象的生活"] }),
      new AbortController().signal,
      adapter,
    );

    expect(beside.label).not.toBe("想象的生活");
    expect(beside.source).toBe("provisional");
  });

  it("never lets a different question join another question's flight", async () => {
    const releases: Array<() => void> = [];
    const adapter: ScenarioAdapter = async (call) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      const text = (call.input as { text: string }).text;
      return { text: text.includes("季度营收预测") ? "季度营收预测" : "想象的生活" };
    };

    const first = generateLabel(labelRequest("first", PAST), new AbortController().signal, adapter);
    const second = generateLabel(
      labelRequest("second", FORECAST),
      new AbortController().signal,
      adapter,
    );
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.forEach((release) => release());

    await expect(first).resolves.toMatchObject({ source: "model", label: "想象的生活" });
    await expect(second).resolves.toMatchObject({ source: "model", label: "季度营收预测" });
  });

  it("still coalesces an identical question into one flight", async () => {
    const releases: Array<() => void> = [];
    let calls = 0;
    const adapter: ScenarioAdapter = async () => {
      calls += 1;
      await new Promise<void>((resolve) => releases.push(resolve));
      return { text: "想象的生活" };
    };
    const first = generateLabel(labelRequest("first", PAST), new AbortController().signal, adapter);
    const second = generateLabel(labelRequest("second", PAST), new AbortController().signal, adapter);
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.forEach((release) => release());

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ operationId: "first", label: "想象的生活" }),
      expect.objectContaining({ operationId: "second", label: "想象的生活" }),
    ]);
    expect(calls).toBe(1);
  });
});
