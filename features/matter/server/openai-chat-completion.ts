import {
  classifyCompletionTerminators,
  type CompletionDisposition,
  type UnusableCompletionCode,
} from "./completion-outcome";

/** What one chat completion said, before any lane decides whether to use it. */
export type ParsedChatCompletion = Readonly<{
  content: unknown;
  disposition: CompletionDisposition;
  unusable?: UnusableCompletionCode;
}>;

/**
 * Reads the OpenAI chat-completions response wire: the first choice's message
 * text, how the relay says it stopped, and whether it answered with a refusal
 * or a tool call instead of text. The managed pool and every reviewed
 * chat-completions transport read this one shape, so an envelope cannot be
 * accepted on one lane and refused on another; only the stop vocabulary is
 * the caller's choice.
 */
export function parseOpenAiChatCompletion(
  payload: unknown,
  classify: (choice: Readonly<Record<string, unknown>>) => CompletionDisposition =
    classifyCompletionTerminators,
): ParsedChatCompletion {
  if (!isPlainObject(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error("The model provider response had no choice.");
  }
  const choice: unknown = payload.choices[0];
  if (!isPlainObject(choice)) throw new Error("The model provider response had no choice object.");
  const message = isPlainObject(choice.message) ? choice.message : null;
  const unusable = hasRefusal(message?.refusal)
    ? "blocked-or-refused" as const
    : hasCollection(message?.tool_calls) || hasCollection(choice.tool_calls) ||
        hasValue(message?.function_call) || hasValue(choice.function_call)
      ? "tool-or-continuation" as const
      : undefined;
  return Object.freeze({
    content: message?.content,
    disposition: classify(choice),
    ...(unusable === undefined ? {} : { unusable }),
  });
}

function hasRefusal(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function hasCollection(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return !Array.isArray(value) || value.length > 0;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
