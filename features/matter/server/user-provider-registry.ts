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
  fetchPublicResponses,
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
const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_OPENAI_BASE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["https://generativelanguage.googleapis.com", GEMINI_OPENAI_BASE],
  ["https://generativelanguage.googleapis.com/v1beta", GEMINI_OPENAI_BASE],
]);

export type UserProviderProfileId =
  | "openai-current"
  | "openai-compatible"
  | "openai-responses-current"
  | "openai-responses-compatible"
  | "deepseek-current"
  | "deepseek-compatible"
  | "deepseek-responses-current"
  | "gemini-openai-current"
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
type UserProviderOperation = "chat-completions" | "responses" | "anthropic-messages";
type CatalogPolicy = "anthropic-haiku-sonnet" | "gemini-flash";

type UserProviderDefinition = Readonly<{
  id: UserProviderProfileId;
  family: "openai" | "deepseek" | "gemini" | "anthropic";
  reviewedModels: readonly string[];
  officialBases: readonly string[];
  discovery: DiscoveryKind;
  operation: UserProviderOperation;
  catalogPolicy?: CatalogPolicy;
  transport: PoolTransport;
  custom: boolean;
}>;

const OPENAI_MODEL = "gpt-4.1-mini";
const DEEPSEEK_MODEL = "deepseek-flash";
const ANTHROPIC_MODELS = Object.freeze([
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
]);
const CLAUDE_HAIKU_MODEL = /(?:^|[-_.:/])haiku(?:$|[-_.:/])/u;
const CLAUDE_SONNET_MODEL = /(?:^|[-_.:/])sonnet(?:$|[-_.:/])/u;
const GEMINI_MODELS = Object.freeze(["gemini-2.5-flash", "gemini-2.5-flash-lite"]);

const OPENAI_CURRENT_TRANSPORT = chatTransport({
  id: "openai-chat-completions/current/2",
  maxTokensField: "max_completion_tokens",
  completion: "official",
  store: false,
});
const OPENAI_COMPATIBLE_TRANSPORT = chatTransport({
  id: "openai-chat-completions/compatible/2",
  maxTokensField: "max_tokens",
  completion: "compatible",
});
const OPENAI_RESPONSES_CURRENT_TRANSPORT = responsesTransport({
  id: "openai-responses/current/1",
  temperature: 0,
});
const OPENAI_RESPONSES_COMPATIBLE_TRANSPORT = responsesTransport({
  id: "openai-responses/compatible/1",
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
const DEEPSEEK_RESPONSES_CURRENT_TRANSPORT = responsesTransport({
  id: "deepseek-responses/current/1",
  temperature: 0,
  reasoning: Object.freeze({ effort: "none" }),
});
const GEMINI_OPENAI_CURRENT_TRANSPORT = chatTransport({
  id: "gemini-openai-chat-completions/current/1",
  maxTokensField: "max_tokens",
  completion: "compatible",
  reasoningEffort: "none",
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
    operation: "chat-completions",
    transport: OPENAI_CURRENT_TRANSPORT,
    custom: false,
  }),
  "openai-compatible": definition({
    id: "openai-compatible",
    family: "openai",
    reviewedModels: [OPENAI_MODEL],
    officialBases: [],
    discovery: "openai-models",
    operation: "chat-completions",
    transport: OPENAI_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
  "openai-responses-current": definition({
    id: "openai-responses-current",
    family: "openai",
    reviewedModels: [OPENAI_MODEL],
    officialBases: ["https://api.openai.com/v1"],
    discovery: "openai-models",
    operation: "responses",
    transport: OPENAI_RESPONSES_CURRENT_TRANSPORT,
    custom: false,
  }),
  "openai-responses-compatible": definition({
    id: "openai-responses-compatible",
    family: "openai",
    reviewedModels: [OPENAI_MODEL, DEEPSEEK_MODEL],
    officialBases: [],
    discovery: "openai-models",
    operation: "responses",
    transport: OPENAI_RESPONSES_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
  "deepseek-current": definition({
    id: "deepseek-current",
    family: "deepseek",
    reviewedModels: [DEEPSEEK_MODEL],
    officialBases: ["https://api.deepseek.com/v1"],
    discovery: "openai-models",
    operation: "chat-completions",
    transport: DEEPSEEK_CURRENT_TRANSPORT,
    custom: false,
  }),
  "deepseek-compatible": definition({
    id: "deepseek-compatible",
    family: "deepseek",
    reviewedModels: [DEEPSEEK_MODEL],
    officialBases: [],
    discovery: "openai-models",
    operation: "chat-completions",
    transport: DEEPSEEK_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
  "deepseek-responses-current": definition({
    id: "deepseek-responses-current",
    family: "deepseek",
    reviewedModels: [DEEPSEEK_MODEL],
    officialBases: ["https://api.deepseek.com", "https://api.deepseek.com/v1"],
    discovery: "openai-models",
    operation: "responses",
    transport: DEEPSEEK_RESPONSES_CURRENT_TRANSPORT,
    custom: false,
  }),
  "gemini-openai-current": definition({
    id: "gemini-openai-current",
    family: "gemini",
    reviewedModels: GEMINI_MODELS,
    officialBases: [GEMINI_OPENAI_BASE],
    discovery: "openai-models",
    operation: "chat-completions",
    catalogPolicy: "gemini-flash",
    transport: GEMINI_OPENAI_CURRENT_TRANSPORT,
    custom: false,
  }),
  "anthropic-current": definition({
    id: "anthropic-current",
    family: "anthropic",
    reviewedModels: ANTHROPIC_MODELS,
    officialBases: ["https://api.anthropic.com/v1"],
    discovery: "anthropic-models",
    operation: "anthropic-messages",
    catalogPolicy: "anthropic-haiku-sonnet",
    transport: ANTHROPIC_CURRENT_TRANSPORT,
    custom: false,
  }),
  "anthropic-compatible": definition({
    id: "anthropic-compatible",
    family: "anthropic",
    reviewedModels: ANTHROPIC_MODELS,
    officialBases: [],
    discovery: "anthropic-models",
    operation: "anthropic-messages",
    transport: ANTHROPIC_COMPATIBLE_TRANSPORT,
    custom: true,
  }),
});
const OFFICIAL_OPERATION_BASES: ReadonlySet<string> = new Set(
  Object.values(DEFINITIONS).flatMap((entry) => (
    entry.officialBases.map((base) => `${entry.operation}\u0000${base}`)
  )),
);

const CHAT_DISCOVERY_ORDER: readonly UserProviderProfileId[] = Object.freeze([
  "openai-compatible",
  "deepseek-compatible",
]);
const RESPONSES_DISCOVERY_ORDER: readonly UserProviderProfileId[] = Object.freeze([
  "openai-responses-compatible",
]);
const ANTHROPIC_DISCOVERY_ORDER: readonly UserProviderProfileId[] = Object.freeze([
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
    ? publicTransport(definition.transport, definition.operation)
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
 * Official fixed-model endpoints skip catalog discovery. Official profiles
 * whose inexpensive model changes over time use one bounded catalog read. A
 * custom endpoint contributes at most one candidate per admitted base/wire
 * pair. The connection route must still prove every returned candidate with
 * the production transport before it can seal a lease; runtime material
 * requests never repeat this negotiation.
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
  const shapes = endpointShapes(canonicalizeProviderRegistryEndpoint(normalizedEndpoint));
  const official = resolveOfficialDefinition(shapes);
  if (official !== null) {
    if (official.definition.catalogPolicy === undefined) {
      return Object.freeze([Object.freeze({
        profileId: official.definition.id,
        model: official.definition.reviewedModels[0]!,
        baseUrl: official.shape.baseUrl,
      })]);
    }
    return await runDiscoveryRequests(
      Object.freeze([officialDiscoveryRequest(official, apiKey)]),
      signal,
      fetchImpl ?? fetchPublicProviderModels,
    );
  }

  const requests = discoveryRequests(shapes, apiKey);
  if (requests.length === 0 || requests.length > MAX_DISCOVERY_REQUESTS) {
    return Object.freeze([]);
  }
  return await runDiscoveryRequests(requests, signal, fetchImpl ?? fetchPublicProviderModels);
}

async function runDiscoveryRequests(
  requests: readonly DiscoveryRequest[],
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<readonly UserProviderSelection[]> {
  const deadline = new AbortController();
  const abort = () => deadline.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => deadline.abort(new DOMException("Discovery timed out", "TimeoutError")), USER_PROVIDER_DISCOVERY_TIMEOUT_MS);
  try {
    const settled = await Promise.all(requests.map(async (request) => {
      try {
        return await discoverSelection(request, deadline.signal, fetchImpl);
      } catch {
        return null;
      }
    }));
    signal.throwIfAborted();
    const selections = settled
      .filter((selection): selection is UserProviderSelection => selection !== null)
      .slice(0, MAX_DISCOVERED_SELECTIONS);
    // Preserve a proved selection if another parallel catalog merely timed
    // out. When none proved, surface the owned deadline instead of reporting a
    // misleading empty catalog to the connection route.
    if (selections.length === 0 && deadline.signal.aborted) {
      const reason = deadline.signal.reason;
      throw reason instanceof DOMException && reason.name === "TimeoutError"
        ? reason
        : new DOMException("Discovery timed out", "TimeoutError");
    }
    return Object.freeze(selections);
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
      ? !OFFICIAL_OPERATION_BASES.has(`${definition.operation}\u0000${value.baseUrl}`) &&
        isSelectableTextModelId(value.model)
      : definition.officialBases.includes(value.baseUrl) &&
        isOfficialModelAllowed(definition, value.model));
}

export function validateUserProviderRegistry(): boolean {
  const definitions = Object.values(DEFINITIONS);
  const ids = new Set(definitions.map((entry) => entry.id));
  const transportIds = new Set(definitions.map((entry) => entry.transport.id));
  const discoveredModelOwners = new Map<string, DiscoveryKind>();
  const officialOperationOwners = new Set<string>();
  for (const entry of definitions) {
    if (entry.reviewedModels.length === 0) return false;
    if (entry.custom !== (entry.officialBases.length === 0)) return false;
    if ((entry.operation === "anthropic-messages") !== (entry.discovery === "anthropic-models")) return false;
    if (entry.catalogPolicy !== undefined && entry.custom) return false;
    if (entry.catalogPolicy === "anthropic-haiku-sonnet" && entry.family !== "anthropic") return false;
    if (entry.catalogPolicy === "gemini-flash" && entry.family !== "gemini") return false;
    if (entry.officialBases.some((base) => !isCanonicalUserProviderBaseUrl(base))) return false;
    for (const base of entry.officialBases) {
      const owner = `${base}\u0000${entry.operation}`;
      if (officialOperationOwners.has(owner)) return false;
      officialOperationOwners.add(owner);
    }
    for (const model of entry.reviewedModels) {
      const owner = discoveredModelOwners.get(model);
      if (owner !== undefined && owner !== entry.discovery) return false;
      discoveredModelOwners.set(model, entry.discovery);
    }
  }
  return ids.size === definitions.length && transportIds.size === definitions.length;
}

type EndpointShape = Readonly<{
  baseUrl: string;
  hint: UserProviderOperation | null;
}>;

/**
 * Two exact Google-owned shortcuts enter the documented OpenAI-compatible
 * surface. This is a server registry alias, not general URL normalization:
 * nearby hosts and paths must continue through ordinary bounded discovery.
 */
function canonicalizeProviderRegistryEndpoint(endpoint: string): string {
  return GEMINI_OPENAI_BASE_ALIASES.get(endpoint) ?? endpoint;
}

function splitEndpoint(endpoint: string): EndpointShape {
  const url = new URL(endpoint);
  if (url.pathname.endsWith("/chat/completions")) {
    return Object.freeze({
      baseUrl: `${url.origin}${url.pathname.slice(0, -"/chat/completions".length)}`,
      hint: "chat-completions",
    });
  }
  if (url.pathname.endsWith("/responses")) {
    return Object.freeze({
      baseUrl: `${url.origin}${url.pathname.slice(0, -"/responses".length)}`,
      hint: "responses",
    });
  }
  if (url.pathname.endsWith("/v1/messages")) {
    return Object.freeze({
      baseUrl: `${url.origin}${url.pathname.slice(0, -"/messages".length)}`,
      hint: "anthropic-messages",
    });
  }
  return Object.freeze({ baseUrl: endpoint, hint: null });
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

type OfficialDefinition = Readonly<{
  shape: EndpointShape;
  definition: UserProviderDefinition;
}>;

function resolveOfficialDefinition(shapes: readonly EndpointShape[]): OfficialDefinition | null {
  for (const shape of shapes) {
    for (const definition of Object.values(DEFINITIONS)) {
      if (definition.custom || !definition.officialBases.includes(shape.baseUrl)) continue;
      // Responses is opt-in only. A base without an operation keeps the
      // provider's ordinary chat/messages profile and never spends a second
      // paid wire guess.
      if (shape.hint === null && definition.operation === "responses") continue;
      if (shape.hint !== null && definition.operation !== shape.hint) continue;
      return Object.freeze({ shape, definition });
    }
  }
  return null;
}

type DiscoveryRequest = Readonly<{
  kind: DiscoveryKind;
  baseUrl: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  profiles: readonly UserProviderProfileId[];
}>;

function officialDiscoveryRequest(
  official: OfficialDefinition,
  apiKey: string,
): DiscoveryRequest {
  const { definition, shape } = official;
  return Object.freeze({
    kind: definition.discovery,
    baseUrl: shape.baseUrl,
    url: appendPath(shape.baseUrl, "models"),
    headers: definition.discovery === "anthropic-models"
      ? anthropicHeaders(apiKey)
      : bearerHeaders(apiKey),
    profiles: Object.freeze([definition.id]),
  });
}

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
    if (shape.hint !== "anthropic-messages" && shape.hint !== "responses") {
      pushDiscoveryRequest(requests, identities, Object.freeze({
        kind: "openai-models",
        baseUrl: shape.baseUrl,
        url: appendPath(shape.baseUrl, "models"),
        headers: bearerHeaders(apiKey),
        profiles: CHAT_DISCOVERY_ORDER,
      }));
    }
  }
  for (const shape of shapes) {
    if (shape.hint === "responses") {
      pushDiscoveryRequest(requests, identities, Object.freeze({
        kind: "openai-models",
        baseUrl: shape.baseUrl,
        url: appendPath(shape.baseUrl, "models"),
        headers: bearerHeaders(apiKey),
        profiles: RESPONSES_DISCOVERY_ORDER,
      }));
    }
  }
  for (const shape of shapes) {
    if (shape.hint === null || shape.hint === "anthropic-messages") {
      const versionedBase = ensureVersionedBase(shape.baseUrl);
      pushDiscoveryRequest(requests, identities, Object.freeze({
        kind: "anthropic-models",
        baseUrl: versionedBase,
        url: appendPath(versionedBase, "models"),
        headers: anthropicHeaders(apiKey),
        profiles: ANTHROPIC_DISCOVERY_ORDER,
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
  const selected = selectCatalogModel(request.profiles, models);
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
  profiles: readonly UserProviderProfileId[],
  models: ReadonlySet<string>,
): Readonly<{ profileId: UserProviderProfileId; model: string }> | null {
  for (const profileId of profiles) {
    const policy = DEFINITIONS[profileId].catalogPolicy;
    if (policy === undefined) continue;
    const model = selectCatalogPolicyModel(policy, models);
    if (model !== null) return Object.freeze({ profileId, model });
  }
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
  const profileId = profiles.find((candidate) => DEFINITIONS[candidate].custom);
  if (profileId === undefined) return null;
  return Object.freeze({ profileId, model });
}

function selectCatalogPolicyModel(
  policy: CatalogPolicy,
  models: ReadonlySet<string>,
): string | null {
  const selectable = [...models].filter(isSelectableTextModelId);
  if (policy === "anthropic-haiku-sonnet") {
    return selectable.find((model) => isClaudeFamilyModel(model, "haiku")) ??
      selectable.find((model) => isClaudeFamilyModel(model, "sonnet")) ?? null;
  }
  const ranked = selectable
    .filter(isGeminiFlashModel)
    .map((model) => Object.freeze({ model, score: geminiFlashSelectionScore(model) }))
    .sort((left, right) => right.score - left.score || compareCodeUnits(left.model, right.model));
  return ranked[0]?.model ?? null;
}

function isOfficialModelAllowed(definition: UserProviderDefinition, model: string): boolean {
  if (definition.catalogPolicy === "anthropic-haiku-sonnet") {
    return isClaudeFamilyModel(model, "haiku") || isClaudeFamilyModel(model, "sonnet");
  }
  if (definition.catalogPolicy === "gemini-flash") return isGeminiFlashModel(model);
  return definition.reviewedModels.includes(model);
}

function isClaudeFamilyModel(model: string, family: "haiku" | "sonnet"): boolean {
  const value = model.toLowerCase();
  const familyPattern = family === "haiku" ? CLAUDE_HAIKU_MODEL : CLAUDE_SONNET_MODEL;
  return isSelectableTextModelId(model) && value.startsWith("claude-") && familyPattern.test(value);
}

function isGeminiFlashModel(model: string): boolean {
  const value = model.toLowerCase();
  return isSelectableTextModelId(model) &&
    /^gemini-2\.5-flash(?:-lite)?(?:$|[-_.:/])/u.test(value) &&
    !/(?:^|[-_.:/])(live|omni|tts|speech|audio|image|imagen|transcrib(?:e|er|ing|ed)?|transcript(?:ion)?|embedding|embed)(?:$|[-_.:/])/u.test(value);
}

function geminiFlashSelectionScore(model: string): number {
  const reviewedIndex = GEMINI_MODELS.indexOf(model);
  const floating = /(?:^|[-_.:/])(preview|experimental|exp|latest)(?:$|[-_.:/])/u.test(model.toLowerCase());
  return (modelSelectionScore(model) ?? 0) +
    (reviewedIndex < 0 ? 0 : 1_000 - reviewedIndex) +
    (floating ? 0 : 100);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function publicTransport(transport: PoolTransport, operation: UserProviderOperation): PoolTransport {
  return Object.freeze({
    ...transport,
    fetch: operation === "anthropic-messages"
      ? fetchPublicAnthropicMessages
      : operation === "responses"
        ? fetchPublicResponses
        : fetchPublicChatCompletions,
  });
}

function chatTransport(input: Readonly<{
  id: string;
  maxTokensField: "max_tokens" | "max_completion_tokens";
  completion: "official" | "compatible";
  thinking?: Readonly<{ type: "disabled" }>;
  reasoningEffort?: "none";
  store?: false;
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
      ...(input.reasoningEffort === undefined ? {} : { reasoning_effort: input.reasoningEffort }),
      ...(input.store === undefined ? {} : { store: input.store }),
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

function responsesTransport(input: Readonly<{
  id: string;
  temperature?: 0;
  reasoning?: Readonly<{ effort: "none" }>;
}>): PoolTransport {
  return Object.freeze({
    id: input.id,
    completionUrl: (baseUrl) => appendPath(baseUrl, "responses"),
    authHeaders: bearerHeaders,
    acceptsResponse: acceptsJsonResponse,
    serialize: (call, maximumOutputTokens, model) => ({
      model,
      input: call.prompt,
      max_output_tokens: maximumOutputTokens,
      stream: false,
      store: false,
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.reasoning === undefined ? {} : { reasoning: input.reasoning }),
    }),
    parseCompletion: parseResponsesCompletion,
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
  if (
    !isPlainObject(payload) ||
    payload.type !== "message" ||
    payload.role !== "assistant" ||
    !Array.isArray(payload.content)
  ) {
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

function parseResponsesCompletion(payload: unknown): PoolParsedCompletion {
  if (!isPlainObject(payload) || payload.object !== "response" || typeof payload.status !== "string") {
    throw new Error("The Responses API envelope was invalid.");
  }
  if (payload.status !== "completed") {
    if (payload.status === "incomplete") {
      const details = isPlainObject(payload.incomplete_details) ? payload.incomplete_details : null;
      return Object.freeze({
        content: undefined,
        disposition: details?.reason === "max_output_tokens" ? "truncated" :
          details?.reason === "content_filter" ? "blocked-or-refused" : "unknown-terminator",
      });
    }
    return Object.freeze({
      content: undefined,
      disposition: payload.status === "failed" ? "blocked-or-refused" : "tool-or-continuation",
    });
  }
  if (
    (payload.error !== undefined && payload.error !== null) ||
    (payload.incomplete_details !== undefined && payload.incomplete_details !== null) ||
    !Array.isArray(payload.output)
  ) {
    throw new Error("The completed Responses API envelope was inconsistent.");
  }

  let messageCount = 0;
  let unusable: "blocked-or-refused" | "tool-or-continuation" | undefined;
  const text: string[] = [];
  for (const output of payload.output) {
    if (!isPlainObject(output) || typeof output.type !== "string") {
      throw new Error("The Responses API output was invalid.");
    }
    if (output.type === "reasoning") {
      if (output.status !== undefined && output.status !== "completed") {
        unusable = "tool-or-continuation";
      }
      continue;
    }
    if (output.type !== "message") {
      unusable = "tool-or-continuation";
      continue;
    }
    messageCount += 1;
    if (output.role !== "assistant" || output.status !== "completed" || !Array.isArray(output.content)) {
      throw new Error("The Responses API message was invalid.");
    }
    for (const part of output.content) {
      if (!isPlainObject(part) || typeof part.type !== "string") {
        throw new Error("The Responses API message content was invalid.");
      }
      if (part.type === "output_text" && typeof part.text === "string") text.push(part.text);
      else if (part.type === "refusal" && typeof part.refusal === "string") unusable = "blocked-or-refused";
      else throw new Error("The Responses API message content was unsupported.");
    }
  }
  if (messageCount !== 1) throw new Error("The Responses API returned an ambiguous message set.");
  const content = text.join("");
  return Object.freeze({
    content: content.trim().length === 0 ? undefined : content,
    disposition: "complete",
    ...(unusable === undefined ? {} : { unusable }),
  });
}

function classifyAnthropicStop(value: unknown): PoolCompletionDisposition {
  if (value === undefined || value === null) return "missing";
  if (typeof value !== "string") return "unknown-terminator";
  switch (value) {
    case "end_turn":
    case "stop_sequence": return "complete";
    case "max_tokens":
    case "model_context_window_exceeded": return "truncated";
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
