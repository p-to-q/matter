import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  MAX_INQUIRY_RESPONSE_BYTES,
  classifyResponse,
} from "../../scripts/probe-model-pool.mjs";
import { FILM_COPY } from "./copy.mjs";

const APP_VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;
const DEFAULT_ORIGIN = "http://127.0.0.1:3121/matter";
const HEALTH_TIMEOUT_MS = 5_000;
const INQUIRY_TIMEOUT_MS = 20_000;
const MAX_HEALTH_RESPONSE_BYTES = 8 * 1_024;

export const CAPTURE_INQUIRY_QUESTION = FILM_COPY.inquiry.question;
export const CAPTURE_INQUIRY_MATERIAL =
  `${FILM_COPY.document.rootSource}${FILM_COPY.document.rootSuffix}`;

export function parseInquiryCapturePreflightArguments(args) {
  let execute = false;
  let origin = DEFAULT_ORIGIN;
  for (const argument of args) {
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument.startsWith("--origin=")) {
      origin = argument.slice("--origin=".length);
      continue;
    }
    throw new Error(`Unknown inquiry-capture preflight option: ${argument}`);
  }
  return Object.freeze({ execute, origin: normalizeLoopbackMatterOrigin(origin) });
}

export function normalizeLoopbackMatterOrigin(value) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback) {
    throw new Error("The inquiry-capture preflight accepts only a plain-HTTP loopback origin.");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error("The inquiry-capture origin cannot contain credentials, a query, or a fragment.");
  }
  const basePath = url.pathname.replace(/\/+$/u, "");
  if (basePath !== "/matter") {
    throw new Error("The inquiry-capture origin must use the /matter base path.");
  }
  return `${url.origin}${basePath}`;
}

export function captureInquiryRequest(requestId = `capture-inquiry-${randomUUID()}`) {
  return Object.freeze({
    protocolVersion: "0.2",
    requestId,
    question: CAPTURE_INQUIRY_QUESTION,
    locale: "zh-CN",
    context: Object.freeze({
      treeId: "matter-launch-inquiry-preflight",
      revision: 1,
      scope: "tree",
      lineage: Object.freeze([Object.freeze({
        nodeId: "thought_fixture_root",
        depth: 0,
        text: CAPTURE_INQUIRY_MATERIAL,
        truncated: false,
      })]),
      thoughtCount: 1,
      clipped: false,
    }),
  });
}

export async function preflightMatterInquiryCapture(origin, options = {}) {
  const target = normalizeLoopbackMatterOrigin(origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const health = await requestJson(
    `${target}/api/health`,
    { method: "GET", headers: { accept: "application/json" } },
    MAX_HEALTH_RESPONSE_BYTES,
    options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS,
    fetchImpl,
  );
  validateCaptureHealth(target, health.response, health.payload);

  const request = captureInquiryRequest(options.requestId);
  const startedAt = now();
  const inquiry = await requestJson(
    `${target}/api/inquiry`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: new URL(target).origin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(request),
    },
    MAX_INQUIRY_RESPONSE_BYTES,
    options.inquiryTimeoutMs ?? INQUIRY_TIMEOUT_MS,
    fetchImpl,
  );
  const classified = classifyResponse(
    "inquiry",
    inquiry.response.status,
    inquiry.payload,
    request,
  );
  const receipt = Object.freeze({
    ok: classified.outcome === "model",
    configured: "available",
    status: inquiry.response.status,
    durationMs: Math.max(0, now() - startedAt),
    outcome: classified.outcome,
    reason: classified.reason,
  });
  if (!receipt.ok) {
    throw new InquiryCapturePreflightError(
      `Ask Matter did not produce an admissible live answer (${receipt.reason ?? receipt.outcome}).`,
      receipt,
    );
  }
  return receipt;
}

export class InquiryCapturePreflightError extends Error {
  constructor(message, receipt = null) {
    super(message);
    this.name = "InquiryCapturePreflightError";
    this.receipt = receipt;
  }
}

function validateCaptureHealth(origin, response, payload) {
  const noStore = hasNoStore(response);
  const expectedBasePath = new URL(origin).pathname;
  if (
    response.status !== 200 || !noStore || !isRecord(payload) ||
    payload.status !== "ok" || payload.protocolVersion !== "0.2" ||
    payload.appVersion !== APP_VERSION || payload.basePath !== expectedBasePath ||
    !isRecord(payload.surfaces) || payload.surfaces.inquiry !== "available"
  ) {
    throw new InquiryCapturePreflightError(
      "The loopback server is not the expected live Ask Matter capture profile.",
    );
  }
}

async function requestJson(url, init, maxBytes, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!hasNoStore(response)) {
      cancelResponseBody(response);
      throw new InquiryCapturePreflightError("The capture preflight response was not marked no-store.");
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
      cancelResponseBody(response);
      throw new InquiryCapturePreflightError("The capture preflight response was not JSON.");
    }
    return Object.freeze({ response, payload: await readBoundedJson(response, maxBytes) });
  } catch (error) {
    if (error instanceof InquiryCapturePreflightError) throw error;
    if (controller.signal.aborted) {
      throw new InquiryCapturePreflightError("The capture preflight timed out.");
    }
    throw new InquiryCapturePreflightError("The capture preflight could not reach Ask Matter.");
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedJson(response, maxBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxBytes) {
      cancelResponseBody(response);
      throw new InquiryCapturePreflightError("The capture preflight response exceeded its byte bound.");
    }
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new InquiryCapturePreflightError("The capture preflight response had no body.");
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel();
      throw new InquiryCapturePreflightError("The capture preflight response exceeded its byte bound.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InquiryCapturePreflightError("The capture preflight response was not valid UTF-8 JSON.");
  }
}

function hasNoStore(response) {
  return response.headers.get("cache-control")?.toLowerCase().split(",")
    .some((directive) => directive.trim() === "no-store") ?? false;
}

function cancelResponseBody(response) {
  void response.body?.cancel().catch(() => undefined);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main() {
  const options = parseInquiryCapturePreflightArguments(process.argv.slice(2));
  console.log("Matter live Ask Matter capture preflight");
  console.log(`mode=${options.execute ? "execute-one-live-call" : "dry-run"}`);
  console.log(`origin=${options.origin}`);
  console.log("material=frozen synthetic Matter seed; answer-content=never logged");
  if (!options.execute) {
    console.log("No request was sent. Add --execute after starting the local AI demo profile.");
    return;
  }
  try {
    const receipt = await preflightMatterInquiryCapture(options.origin);
    console.log(JSON.stringify(receipt));
  } catch (error) {
    if (error instanceof InquiryCapturePreflightError && error.receipt !== null) {
      console.log(JSON.stringify(error.receipt));
    }
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
