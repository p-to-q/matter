import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  resetRequired: false,
  credentialId: null,
  endpoint: null,
  expiresAt: null,
});

beforeEach(() => installSerialMutationLock());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("provider-session client", () => {
  it("sends an explicit atomic save with only endpoint and replacement key", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      ...disconnected,
      credentialPresent: true,
      credentialId: "AAAAAAAAAAAAAAAAAAAAAA",
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
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(url).toMatch(/\/api\/provider-session$/u);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error" });
    expect(calls.map(([, request]) => request.method)).toEqual(["POST", "GET"]);
    expect(JSON.parse(String(init.body))).toEqual({
      protocolVersion: "4",
      action: "save",
      endpoint: "https://mirror.vendor.ai/v1/chat/completions",
      apiKey: "sk-session-secret",
    });
  });

  it("does not report saved when a later removal generation wins before confirmation", async () => {
    const connected = {
      ...disconnected,
      credentialPresent: true,
      credentialId: "AAAAAAAAAAAAAAAAAAAAAA",
      endpoint: "https://mirror.vendor.ai/v1",
      expiresAt: "2026-09-11T09:00:00.000Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(connected))
      .mockResolvedValueOnce(Response.json(disconnected));
    vi.stubGlobal("fetch", fetchMock);
    await expect(saveUserProvider({
      endpoint: "https://mirror.vendor.ai/v1",
      apiKey: "sk-session-secret",
      signal: new AbortController().signal,
    })).rejects.toEqual(new ProviderSessionClientError(
      "SAVE_SUPERSEDED",
      "Another Model API action changed the saved access before confirmation.",
      false,
      disconnected,
    ));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serializes save confirmation, remove, and a newer save across browser clients", async () => {
    const firstResponse = deferred<Response>();
    const savedA = {
      ...disconnected,
      credentialPresent: true,
      credentialId: "AAAAAAAAAAAAAAAAAAAAAA",
      endpoint: "https://a.vendor.ai/v1",
      expiresAt: "2026-09-11T09:00:00.000Z",
    };
    const savedB = {
      ...savedA,
      credentialId: "BBBBBBBBBBBBBBBBBBBBBB",
      endpoint: "https://b.vendor.ai/v1",
    };
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(Response.json(savedA))
      .mockResolvedValueOnce(Response.json(disconnected))
      .mockResolvedValueOnce(Response.json(disconnected))
      .mockResolvedValueOnce(Response.json(savedB))
      .mockResolvedValueOnce(Response.json(savedB));
    vi.stubGlobal("fetch", fetchMock);

    const saveA = saveUserProvider({
      endpoint: savedA.endpoint,
      apiKey: "sk-a",
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const remove = removeUserProvider(new AbortController().signal);
    const saveB = saveUserProvider({
      endpoint: savedB.endpoint,
      apiKey: "sk-b",
      signal: new AbortController().signal,
    });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstResponse.resolve(Response.json(savedA));
    await expect(saveA).resolves.toEqual(savedA);
    await expect(remove).resolves.toEqual(disconnected);
    await expect(saveB).resolves.toEqual(savedB);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([, request]) => request.method)).toEqual([
      "POST", "GET", "DELETE", "GET", "POST", "GET",
    ]);
  });

  it("does not claim removal when a duplicate damaged generation remains visible", async () => {
    const damaged = { ...disconnected, resetRequired: true };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(disconnected))
      .mockResolvedValueOnce(Response.json(damaged)));

    await expect(removeUserProvider(new AbortController().signal)).rejects.toMatchObject({
      code: "REMOVE_UNCONFIRMED",
      retryable: false,
      currentStatus: damaged,
    });
  });

  it("does not spend the network deadline while waiting for the mutation lock", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, options: LockOptions) => new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        }),
      },
    });
    const pending = saveUserProvider({
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-session-secret",
      signal: controller.signal,
    });

    await vi.advanceTimersByTimeAsync(PROVIDER_SESSION_CLIENT_TIMEOUT_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    const reason = new DOMException("Owner left", "AbortError");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it("refuses cookie-writing mutations when cross-tab coordination is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeUserProvider(new AbortController().signal)).rejects.toMatchObject({
      code: "FEATURE_UNAVAILABLE",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not confirm a different credential saved for the same endpoint", async () => {
    const saved = {
      ...disconnected,
      credentialPresent: true,
      credentialId: "AAAAAAAAAAAAAAAAAAAAAA",
      endpoint: "https://mirror.vendor.ai/v1",
      expiresAt: "2026-09-11T09:00:00.000Z",
    };
    const replacement = {
      ...saved,
      credentialId: "BBBBBBBBBBBBBBBBBBBBBB",
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(saved))
      .mockResolvedValueOnce(Response.json(replacement)));

    await expect(saveUserProvider({
      endpoint: saved.endpoint,
      apiKey: "sk-session-secret",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "SAVE_SUPERSEDED",
      currentStatus: replacement,
    });
  });

  it("reports an uncertain save without inviting a second paid verification", async () => {
    const connected = {
      ...disconnected,
      credentialPresent: true,
      credentialId: "AAAAAAAAAAAAAAAAAAAAAA",
      endpoint: "https://mirror.vendor.ai/v1",
      expiresAt: "2026-09-11T09:00:00.000Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(connected))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(saveUserProvider({
      endpoint: "https://mirror.vendor.ai/v1",
      apiKey: "sk-session-secret",
      signal: new AbortController().signal,
    })).rejects.toEqual(new ProviderSessionClientError(
      "SAVE_UNCONFIRMED",
      "The provider was verified, but the saved state could not be confirmed.",
      false,
    ));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends test separately and omits a blank retained key from the wire", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      protocolVersion: "4",
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
      protocolVersion: "4",
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
    expect(calls.map(([, init]) => init.method)).toEqual(["GET", "DELETE", "GET"]);
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

function installSerialMutationLock(): void {
  let tail = Promise.resolve<unknown>(undefined);
  const request = (
    name: string,
    _options: LockOptions,
    callback: (lock: Lock) => unknown,
  ): Promise<unknown> => {
    const result = tail.then(() => callback({ name, mode: "exclusive" }));
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  vi.stubGlobal("navigator", {
    locks: { request },
  });
}

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return Object.freeze({ promise, resolve });
}
