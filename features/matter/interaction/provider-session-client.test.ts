import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_SESSION_CLIENT_TIMEOUT_MS,
  PROVIDER_SESSION_PROTOCOL_VERSION,
} from "../protocol/provider-session-contract";
import {
  ProviderSessionClientError,
  readProviderSession,
  removeUserProvider,
  saveUserProvider,
  testUserProvider,
} from "./provider-session-client";

const disconnected = Object.freeze({
  protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
  available: true,
  credentialPresent: false,
  endpoint: null,
  expiresAt: null,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("provider-session client", () => {
  it("sends an explicit atomic save with only endpoint and replacement key", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      ...disconnected,
      credentialPresent: true,
      endpoint: "https://mirror.vendor.ai/v1",
      expiresAt: "2026-09-11T09:00:00.000Z",
    }));
    vi.stubGlobal("fetch", fetchMock);
    await saveUserProvider({
      endpoint: "https://mirror.vendor.ai/v1/chat/completions",
      apiKey: "sk-session-secret",
      signal: new AbortController().signal,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/provider-session$/u);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error" });
    expect(JSON.parse(String(init.body))).toEqual({
      protocolVersion: "3",
      action: "save",
      endpoint: "https://mirror.vendor.ai/v1/chat/completions",
      apiKey: "sk-session-secret",
    });
  });

  it("sends test separately and omits a blank retained key from the wire", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      protocolVersion: "3",
      verified: true,
      endpoint: "https://api.openai.com/v1",
    }));
    vi.stubGlobal("fetch", fetchMock);
    await testUserProvider({
      endpoint: "https://api.openai.com/v1",
      apiKey: "",
      signal: new AbortController().signal,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      protocolVersion: "3",
      action: "test",
      endpoint: "https://api.openai.com/v1",
    });
  });

  it("uses GET and DELETE without sending a body", async () => {
    const fetchMock = vi.fn(async () => Response.json(disconnected));
    vi.stubGlobal("fetch", fetchMock);
    await readProviderSession(new AbortController().signal);
    await removeUserProvider(new AbortController().signal);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([, init]) => init.method)).toEqual(["GET", "DELETE"]);
    expect(calls.every(([, init]) => init.body === undefined)).toBe(true);
  });

  it("strictly rejects a status that echoes secret material", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...disconnected, apiKey: "leaked" })));
    await expect(readProviderSession(new AbortController().signal)).rejects.toEqual(
      new ProviderSessionClientError("CONNECTION_FAILED", "The provider response was invalid.", false),
    );
  });

  it("propagates cancellation and bounds response bytes", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Owner left", "AbortError");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const pending = readProviderSession(controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { headers: { "content-length": "9000" } })));
    await expect(readProviderSession(new AbortController().signal)).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
      retryable: false,
    });
  });

  it.each([
    ["GET", () => readProviderSession(new AbortController().signal)],
    ["POST", () => saveUserProvider({
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-session-secret",
      signal: new AbortController().signal,
    })],
  ])("settles a stalled %s transport at the independent client deadline", async (_method, start) => {
    vi.useFakeTimers();
    let transportSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      transportSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }));
    const pending = start();
    const rejected = expect(pending).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(PROVIDER_SESSION_CLIENT_TIMEOUT_MS);
    await rejected;
    expect(transportSignal?.aborted).toBe(true);
  });

  it("cancels a stalled response reader when the client deadline wins", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    const pending = saveUserProvider({
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-session-secret",
      signal: new AbortController().signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(PROVIDER_SESSION_CLIENT_TIMEOUT_MS);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
