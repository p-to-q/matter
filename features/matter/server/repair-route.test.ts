import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRANSCRIPT_REPAIR_PROMPT_VERSION } from "../material/transcript-repair";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  MAX_REPAIR_REQUEST_BYTES,
  isRepairSuccess,
  parseRepairRequest,
} from "../protocol/repair-contract";
import { resetRepairGeneratorState } from "./repair-generator";
import { handleRepairRequest, repairErrorResponse } from "./repair-route";

const BODY = {
  protocolVersion: PROTOCOL_VERSION,
  promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
  operationId: "voice_1",
  attempt: 1,
  locale: "zh-CN",
  text: "我一直在想这件事到底该怎么做 也许先放一放反而会更清楚",
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/matter/api/repair", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function respond(request: Request): Promise<Response> {
  try {
    return await handleRepairRequest(request);
  } catch (error) {
    return repairErrorResponse(error);
  }
}

beforeEach(() => resetRepairGeneratorState());
afterEach(() => resetRepairGeneratorState());

describe("parseRepairRequest", () => {
  it("accepts one well-formed utterance", () => {
    const parsed = parseRepairRequest(BODY);
    expect(parsed.ok).toBe(true);
  });

  it("rejects an unsupported locale, protocol, or prompt version", () => {
    expect(parseRepairRequest({ ...BODY, locale: "en-GB" })).toEqual({
      ok: false,
      message: "The repair locale is invalid.",
    });
    expect(parseRepairRequest({ ...BODY, protocolVersion: "0.1" })).toEqual({
      ok: false,
      message: "The repair protocol version is unsupported.",
    });
    expect(parseRepairRequest({ ...BODY, promptVersion: "transcript-repair/0" })).toEqual({
      ok: false,
      message: "The repair prompt version is unsupported.",
    });
  });

  it("rejects a field the contract does not declare", () => {
    expect(parseRepairRequest({ ...BODY, treeId: "tree-1" })).toEqual({
      ok: false,
      message: "The repair request fields are invalid.",
    });
  });

  it("accepts a bounded vocabulary hint and treats absence as none", () => {
    const withHint = parseRepairRequest({ ...BODY, vocabulary: ["留白", "呼吸"] });
    expect(withHint.ok && withHint.request.vocabulary).toEqual(["留白", "呼吸"]);
    const withoutHint = parseRepairRequest(BODY);
    expect(withoutHint.ok && withoutHint.request.vocabulary).toBeUndefined();
  });

  it("refuses a vocabulary that is too long, too many, or not text", () => {
    expect(parseRepairRequest({ ...BODY, vocabulary: Array(25).fill("留白") }).ok).toBe(false);
    expect(parseRepairRequest({ ...BODY, vocabulary: ["字".repeat(33)] }).ok).toBe(false);
    expect(parseRepairRequest({ ...BODY, vocabulary: [" "] }).ok).toBe(false);
    expect(parseRepairRequest({ ...BODY, vocabulary: "留白" }).ok).toBe(false);
  });

  it("rejects an empty or over-long transcript", () => {
    expect(parseRepairRequest({ ...BODY, text: "   " }).ok).toBe(false);
    expect(parseRepairRequest({ ...BODY, text: "字".repeat(2_001) }).ok).toBe(false);
  });
});

describe("repair route", () => {
  it("answers with a transcript that echoes the request identity", async () => {
    const response = await respond(post(BODY));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(isRepairSuccess(payload, { operationId: "voice_1", attempt: 1 })).toBe(true);
  });

  it("refuses a body larger than the boundary allows", async () => {
    const response = await respond(post({ ...BODY, text: "字".repeat(MAX_REPAIR_REQUEST_BYTES) }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it("refuses a non-JSON media type", async () => {
    const response = await respond(post("text", { "content-type": "text/plain" }));
    expect(response.status).toBe(415);
  });

  it("never leaks a provider or a transcript through an unexpected failure", async () => {
    const response = repairErrorResponse(new Error("relay https://secret.invalid rejected 我说的话"));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("secret.invalid");
    expect(body).not.toContain("我说的话");
    expect(JSON.parse(body)).toEqual({
      error: {
        code: "REPAIR_FAILED",
        message: "The transcript could not be repaired.",
        retryable: true,
      },
    });
  });
});
