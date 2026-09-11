import { describe, expect, it } from "vitest";
import { readBoundedJsonResponse } from "./bounded-json-response";

describe("readBoundedJsonResponse", () => {
  it("owns each streamed fragment before a producer reuses its buffer", async () => {
    const payload = JSON.stringify({ text: "material" });
    const response = responseFromReusedByteView(payload);

    await expect(readBoundedJsonResponse(
      response,
      new TextEncoder().encode(payload).byteLength,
      new AbortController().signal,
    )).resolves.toEqual({ text: "material" });
  });
});

function responseFromReusedByteView(text: string): Response {
  const encoded = new TextEncoder().encode(text);
  const backing = new Uint8Array(8);
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset === encoded.byteLength) {
        controller.close();
        return;
      }
      const length = Math.min(backing.byteLength, encoded.byteLength - offset);
      backing.set(encoded.subarray(offset, offset + length));
      offset += length;
      controller.enqueue(backing.subarray(0, length));
      // Let the reader consume this view before the source reuses it.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  }));
}
