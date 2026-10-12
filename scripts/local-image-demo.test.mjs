import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { inflateSync } from "node:zlib";

import {
  RELAY_BODY_CAP_BYTES,
  assertConfiguredImagePool,
  createFakeImageRelay,
  createLocalImageDemoEnvironment,
  localImageDemoSummary,
  parseLocalImageDemoArguments,
} from "./local-image-demo.mjs";

const SECRET = "developer-secret-do-not-leak";

function developer(overrides = {}) {
  return {
    PATH: "/usr/bin",
    MATTER_MODEL_POOL: "primary",
    MATTER_MODEL_PRIMARY_BASE_URL: "https://models.example.invalid/v1",
    MATTER_MODEL_PRIMARY_API_KEY: SECRET,
    MATTER_MODEL_PRIMARY_MODELS: "model-a",
    MATTER_IMAGE_POOL: "draw-images",
    MATTER_IMAGE_DRAW_IMAGES_BASE_URL: "https://images.example.invalid/v1",
    MATTER_IMAGE_DRAW_IMAGES_API_KEY: `${SECRET}-image`,
    MATTER_IMAGE_DRAW_IMAGES_MODELS: "image-a",
    MATTER_IMAGE_DRAW_IMAGES_SHAPE: "images",
    ...overrides,
  };
}

const REAL = parseLocalImageDemoArguments([]);
const FAKE = parseLocalImageDemoArguments(["--fake-image"]);

async function post(url, { key, body = "{}", method = "POST", headers = {} } = {}) {
  return fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
      ...headers,
    },
    ...(method === "GET" ? {} : { body }),
  });
}

function assertDecodablePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(bytes.readUInt32BE(16), 1024);
  assert.equal(bytes.readUInt32BE(20), 1024);
  const idat = [];
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") ended = true;
    offset += 12 + length;
  }
  assert.ok(ended && offset === bytes.length, "the PNG must end exactly at IEND");
  assert.equal(inflateSync(Buffer.concat(idat)).length, (1 + 1024) * 1024);
}

async function withRelay(options, run) {
  const relay = createFakeImageRelay({ delayMs: 0, ...options });
  const listening = await relay.listen();
  try {
    await run(relay, listening);
  } finally {
    await relay.close();
  }
}

test("parses a bounded port and keeps relay flags tied to --fake-image", () => {
  assert.deepEqual(REAL, {
    fakeImage: false,
    imageDelayMs: 4_000,
    imageFailEvery: 0,
    imageShape: "images",
    imageSlow: false,
    port: 3000,
  });
  assert.deepEqual(
    parseLocalImageDemoArguments([
      "--port=3210", "--fake-image", "--image-delay=0", "--image-fail=3", "--image-slow", "--image-shape=chat",
    ]),
    { fakeImage: true, imageDelayMs: 0, imageFailEvery: 3, imageShape: "chat", imageSlow: true, port: 3210 },
  );
  assert.equal(parseLocalImageDemoArguments(["--fake-image", "--image-delay=30000"]).imageDelayMs, 30_000);
  assert.throws(() => parseLocalImageDemoArguments(["--port=80"]), /1024/);
  assert.throws(() => parseLocalImageDemoArguments(["--port=abc"]), /1024/);
  assert.throws(() => parseLocalImageDemoArguments(["--fake-image", "--image-delay=30001"]), /0 to 30000/);
  assert.throws(() => parseLocalImageDemoArguments(["--fake-image", "--image-delay=-1"]), /0 to 30000/);
  assert.throws(() => parseLocalImageDemoArguments(["--fake-image", "--image-fail=0"]), /1 to 1000/);
  assert.throws(() => parseLocalImageDemoArguments(["--fake-image", "--image-shape=json"]), /images or chat/);
  assert.throws(() => parseLocalImageDemoArguments(["--image-delay=10"]), /needs --fake-image/);
  assert.throws(() => parseLocalImageDemoArguments(["--image-slow"]), /needs --fake-image/);
  assert.throws(() => parseLocalImageDemoArguments(["--real-brief"]), /Unknown/);
});

test("fails closed on absent, incomplete, or unsafe image stations without printing values", () => {
  assert.throws(() => assertConfiguredImagePool({}), (error) =>
    /No image station is configured/.test(error.message) &&
    /\.env\.example/.test(error.message) &&
    /MATTER_IMAGE_POOL/.test(error.message) &&
    /--fake-image/.test(error.message));
  const failures = [
    [{ MATTER_IMAGE_DRAW_IMAGES_API_KEY: "" }, /MATTER_IMAGE_DRAW_IMAGES_API_KEY/],
    [{ MATTER_IMAGE_DRAW_IMAGES_MODELS: " , " }, /MATTER_IMAGE_DRAW_IMAGES_MODELS/],
    [{ MATTER_IMAGE_DRAW_IMAGES_BASE_URL: undefined }, /MATTER_IMAGE_DRAW_IMAGES_BASE_URL/],
    [{ MATTER_IMAGE_DRAW_IMAGES_SHAPE: "" }, /SHAPE must be exactly chat or images/],
    [{ MATTER_IMAGE_DRAW_IMAGES_SHAPE: "json" }, /SHAPE must be exactly chat or images/],
    [{ MATTER_IMAGE_DRAW_IMAGES_BASE_URL: "http://images.example.invalid/v1" }, /HTTPS/],
    [{ MATTER_IMAGE_DRAW_IMAGES_BASE_URL: "not a url" }, /absolute URL/],
    [{ MATTER_IMAGE_POOL: "bad station" }, /invalid station name/],
  ];
  for (const [overrides, pattern] of failures) {
    assert.throws(() => assertConfiguredImagePool(developer(overrides)), (error) =>
      pattern.test(error.message) && !error.message.includes(SECRET));
  }
  assert.doesNotThrow(() => assertConfiguredImagePool(developer()));
  assert.doesNotThrow(() => assertConfiguredImagePool(developer({
    MATTER_IMAGE_DRAW_IMAGES_BASE_URL: "http://127.0.0.1:9/v1",
    MATTER_IMAGE_DRAW_IMAGES_SHAPE: "chat",
  })));
});

test("real chat and real image: the developer's pools pass through and only the gate is set", () => {
  const input = developer({ MATTER_IMAGE_ADAPTER: "off", MATTER_BASE_PATH: "/m" });
  const environment = createLocalImageDemoEnvironment(input, REAL);
  assert.equal(environment.MATTER_IMAGE_ADAPTER, "live");
  assert.equal(environment.MATTER_BASE_PATH, "/m");
  for (const key of Object.keys(input)) {
    if (key !== "MATTER_IMAGE_ADAPTER") assert.equal(environment[key], input[key], key);
  }
  // The flags the AI demo already owns stay consistent with `dev:ai`.
  assert.equal(environment.MATTER_INQUIRY_ADAPTER, "live");
  assert.equal(environment.MATTER_TEXT_SWAP_ADAPTER, "live");
  assert.equal(environment.MATTER_REPAIR_ADAPTER, "live");
  assert.equal(environment.MATTER_LABEL_ADAPTER, "fixture");
  assert.equal(environment.MATTER_TRANSCRIPTION_ADAPTER, "browser");
  assert.equal(environment.NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED, "true");
  assert.equal(environment.NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED, "true");
});

test("a missing image station is an error unless the fake relay was asked for", () => {
  const withoutImage = developer({ MATTER_IMAGE_POOL: undefined });
  assert.throws(() => createLocalImageDemoEnvironment(withoutImage, REAL), /No image station/);
  const environment = createLocalImageDemoEnvironment(withoutImage, FAKE, {
    apiKey: "k",
    baseUrl: "http://127.0.0.1:4010/v1",
    port: 4010,
  });
  assert.equal(environment.MATTER_IMAGE_ADAPTER, "live");
});

test("a missing or ambiguous chat pool is an error in every mode", () => {
  const relay = { apiKey: "k", baseUrl: "http://127.0.0.1:4010/v1", port: 4010 };
  assert.throws(() => createLocalImageDemoEnvironment({ ...developer(), MATTER_MODEL_POOL: "" }, REAL), /model pool/);
  assert.throws(() => createLocalImageDemoEnvironment({ MATTER_IMAGE_ADAPTER: "live" }, FAKE, relay), /model pool/);
  assert.throws(
    () => createLocalImageDemoEnvironment(developer({ MATTER_LABEL_POOL: "legacy" }), FAKE, relay),
    /exactly one/,
  );
  assert.throws(() => createLocalImageDemoEnvironment(developer(), FAKE), /listening/);
});

test("real chat and fake image: only the image pool is replaced, with a loopback http station", () => {
  const relay = { apiKey: "run-key", baseUrl: "http://127.0.0.1:4010/v1", port: 4010 };
  for (const shape of ["images", "chat"]) {
    const options = parseLocalImageDemoArguments(["--fake-image", `--image-shape=${shape}`]);
    const input = developer({ MATTER_IMAGE_ADAPTER: "off" });
    const environment = createLocalImageDemoEnvironment(input, options, relay);
    assert.equal(environment.MATTER_IMAGE_ADAPTER, "live");
    assert.equal(environment.MATTER_IMAGE_POOL, "local-fake");
    assert.equal(environment.MATTER_IMAGE_LOCAL_FAKE_BASE_URL, relay.baseUrl);
    assert.equal(environment.MATTER_IMAGE_LOCAL_FAKE_API_KEY, relay.apiKey);
    assert.equal(environment.MATTER_IMAGE_LOCAL_FAKE_SHAPE, shape);
    assert.match(environment.MATTER_IMAGE_LOCAL_FAKE_BASE_URL, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    // No trace of the developer's image station survives in the child environment.
    const imageKeys = Object.keys(environment).filter((key) => key.startsWith("MATTER_IMAGE_"));
    assert.deepEqual(imageKeys.sort(), [
      "MATTER_IMAGE_ADAPTER",
      "MATTER_IMAGE_LOCAL_FAKE_API_KEY",
      "MATTER_IMAGE_LOCAL_FAKE_BASE_URL",
      "MATTER_IMAGE_LOCAL_FAKE_MODELS",
      "MATTER_IMAGE_LOCAL_FAKE_SHAPE",
      "MATTER_IMAGE_POOL",
    ]);
    assert.ok(!Object.values(environment).some((value) => String(value).includes(`${SECRET}-image`)));
    // The chat pool is the developer's own, untouched.
    assert.equal(environment.MATTER_MODEL_POOL, "primary");
    assert.equal(environment.MATTER_MODEL_PRIMARY_API_KEY, SECRET);
    assert.equal(environment.MATTER_MODEL_PRIMARY_BASE_URL, "https://models.example.invalid/v1");
  }
});

test("the banner states which relays are real and which are fake, and never carries a key", () => {
  const relay = { apiKey: "run-key-xyz", baseUrl: "http://127.0.0.1:4010/v1", port: 4010 };
  const real = localImageDemoSummary(createLocalImageDemoEnvironment(developer(), REAL), REAL).join("\n");
  assert.match(real, /chat = REAL/);
  assert.match(real, /image = REAL/);
  assert.match(real, /SPEND YOUR CREDITS/);
  assert.match(real, /http:\/\/localhost:3000\/matter/);
  assert.match(real, /绘图/);
  assert.match(real, /Draw/);
  assert.match(real, /provisional/);
  assert.doesNotMatch(real, /developer-secret|models\.example|images\.example|model-a/u);
  assert.equal(real.split("\n").filter((line) => /^ {2}\d\. /.test(line)).length, 6);

  const options = parseLocalImageDemoArguments(["--fake-image", "--port=3300", "--image-fail=2"]);
  const fake = localImageDemoSummary(createLocalImageDemoEnvironment(developer(), options, relay), options, relay).join("\n");
  assert.match(fake, /chat = REAL/);
  assert.match(fake, /image = FAKE/);
  assert.match(fake, /every 2th request/);
  assert.match(fake, /localhost:3300\/matter/);
  assert.doesNotMatch(fake, /run-key-xyz|developer-secret/u);
});

test("the relay binds to 127.0.0.1 only and shuts down cleanly", async () => {
  await withRelay({}, async (relay, listening) => {
    assert.equal(listening.host, "127.0.0.1");
    assert.equal(relay.server.address().address, "127.0.0.1");
    assert.match(listening.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    assert.match(listening.apiKey, /^[0-9a-f]{48}$/);
  });
  const first = createFakeImageRelay({ delayMs: 0 });
  const second = createFakeImageRelay({ delayMs: 0 });
  const [a, b] = [await first.listen(), await second.listen()];
  assert.notEqual(a.port, b.port);
  assert.notEqual(a.apiKey, b.apiKey);
  await Promise.all([first.close(), second.close()]);
});

test("the relay refuses a missing or wrong key, a non-POST method, a wrong path, and an oversize body", async () => {
  await withRelay({}, async (relay, listening) => {
    const url = `${listening.baseUrl}/images/generations`;
    assert.equal((await post(url)).status, 401);
    assert.equal((await post(url, { key: "wrong" })).status, 401);
    assert.equal((await post(url, { key: listening.apiKey.slice(0, -1) })).status, 401);
    assert.equal((await post(url, { method: "GET" })).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: listening.apiKey } })).status, 401);
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const response = await post(url, { key: listening.apiKey, method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "POST");
    }
    assert.equal((await post(`${listening.baseUrl}/chat/completions`, { key: listening.apiKey })).status, 404);
    assert.equal((await post(url, { key: listening.apiKey, body: "{not json" })).status, 400);
    const oversize = await post(url, {
      key: listening.apiKey,
      body: JSON.stringify({ prompt: "x".repeat(RELAY_BODY_CAP_BYTES + 1) }),
    });
    assert.equal(oversize.status, 413);
    // At the cap exactly it is still admitted.
    const filler = "x".repeat(RELAY_BODY_CAP_BYTES - '{"p":""}'.length);
    const atCap = await post(url, { key: listening.apiKey, body: JSON.stringify({ p: filler }) });
    assert.equal(atCap.status, 200);
    await atCap.arrayBuffer();
    // Every refusal was cheap: only the admitted request reached the image step.
    assert.equal(relay.requests, 1);
    for (const response of [await post(url), await post(url, { key: listening.apiKey })]) {
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      await response.arrayBuffer();
    }
    // A preflight is a non-POST and is refused without CORS headers.
    const preflight = await fetch(url, { method: "OPTIONS", headers: { origin: "http://evil.example", "access-control-request-method": "POST" } });
    assert.equal(preflight.status, 401);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
  });
});

test("a chunked oversize body is refused without being buffered", async () => {
  await withRelay({}, async (_relay, listening) => {
    const status = await new Promise((resolveStatus, rejectStatus) => {
      const outgoing = httpRequest({
        host: "127.0.0.1",
        port: Number(new URL(listening.baseUrl).port),
        path: "/v1/images/generations",
        method: "POST",
        headers: { authorization: `Bearer ${listening.apiKey}`, "content-type": "application/json" },
      }, (response) => {
        response.resume();
        resolveStatus(response.statusCode);
      });
      outgoing.once("error", rejectStatus);
      outgoing.write("{\"p\":\"");
      outgoing.write("x".repeat(RELAY_BODY_CAP_BYTES));
      outgoing.end("\"}");
    });
    assert.equal(status, 413);
  });
});

test("the images shape returns a decodable PNG whose sha256 matches", async () => {
  await withRelay({ shape: "images" }, async (relay, listening) => {
    const response = await post(`${listening.baseUrl}/images/generations`, {
      key: listening.apiKey,
      body: JSON.stringify({ model: "m", prompt: "p", n: 1, size: "1024x1024" }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    const payload = await response.json();
    assert.equal(payload.data.length, 1);
    const bytes = Buffer.from(payload.data[0].b64_json, "base64");
    assertDecodablePng(bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), relay.sha256);
    assert.equal(relay.sha256, createHash("sha256").update(readFileSync(new URL("./fixtures/local-image-demo.png", import.meta.url))).digest("hex"));
  });
});

test("the chat shape returns the PNG as one markdown data URL", async () => {
  await withRelay({ shape: "chat" }, async (relay, listening) => {
    assert.equal((await post(`${listening.baseUrl}/images/generations`, { key: listening.apiKey })).status, 404);
    const response = await post(`${listening.baseUrl}/chat/completions`, {
      key: listening.apiKey,
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "p" }] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].finish_reason, "stop");
    const match = /^!\[image\]\(data:image\/png;base64,([A-Za-z0-9+/]+={0,2})\)$/.exec(payload.choices[0].message.content);
    assert.ok(match);
    const bytes = Buffer.from(match[1], "base64");
    assertDecodablePng(bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), relay.sha256);
  });
});

test("every Nth request fails with HTTP 500 after the delay", async () => {
  await withRelay({ failEvery: 2 }, async (_relay, listening) => {
    const url = `${listening.baseUrl}/images/generations`;
    const statuses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await post(url, { key: listening.apiKey });
      statuses.push(response.status);
      await response.arrayBuffer();
    }
    assert.deepEqual(statuses, [200, 500, 200, 500]);
  });
});

test("the delay is honoured and the slow mode waits far longer than a normal answer", async () => {
  await withRelay({ delayMs: 150 }, async (_relay, listening) => {
    const started = Date.now();
    const response = await post(`${listening.baseUrl}/images/generations`, { key: listening.apiKey });
    await response.arrayBuffer();
    assert.ok(Date.now() - started >= 140);
  });
  await withRelay({ delayMs: 0, slow: true, slowMs: 5_000 }, async (_relay, listening) => {
    const pending = post(`${listening.baseUrl}/images/generations`, { key: listening.apiKey }).catch((error) => error);
    const raced = await Promise.race([pending, new Promise((resolveRace) => setTimeout(() => resolveRace("still waiting"), 300))]);
    assert.equal(raced, "still waiting");
    // Closing while a request waits must not hang (withRelay closes it next).
    void pending;
  });
});

test("a caller that gives up while the relay waits does not crash it", async () => {
  await withRelay({ delayMs: 200 }, async (relay, listening) => {
    const controller = new AbortController();
    const pending = fetch(`${listening.baseUrl}/images/generations`, {
      method: "POST",
      headers: { authorization: `Bearer ${listening.apiKey}`, "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    }).catch((error) => error);
    setTimeout(() => controller.abort(), 40);
    assert.equal((await pending).name, "AbortError");
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    const response = await post(`${listening.baseUrl}/images/generations`, { key: listening.apiKey });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    assert.equal(relay.requests, 2);
  });
});
