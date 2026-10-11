import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MATTER_LOCALE } from "../config/locales";
import { MODEL_DEADLINES } from "../config/model-deadlines";
import {
  IMAGE_REQUEST_VERSION,
  IMAGE_RESPONSE_HEADERS,
  MAX_IMAGE_BYTES,
  type ImageRequestEnvelope,
} from "../protocol/image-contract";
import type { ImageErrorCode } from "../server/image-errors";
import { PICTURE_SERVER_ERROR_CODES, type PictureFailureReason } from "../runtime/picture-turn";
import { PROTOCOL_VERSION } from "../tree/model";
import { requestPicture } from "./picture-client";

const PASSAGE = "A private sentence about my brother and the unpaid rent.";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("picture client", () => {
  describe("request shape", () => {
    it("posts one exact JSON envelope to the same-origin route with no cache and no redirects", async () => {
      const bytes = png(512, 384);
      const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return imageResponse(bytes);
      });
      const controller = new AbortController();

      await requestPicture(envelope(), { fetch: send, signal: controller.signal });

      expect(send).toHaveBeenCalledOnce();
      const [url, init] = send.mock.calls[0]!;
      expect(url).toBe("/matter/api/image");
      expect(init?.method).toBe("POST");
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
      expect(init?.credentials).toBeUndefined();
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      expect(new Headers(init?.headers).get("accept")).toContain("image/png");
      expect(JSON.parse(String(init?.body))).toEqual(envelope());
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("uses the injected transport and never the global one", async () => {
      vi.stubGlobal("fetch", vi.fn(() => { throw new Error("global fetch used"); }));
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(png(512, 384)),
        signal: new AbortController().signal,
      });
      expect(result.ok).toBe(true);
    });

    it("falls back to the global transport when none is injected", async () => {
      const bytes = png(512, 384);
      const global = vi.fn(async () => imageResponse(bytes));
      vi.stubGlobal("fetch", global);
      const result = await requestPicture(envelope(), { signal: new AbortController().signal });
      expect(result.ok).toBe(true);
      expect(global).toHaveBeenCalledOnce();
    });

    it("makes exactly one attempt on failure", async () => {
      const send = vi.fn(async () => errorResponse(503, "IMAGE_UNAVAILABLE", true));
      const result = await requestPicture(envelope(), { fetch: send, signal: new AbortController().signal });
      expect(result).toEqual({ ok: false, reason: "server-error:IMAGE_UNAVAILABLE", retryable: true });
      expect(send).toHaveBeenCalledOnce();
    });
  });

  describe("success", () => {
    it.each([
      ["image/png", () => png(512, 384)],
      ["image/jpeg", () => jpeg(640, 480)],
      ["image/webp", () => webp(800, 600)],
    ] as const)("returns the received %s bytes untouched with the pointer that names them", async (mediaType, build) => {
      const bytes = build();
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(bytes, { mediaType }),
        signal: new AbortController().signal,
      });
      if (!result.ok) throw new Error(`picture expected, got ${result.reason}`);
      expect(Buffer.from(result.picture.bytes).equals(Buffer.from(bytes))).toBe(true);
      expect(result.picture.pointer).toEqual({
        mediaType,
        byteLength: bytes.byteLength,
        width: dimensionsOf(mediaType).width,
        height: dimensionsOf(mediaType).height,
        contentHash: sha256(bytes),
      });
    });

    it("keeps the bytes exactly even when the body arrives in many fragments", async () => {
      const bytes = png(512, 384, 5000);
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(bytes, { chunk: 7 }),
        signal: new AbortController().signal,
      });
      if (!result.ok) throw new Error("picture expected");
      expect(Buffer.from(result.picture.bytes).equals(Buffer.from(bytes))).toBe(true);
    });

    it("tolerates a missing Content-Length and a parameterised-case content type", async () => {
      const bytes = png(512, 384);
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(bytes, { contentLength: null, contentType: " Image/PNG " }),
        signal: new AbortController().signal,
      });
      expect(result.ok).toBe(true);
    });

    it("accepts a picture at exactly the byte ceiling", async () => {
      const bytes = png(512, 384, MAX_IMAGE_BYTES - pngBase(512, 384).length);
      expect(bytes.byteLength).toBe(MAX_IMAGE_BYTES);
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(bytes),
        signal: new AbortController().signal,
      });
      expect(result.ok).toBe(true);
    });

    it("hands the caller bytes it owns, independent of the transport's buffers", async () => {
      const bytes = png(512, 384);
      const source = new Uint8Array(bytes);
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(source),
        signal: new AbortController().signal,
      });
      if (!result.ok) throw new Error("picture expected");
      source.fill(0);
      expect(Buffer.from(result.picture.bytes).equals(Buffer.from(bytes))).toBe(true);
    });
  });

  describe("an untrustworthy success is invalid and never retryable", () => {
    const bytes = png(512, 384);

    it.each<[string, () => Response]>([
      ["a content type outside the image set", () => imageResponse(bytes, { contentType: "image/gif" })],
      ["a JSON content type on a 200", () => imageResponse(bytes, { contentType: "application/json" })],
      ["a missing content type", () => imageResponse(bytes, { contentType: null })],
      ["a content type that disagrees with the bytes", () => imageResponse(bytes, { contentType: "image/jpeg" })],
      ["a hash of different bytes", () => imageResponse(bytes, { sha256: sha256(png(512, 384, 1)) })],
      ["a missing hash", () => imageResponse(bytes, { sha256: null })],
      ["an uppercase hash", () => imageResponse(bytes, { sha256: sha256(bytes).toUpperCase() })],
      ["a malformed hash", () => imageResponse(bytes, { sha256: "abc" })],
      ["a width header that disagrees with the bytes", () => imageResponse(bytes, { width: "513" })],
      ["a height header that disagrees with the bytes", () => imageResponse(bytes, { height: "385" })],
      ["a missing width", () => imageResponse(bytes, { width: null })],
      ["a missing height", () => imageResponse(bytes, { height: null })],
      ["a hexadecimal width", () => imageResponse(bytes, { width: "0x200" })],
      ["an exponent height", () => imageResponse(bytes, { height: "3.84e2" })],
      ["a content length longer than the body", () => imageResponse(bytes, { contentLength: String(bytes.byteLength + 1) })],
      ["a content length shorter than the body", () => imageResponse(bytes, { contentLength: String(bytes.byteLength - 1) })],
      ["a non-numeric content length", () => imageResponse(bytes, { contentLength: "12abc" })],
      ["a declared length over the ceiling", () => imageResponse(bytes, { contentLength: String(MAX_IMAGE_BYTES + 1) })],
      ["an empty body", () => imageResponse(new Uint8Array(0))],
      ["a body that is not an image", () => imageResponse(new TextEncoder().encode("<html>sign in</html>".repeat(20)))],
      ["a truncated image", () => imageResponse(bytes.subarray(0, bytes.length - 20))],
      ["dimensions below the minimum", () => imageResponse(png(100, 100))],
      ["a missing body", () => new Response(null, { status: 200, headers: { "content-type": "image/png" } })],
    ])("refuses %s", async (_name, build) => {
      const result = await requestPicture(envelope(), {
        fetch: async () => build(),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-response", retryable: false });
    });

    it("verifies the hash of the received bytes, not the declared length alone", async () => {
      const tampered = new Uint8Array(bytes);
      tampered[40] ^= 0xff;
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(tampered, { sha256: sha256(bytes) }),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-response", retryable: false });
    });

    it("refuses bytes it cannot digest rather than trusting the header", async () => {
      vi.stubGlobal("crypto", {});
      const result = await requestPicture(envelope(), {
        fetch: async () => imageResponse(bytes),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-response", retryable: false });
    });
  });

  describe("an oversize stream is cut, not buffered", () => {
    it("stops reading and cancels the body once the ceiling is crossed with no declared length", async () => {
      let pulled = 0;
      let cancelled = false;
      const chunk = new Uint8Array(256 * 1024).fill(1);
      // Finite on purpose: a reader that does not cut the stream fails the
      // pull-count assertion instead of reading forever.
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
          if (pulled >= 40) controller.close();
        },
        cancel() { cancelled = true; },
      });
      const result = await requestPicture(envelope(), {
        fetch: async () => new Response(body, { status: 200, headers: { "content-type": "image/png" } }),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-response", retryable: false });
      expect(cancelled).toBe(true);
      // 8 chunks reach the 2 MiB ceiling; the ninth is the refusal. A reader that
      // buffered until the end would pull without bound.
      expect(pulled).toBeLessThanOrEqual(MAX_IMAGE_BYTES / chunk.byteLength + 3);
    });

    it("cancels the body without reading when the declared length is over the ceiling", async () => {
      let pulled = 0;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(10)); },
        cancel() { cancelled = true; },
      });
      const result = await requestPicture(envelope(), {
        fetch: async () => new Response(body, {
          status: 200,
          headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES + 1) },
        }),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-response", retryable: false });
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThanOrEqual(2);
    });

    it("cancels the body when the content type is wrong", async () => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(new Uint8Array(10)); },
        cancel() { cancelled = true; },
      });
      const result = await requestPicture(envelope(), {
        fetch: async () => new Response(body, { status: 200, headers: { "content-type": "text/html" } }),
        signal: new AbortController().signal,
      });
      expect(result.ok).toBe(false);
      expect(cancelled).toBe(true);
    });
  });

  describe("server refusals", () => {
    // Retryable only when the envelope says so AND the status is one where no
    // relay could have been billed: 429, a 503 shed, a 422 brief refusal.
    it.each<[number, ImageErrorCode, boolean, boolean]>([
      [429, "RATE_LIMITED", true, true],
      [503, "IMAGE_UNAVAILABLE", true, true],
      [422, "IMAGE_REJECTED", true, true],
      [429, "RATE_LIMITED", false, false],
      [503, "IMAGE_UNAVAILABLE", false, false],
      [422, "IMAGE_REJECTED", false, false],
      [504, "IMAGE_UNAVAILABLE", true, false],
      [500, "IMAGE_FAILED", true, false],
      [500, "IMAGE_FAILED", false, false],
      [499, "IMAGE_FAILED", true, false],
      [502, "IMAGE_UNAVAILABLE", true, false],
      [413, "INVALID_REQUEST", true, false],
      [400, "INVALID_REQUEST", false, false],
      [403, "INVALID_REQUEST", false, false],
      [404, "IMAGE_UNAVAILABLE", true, false],
    ])("status %i %s with envelope retryable=%s is retryable=%s", async (status, code, envelopeRetryable, expected) => {
      const result = await requestPicture(envelope(), {
        fetch: async () => errorResponse(status, code, envelopeRetryable),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: `server-error:${code}`, retryable: expected });
    });

    it.each<[string, () => Response]>([
      ["an HTML gateway page", () => new Response("<html>bad gateway</html>", { status: 503, headers: { "content-type": "text/html" } })],
      ["an empty refusal", () => new Response(null, { status: 429 })],
      ["a refusal with an unknown code", () => Response.json({ error: { code: "TEAPOT", message: "x", retryable: true } }, { status: 429 })],
      ["a refusal with an extra key", () => Response.json({ error: { code: "RATE_LIMITED", message: "x", retryable: true, extra: 1 } }, { status: 429 })],
      ["a refusal with a non-boolean retryable", () => Response.json({ error: { code: "RATE_LIMITED", message: "x", retryable: "true" } }, { status: 429 })],
      ["a refusal with an empty message", () => Response.json({ error: { code: "RATE_LIMITED", message: "", retryable: true } }, { status: 429 })],
      ["a refusal with an overlong message", () => Response.json({ error: { code: "RATE_LIMITED", message: "x".repeat(501), retryable: true } }, { status: 429 })],
      ["an envelope with an extra top-level key", () => Response.json({ error: { code: "RATE_LIMITED", message: "x", retryable: true }, more: 1 }, { status: 429 })],
      ["a bare JSON array", () => Response.json([], { status: 503 })],
      ["a valid envelope padded past the refusal size bound", () => new Response(
        `${JSON.stringify({ error: { code: "RATE_LIMITED", message: "x", retryable: true } })}${" ".repeat(8000)}`,
        { status: 429, headers: { "content-type": "application/json" } },
      )],
    ])("treats %s as invalid-response and never retryable", async (_name, build) => {
      const result = await requestPicture(envelope(), {
        fetch: async () => build(),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-response", retryable: false });
    });

    it("pins its code list to the server's code set in both directions", () => {
      const listed: Record<(typeof PICTURE_SERVER_ERROR_CODES)[number], true> = {
        INVALID_REQUEST: true, RATE_LIMITED: true, IMAGE_REJECTED: true, IMAGE_UNAVAILABLE: true, IMAGE_FAILED: true,
      };
      const serverCodes: Record<ImageErrorCode, true> = listed;
      const clientCodes: Record<(typeof PICTURE_SERVER_ERROR_CODES)[number], true> = serverCodes;
      expect(Object.keys(clientCodes).sort()).toEqual([...PICTURE_SERVER_ERROR_CODES].sort());
    });
  });

  describe("transport failure is never retryable, because a relay may have billed", () => {
    it("a rejected fetch is a network failure", async () => {
      const send = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
      const result = await requestPicture(envelope(), { fetch: send, signal: new AbortController().signal });
      expect(result).toEqual({ ok: false, reason: "network", retryable: false });
      expect(send).toHaveBeenCalledOnce();
    });

    it("a stream that errors mid-body is a network failure", async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(100));
          controller.error(new TypeError("connection reset"));
        },
      });
      const result = await requestPicture(envelope(), {
        fetch: async () => new Response(body, { status: 200, headers: { "content-type": "image/png" } }),
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, reason: "network", retryable: false });
    });

    it("a refusal body that errors mid-read is not a retry invitation", async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new TypeError("connection reset")); },
      });
      const result = await requestPicture(envelope(), {
        fetch: async () => new Response(body, { status: 503, headers: { "content-type": "application/json" } }),
        signal: new AbortController().signal,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.retryable).toBe(false);
    });

    it("our own deadline is a timeout even when the transport ignores the signal", async () => {
      const send = vi.fn(() => new Promise<Response>(() => undefined));
      const result = await requestPicture(envelope(), {
        fetch: send,
        signal: new AbortController().signal,
        deadlineMs: 20,
      });
      expect(result).toEqual({ ok: false, reason: "timeout", retryable: false });
      expect(send).toHaveBeenCalledOnce();
    });

    it("the deadline also covers a body that stalls after the headers", async () => {
      const body = new ReadableStream<Uint8Array>({ start() { /* never produces */ } });
      const result = await requestPicture(envelope(), {
        fetch: async () => new Response(body, { status: 200, headers: { "content-type": "image/png" } }),
        signal: new AbortController().signal,
        deadlineMs: 20,
      });
      expect(result).toEqual({ ok: false, reason: "timeout", retryable: false });
    });

    it.each([200, 503])("the deadline holds on a %i body whose reader ignores cancellation", async (status) => {
      const stuck = {
        ok: status === 200,
        status,
        headers: new Headers({ "content-type": status === 200 ? "image/png" : "application/json" }),
        body: {
          getReader: () => ({
            read: () => new Promise<never>(() => undefined),
            cancel: async () => undefined,
            releaseLock: () => undefined,
          }),
          cancel: async () => undefined,
        },
      } as unknown as Response;
      const result = await requestPicture(envelope(), {
        fetch: async () => stuck,
        signal: new AbortController().signal,
        deadlineMs: 20,
      });
      expect(result).toEqual({ ok: false, reason: "timeout", retryable: false });
    });

    it("defaults the deadline to the image client budget", async () => {
      vi.useFakeTimers();
      const pending = requestPicture(envelope(), {
        fetch: () => new Promise<Response>(() => undefined),
        signal: new AbortController().signal,
      });
      let settled = false;
      void pending.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(MODEL_DEADLINES.image.clientMs - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await expect(pending).resolves.toEqual({ ok: false, reason: "timeout", retryable: false });
    });

    it("a caller abort during the request is aborted, not timeout", async () => {
      const controller = new AbortController();
      const send = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
      const pending = requestPicture(envelope(), { fetch: send, signal: controller.signal });
      controller.abort();
      await expect(pending).resolves.toEqual({ ok: false, reason: "aborted", retryable: false });
    });

    it("a caller abort wins even when the transport ignores the signal", async () => {
      const controller = new AbortController();
      const pending = requestPicture(envelope(), {
        fetch: () => new Promise<Response>(() => undefined),
        signal: controller.signal,
      });
      controller.abort();
      await expect(pending).resolves.toEqual({ ok: false, reason: "aborted", retryable: false });
    });

    it("a caller abort while the body is streaming is aborted and cancels the stream", async () => {
      const controller = new AbortController();
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(stream) { stream.enqueue(new Uint8Array(10)); },
        cancel() { cancelled = true; },
      });
      const pending = requestPicture(envelope(), {
        fetch: async () => new Response(body, { status: 200, headers: { "content-type": "image/png" } }),
        signal: controller.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      controller.abort();
      await expect(pending).resolves.toEqual({ ok: false, reason: "aborted", retryable: false });
      await vi.waitFor(() => expect(cancelled).toBe(true));
    });

    it("an already-aborted signal never reaches the transport", async () => {
      const send = vi.fn(async () => imageResponse(png(512, 384)));
      const controller = new AbortController();
      controller.abort();
      const result = await requestPicture(envelope(), { fetch: send, signal: controller.signal });
      expect(result).toEqual({ ok: false, reason: "aborted", retryable: false });
      expect(send).not.toHaveBeenCalled();
    });

    it("an abort that lands after the picture was verified still reports aborted", async () => {
      const controller = new AbortController();
      const bytes = png(512, 384);
      const result = await requestPicture(envelope(), {
        fetch: async () => {
          const response = imageResponse(bytes);
          controller.abort();
          return response;
        },
        signal: controller.signal,
      });
      expect(result).toEqual({ ok: false, reason: "aborted", retryable: false });
    });
  });

  describe("the passage never appears in an outcome", () => {
    const failures: [string, () => Promise<Response>][] = [
      ["a rejected fetch quoting the passage", async () => { throw new TypeError(PASSAGE); }],
      ["a refusal echoing the passage as its message", async () => Response.json({
        error: { code: "IMAGE_REJECTED", message: PASSAGE, retryable: true },
      }, { status: 422 })],
      ["a refusal that is not an envelope", async () => new Response(PASSAGE, { status: 500 })],
      ["a success with a hostile hash header", async () => imageResponse(png(512, 384), { sha256: PASSAGE })],
      ["a success whose bytes are the passage", async () => imageResponse(new TextEncoder().encode(PASSAGE))],
    ];
    it.each(failures)("keeps it out of %s", async (_name, send) => {
      const result = await requestPicture(envelope(), { fetch: send, signal: new AbortController().signal });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("brother");
      expect(JSON.stringify(result)).not.toContain("rent");
      if (!result.ok) {
        const closed: PictureFailureReason[] = [
          "aborted", "timeout", "network", "invalid-response",
          "server-error:INVALID_REQUEST", "server-error:RATE_LIMITED", "server-error:IMAGE_REJECTED",
          "server-error:IMAGE_UNAVAILABLE", "server-error:IMAGE_FAILED",
        ];
        expect(closed).toContain(result.reason);
      }
    });

    it("never returns an Error object or message text at all", async () => {
      const result = await requestPicture(envelope(), {
        fetch: async () => { throw new TypeError(PASSAGE); },
        signal: new AbortController().signal,
      });
      expect(Object.keys(result).sort()).toEqual(["ok", "reason", "retryable"]);
    });
  });
});

function envelope(): ImageRequestEnvelope {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: IMAGE_REQUEST_VERSION,
    id: "picture-request-1",
    locale: MATTER_LOCALE.english,
    passage: Object.freeze({ nodeId: "node-1", text: PASSAGE }),
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function dimensionsOf(mediaType: "image/png" | "image/jpeg" | "image/webp") {
  return mediaType === "image/png"
    ? { width: 512, height: 384 }
    : mediaType === "image/jpeg" ? { width: 640, height: 480 } : { width: 800, height: 600 };
}

type ImageResponseOptions = Readonly<{
  mediaType?: string;
  contentType?: string | null;
  contentLength?: string | null;
  width?: string | null;
  height?: string | null;
  sha256?: string | null;
  chunk?: number;
}>;

/** A response the way the route builds one, with each header overridable or removable. */
function imageResponse(bytes: Uint8Array, options: ImageResponseOptions = {}): Response {
  const dimensions = dimensionsOf((options.mediaType ?? "image/png") as "image/png");
  const headers = new Headers();
  const set = (name: string, value: string | null | undefined, fallback: string) => {
    const resolved = value === undefined ? fallback : value;
    if (resolved !== null) headers.set(name, resolved);
  };
  set("content-type", options.contentType, options.mediaType ?? "image/png");
  set("content-length", options.contentLength, String(bytes.byteLength));
  set(IMAGE_RESPONSE_HEADERS.width, options.width, String(dimensions.width));
  set(IMAGE_RESPONSE_HEADERS.height, options.height, String(dimensions.height));
  set(IMAGE_RESPONSE_HEADERS.sha256, options.sha256, sha256(bytes));
  const fragment = options.chunk ?? bytes.byteLength;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += Math.max(1, fragment)) {
        controller.enqueue(bytes.slice(offset, offset + fragment));
      }
      controller.close();
    },
  });
  // A Response over a stream sets no length of its own; the headers above are the route's.
  return new Response(bytes.byteLength === 0 ? null : body, { status: 200, headers });
}

function errorResponse(status: number, code: ImageErrorCode, retryable: boolean): Response {
  return Response.json(
    { error: { code, message: "Matter could not draw this passage just now.", retryable } },
    { status },
  );
}

function pngBase(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 2;
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([header, iend]);
}

/** A structurally valid PNG; `padding` varies the bytes (and so the hash) without breaking the structure. */
function png(width: number, height: number, padding = 0): Uint8Array {
  const base = pngBase(width, height);
  if (padding === 0) return new Uint8Array(base);
  const filler = Buffer.alloc(padding);
  for (let index = 0; index < padding; index += 1) filler[index] = (index * 31 + padding) % 251;
  return new Uint8Array(Buffer.concat([base.subarray(0, 33), filler, base.subarray(33)]));
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  const frame = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  bytes.push(...frame, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

function webp(width: number, height: number): Uint8Array {
  // VP8X extended header: canvas size is stored minus one in 24 bits, little endian.
  const payload = Buffer.alloc(10);
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);
  const chunk = Buffer.concat([Buffer.from("VP8X", "ascii"), u32le(payload.length), payload]);
  const riff = Buffer.concat([Buffer.from("WEBP", "ascii"), chunk]);
  return new Uint8Array(Buffer.concat([Buffer.from("RIFF", "ascii"), u32le(riff.length), riff]));
}

function u32le(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value, 0);
  return out;
}
