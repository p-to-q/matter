/** A strict browser response boundary shared by bounded Matter JSON clients. */
export async function readBoundedJsonResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("The response byte bound is invalid.");
  }

  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > maxBytes) {
    // Cancellation is best-effort: a remote body must not turn a size refusal
    // into another unbounded wait.
    void response.body?.cancel().catch(() => undefined);
    throw new Error("The response is too large.");
  }

  const body = response.body;
  if (body === null) throw new Error("The response has no body.");
  if (signal.aborted) {
    // The owner may leave after headers but before this reader is installed.
    // Close that narrow gap so the unread body is not left behind merely
    // because no reader-level abort listener existed yet.
    void body.cancel(signal.reason).catch(() => undefined);
    signal.throwIfAborted();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let oversized = false;
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        oversized = true;
        throw new Error("The response is too large.");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (signal.aborted || oversized) cancel();
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(merged);
  return JSON.parse(text) as unknown;
}
