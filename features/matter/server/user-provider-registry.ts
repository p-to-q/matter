import "server-only";

import { BoundedByteAccumulator } from "../runtime/bounded-byte-accumulator";
import {
  isCanonicalUserProviderBaseUrl,
  isValidUserProviderApiKey,
  normalizeUserProviderEndpoint,
} from "../protocol/provider-session-contract";
import type {
  PoolCandidate,
  PoolCompletionDisposition,
  PoolParsedCompletion,
  PoolTransport,
} from "./model-pool";
import {
  fetchPublicAnthropicMessages,
  fetchPublicChatCompletions,
  fetchPublicProviderModels,
} from "./public-provider-fetch";

export const USER_PROVIDER_DISCOVERY_TIMEOUT_MS = 2_250;
const MAX_MODEL_LIST_BYTES = 64 * 1_024;
// Aggregators commonly expose far more than one vendor's catalog. Bytes remain
// the primary memory bound; this secondary ceiling rejects pathological arrays
// without excluding an otherwise ordinary multi-provider gateway.
const MAX_MODEL_LIST_ENTRIES = 512;
const MAX_MODEL_ID_CODE_UNITS = 128;
const MAX_DISCOVERED_SELECTIONS = 3;
const MAX_DISCOVERY_REQUESTS = 3;

export type UserProviderProfileId =
  | "openai-current"
  | "openai-compatible"
  | "deepseek-current"
  | "deepseek-compatible"
  | "anthropic-current"
  | "anthropic-compatible";

export type UserProviderSelection = Readonly<{
  profileId: UserProviderProfileId;
  model: string;
  baseUrl: string;
}>;

export type UserProviderCandidateCredential = UserProviderSelection & Readonly<{
  apiKey: string;
  scopeId: string;
}>;

type DiscoveryKind = "openai-models" | "anthropic-models";

type UserProviderDefinition = Readonly<{
  id: UserProviderProfileId;
  family: "openai" | "deepseek" | "anthropic";
  reviewedModels: readonly string[];
  officialBases: readonly string[];
  discovery: DiscoveryKind;
  transport: PoolTransport;
  custom: boolean;
}>;

const OPENAI_MODEL = "gpt-4.1-mini";
const DEEPSEEK_MODEL = "deepseek-flash";
// Fable is the current small Claude family with a materially longer active
// lifecycle than the near-retirement Haiku 4.5 snapshot.
const ANTHROPIC_MODEL = "claude-fable-5";

const OPENAI_CURRENT_TRANSPORT = chatTransport({
  id: "openai-chat-completions/current/2",
  maxTokensField: "max_completion_tokens",
  completion: "official",
});
const OPENAI_COMPATIBLE_TRANSPORT = chatTransport({
  id: "openai-chat-completions/compatible/2",
  maxTokensField: "max_tokens",
  completion: "compatible",
});
const DEEPSEEK_CURRENT_TRANSPORT = chatTransport({
  id: "deepseek-chat-completions/current/2",
  maxTokensField: "max_tokens",
  completion: "official",
  thinking: Object.freeze({ type: "disabled" }),
});
const DEEPSEEK_COMPATIBLE_TRANSPORT = chatTransport({
  id: "deepseek-chat-completions/compatible/2",
  maxTokensField: "max_tokens",
  completion: "compatible",
});
const ANTHROPIC_CURRENT_TRANSPORT = anthropicTransport("anthropic-messages/current/1");
const ANTHROPIC_COMPATIBLE_TRANSPORT = anthropicTransport("anthropic-messages/compatible/1");

const DEFINITIONS: Readonly<Record<UserProviderProfileId, UserProviderDefinition>> = Object.freeze({
  "openai-current": definition({
    id: "openai-current",
    family: "openai",
    reviewedModels: [OPENAI_MODEL],
    officialBases: ["https://api.openai.com/v1"],
    discovery: "openai-models",
    transport: OPENAI_CURRENT_TRANSPORT,
    custom: false,
  }),
  "openai-compatible": definition({
    id: "openai-compatible",
    family: "openai",
    reviewedModels: [OPENAI_MODEL],
    officialBases: [],
    discovery: "openai-models",
    transport: OPENAI_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
  "deepseek-current": definition({
    id: "deepseek-current",
    family: "deepseek",
    reviewedModels: [DEEPSEEK_MODEL],
    officialBases: ["https://api.deepseek.com/v1"],
    discovery: "openai-models",
    transport: DEEPSEEK_CURRENT_TRANSPORT,
    custom: false,
  }),
  "deepseek-compatible": definition({
    id: "deepseek-compatible",
    family: "deepseek",
    reviewedModels: [DEEPSEEK_MODEL],
    officialBases: [],
    discovery: "openai-models",
    transport: DEEPSEEK_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
  "anthropic-current": definition({
    id: "anthropic-current",
    family: "anthropic",
    reviewedModels: [ANTHROPIC_MODEL],
    officialBases: ["https://api.anthropic.com/v1"],
    discovery: "anthropic-models",
    transport: ANTHROPIC_CURRENT_TRANSPORT,
    custom: false,
  }),
  "anthropic-compatible": definition({
    id: "anthropic-compatible",
    family: "anthropic",
    reviewedModels: [ANTHROPIC_MODEL],
    officialBases: [],
    discovery: "anthropic-models",
    transport: ANTHROPIC_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
});
const OFFICIAL_BASES: ReadonlySet<string> = new Set(
  Object.values(DEFINITIONS).flatMap((entry) => entry.officialBases),
);

const CUSTOM_DISCOVERY_ORDER: readonly UserProviderProfileId[] = Object.freeze([
  "openai-compatible",
  "deepseek-compatible",
  "anthropic-compatible",
]);

export function createUserPoolCandidate(credential: UserProviderCandidateCredential): PoolCandidate | null {
  if (!isUserProviderSelection({
    profileId: credential.profileId,
    model: credential.model,
    baseUrl: credential.baseUrl,
  }) || !isValidUserProviderApiKey(credential.apiKey)) return null;
  if (!/^[A-Za-z0-9_-]{22}$/u.test(credential.scopeId)) return null;
  const definition = DEFINITIONS[credential.profileId];
  const transport = definition.custom
    ? publicTransport(definition.transport, definition.family)
    : definition.transport;
  return Object.freeze({
    station: `user-${definition.family}`,
    baseUrl: credential.baseUrl,
    apiKey: credential.apiKey,
    model: credential.model,
    credentialScopeId: credential.scopeId,
    transport,
  });
}

export function createUserProbeCandidate(
  selection: UserProviderSelection,
  apiKey: string,
  scopeId: string,
): PoolCandidate | null {
  return createUserPoolCandidate({ ...selection, apiKey, scopeId });
}

/**
 * Resolves endpoint shape without provider or model hints from the browser.
 * Official endpoints use one reviewed model. A custom endpoint contributes at
 * most one bounded candidate per admitted base/wire pair; the connection route
 * must still prove each candidate with the production transport before it can
 * seal a lease. Runtime material requests never repeat this negotiation.
 */
export async function resolveUserProviderSelections(
  endpoint: string,
  apiKey: string,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<readonly UserProviderSelection[]> {
  const normalizedEndpoint = normalizeUserProviderEndpoint(endpoint);
  if (normalizedEndpoint === null || !isValidUserProviderApiKey(apiKey)) {
    return Object.freeze([]);
  }
  signal.throwIfAborted();
  const shapes = endpointShapes(normalizedEndpoint);
  for (const shape of shapes) {
    const official = resolveOfficialSelection(shape);
    if (official !== null) return Object.freeze([official]);
  }

  const requests = discoveryRequests(shapes, apiKey);
  if (requests.length === 0 || requests.length > MAX_DISCOVERY_REQUESTS) {
    return Object.freeze([]);
  }
  const deadline = new AbortController();
  const abort = () => deadline.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => deadline.abort(new DOMException("Discovery timed out", "TimeoutError")), USER_PROVIDER_DISCOVERY_TIMEOUT_MS);
  try {
    const settled = await Promise.all(requests.map(async (request) => {
      try {
        return await discoverSelection(request, deadline.signal, fetchImpl ?? fetchPublicProviderModels);
      } catch {
        return null;
      }
    }));
    signal.throwIfAborted();
    return Object.freeze(settled
      .filter((selection): selection is UserProviderSelection => selection !== null)
      .slice(0, MAX_DISCOVERED_SELECTIONS));
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    deadline.abort();
  }
}

export function isUserProviderSelection(value: unknown): value is UserProviderSelection {
  if (!isPlainObject(value) || !hasExactKeys(value, ["profileId", "model", "baseUrl"])) {
    return false;
  }
  if (
    !isUserProviderProfileId(value.profileId) ||
    typeof value.model !== "string" ||
    typeof value.baseUrl !== "string"
  ) return false;
  const definition = DEFINITIONS[value.profileId];
  return isCanonicalUserProviderBaseUrl(value.baseUrl) &&
    (definition.custom
      ? !OFFICIAL_BASES.has(value.baseUrl) && isSelectableTextModelId(value.model)
      : definition.officialBases.includes(value.baseUrl) &&
        definition.reviewedModels.includes(value.model));
}

export function validateUserProviderRegistry(): boolean {
  const definitions = Object.values(DEFINITIONS);
  const ids = new Set(definitions.map((entry) => entry.id));
  const transportIds = new Set(definitions.map((entry) => entry.transport.id));
  const discoveredModelOwners = new Map<string, DiscoveryKind>();
  for (const entry of definitions) {
    if (entry.reviewedModels.length === 0) return false;
    if (entry.officialBases.some((base) => !isCanonicalUserProviderBaseUrl(base))) return false;
    for (const model of entry.reviewedModels) {
      const owner = discoveredModelOwners.get(model);
      if (owner !== undefined && owner !== entry.discovery) return false;
      discoveredModelOwners.set(model, entry.discovery);
    }
  }
  return ids.size === definitions.length && transportIds.size === definitions.length;
}

type EndpointShape = Readonly<{
  endpoint: string;
  baseUrl: string;
  hint: "chat-completions" | "anthropic-messages" | null;
}>;

function splitEndpoint(endpoint: string): EndpointShape {
  const url = new URL(endpoint);
  if (url.pathname.endsWith("/chat/completions")) {
    return Object.freeze({
      endpoint,
      baseUrl: `${url.origin}${url.pathname.slice(0, -"/chat/completions".length)}`,
      hint: "chat-completions",
    });
  }
  if (url.pathname.endsWith("/v1/messages")) {
    return Object.freeze({
      endpoint,
      baseUrl: `${url.origin}${url.pathname.slice(0, -"/messages".length)}`,
      hint: "anthropic-messages",
    });
  }
  return Object.freeze({ endpoint, baseUrl: endpoint, hint: null });
}

/**
 * Keeps the supplied safe path first. One same-origin `/v1` base is the only
 * hidden path recovery; explicit operation URLs are never rewritten.
 */
function endpointShapes(endpoint: string): readonly EndpointShape[] {
  const exact = splitEndpoint(endpoint);
  if (exact.hint !== null || new URL(exact.baseUrl).pathname.replace(/\/+$/u, "").endsWith("/v1")) {
    return Object.freeze([exact]);
  }
  const fallback = normalizeUserProviderEndpoint(`${exact.baseUrl}/v1`);
  return fallback === null
    ? Object.freeze([exact])
    : Object.freeze([exact, splitEndpoint(fallback)]);
}

function resolveOfficialSelection(shape: EndpointShape): UserProviderSelection | null {
  for (const profileId of ["openai-current", "deepseek-current", "anthropic-current"] as const) {
    const definition = DEFINITIONS[profileId];
    if (!definition.officialBases.includes(shape.baseUrl)) continue;
    if (shape.hint === "anthropic-messages" && definition.discovery !== "anthropic-models") continue;
    if (shape.hint === "chat-completions" && definition.discovery !== "openai-models") continue;
    return Object.freeze({
      profileId,
      model: definition.reviewedModels[0]!,
      baseUrl: shape.baseUrl,
    });
  }
  return null;
}

type DiscoveryRequest = Readonly<{
  kind: DiscoveryKind;
  endpoint: string;
  baseUrl: string;
  url: string;
  headers: Readonly<Record<string, string>>;
}>;

function discoveryRequests(
  shapes: readonly EndpointShape[],
  apiKey: string,
): readonly DiscoveryRequest[] {
  const requests: DiscoveryRequest[] = [];
  const identities = new Set<string>();
  // Prefer the overwhelmingly common compatible wire on the person's exact
  // base, then its sole path recovery, before trying the native Anthropic wire.
  // Promise.all preserves this order even though the catalog reads share one
  // latency budget.
  for (const shape of shapes) {
    if (shape.hint !== "anthropic-messages") {
      pushDiscoveryRequest(requests, identities, Object.freeze({
        kind: "openai-models",
        endpoint: shape.endpoint,
        baseUrl: shape.baseUrl,
        url: appendPath(shape.baseUrl, "models"),
        headers: bearerHeaders(apiKey),
      }));
    }
  }
  for (const shape of shapes) {
    if (shape.hint !== "chat-completions") {
      const versionedBase = ensureVersionedBase(shape.baseUrl);
      pushDiscoveryRequest(requests, identities, Object.freeze({
        kind: "anthropic-models",
        endpoint: shape.endpoint,
        baseUrl: versionedBase,
        url: appendPath(versionedBase, "models"),
        headers: anthropicHeaders(apiKey),
      }));
    }
  }
  return Object.freeze(requests);
}

function pushDiscoveryRequest(
  requests: DiscoveryRequest[],
  identities: Set<string>,
  request: DiscoveryRequest,
): void {
  const identity = `${request.kind}\u0000${request.url}`;
  if (identities.has(identity)) return;
  identities.add(identity);
  requests.push(request);
}

async function discoverSelection(
  request: DiscoveryRequest,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<UserProviderSelection | null> {
  const response = await fetchWithAbortBoundary(fetchImpl, request.url, {
    method: "GET",
    headers: { accept: "application/json", ...request.headers },
    cache: "no-store",
    redirect: "error",
    signal,
  }, signal);
  if (!response.ok || !acceptsJsonResponse(response)) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  const payload = await readBoundedJson(response, signal);
  const models = parseModelList(payload);
  if (models === null) return null;
  const selected = selectCatalogModel(request.kind, models);
  return selected === null ? null : Object.freeze({
    profileId: selected.profileId,
    model: selected.model,
    baseUrl: request.baseUrl,
  });
}

/**
 * Catalogs do not share a capability schema. We first retain a reviewed exact
 * model when present, then choose one inexpensive-looking text model in stable
 * catalog order. The content-free sentinel, not the name heuristic, is the
 * authority that proves the selected model actually supports Matter's wire.
 */
function selectCatalogModel(
  kind: DiscoveryKind,
  models: ReadonlySet<string>,
): Readonly<{ profileId: UserProviderProfileId; model: string }> | null {
  const profiles = CUSTOM_DISCOVERY_ORDER.filter((profileId) => (
    DEFINITIONS[profileId].discovery === kind
  ));
  for (const profileId of profiles) {
    const preferred = DEFINITIONS[profileId].reviewedModels.find((model) => models.has(model));
    if (preferred !== undefined) return Object.freeze({ profileId, model: preferred });
  }
  const ranked = [...models]
    .map((model, index) => Object.freeze({ model, index, score: modelSelectionScore(model) }))
    .filter(({ score }) => score !== null)
    .sort((left, right) => (
      right.score! - left.score! || left.index - right.index || left.model.localeCompare(right.model)
    ));
  const model = ranked[0]?.model;
  if (model === undefined) return null;
  const profileId = kind === "anthropic-models"
    ? "anthropic-compatible"
    : "openai-compatible";
  return Object.freeze({ profileId, model });
}

function modelSelectionScore(model: string): number | null {
  if (!isSelectableTextModelId(model)) return null;
  const value = model.toLowerCase();
  let score = 0;
  if (/(?:^|[-_.:/])(mini|nano|flash|haiku|small|lite)(?:$|[-_.:/])/u.test(value)) score += 80;
  if (/(?:^|[-_.:/])(chat|instruct|sonnet)(?:$|[-_.:/])/u.test(value)) score += 35;
  if (/(?:gpt|claude|deepseek|qwen|glm|gemini|mistral|llama)/u.test(value)) score += 20;
  if (/(?:^|[-_.:/])(preview|experimental|exp)(?:$|[-_.:/])/u.test(value)) score -= 15;
  if (/(?:^|[-_.:/])(pro|max|opus|fable|reasoner)(?:$|[-_.:/])/u.test(value)) score -= 45;
  return score;
}

function isSelectableTextModelId(model: string): boolean {
  if (
    model.length === 0 ||
    model.length > MAX_MODEL_ID_CODE_UNITS ||
    /[^\x20-\x7e]/u.test(model)
  ) return false;
  const value = model.toLowerCase();
  return !/(?:^|[-_.:/])(embedding|embed|moderation|rerank|realtime|transcrib|whisper|tts|audio|image|dall-e|sora)(?:$|[-_.:/])/u.test(value);
}

function definition(value: UserProviderDefinition): UserProviderDefinition {
  return Object.freeze({
    ...value,
    reviewedModels: Object.freeze([...value.reviewedModels]),
    officialBases: Object.freeze([...value.officialBases]),
  });
}

function publicTransport(transport: PoolTransport, family: UserProviderDefinition["family"]): PoolTransport {
  return Object.freeze({
    ...transport,
    fetch: family === "anthropic" ? fetchPublicAnthropicMessages : fetchPublicChatCompletions,
  });
}

function chatTransport(input: Readonly<{
  id: string;
  maxTokensField: "max_tokens" | "max_completion_tokens";
  completion: "official" | "compatible";
  thinking?: Readonly<{ type: "disabled" }>;
}>): PoolTransport {
  return Object.freeze({
    id: input.id,
    completionUrl: (baseUrl) => appendPath(baseUrl, "chat/completions"),
    authHeaders: bearerHeaders,
    acceptsResponse: acceptsJsonResponse,
    serialize: (call, maximumOutputTokens, model) => ({
      model,
      temperature: 0,
      [input.maxTokensField]: maximumOutputTokens,
      stream: false,
      ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
      messages: [{ role: "user", content: call.prompt }],
    }),
    parseCompletion: (payload) => parseChatCompletion(
      payload,
      input.completion === "official" ? classifyOfficialChatCompletion : classifyCompatibleChatCompletion,
    ),
  });
}

function anthropicTransport(id: string): PoolTransport {
  return Object.freeze({
    id,
    completionUrl: (baseUrl) => appendPath(ensureVersionedBase(baseUrl), "messages"),
    authHeaders: anthropicHeaders,
    acceptsResponse: acceptsJsonResponse,
    serialize: (call, maximumOutputTokens, model) => ({
      model,
      max_tokens: maximumOutputTokens,
      temperature: 0,
      stream: false,
      messages: [{ role: "user", content: call.prompt }],
    }),
    parseCompletion: parseAnthropicCompletion,
  });
}

function parseChatCompletion(
  payload: unknown,
  classify: (choice: Readonly<Record<string, unknown>>) => PoolCompletionDisposition,
): PoolParsedCompletion {
  if (!isPlainObject(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error("The model provider response had no choice.");
  }
  const choice = payload.choices[0];
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

function parseAnthropicCompletion(payload: unknown): PoolParsedCompletion {
  if (!isPlainObject(payload) || payload.type !== "message" || !Array.isArray(payload.content)) {
    throw new Error("The Anthropic response envelope was invalid.");
  }
  const text: string[] = [];
  let unusable: "blocked-or-refused" | "tool-or-continuation" | undefined;
  for (const block of payload.content) {
    if (!isPlainObject(block) || typeof block.type !== "string") {
      throw new Error("The Anthropic response content was invalid.");
    }
    if (block.type === "text" && typeof block.text === "string") text.push(block.text);
    else if (block.type === "tool_use") unusable = "tool-or-continuation";
    else if (block.type !== "thinking" && block.type !== "redacted_thinking") {
      throw new Error("The Anthropic response content was unsupported.");
    }
  }
  const disposition = classifyAnthropicStop(payload.stop_reason);
  if (disposition === "blocked-or-refused") unusable = "blocked-or-refused";
  return Object.freeze({
    content: text.length === 0 ? undefined : text.join(""),
    disposition,
    ...(unusable === undefined ? {} : { unusable }),
  });
}

function classifyAnthropicStop(value: unknown): PoolCompletionDisposition {
  if (value === undefined || value === null) return "missing";
  if (typeof value !== "string") return "unknown-terminator";
  switch (value) {
    case "end_turn":
    case "stop_sequence": return "complete";
    case "max_tokens": return "truncated";
    case "refusal": return "blocked-or-refused";
    case "tool_use":
    case "pause_turn": return "tool-or-continuation";
    default: return "unknown-terminator";
  }
}

function classifyOfficialChatCompletion(choice: Readonly<Record<string, unknown>>): PoolCompletionDisposition {
  if (choice.stop_reason !== undefined && choice.stop_reason !== null) return "unknown-terminator";
  const reason = choice.finish_reason;
  if (reason === undefined || reason === null) return "missing";
  if (typeof reason !== "string") return "unknown-terminator";
  switch (reason) {
    case "stop": return "complete";
    case "length": return "truncated";
    case "content_filter": return "blocked-or-refused";
    case "function_call":
    case "tool_calls": return "tool-or-continuation";
    default: return "unknown-terminator";
  }
}

function classifyCompatibleChatCompletion(choice: Readonly<Record<string, unknown>>): PoolCompletionDisposition {
  const raw = [choice.finish_reason, choice.stop_reason];
  if (raw.some((reason) => reason !== undefined && reason !== null && typeof reason !== "string")) {
    return "unknown-terminator";
  }
  const reasons = raw
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => reason.trim().toLowerCase());
  if (reasons.length === 0) return "missing";
  if (reasons.some((reason) => reason.length === 0)) return "unknown-terminator";
  const dispositions = reasons.map((reason): PoolCompletionDisposition => {
    if (reason === "stop" || reason === "end_turn" || reason === "stop_sequence") return "complete";
    if (reason === "length" || reason === "max_tokens") return "truncated";
    if (reason === "content_filter" || reason === "refusal" || reason === "safety") return "blocked-or-refused";
    if (reason === "function_call" || reason === "tool_calls" || reason === "tool_use") return "tool-or-continuation";
    return "unknown-terminator";
  });
  if (dispositions.every((value) => value === "complete")) return "complete";
  if (dispositions.includes("unknown-terminator")) return "unknown-terminator";
  if (dispositions.includes("blocked-or-refused")) return "blocked-or-refused";
  if (dispositions.includes("tool-or-continuation")) return "tool-or-continuation";
  return "truncated";
}

function acceptsJsonResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

function bearerHeaders(apiKey: string): Readonly<Record<string, string>> {
  return Object.freeze({ authorization: `Bearer ${apiKey}` });
}

function anthropicHeaders(apiKey: string): Readonly<Record<string, string>> {
  return Object.freeze({
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  });
}

function appendPath(baseUrl: string, suffix: string): string {
  return `${baseUrl}/${suffix}`;
}

function ensureVersionedBase(baseUrl: string): string {
  return new URL(baseUrl).pathname.replace(/\/+$/u, "").endsWith("/v1")
    ? baseUrl
    : `${baseUrl}/v1`;
}

function parseModelList(payload: unknown): ReadonlySet<string> | null {
  if (!isPlainObject(payload) || !Array.isArray(payload.data)) return null;
  if (payload.data.length === 0 || payload.data.length > MAX_MODEL_LIST_ENTRIES) return null;
  const ids = new Set<string>();
  for (const entry of payload.data) {
    if (!isPlainObject(entry) || typeof entry.id !== "string") return null;
    if (
      entry.id.length === 0 ||
      entry.id.length > MAX_MODEL_ID_CODE_UNITS ||
      /[^\x20-\x7e]/u.test(entry.id)
    ) return null;
    ids.add(entry.id);
  }
  return ids;
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > MAX_MODEL_LIST_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("The provider model list was too large.");
  }
  const body = response.body;
  if (body === null) throw new Error("The provider model list had no body.");
  signal.throwIfAborted();
  const reader = body.getReader();
  const bytes = new BoundedByteAccumulator(MAX_MODEL_LIST_BYTES);
  const abort = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      const { done, value } = await readWithAbort(reader, signal);
      if (done) break;
      if (value !== undefined && !bytes.append(value)) {
        void reader.cancel().catch(() => undefined);
        throw new Error("The provider model list was too large.");
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.snapshot());
  return JSON.parse(text) as unknown;
}

async function fetchWithAbortBoundary(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  const request = fetchImpl(url, init);
  const boundary = rejectOnAbort(signal);
  try {
    return await Promise.race([request, boundary.promise]);
  } finally {
    boundary.dispose();
    if (signal.aborted) {
      void request.then((response) => response.body?.cancel()).catch(() => undefined);
    }
  }
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const boundary = rejectOnAbort(signal);
  try {
    return await Promise.race([reader.read(), boundary.promise]);
  } finally {
    boundary.dispose();
  }
}

function rejectOnAbort(signal: AbortSignal): Readonly<{ promise: Promise<never>; dispose: () => void }> {
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<never>((_resolve, reject) => { rejectPromise = reject; });
  promise.catch(() => undefined);
  const abort = () => rejectPromise(signal.reason ?? new DOMException("Aborted", "AbortError"));
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return Object.freeze({ promise, dispose: () => signal.removeEventListener("abort", abort) });
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

function isUserProviderProfileId(value: unknown): value is UserProviderProfileId {
  return typeof value === "string" && Object.hasOwn(DEFINITIONS, value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
