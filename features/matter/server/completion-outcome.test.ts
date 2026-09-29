import { describe, expect, it } from "vitest";
import { classifyCompletionTerminators } from "./completion-outcome";

describe("classifyCompletionTerminators", () => {
  it("accepts vLLM's stop-token id beside a stop finish", () => {
    // Llama 3's end-of-turn token as vLLM reports it.
    expect(classifyCompletionTerminators({ finish_reason: "stop", stop_reason: 128_009 }))
      .toBe("complete");
    expect(classifyCompletionTerminators({ finish_reason: " STOP ", stop_reason: 0 }))
      .toBe("complete");
  });

  it.each([
    ["alone", { stop_reason: 128_009 }],
    ["beside a truncation", { finish_reason: "length", stop_reason: 128_009 }],
    ["beside another complete finish", { finish_reason: "eos", stop_reason: 128_009 }],
    ["beside an unknown finish", { finish_reason: "new_state", stop_reason: 128_009 }],
  ])("reads a stop-token id %s as an unknown report", (_name, choice) => {
    expect(classifyCompletionTerminators(choice)).toBe("unknown-terminator");
  });

  it.each([
    ["a negative number", -1],
    ["a fraction", 1.5],
    ["an unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["not a number", Number.NaN],
    ["a boolean", true],
    ["an object", { token: 128_009 }],
  ])("treats %s as an unknown stop report", (_name, stopReason) => {
    expect(classifyCompletionTerminators({ finish_reason: "stop", stop_reason: stopReason }))
      .toBe("unknown-terminator");
  });

  it("keeps the numeric form out of finish_reason", () => {
    expect(classifyCompletionTerminators({ finish_reason: 128_009 })).toBe("unknown-terminator");
  });

  it("still reads string reports and their conflicts as before", () => {
    expect(classifyCompletionTerminators({ finish_reason: "stop" })).toBe("complete");
    expect(classifyCompletionTerminators({})).toBe("missing");
    expect(classifyCompletionTerminators({ finish_reason: "stop", stop_reason: "length" }))
      .toBe("truncated");
    expect(classifyCompletionTerminators({ finish_reason: "", stop_reason: "max_tokens" }))
      .toBe("unknown-terminator");
  });
});
