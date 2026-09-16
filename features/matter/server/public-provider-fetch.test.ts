import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPinnedLookup,
  createPublicProviderFetch,
  isPublicProviderAddress,
  resolvePublicProviderAddress,
  selectPublicProviderAddress,
  type PublicProviderOperation,
} from "./public-provider-fetch";

const PUBLIC_DNS_ANSWER = Object.freeze([{ address: "8.8.8.8", family: 4 as const }]);

describe("public provider network boundary", () => {
  it.each([
    ["8.8.8.8", true],
    ["10.0.0.1", false],
    ["100.64.0.1", false],
    ["169.254.169.254", false],
    ["172.31.255.255", false],
    ["192.0.0.8", false],
    ["192.0.0.9", false],
    ["192.0.0.10", false],
    ["192.0.0.255", false],
    ["192.0.1.0", true],
    ["192.0.2.1", false],
    ["192.0.3.0", true],
    ["192.31.195.255", true],
    ["192.31.196.1", false],
    ["192.31.197.0", true],
    ["192.52.192.255", true],
    ["192.52.193.1", false],
    ["192.52.194.0", true],
    ["192.175.47.255", true],
    ["192.175.48.1", false],
    ["192.175.49.0", true],
    ["198.51.99.255", true],
    ["198.51.100.1", false],
    ["198.51.101.0", true],
    ["203.0.113.1", false],
    ["203.0.114.0", true],
    ["2606:4700:4700::1111", true],
    ["::1", false],
    ["::ffff:127.0.0.1", false],
    ["fc00::1", false],
    ["fe80::1", false],
    ["2000:ffff:ffff:ffff:ffff:ffff:ffff:ffff", true],
    ["2001:1::1", false],
    ["2001:db8::1", false],
    ["2001:2::1", false],
    ["2001:3::1", false],
    ["2001:4:112::1", false],
    ["2001:30::1", false],
    ["2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff", false],
    ["2001:200::1", true],
    ["2001:db7:ffff:ffff:ffff:ffff:ffff:ffff", true],
    ["2001:db9::1", true],
    ["2002:7f00:1::", false],
    ["2003::1", true],
    ["2620:4f:7fff::1", true],
    ["2620:4f:8000::1", false],
    ["2620:4f:8001::1", true],
    ["3fff::1", false],
    ["3fff:1000::1", true],
  ])("classifies %s without swallowing adjacent public space", (address, expected) => {
    expect(isPublicProviderAddress(address)).toBe(expected);
  });

  it("rejects a DNS answer set when any address is private", () => {
    expect(() => selectPublicProviderAddress([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ])).toThrow("outside the public Internet");
  });

  it("pins the checked address rather than resolving the hostname again", async () => {
    const lookup = createPinnedLookup({ address: "8.8.8.8", family: 4 });
    const result = await new Promise<Readonly<{ address: string; family: number }>>((resolve, reject) => {
      (lookup as unknown as (
        hostname: string,
        options: object,
        callback: (error: Error | null, address: string, family: number) => void,
      ) => void)("now-private.attacker.example", {}, (error, address, family) => {
        if (error !== null) reject(error);
        else resolve({ address, family });
      });
    });
    expect(result).toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("bounds DNS and ignores a late answer after authority is aborted", async () => {
    const controller = new AbortController();
    let resolveLookup!: (value: readonly [{ address: string; family: 4 }]) => void;
    const lookup = vi.fn(() => new Promise<readonly [{ address: string; family: 4 }]>((resolve) => {
      resolveLookup = resolve;
    }));
    const pending = resolvePublicProviderAddress("mirror.vendor.ai", controller.signal, lookup);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resolveLookup([{ address: "8.8.8.8", family: 4 }]);
    await Promise.resolve();
    expect(lookup).toHaveBeenCalledOnce();
  });

  it.each<readonly [PublicProviderOperation, string, "GET" | "POST", string | undefined]>([
    ["chat-completions", "https://mirror.vendor.ai/v1/chat/completions", "POST", "{}"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/messages", "POST", "{\"text\":\"思想\"}"],
    ["models", "https://mirror.vendor.ai/v1/models", "GET", undefined],
  ])("admits only the %s operation's owned method and path", async (operation, url, method, body) => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch(operation, {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    const pending = safeFetch(url, { method, body });
    await vi.waitFor(() => expect(harness.requestHttps).toHaveBeenCalledOnce());
    const [requestedUrl, options] = harness.requestHttps.mock.calls[0]!;
    expect(requestedUrl.toString()).toBe(url);
    expect(options.method).toBe(method);
    if (body === undefined) {
      expect(options.headers).not.toHaveProperty("content-length");
      expect(harness.end).toHaveBeenCalledWith();
    } else {
      expect(options.headers).toMatchObject({
        "content-length": String(Buffer.byteLength(body, "utf8")),
      });
      expect(harness.end).toHaveBeenCalledWith(body);
    }
    harness.respond(200, { "content-type": "application/json" }, "{}");
    await expect(pending).resolves.toMatchObject({ status: 200 });
  });

  it.each<readonly [PublicProviderOperation, string, string]>([
    ["chat-completions", "https://mirror.vendor.ai/v1/chat/completions", "GET"],
    ["chat-completions", "https://mirror.vendor.ai/v1/chat/completions", "PUT"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/messages", "GET"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/messages", "PATCH"],
    ["models", "https://mirror.vendor.ai/v1/models", "POST"],
    ["models", "https://mirror.vendor.ai/v1/models", "DELETE"],
  ])("rejects %s with the foreign %s method", async (operation, url, method) => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch(operation, {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    await expect(safeFetch(url, { method, body: method === "POST" ? "{}" : undefined }))
      .rejects.toThrow("request method is invalid");
    expect(harness.requestHttps).not.toHaveBeenCalled();
  });

  it.each<readonly [PublicProviderOperation, string, string]>([
    ["chat-completions", "https://mirror.vendor.ai/v1/models", "request path is invalid"],
    ["chat-completions", "https://mirror.vendor.ai/v1/chat/completions/", "request path is invalid"],
    ["anthropic-messages", "https://mirror.vendor.ai/messages", "request URL is invalid"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/chat/completions", "request path is invalid"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/messages/", "request path is invalid"],
    ["models", "https://mirror.vendor.ai/v1/chat/completions", "request path is invalid"],
    ["models", "https://mirror.vendor.ai/v1/models/", "request path is invalid"],
  ])("rejects a path outside the %s operation", async (operation, url, message) => {
    const lookupAll = vi.fn(async () => PUBLIC_DNS_ANSWER);
    const safeFetch = createPublicProviderFetch(operation, { lookupAll });
    await expect(safeFetch(url, operation === "models"
      ? { method: "GET" }
      : { method: "POST", body: "{}" }))
      .rejects.toThrow(message);
    expect(lookupAll).not.toHaveBeenCalled();
  });

  it.each<readonly [PublicProviderOperation, string]>([
    ["chat-completions", "https://mirror.vendor.ai/v1/chat/completions?model=other"],
    ["chat-completions", "https://mirror.vendor.ai/v1/chat/completions#other"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/messages?stream=true"],
    ["anthropic-messages", "https://mirror.vendor.ai/v1/messages#other"],
    ["models", "https://mirror.vendor.ai/v1/models?limit=100"],
    ["models", "https://mirror.vendor.ai/v1/models#other"],
  ])("rejects query strings and fragments for %s", async (operation, url) => {
    const lookupAll = vi.fn(async () => PUBLIC_DNS_ANSWER);
    const safeFetch = createPublicProviderFetch(operation, { lookupAll });
    await expect(safeFetch(url, operation === "models"
      ? { method: "GET" }
      : { method: "POST", body: "{}" }))
      .rejects.toThrow("request URL is invalid");
    expect(lookupAll).not.toHaveBeenCalled();
  });

  it.each<readonly [PublicProviderOperation, string]>([
    ["chat-completions", "https://user@mirror.vendor.ai/v1/chat/completions"],
    ["models", "https://user:secret@mirror.vendor.ai/v1/models"],
  ])("rejects URL credentials before DNS for %s", async (operation, url) => {
    const lookupAll = vi.fn(async () => PUBLIC_DNS_ANSWER);
    const safeFetch = createPublicProviderFetch(operation, { lookupAll });
    await expect(safeFetch(url, operation === "models"
      ? { method: "GET" }
      : { method: "POST", body: "{}" }))
      .rejects.toThrow("request URL is invalid");
    expect(lookupAll).not.toHaveBeenCalled();
  });

  it("requires a bounded byte body for completion operations", async () => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch("chat-completions", {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    await expect(safeFetch("https://mirror.vendor.ai/v1/chat/completions", { method: "POST" }))
      .rejects.toThrow("request body is invalid");
    await expect(safeFetch("https://mirror.vendor.ai/v1/chat/completions", {
      method: "POST",
      body: new Blob(["{}"]),
    })).rejects.toThrow("request body is invalid");
    expect(harness.requestHttps).not.toHaveBeenCalled();
  });

  it("accepts a byte body and owns its exact framing", async () => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch("anthropic-messages", {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    const body = new TextEncoder().encode("思想");
    const pending = safeFetch("https://mirror.vendor.ai/v1/messages", {
      method: "POST",
      headers: { "content-length": "999" },
      body,
    });
    await vi.waitFor(() => expect(harness.requestHttps).toHaveBeenCalledOnce());
    expect(harness.requestHttps.mock.calls[0]![1].headers).toMatchObject({
      "content-length": String(body.byteLength),
    });
    expect(harness.end).toHaveBeenCalledWith(body);
    harness.respond(200, { "content-type": "application/json" }, "{}");
    await expect(pending).resolves.toMatchObject({ status: 200 });
  });

  it("forbids a body on model discovery", async () => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch("models", {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    await expect(safeFetch("https://mirror.vendor.ai/v1/models", {
      method: "GET",
      body: "{}",
    })).rejects.toThrow("request body is invalid");
    expect(harness.requestHttps).not.toHaveBeenCalled();
  });

  it("pins the real request hook, retains TLS hostname verification, and never follows a redirect", async () => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch("chat-completions", {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    const pending = safeFetch("https://mirror.vendor.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: "{}",
    });
    await vi.waitFor(() => expect(harness.requestHttps).toHaveBeenCalledOnce());
    const options = harness.requestHttps.mock.calls[0]![1];
    expect(options).toMatchObject({
      agent: false,
      family: 4,
      maxHeaderSize: 16 * 1_024,
      rejectUnauthorized: true,
      servername: "mirror.vendor.ai",
    });
    expect(options.headers).toMatchObject({
      authorization: "Bearer secret",
      "content-length": "2",
      "content-type": "application/json",
    });
    const pinned = await callLookup(options.lookup!, "mirror.vendor.ai");
    expect(pinned).toEqual({ address: "8.8.8.8", family: 4 });
    harness.respond(302, { location: "https://127.0.0.1/private" }, "redirect");
    const response = await pending;
    expect(response.status).toBe(302);
    expect(harness.requestHttps).toHaveBeenCalledOnce();
    expect(harness.end).toHaveBeenCalledWith("{}");
  });

  it("aborts an active pinned socket and tolerates its late response", async () => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch("chat-completions", {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    const controller = new AbortController();
    const pending = safeFetch("https://mirror.vendor.ai/v1/chat/completions", {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(harness.requestHttps).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Owner left", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.destroy).toHaveBeenCalledOnce();
    expect(() => harness.respond(200, { "content-type": "application/json" }, "{}"))
      .not.toThrow();
    expect(harness.responseDestroy).toHaveBeenCalledOnce();
  });

  it("rejects a premature socket close that has no preceding error", async () => {
    const harness = requestHarness();
    const safeFetch = createPublicProviderFetch("chat-completions", {
      lookupAll: async () => PUBLIC_DNS_ANSWER,
      requestHttps: harness.requestHttps,
    });
    const pending = safeFetch("https://mirror.vendor.ai/v1/chat/completions", {
      method: "POST",
      body: "{}",
    });
    await vi.waitFor(() => expect(harness.requestHttps).toHaveBeenCalledOnce());
    harness.close();
    await expect(pending).rejects.toThrow("closed before a response");
  });
});

function requestHarness() {
  const request = new EventEmitter() as ClientRequest;
  let onResponse: ((response: IncomingMessage) => void) | null = null;
  const end = vi.fn();
  const destroy = vi.fn((error?: Error) => {
    queueMicrotask(() => {
      if (error !== undefined) request.emit("error", error);
      request.emit("close");
    });
    return request;
  });
  Object.assign(request, { end, destroy });
  const requestHttps = vi.fn((_url, _options, response) => {
    onResponse = response;
    return request;
  });
  const responseDestroy = vi.fn();
  return {
    requestHttps,
    end,
    destroy,
    responseDestroy,
    close: () => request.emit("close"),
    respond(status: number, headers: Record<string, string>, body: string) {
      const stream = new PassThrough();
      const response = stream as unknown as IncomingMessage;
      response.statusCode = status;
      response.statusMessage = "fixture";
      response.headers = headers;
      response.destroy = responseDestroy;
      onResponse?.(response);
      stream.end(body);
    },
  };
}

async function callLookup(
  lookup: NonNullable<import("node:https").RequestOptions["lookup"]>,
  hostname: string,
): Promise<Readonly<{ address: string; family: number }>> {
  return await new Promise((resolve, reject) => {
    (lookup as unknown as (
      hostname: string,
      options: object,
      callback: (error: Error | null, address: string, family: number) => void,
    ) => void)(hostname, {}, (error, address, family) => {
      if (error !== null) reject(error);
      else resolve({ address, family });
    });
  });
}
