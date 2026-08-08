import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEDICATED_DOMAIN_BUILD_SHAPE,
  DEDICATED_DOMAIN_RUNTIME_SHAPE,
  VERCEL_BUILD_COMMAND_MAX_LENGTH,
  inspectVercelConfig,
} from "./check-vercel-config.mjs";

function validConfig() {
  return {
    framework: "nextjs",
    buildCommand: "npm run build",
    regions: ["hkg1"],
    build: { env: { ...DEDICATED_DOMAIN_BUILD_SHAPE } },
    env: { ...DEDICATED_DOMAIN_RUNTIME_SHAPE, MATTER_LABEL_ADAPTER: "live" },
  };
}

test("accepts the committed deployment configuration", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  assert.deepEqual(inspectVercelConfig(config), []);
});

test("accepts a minimal configuration carrying both shapes", () => {
  assert.deepEqual(inspectVercelConfig(validConfig()), []);
});

test("rejects a configuration with no region pinned near the model pool", () => {
  const config = validConfig();
  delete config.regions;
  assert.match(inspectVercelConfig(config).join("\n"), /region close to the model pool/);
});

test("rejects a build command longer than Vercel's schema allows", () => {
  // The exact regression that failed every production deployment from
  // Preview.8 to Preview.12: the build shape inlined as a command prefix.
  const config = validConfig();
  config.buildCommand = `${"MATTER_BASE_PATH= ".repeat(20)}npm run build`;
  assert.ok(config.buildCommand.length > VERCEL_BUILD_COMMAND_MAX_LENGTH);
  assert.match(inspectVercelConfig(config).join("\n"), /Vercel rejects more than 256/);
});

test("accepts a build command exactly at the bound and rejects one character more", () => {
  const atBound = validConfig();
  atBound.buildCommand = "x".repeat(VERCEL_BUILD_COMMAND_MAX_LENGTH);
  assert.deepEqual(inspectVercelConfig(atBound), []);

  const overBound = validConfig();
  overBound.buildCommand = "x".repeat(VERCEL_BUILD_COMMAND_MAX_LENGTH + 1);
  assert.equal(inspectVercelConfig(overBound).length, 1);
});

test("rejects a dedicated-domain build that would ship the /matter base path", () => {
  const config = validConfig();
  config.build.env.MATTER_BASE_PATH = "/matter";
  assert.match(inspectVercelConfig(config).join("\n"), /build\.env MATTER_BASE_PATH is "\/matter"/);
});

test("rejects a build that drops a value the client bundle needs", () => {
  const config = validConfig();
  delete config.build.env.NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED;
  assert.match(
    inspectVercelConfig(config).join("\n"),
    /build\.env is missing NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED/,
  );
});

test("rejects a runtime shape that would make the health probe untruthful", () => {
  const config = validConfig();
  delete config.env.MATTER_TRANSCRIPTION_ADAPTER;
  assert.match(inspectVercelConfig(config).join("\n"), /env is missing MATTER_TRANSCRIPTION_ADAPTER/);
});

test("does not require the build-inlined public flags at runtime", () => {
  const config = validConfig();
  assert.ok(!("NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED" in config.env));
  assert.deepEqual(inspectVercelConfig(config), []);
});

test("rejects a build value that disagrees with the same runtime value", () => {
  const config = validConfig();
  config.env.NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED = "true";
  config.build.env.NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED = "false";
  assert.match(
    inspectVercelConfig(config).join("\n"),
    /NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED is "false" at build and "true" at runtime/,
  );
});

test("rejects a credential by key name and by value shape", () => {
  const named = validConfig();
  named.env.MATTER_LABEL_AIPING_API_KEY = "placeholder";
  assert.match(inspectVercelConfig(named).join("\n"), /encrypted Vercel store/);

  const shaped = validConfig();
  // Shaped like a provider key, but not one: never place real key material,
  // whole or partial, in a file this repository can publish.
  shaped.build.env.MATTER_LABEL_EXAMPLE_RELAY = "XX-000000000000000000000000000000";
  assert.match(inspectVercelConfig(shaped).join("\n"), /credential-shaped value/);
});

test("does not mistake an ordinary configuration value for a credential", () => {
  const config = validConfig();
  config.env.MATTER_LABEL_POOL = "abc,aiping";
  config.env.MATTER_LABEL_AIPING_MODELS = "Qwen3.5-Flash,GLM-4.7-Flash";
  assert.deepEqual(inspectVercelConfig(config), []);
});

test("reports a missing or malformed configuration whole", () => {
  assert.deepEqual(inspectVercelConfig(null), ["vercel.json is not a JSON object."]);
  assert.deepEqual(inspectVercelConfig([]), ["vercel.json is not a JSON object."]);

  const noEnv = { framework: "nextjs", buildCommand: "npm run build" };
  const failures = inspectVercelConfig(noEnv);
  assert.ok(failures.includes("vercel.json build.env is missing."));
  assert.ok(failures.includes("vercel.json env is missing."));
});
