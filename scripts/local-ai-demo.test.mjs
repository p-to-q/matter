import assert from "node:assert/strict";
import test from "node:test";

import {
  assertConfiguredPool,
  assertLocalDemoPortAvailable,
  createLocalAiDemoEnvironment,
  localAiDemoExitCode,
  localAiDemoSummary,
  parseLocalAiDemoArguments,
} from "./local-ai-demo.mjs";

function pool(overrides = {}) {
  return {
    PATH: "/usr/bin",
    MATTER_MODEL_POOL: "primary",
    MATTER_MODEL_PRIMARY_BASE_URL: "https://models.example.invalid/v1",
    MATTER_MODEL_PRIMARY_API_KEY: "secret",
    MATTER_MODEL_PRIMARY_MODELS: "model-a",
    ...overrides,
  };
}

test("parses a bounded port and makes live surfaces explicit options", () => {
  assert.deepEqual(parseLocalAiDemoArguments([]), {
    liveLabel: false,
    liveTransform: false,
    port: 3000,
  });
  assert.deepEqual(parseLocalAiDemoArguments(["--port=3210", "--live-label", "--live-transform"]), {
    liveLabel: true,
    liveTransform: true,
    port: 3210,
  });
  assert.throws(() => parseLocalAiDemoArguments(["--port=80"]), /1024/);
  assert.throws(() => parseLocalAiDemoArguments(["--unknown"]), /Unknown/);
});

test("builds an explicit hybrid demo without weakening production gates", () => {
  const environment = createLocalAiDemoEnvironment(pool({ MATTER_TRANSFORM_ADAPTER: "live" }), {
    liveLabel: false,
    liveTransform: false,
    port: 3000,
  });
  assert.equal(environment.MATTER_TRANSFORM_ADAPTER, "fixture");
  assert.equal(environment.MATTER_TEXT_SWAP_ADAPTER, "live");
  assert.equal(environment.MATTER_TRANSFORM_SURFACE, "public");
  assert.equal(environment.MATTER_TEXT_SWAP_SURFACE, "public");
  assert.equal(environment.MATTER_LABEL_ADAPTER, "fixture");
  assert.equal(environment.MATTER_INQUIRY_ADAPTER, "live");
  assert.equal(environment.MATTER_TRANSCRIPTION_ADAPTER, "browser");
  assert.equal(environment.NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED, "true");
  const summary = localAiDemoSummary(environment, {
    liveLabel: false,
    liveTransform: false,
    port: 3000,
  }).join("\n");
  assert.match(summary, /productionGo=false/);
  assert.match(summary, /opening the page sends no provider request/);
  assert.doesNotMatch(summary, /secret|models\.example|model-a/u);
});

test("allows live Elastic only when the operator asks for it", () => {
  const environment = createLocalAiDemoEnvironment(pool(), {
    liveLabel: true,
    liveTransform: true,
    port: 3000,
  });
  assert.equal(environment.MATTER_TRANSFORM_ADAPTER, "live");
  assert.equal(environment.MATTER_TEXT_SWAP_ADAPTER, "live");
  assert.equal(environment.MATTER_LABEL_ADAPTER, "live");
  const summary = localAiDemoSummary(environment, {
    liveLabel: true,
    liveTransform: true,
    port: 3000,
  }).join("\n");
  assert.match(summary, /experimental/);
  assert.match(summary, /opening or using the page may send visible material/);
});

test("fails closed on absent, ambiguous, incomplete, or unsafe pools", () => {
  assert.throws(() => assertConfiguredPool({}), /must be configured/);
  assert.throws(() => assertConfiguredPool(pool({ MATTER_LABEL_POOL: "legacy" })), /exactly one/);
  assert.throws(() => assertConfiguredPool(pool({ MATTER_MODEL_PRIMARY_API_KEY: "" })), /base URL, key, and model/);
  assert.throws(() => assertConfiguredPool(pool({ MATTER_MODEL_PRIMARY_MODELS: " , " })), /base URL, key, and model/);
  assert.throws(() => assertConfiguredPool(pool({ MATTER_MODEL_PRIMARY_ENABLE_THINKING: "no" })), /true or false/);
  assert.throws(() => assertConfiguredPool(pool({ MATTER_MODEL_PRIMARY_BASE_URL: "http://models.example.invalid/v1" })), /HTTPS/);
  assert.throws(() => assertConfiguredPool(pool({ MATTER_MODEL_PRIMARY_BASE_URL: "http://[::1]:11434/v1" })), /HTTPS/);
  assert.doesNotThrow(() => assertConfiguredPool(pool({ MATTER_MODEL_PRIMARY_BASE_URL: "http://127.0.0.1:11434/v1" })));
});

test("reports an unexpected child signal as failure without penalising an operator stop", () => {
  assert.equal(localAiDemoExitCode(0, null, null), 0);
  assert.equal(localAiDemoExitCode(2, null, null), 2);
  assert.equal(localAiDemoExitCode(null, "SIGINT", "SIGINT"), 0);
  assert.equal(localAiDemoExitCode(null, "SIGTERM", "SIGINT"), 1);
  assert.equal(localAiDemoExitCode(null, "SIGKILL", null), 1);
  assert.equal(localAiDemoExitCode(null, null, null), 1);
});

test("checks both localhost families and rejects either occupied endpoint", async () => {
  const checked = [];
  await assertLocalDemoPortAvailable(3000, async (host, port) => {
    checked.push([host, port]);
  });
  assert.deepEqual(checked, [["127.0.0.1", 3000], ["::1", 3000]]);

  await assert.rejects(
    assertLocalDemoPortAvailable(3000, async (host) => {
      if (host === "::1") throw Object.assign(new Error("busy"), { code: "EADDRINUSE" });
    }),
    /already in use on localhost \(::1\)/,
  );
});
