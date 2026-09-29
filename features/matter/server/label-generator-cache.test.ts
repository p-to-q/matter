import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Force every question onto one cache key, which SHA-256 makes unreachable in
// practice, to prove a hit is judged against its own question, not trusted.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    createHash: () => {
      const hash = {
        update: () => hash,
        digest: () => "forced-collision",
      };
      return hash;
    },
  };
});
import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import { PROTOCOL_VERSION } from "../tree/model";
import type { LabelRequest } from "../protocol/label-contract";
import type { ScenarioAdapter } from "./harness";
import { generateLabel, resetLabelGeneratorState } from "./label-generator";

function labelRequest(operationId: string, text: string): LabelRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    operationId,
    basis: { treeId: "tree-1", nodeId: operationId, revision: 4 },
    locale: "zh-CN",
    maxGraphemes: 9,
    text,
    reference: {},
  };
}

afterEach(() => resetLabelGeneratorState());

describe("label cache", () => {
  it("never shows another question's label from a colliding entry", async () => {
    const answers = ["想象的生活", "季度营收预测"];
    let calls = 0;
    const adapter: ScenarioAdapter = async () => ({ text: answers[calls++] ?? "" });

    const first = await generateLabel(
      labelRequest("first", "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。"),
      new AbortController().signal,
      adapter,
    );
    const second = await generateLabel(
      labelRequest("second", "呃，我觉得季度营收预测需要重新检查一下数据来源。"),
      new AbortController().signal,
      adapter,
    );

    expect(first).toMatchObject({ source: "model", label: "想象的生活" });
    // The stored label is well-formed but not grounded in this material, so
    // adjudication refuses the hit and the question is asked afresh.
    expect(calls).toBe(2);
    expect(second).toMatchObject({ source: "model", label: "季度营收预测" });
  });

  it("never lets a different question join another question's flight", async () => {
    const releases: Array<() => void> = [];
    const adapter: ScenarioAdapter = async (call) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      const text = (call.input as { text: string }).text;
      return { text: text.includes("季度营收预测") ? "季度营收预测" : "想象的生活" };
    };

    const first = generateLabel(
      labelRequest("first", "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。"),
      new AbortController().signal,
      adapter,
    );
    const second = generateLabel(
      labelRequest("second", "呃，我觉得季度营收预测需要重新检查一下数据来源。"),
      new AbortController().signal,
      adapter,
    );
    // Both questions share a (forced) digest, yet each needs its own call.
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
    const text = "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。";
    const first = generateLabel(labelRequest("first", text), new AbortController().signal, adapter);
    const second = generateLabel(labelRequest("second", text), new AbortController().signal, adapter);
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.forEach((release) => release());

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ operationId: "first", label: "想象的生活" }),
      expect.objectContaining({ operationId: "second", label: "想象的生活" }),
    ]);
    expect(calls).toBe(1);
  });
});
