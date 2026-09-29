import { describe, expect, it } from "vitest";
import { parseOpenAiChatCompletion } from "./openai-chat-completion";

function completion(choice: Record<string, unknown>): unknown {
  return { choices: [choice] };
}

describe("parseOpenAiChatCompletion", () => {
  it("reads the first choice's text and its stop report", () => {
    expect(parseOpenAiChatCompletion(completion({
      message: { role: "assistant", content: "text" },
      finish_reason: "stop",
    }))).toEqual({ content: "text", disposition: "complete" });
  });

  it.each([
    ["a refusal", { message: { content: null, refusal: "no" }, finish_reason: "stop" }, "blocked-or-refused"],
    ["a message tool call", { message: { content: null, tool_calls: [{}] }, finish_reason: "stop" }, "tool-or-continuation"],
    ["a choice tool call", { message: { content: "x" }, tool_calls: [{}], finish_reason: "stop" }, "tool-or-continuation"],
    ["a legacy function call", { message: { content: null, function_call: {} }, finish_reason: "stop" }, "tool-or-continuation"],
  ] as const)("marks %s as an answer that is not text", (_name, choice, unusable) => {
    expect(parseOpenAiChatCompletion(completion(choice))).toMatchObject({ unusable });
  });

  it("ignores empty refusal and tool-call fields", () => {
    expect(parseOpenAiChatCompletion(completion({
      message: { content: "text", refusal: " ", tool_calls: [] },
      finish_reason: "stop",
    }))).not.toHaveProperty("unusable");
  });

  it("lets the lane choose its stop vocabulary", () => {
    const choice = { message: { content: "text" }, finish_reason: "eos" };
    expect(parseOpenAiChatCompletion(completion(choice)).disposition).toBe("complete");
    expect(parseOpenAiChatCompletion(completion(choice), () => "unknown-terminator").disposition)
      .toBe("unknown-terminator");
  });

  it.each([
    ["no object", null],
    ["an array", []],
    ["no choices", { choices: [] }],
    ["a non-object choice", { choices: ["text"] }],
    ["an array choice", { choices: [[]] }],
  ])("refuses %s", (_name, payload) => {
    expect(() => parseOpenAiChatCompletion(payload)).toThrow();
  });
});
