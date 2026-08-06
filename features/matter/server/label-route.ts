import {
  MAX_LABEL_REQUEST_BYTES,
  parseLabelRequest,
} from "./label-contract";
import { LabelServerError, invalidLabelRequest } from "./label-errors";
import { generateLabel } from "./label-generator";

/**
 * Parses, delegates, and translates. No labelling policy lives here: the route
 * only refuses what it cannot understand and turns a server error into the one
 * stable envelope the browser knows how to read.
 */
export async function handleLabelRequest(request: Request): Promise<Response> {
  const declaredLength = parseOptionalContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > MAX_LABEL_REQUEST_BYTES) {
    throw new LabelServerError("INVALID_REQUEST", "The label request is too large.", false, 413);
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new LabelServerError("INVALID_REQUEST", "The label request format is invalid.", false, 415);
  }

  const body = await readBoundedText(request, MAX_LABEL_REQUEST_BYTES);
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw invalidLabelRequest("The label request could not be read.");
  }

  const parsed = parseLabelRequest(payload);
  if (!parsed.ok) throw invalidLabelRequest(parsed.message);

  return Response.json(await generateLabel(parsed.request, request.signal), {
    headers: { "Cache-Control": "no-store" },
  });
}

export function labelErrorResponse(error: unknown): Response {
  const known = error instanceof LabelServerError
    ? error
    : new LabelServerError("LABEL_FAILED", "The label could not be derived.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Reads at most `maxBytes` and rejects malformed UTF-8 rather than replacing it.
 * A declared content length may be absent or untrue, so the bound is enforced
 * while streaming rather than after buffering.
 */
async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const body = request.body;
  if (body === null) throw invalidLabelRequest("The label request has no body.");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new LabelServerError("INVALID_REQUEST", "The label request is too large.", false, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (total > maxBytes) await body.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    throw invalidLabelRequest("The label request is not valid UTF-8.");
  }
}

function parseOptionalContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) {
    throw invalidLabelRequest("The content length is invalid.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw invalidLabelRequest("The content length is invalid.");
  }
  return parsed;
}
