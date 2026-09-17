import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const requestModel = vi.hoisted(() => ({
  resolve: vi.fn(() => {
    throw new Error("request model resolution crossed admission");
  }),
}));
vi.mock("./request-model-pool", () => ({
  resolveScenarioRequestModelAdapter: requestModel.resolve,
}));

import { resetInquiryAdmissionForTests } from "./inquiry-admission";
import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import { TRANSCRIPT_REPAIR_PROMPT_VERSION } from "../material/transcript-repair";
import { PROTOCOL_VERSION } from "../tree/model";
import { handleInquiryRequest } from "./inquiry-route";
import { handleLabelRequest, resetLabelAdmissionForTests } from "./label-route";
import { handleRepairRequest, resetRepairAdmissionForTests } from "./repair-route";
import { handleTextSwapRequest } from "./text-swap-route";
import { resetTransformAdmissionForTests } from "./transform-admission";
import { handleTransformRequest } from "./transform-route";

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env = {
    ...originalEnvironment,
    NODE_ENV: "production",
    MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io",
  };
  requestModel.resolve.mockClear();
  resetInquiryAdmissionForTests();
  resetLabelAdmissionForTests();
  resetRepairAdmissionForTests();
  resetTransformAdmissionForTests();
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("model route admission order", () => {
  it.each([
    ["inquiry", handleInquiryRequest],
    ["label", handleLabelRequest],
    ["repair", handleRepairRequest],
    ["text-swap", handleTextSwapRequest],
    ["transform", handleTransformRequest],
  ] as const)("rejects cross-origin %s before credential or pool work", async (path, handle) => {
    const request = new Request(`https://matter.ptoq.io/matter/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: "{}",
    });

    await expect(handle(request)).rejects.toMatchObject({ status: 403 });
    expect(requestModel.resolve).not.toHaveBeenCalled();
  });

  it("lets an admitted label request use its explicitly injected proof adapter", async () => {
    const response = await handleLabelRequest(sameOriginRequest("label", {
      protocolVersion: PROTOCOL_VERSION,
      promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
      operationId: "operation-1",
      basis: { treeId: "tree-1", nodeId: "node-1", revision: 2 },
      locale: "zh-CN",
      maxGraphemes: 9,
      text: "我们怀念的也许不是过去，而是仍然可以想象的生活。",
      reference: { siblingLabels: ["模型调用成本"] },
    }), async () => ({ text: "想象的生活" }));

    expect(response.status).toBe(200);
    expect(requestModel.resolve).not.toHaveBeenCalled();
  });

  it("lets an admitted repair request use its explicitly injected proof adapter", async () => {
    const response = await handleRepairRequest(sameOriginRequest("repair", {
      protocolVersion: PROTOCOL_VERSION,
      promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
      operationId: "voice_1",
      attempt: 1,
      locale: "zh-CN",
      text: "我一直在想这件事到底该怎么做 也许先放一放反而会更清楚",
    }), async () => ({
      text: "我一直在想这件事到底该怎么做，也许先放一放反而会更清楚。",
    }));

    expect(response.status).toBe(200);
    expect(requestModel.resolve).not.toHaveBeenCalled();
  });
});

function sameOriginRequest(path: string, body: unknown): Request {
  return new Request(`https://matter.ptoq.io/matter/api/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://matter.ptoq.io",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}
