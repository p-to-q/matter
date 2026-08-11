import { clientMatterBasePath } from "../config/base-path";
import { TRANSCRIPT_REPAIR_PROMPT_VERSION } from "../material/transcript-repair";
import {
  MAX_REPAIR_RESPONSE_BYTES,
  REPAIR_CLIENT_TIMEOUT_MS,
  isRepairSuccess,
  type RepairSuccess,
} from "../protocol/repair-contract";
import { PROTOCOL_VERSION } from "../tree/model";

/**
 * Asks the server for one bounded proposal after the usable transcript has
 * already become material. The request may fail without retry or visible error:
 * every rejection leaves the person's admitted baseline in place.
 */
export type RepairRequestInput = Readonly<{
  operationId: string;
  attempt: number;
  locale: string;
  text: string;
  /** Bounded terms from the person's own material; omitted when there are none. */
  vocabulary?: readonly string[];
  signal: AbortSignal;
  timeoutMs?: number;
}>;

/**
 * A build-time switch, read at the call site. Repair is an improvement to an
 * utterance that already exists, so a deployment without it hears the same
 * words a moment sooner rather than losing a capability.
 */
export function transcriptRepairEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED !== "false";
}

export async function requestTranscriptRepair(input: RepairRequestInput): Promise<RepairSuccess> {
  const body = JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
    operationId: input.operationId,
    attempt: input.attempt,
    locale: input.locale,
    text: input.text,
    ...(input.vocabulary === undefined || input.vocabulary.length === 0
      ? {}
      : { vocabulary: input.vocabulary }),
  });
  const deadline = withDeadline(input.signal, input.timeoutMs ?? REPAIR_CLIENT_TIMEOUT_MS);

  try {
    const response = await Promise.race([
      fetch(`${clientMatterBasePath()}/api/repair`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body,
        cache: "no-store",
        redirect: "error",
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
    // Fetch may resolve as soon as response headers arrive. Keep the same
    // deadline around the bounded body read so a slow or stalled proxy cannot
    // outlive the repair lease while retaining request resources.
    const text = await Promise.race([
      readBoundedText(response, MAX_REPAIR_RESPONSE_BYTES, deadline.signal),
      deadline.settlement,
    ]);
    if (!response.ok) throw new RepairUnavailable();
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new RepairUnavailable();
    }
    if (!isRepairSuccess(payload, { operationId: input.operationId, attempt: input.attempt })) {
      throw new RepairUnavailable();
    }
    return payload;
  } catch (error) {
    if (input.signal.aborted) throw error;
    throw new RepairUnavailable();
  } finally {
    deadline.dispose();
  }
}

/**
 * One error, deliberately. Nothing downstream branches on why repair did not
 * happen — a timeout, a 500, and a malformed answer all mean the same thing to
 * the person, which is that their transcript is admitted as spoken.
 */
export class RepairUnavailable extends Error {
  constructor() {
    super("Transcript repair is unavailable.");
    this.name = "RepairUnavailable";
  }
}

/**
 * Reads at most `maxBytes` and refuses malformed UTF-8. A replacement character
 * would turn a broken response into a plausible-looking sentence.
 */
async function readBoundedText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new RepairUnavailable();
  }
  const body = response.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelReader = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  if (signal.aborted) cancelReader();
  else signal.addEventListener("abort", cancelReader, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new RepairUnavailable();
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
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
    throw new RepairUnavailable();
  }
}

function withDeadline(parent: AbortSignal, timeoutMs: number): {
  signal: AbortSignal;
  settlement: Promise<never>;
  dispose: () => void;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RepairUnavailable();
  const controller = new AbortController();
  let rejectSettlement!: (reason: unknown) => void;
  const settlement = new Promise<never>((_resolve, reject) => {
    rejectSettlement = reject;
  });
  settlement.catch(() => undefined);

  const abortFromParent = () => {
    controller.abort(parent.reason);
    rejectSettlement(parent.reason ?? new DOMException("Aborted", "AbortError"));
  };
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    const reason = new DOMException("The repair request timed out.", "TimeoutError");
    controller.abort(reason);
    rejectSettlement(reason);
  }, timeoutMs);

  return {
    signal: controller.signal,
    settlement,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abortFromParent);
    },
  };
}
