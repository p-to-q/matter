import "server-only";

import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { isCanonicalUserProviderBaseUrl } from "../protocol/provider-session-contract";

type LookupAll = (
  hostname: string,
  options: Readonly<{ all: true; verbatim: true }>,
) => Promise<readonly LookupAddress[]>;

type RequestHttps = (
  url: URL,
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

export type PublicProviderOperation =
  | "chat-completions"
  | "anthropic-messages"
  | "models";

/**
 * A deliberately small fetch surface for user-selected provider mirrors.
 * It resolves every request afresh, rejects any mixed private answer set, then
 * pins the TLS socket to one checked address while retaining hostname SNI and
 * certificate verification. `https.request` does not follow redirects.
 */
export function createPublicProviderFetch(operation: PublicProviderOperation, dependencies: Readonly<{
  lookupAll?: LookupAll;
  requestHttps?: RequestHttps;
}> = {}): typeof fetch {
  const lookupAll = dependencies.lookupAll ?? dnsLookup as LookupAll;
  const requestHttps = dependencies.requestHttps ?? httpsRequest as RequestHttps;
  return async (input, init) => {
    if (typeof input !== "string" && !(input instanceof URL)) {
      throw new Error("The provider request URL is invalid.");
    }
    const url = new URL(input.toString());
    assertOperationUrl(url, operation);
    const signal = init?.signal ?? undefined;
    signal?.throwIfAborted();
    const address = await resolvePublicProviderAddress(url.hostname, signal, lookupAll);
    signal?.throwIfAborted();
    const method = (init?.method ?? "GET").toUpperCase();
    const expectedMethod = operation === "models" ? "GET" : "POST";
    if (method !== expectedMethod) throw new Error("The provider request method is invalid.");
    const body = init?.body;
    if (expectedMethod === "POST" && typeof body !== "string" && !(body instanceof Uint8Array)) {
      throw new Error("The provider request body is invalid.");
    }
    if (expectedMethod === "GET" && body !== undefined && body !== null) {
      throw new Error("The provider request body is invalid.");
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    // Some compatible gateways reject chunked JSON. Framing is server-owned
    // and must count bytes rather than JavaScript code units.
    if (expectedMethod === "POST") {
      headers["content-length"] = String(
        typeof body === "string" ? Buffer.byteLength(body, "utf8") : (body as Uint8Array).byteLength,
      );
    }

    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return false;
        settled = true;
        callback();
        return true;
      };
      const request = requestHttps(url, {
        method,
        headers,
        agent: false,
        family: address.family,
        lookup: createPinnedLookup(address),
        maxHeaderSize: 16 * 1_024,
        rejectUnauthorized: true,
        servername: url.hostname,
      }, (response) => {
        if (settled || signal?.aborted) {
          response.destroy();
          return;
        }
        try {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const entry of value) responseHeaders.append(name, entry);
            } else {
              responseHeaders.set(name, String(value));
            }
          }
          const status = response.statusCode ?? 502;
          const responseBody = status === 204 || status === 304
            ? null
            : Readable.toWeb(response) as ReadableStream<Uint8Array>;
          const result = new Response(responseBody, {
            status,
            statusText: response.statusMessage,
            headers: responseHeaders,
          });
          if (!finish(() => resolve(result))) response.destroy();
        } catch (error) {
          response.destroy();
          finish(() => reject(error));
        }
      });
      request.once("error", (error) => finish(() => reject(error)));
      const abort = () => {
        const reason = signal?.reason ?? new DOMException("Aborted", "AbortError");
        finish(() => reject(reason));
        request.destroy(reason);
      };
      signal?.addEventListener("abort", abort, { once: true });
      request.once("close", () => {
        signal?.removeEventListener("abort", abort);
        finish(() => reject(new Error("The provider connection closed before a response.")));
      });
      if (expectedMethod === "POST") request.end(body);
      else request.end();
    });
  };
}

export const fetchPublicChatCompletions: typeof fetch = createPublicProviderFetch("chat-completions");
export const fetchPublicAnthropicMessages: typeof fetch = createPublicProviderFetch("anthropic-messages");
export const fetchPublicProviderModels: typeof fetch = createPublicProviderFetch("models");

export async function resolvePublicProviderAddress(
  hostname: string,
  signal?: AbortSignal,
  lookupAll: LookupAll = dnsLookup as LookupAll,
): Promise<LookupAddress> {
  if (isIP(hostname) !== 0) throw new Error("Provider IP literals are not supported.");
  const boundary = signal === undefined ? null : rejectOnAbort(signal);
  try {
    const answers = await (boundary === null
      ? lookupAll(hostname, { all: true, verbatim: true })
      : Promise.race([
        lookupAll(hostname, { all: true, verbatim: true }),
        boundary.promise,
      ]));
    return selectPublicProviderAddress(answers);
  } finally {
    boundary?.dispose();
  }
}

export function selectPublicProviderAddress(answers: readonly LookupAddress[]): LookupAddress {
  if (answers.length === 0 || answers.length > 32) {
    throw new Error("The provider hostname has no bounded public address set.");
  }
  if (answers.some((answer) => (
    (answer.family !== 4 && answer.family !== 6) ||
    isIP(answer.address) !== answer.family ||
    !isPublicProviderAddress(answer.address)
  ))) {
    throw new Error("The provider hostname resolves outside the public Internet.");
  }
  const first = answers[0]!;
  return Object.freeze({ address: first.address, family: first.family });
}

export function isPublicProviderAddress(address: string): boolean {
  // Policy follows the IANA IPv4/IPv6 Special-Purpose Address Registries. Keep
  // the adjacent-public fixtures in sync whenever those registries change.
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const words = parseIpv6(address);
  if (words === null || (words[0]! & 0xe000) !== 0x2000) return false;
  return !NON_PUBLIC_IPV6_PREFIXES.some(({ prefix, bits }) => (
    matchesIpv6Prefix(words, prefix, bits)
  ));
}

export function createPinnedLookup(address: LookupAddress): LookupFunction {
  return ((_hostname: string, _options: unknown, callback: (
    error: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void) => callback(null, address.address, address.family)) as LookupFunction;
}

function assertOperationUrl(url: URL, operation: PublicProviderOperation): void {
  const suffix = operation === "chat-completions"
    ? "/chat/completions"
    : operation === "anthropic-messages"
      ? "/messages"
      : "/models";
  if (!url.pathname.endsWith(suffix)) throw new Error("The provider request path is invalid.");
  const baseUrl = `${url.origin}${url.pathname.slice(0, -suffix.length)}`;
  const basePath = new URL(baseUrl).pathname.replace(/\/+$/u, "");
  if (
    url.username !== "" ||
    url.password !== "" ||
    !isCanonicalUserProviderBaseUrl(baseUrl) ||
    url.search !== "" ||
    url.hash !== "" ||
    (operation === "anthropic-messages" && !basePath.endsWith("/v1"))
  ) {
    throw new Error("The provider request URL is invalid.");
  }
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  const [a, b, c, d] = octets as [number, number, number, number];
  const value = (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
  return !NON_PUBLIC_IPV4_PREFIXES.some(({ prefix, bits }) => (
    matchesIpv4Prefix(value, prefix, bits)
  ));
}

type Ipv4Prefix = Readonly<{ prefix: number; bits: number }>;
type Ipv6Prefix = Readonly<{ prefix: readonly number[]; bits: number }>;

// All current IANA IPv4 special-purpose blocks plus multicast/reserved space.
// A more-specific globally reachable assignment remains special-use here: a
// provider mirror must resolve to ordinary public unicast space.
const NON_PUBLIC_IPV4_PREFIXES: readonly Ipv4Prefix[] = Object.freeze([
  Object.freeze({ prefix: 0x00000000, bits: 8 }), // 0.0.0.0/8
  Object.freeze({ prefix: 0x0a000000, bits: 8 }), // 10.0.0.0/8
  Object.freeze({ prefix: 0x64400000, bits: 10 }), // 100.64.0.0/10
  Object.freeze({ prefix: 0x7f000000, bits: 8 }), // 127.0.0.0/8
  Object.freeze({ prefix: 0xa9fe0000, bits: 16 }), // 169.254.0.0/16
  Object.freeze({ prefix: 0xac100000, bits: 12 }), // 172.16.0.0/12
  Object.freeze({ prefix: 0xc0000000, bits: 24 }), // 192.0.0.0/24
  Object.freeze({ prefix: 0xc0000200, bits: 24 }), // 192.0.2.0/24
  Object.freeze({ prefix: 0xc01fc400, bits: 24 }), // 192.31.196.0/24
  Object.freeze({ prefix: 0xc034c100, bits: 24 }), // 192.52.193.0/24
  Object.freeze({ prefix: 0xc0586300, bits: 24 }), // 192.88.99.0/24
  Object.freeze({ prefix: 0xc0a80000, bits: 16 }), // 192.168.0.0/16
  Object.freeze({ prefix: 0xc0af3000, bits: 24 }), // 192.175.48.0/24
  Object.freeze({ prefix: 0xc6120000, bits: 15 }), // 198.18.0.0/15
  Object.freeze({ prefix: 0xc6336400, bits: 24 }), // 198.51.100.0/24
  Object.freeze({ prefix: 0xcb007100, bits: 24 }), // 203.0.113.0/24
  Object.freeze({ prefix: 0xe0000000, bits: 3 }), // 224.0.0.0/3
]);

const NON_PUBLIC_IPV6_PREFIXES: readonly Ipv6Prefix[] = Object.freeze([
  ipv6Prefix([0x2001, 0, 0, 0, 0, 0, 0, 0], 23), // IETF Protocol Assignments
  ipv6Prefix([0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32), // Documentation
  ipv6Prefix([0x2002, 0, 0, 0, 0, 0, 0, 0], 16), // 6to4
  ipv6Prefix([0x2620, 0x004f, 0x8000, 0, 0, 0, 0, 0], 48), // AS112
  ipv6Prefix([0x3ffe, 0, 0, 0, 0, 0, 0, 0], 16), // Returned 6bone space
  ipv6Prefix([0x3fff, 0, 0, 0, 0, 0, 0, 0], 20), // Documentation
]);

function matchesIpv4Prefix(value: number, prefix: number, bits: number): boolean {
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (prefix & mask) >>> 0;
}

function ipv6Prefix(prefix: readonly number[], bits: number): Ipv6Prefix {
  return Object.freeze({ prefix: Object.freeze(prefix), bits });
}

function matchesIpv6Prefix(value: readonly number[], prefix: readonly number[], bits: number): boolean {
  const wholeWords = Math.floor(bits / 16);
  for (let index = 0; index < wholeWords; index += 1) {
    if (value[index] !== prefix[index]) return false;
  }
  const remaining = bits % 16;
  if (remaining === 0) return true;
  const mask = (0xffff << (16 - remaining)) & 0xffff;
  return (value[wholeWords]! & mask) === (prefix[wholeWords]! & mask);
}

function parseIpv6(address: string): readonly number[] | null {
  const value = address.toLowerCase();
  if (value.includes("%") || value.split("::").length > 2) return null;
  const halves = value.split("::");
  const left = parseIpv6Half(halves[0] ?? "");
  const right = parseIpv6Half(halves[1] ?? "");
  if (left === null || right === null) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  return missing >= 1 ? [...left, ...Array<number>(missing).fill(0), ...right] : null;
}

function parseIpv6Half(value: string): number[] | null {
  if (value === "") return [];
  const parts = value.split(":");
  const words: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.includes(".")) {
      if (index !== parts.length - 1 || !isCanonicalIpv4(part)) return null;
      const octets = part.split(".").map(Number);
      words.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
    } else {
      if (!/^[0-9a-f]{1,4}$/u.test(part)) return null;
      words.push(Number.parseInt(part, 16));
    }
  }
  return words;
}

function isCanonicalIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => (
    /^(?:0|[1-9]\d{0,2})$/u.test(part) && Number(part) <= 255
  ));
}

function rejectOnAbort(signal: AbortSignal): Readonly<{
  promise: Promise<never>;
  dispose: () => void;
}> {
  let rejectPromise!: (reason: DOMException) => void;
  const promise = new Promise<never>((_resolve, reject) => { rejectPromise = reject; });
  promise.catch(() => undefined);
  const reject = () => rejectPromise(new DOMException("Aborted", "AbortError"));
  if (signal.aborted) reject();
  else signal.addEventListener("abort", reject, { once: true });
  return Object.freeze({ promise, dispose: () => signal.removeEventListener("abort", reject) });
}
