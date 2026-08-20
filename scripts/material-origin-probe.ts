import {
  TRANSFORM_CLIENT_TIMEOUT_MS,
  parseTransformEnvelope,
  parseTransformError,
  parseTransformPlan,
  type TransformEnvelope,
} from "../features/matter/protocol/transform-contract";
import {
  TEXT_SWAP_CLIENT_TIMEOUT_MS,
  parseTextSwapEnvelope,
  parseTextSwapError,
  parseTextSwapPlan,
  type TextSwapEnvelope,
} from "../features/matter/protocol/text-swap-contract";

export const MATERIAL_PROBE_PRODUCTION_ORIGIN = "https://matter.ptoq.io";
export const MATERIAL_PROBE_MINIMUM_PACE_MS = 8_000;
export const MATERIAL_PROBE_MAX_CALLS_PER_SURFACE = 50;
export const MATERIAL_PROBE_RESPONSE_BYTES = 64 * 1_024;

export type MaterialProbeSurface = "turn" | "text-swap";
export type MaterialProbeProfile = "smoke" | "promotion";
export type MaterialProbeOutcome =
  | "strict-plan"
  | "model-rejected"
  | "model-unavailable"
  | "model-timeout"
  | "model-busy"
  | "route-timeout"
  | "route-failed"
  | "admission-failed"
  | "invalid-response"
  | "client-timeout"
  | "transport-failed";

export type MaterialOriginProbeConfig = Readonly<{
  origin: string;
  expectedVersion: string;
  profile: MaterialProbeProfile;
  callsPerSurface: number;
  paceMs: number;
  execute: boolean;
  allowRemote: boolean;
  confirmationOrigin?: string;
  productionLiteral?: string;
}>;

export type MaterialProbeSample = Readonly<{
  surface: MaterialProbeSurface;
  status: number;
  durationMs: number;
  outcome: MaterialProbeOutcome;
}>;

export type MaterialProbeSurfaceSummary = Readonly<{
  calls: number;
  strictPlans: number;
  rejected: number;
  unavailable: number;
  timeout: number;
  busy: number;
  routeFailed: number;
  admissionFailed: number;
  invalidResponse: number;
  transportFailed: number;
  latencyMs: Readonly<{
    all: Readonly<{ p50: number; p95: number; max: number }>;
    strictPlan: Readonly<{ p50: number; p95: number; max: number }>;
  }>;
}>;

export type MaterialProbeSummary = Readonly<{
  profile: MaterialProbeProfile;
  callsPerSurface: number;
  expectedVersion: string;
  runOk: boolean;
  promotionReady: boolean;
  bySurface: Readonly<Record<MaterialProbeSurface, MaterialProbeSurfaceSummary>>;
}>;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ProbeEnvelope = TransformEnvelope | TextSwapEnvelope;

type RunOptions = Readonly<{
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onSample?: (sample: MaterialProbeSample) => void;
}>;

const SYNTHETIC_PASSAGE = "我们怀念的也许不是一个真实存在过的过去";
const SYNTHETIC_AFTER = "，而是那个过去在今天仍然允许我们想象的其他生活。";
const SYNTHETIC_NODE_TEXT = `${SYNTHETIC_PASSAGE}${SYNTHETIC_AFTER}`;
const SYNTHETIC_DIRECTION = "换一种更凝练的说法";
const SYNTHETIC_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export function normalizeMaterialProbeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new MaterialProbeConfigurationError("The material probe requires an HTTPS origin without credentials.");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new MaterialProbeConfigurationError("The material probe origin must not include a path, query, or fragment.");
  }
  return url.origin;
}

export function assertMaterialProbeAuthorization(config: MaterialOriginProbeConfig): string {
  const origin = normalizeMaterialProbeOrigin(config.origin);
  if (!config.execute) {
    throw new MaterialProbeConfigurationError("The material probe has not been explicitly authorized to execute.");
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/u.test(config.expectedVersion)) {
    throw new MaterialProbeConfigurationError("The material probe requires one bounded expected version.");
  }
  if (config.profile !== "smoke" && config.profile !== "promotion") {
    throw new MaterialProbeConfigurationError("The material probe profile is unsupported.");
  }
  if (
    !Number.isSafeInteger(config.callsPerSurface) ||
    config.callsPerSurface < 1 ||
    config.callsPerSurface > MATERIAL_PROBE_MAX_CALLS_PER_SURFACE
  ) {
    throw new MaterialProbeConfigurationError("The material probe call count is outside its fixed bound.");
  }
  if (config.profile === "smoke" && config.callsPerSurface !== 1) {
    throw new MaterialProbeConfigurationError("The smoke profile makes exactly one call per surface.");
  }
  if (!Number.isSafeInteger(config.paceMs) || config.paceMs < MATERIAL_PROBE_MINIMUM_PACE_MS) {
    throw new MaterialProbeConfigurationError("The material probe pace is below the shared admission boundary.");
  }

  if (!isLoopbackHostname(new URL(origin).hostname)) {
    if (!config.allowRemote || config.confirmationOrigin !== origin) {
      throw new MaterialProbeConfigurationError("The remote material probe lacks exact origin authorization.");
    }
  }
  if (origin === MATERIAL_PROBE_PRODUCTION_ORIGIN && config.productionLiteral !== origin) {
    throw new MaterialProbeConfigurationError("The production material probe lacks its literal production authorization.");
  }
  return origin;
}

export function buildSyntheticEnvelope(
  surface: MaterialProbeSurface,
  sampleNumber: number,
): ProbeEnvelope {
  if (!Number.isSafeInteger(sampleNumber) || sampleNumber < 1) {
    throw new MaterialProbeConfigurationError("Synthetic sample numbers must be positive integers.");
  }
  const suffix = String(sampleNumber).padStart(2, "0");
  if (surface === "turn") {
    const parsed = parseTransformEnvelope({
      protocolVersion: "0.2",
      requestVersion: "transform/2",
      id: `probe_transform_${suffix}`,
      treeId: "probe_transform_tree",
      mode: "transform",
      operation: "expand-in-place",
      treeRevision: sampleNumber - 1,
      selection: {
        type: "segment-range",
        nodeId: "probe_transform_node",
        start: 0,
        end: SYNTHETIC_PASSAGE.length,
        selectedText: SYNTHETIC_PASSAGE,
      },
      gesture: { type: "stretch", axis: "vertical", amount: 0.5 },
      locale: "zh-CN",
      context: {
        lineage: [{
          id: "probe_transform_node",
          text: SYNTHETIC_NODE_TEXT,
          parentId: null,
          createdAt: SYNTHETIC_TIMESTAMP,
          updatedAt: SYNTHETIC_TIMESTAMP,
        }],
      },
    });
    if (!parsed.ok) throw new MaterialProbeConfigurationError("The frozen transform probe envelope is invalid.");
    return parsed.envelope;
  }

  const parsed = parseTextSwapEnvelope({
    protocolVersion: "0.2",
    requestVersion: "text-swap/1",
    id: `probe_text_swap_${suffix}`,
    treeId: "probe_text_swap_tree",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: sampleNumber - 1,
    selection: {
      type: "segment-range",
      nodeId: "probe_text_swap_node",
      start: 0,
      end: SYNTHETIC_PASSAGE.length,
      selectedText: SYNTHETIC_PASSAGE,
    },
    direction: { text: SYNTHETIC_DIRECTION },
    locale: "zh-CN",
    context: {
      lineage: [{
        id: "probe_text_swap_node",
        text: SYNTHETIC_NODE_TEXT,
        parentId: null,
        createdAt: SYNTHETIC_TIMESTAMP,
        updatedAt: SYNTHETIC_TIMESTAMP,
      }],
    },
  });
  if (!parsed.ok) throw new MaterialProbeConfigurationError("The frozen text-swap probe envelope is invalid.");
  return parsed.envelope;
}

export async function runMaterialOriginProbe(
  config: MaterialOriginProbeConfig,
  options: RunOptions = {},
): Promise<MaterialProbeSummary> {
  const origin = assertMaterialProbeAuthorization(config);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? delay;
  const onSample = options.onSample ?? (() => undefined);

  try {
    await requireMaterialLiveHealth(origin, config.expectedVersion, fetchImpl);
  } catch {
    throw new MaterialProbePreflightError("The material-live deployment preflight could not be completed.");
  }

  const samples: MaterialProbeSample[] = [];
  let previousStart: number | null = null;
  for (let sampleNumber = 1; sampleNumber <= config.callsPerSurface; sampleNumber += 1) {
    for (const surface of ["turn", "text-swap"] as const) {
      if (previousStart !== null) {
        const remaining = config.paceMs - (now() - previousStart);
        if (remaining > 0) await sleep(remaining);
      }
      const startedAt = now();
      previousStart = startedAt;
      const sample = await probeOne({
        origin,
        surface,
        envelope: buildSyntheticEnvelope(surface, sampleNumber),
        fetchImpl,
        startedAt,
        now,
      });
      samples.push(sample);
      onSample(sample);
      if (sample.outcome === "admission-failed" || sample.outcome === "invalid-response") {
        return summarizeMaterialProbe(config, samples);
      }
    }
  }
  return summarizeMaterialProbe(config, samples);
}

export function summarizeMaterialProbe(
  config: Pick<MaterialOriginProbeConfig, "profile" | "callsPerSurface" | "expectedVersion">,
  samples: readonly MaterialProbeSample[],
): MaterialProbeSummary {
  const bySurface = Object.freeze({
    turn: summarizeSurface(samples.filter((sample) => sample.surface === "turn")),
    "text-swap": summarizeSurface(samples.filter((sample) => sample.surface === "text-swap")),
  });
  const surfaces = Object.values(bySurface);
  const complete = surfaces.every((surface) => surface.calls === config.callsPerSurface);
  const runOk = complete && surfaces.every((surface) =>
    surface.strictPlans > 0 &&
    surface.busy === 0 &&
    surface.routeFailed === 0 &&
    surface.admissionFailed === 0 &&
    surface.invalidResponse === 0 &&
    surface.transportFailed === 0
  );
  const promotionReady = config.profile === "promotion" &&
    config.callsPerSurface === MATERIAL_PROBE_MAX_CALLS_PER_SURFACE &&
    runOk &&
    surfaces.every((surface) =>
      surface.rejected === 0 &&
      surface.strictPlans + surface.unavailable + surface.timeout === surface.calls &&
      (surface.unavailable + surface.timeout) / surface.calls <= 0.02 &&
      surface.latencyMs.strictPlan.p95 <= 8_000
    );
  return Object.freeze({
    profile: config.profile,
    callsPerSurface: config.callsPerSurface,
    expectedVersion: config.expectedVersion,
    runOk,
    promotionReady,
    bySurface,
  });
}

export function formatMaterialProbeReport(summary: MaterialProbeSummary): string {
  return JSON.stringify(summary);
}

async function probeOne(input: Readonly<{
  origin: string;
  surface: MaterialProbeSurface;
  envelope: ProbeEnvelope;
  fetchImpl: FetchLike;
  startedAt: number;
  now: () => number;
}>): Promise<MaterialProbeSample> {
  const endpoint = `${input.origin}/api/${input.surface}`;
  let status = 0;
  let outcome: MaterialProbeOutcome;
  try {
    const timeoutMs = input.surface === "turn"
      ? TRANSFORM_CLIENT_TIMEOUT_MS
      : TEXT_SWAP_CLIENT_TIMEOUT_MS;
    const response = await input.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "cache-control": "no-store",
        "content-type": "application/json",
        origin: input.origin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(input.envelope),
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = response.status;
    outcome = await classifyMaterialResponse(input.surface, input.envelope, endpoint, response);
  } catch (error) {
    outcome = isTimeoutError(error) ? "client-timeout" : "transport-failed";
  }
  return Object.freeze({
    surface: input.surface,
    status,
    durationMs: Math.max(0, Math.round(input.now() - input.startedAt)),
    outcome,
  });
}

async function classifyMaterialResponse(
  surface: MaterialProbeSurface,
  envelope: ProbeEnvelope,
  endpoint: string,
  response: Response,
): Promise<MaterialProbeOutcome> {
  if (
    response.redirected ||
    response.url !== endpoint ||
    response.status >= 300 && response.status < 400 ||
    !isJsonContentType(response.headers.get("content-type")) ||
    !hasNoStore(response.headers.get("cache-control"))
  ) return "invalid-response";

  const payload = await readBoundedJson(response, MATERIAL_PROBE_RESPONSE_BYTES);
  if (payload === INVALID_JSON) return "invalid-response";
  if (response.status === 200) {
    if (surface === "turn") {
      return parseTransformPlan(payload, envelope as TransformEnvelope) === null
        ? "invalid-response"
        : "strict-plan";
    }
    return parseTextSwapPlan(payload, envelope as TextSwapEnvelope) === null
      ? "invalid-response"
      : "strict-plan";
  }

  const error = surface === "turn" ? parseTransformError(payload) : parseTextSwapError(payload);
  if (error === null) return "invalid-response";
  if (
    response.status === 422 &&
    error.code === "TURN_REJECTED" &&
    error.fallbackReason === "MODEL_REJECTED"
  ) return "model-rejected";
  if (
    response.status === 429 &&
    error.code === "TURN_UNAVAILABLE" &&
    error.fallbackReason === "MODEL_BUSY"
  ) return "admission-failed";
  if (response.status === 403 && error.code === "INVALID_REQUEST") return "admission-failed";
  if (response.status === 503 && error.code === "TURN_UNAVAILABLE") {
    if (error.fallbackReason === "MODEL_UNAVAILABLE") return "model-unavailable";
    if (error.fallbackReason === "MODEL_TIMEOUT") return "model-timeout";
    if (error.fallbackReason === "MODEL_BUSY") return "model-busy";
  }
  if (response.status === 504 && error.code === "TURN_FAILED") return "route-timeout";
  if ((response.status === 499 || response.status === 500) && error.code === "TURN_FAILED") {
    return "route-failed";
  }
  return "invalid-response";
}

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown | typeof INVALID_JSON> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximumBytes) return INVALID_JSON;
  }
  if (response.body === null) return INVALID_JSON;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return INVALID_JSON;
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return INVALID_JSON;
  } finally {
    reader.releaseLock();
  }
}

function summarizeSurface(samples: readonly MaterialProbeSample[]): MaterialProbeSurfaceSummary {
  const allLatencies = samples.map((sample) => sample.durationMs).sort(numberOrder);
  const planLatencies = samples
    .filter((sample) => sample.outcome === "strict-plan")
    .map((sample) => sample.durationMs)
    .sort(numberOrder);
  const count = (outcome: MaterialProbeOutcome) => samples.filter((sample) => sample.outcome === outcome).length;
  return Object.freeze({
    calls: samples.length,
    strictPlans: count("strict-plan"),
    rejected: count("model-rejected"),
    unavailable: count("model-unavailable"),
    timeout: count("model-timeout") + count("route-timeout") + count("client-timeout"),
    busy: count("model-busy"),
    routeFailed: count("route-failed"),
    admissionFailed: count("admission-failed"),
    invalidResponse: count("invalid-response"),
    transportFailed: count("transport-failed"),
    latencyMs: Object.freeze({
      all: latencySummary(allLatencies),
      strictPlan: latencySummary(planLatencies),
    }),
  });
}

async function requireMaterialLiveHealth(
  origin: string,
  expectedVersion: string,
  fetchImpl: FetchLike,
): Promise<void> {
  const endpoint = `${origin}/api/health`;
  const response = await fetchImpl(endpoint, {
    cache: "no-store",
    credentials: "omit",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (
    response.status !== 200 ||
    response.redirected ||
    response.url !== endpoint ||
    !isJsonContentType(response.headers.get("content-type")) ||
    !hasNoStore(response.headers.get("cache-control"))
  ) throw new MaterialProbePreflightError("The material health response is invalid.");
  const payload = await readBoundedJson(response, MATERIAL_PROBE_RESPONSE_BYTES);
  if (payload === INVALID_JSON || !isRecord(payload) || !isRecord(payload.surfaces)) {
    throw new MaterialProbePreflightError("The material health payload is invalid.");
  }
  if (
    payload.protocolVersion !== "0.2" ||
    payload.appVersion !== expectedVersion ||
    payload.basePath !== "" ||
    payload.status !== "ok"
  ) throw new MaterialProbePreflightError("The material health identity is stale or incompatible.");
  for (const surface of [
    "material",
    "localPersistence",
    "voiceAdmission",
    "thoughtLabel",
    "transcriptRepair",
    "inquiry",
    "transformTurn",
    "textSwap",
    "archiveExportImport",
  ]) {
    if (payload.surfaces[surface] !== "available") {
      throw new MaterialProbePreflightError("The origin is not material-live.");
    }
  }
}

function latencySummary(sorted: readonly number[]): Readonly<{ p50: number; p95: number; max: number }> {
  return Object.freeze({
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
  });
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}

function isJsonContentType(value: string | null): boolean {
  return value !== null && /^application\/json(?:\s*;|$)/iu.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNoStore(value: string | null): boolean {
  return value !== null && value.split(",").some((token) => token.trim().toLowerCase() === "no-store");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError" ||
    error instanceof Error && error.name === "TimeoutError";
}

function numberOrder(left: number, right: number): number {
  return left - right;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

const INVALID_JSON = Symbol("invalid-json");

export class MaterialProbeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialProbeConfigurationError";
  }
}

export class MaterialProbePreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialProbePreflightError";
  }
}
