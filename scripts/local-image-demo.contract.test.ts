import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { IMAGE_REQUEST_VERSION, IMAGE_RESPONSE_HEADERS } from "../features/matter/protocol/image-contract";
import { PROTOCOL_VERSION } from "../features/matter/tree/model";
import { resetImageAdmissionForTests } from "../features/matter/server/image-admission";
import { imageErrorResponse } from "../features/matter/server/image-errors";
import { FIXTURE_IMAGE_DATA_URL, fixtureImageBriefAdapter } from "../features/matter/server/image-fixtures";
import { handleImageRequest, resetImageGovernors } from "../features/matter/server/image-route";
import { imageSurfaceConfigured, imageSurfaceMode } from "../features/matter/server/image-surface";
import {
  IMAGE_POOL_LIMITS,
  createPoolAdapter,
  readImagePool,
  readModelPool,
} from "../features/matter/server/model-pool";

// The launcher is plain .mjs and cannot import the TypeScript readers, so this
// file holds it against the real ones. The specifier is a variable on purpose:
// the module has no declarations and `allowJs` is off.
type Relay = { apiKey: string; baseUrl: string; port: number };
type Launcher = {
  parseLocalImageDemoArguments(args: readonly string[]): Record<string, unknown>;
  createLocalImageDemoEnvironment(
    environment: Record<string, string | undefined>,
    options: Record<string, unknown>,
    relay?: Relay | null,
  ): Record<string, string | undefined>;
  createFakeImageRelay(options: Record<string, unknown>): {
    sha256: string;
    listen(): Promise<Relay>;
    close(): Promise<void>;
  };
};
const launcherUrl = pathToFileURL(resolve("scripts/local-image-demo.mjs")).href;
const launcher = (await import(/* @vite-ignore */ launcherUrl)) as Launcher;

const DEVELOPER = Object.freeze({
  MATTER_MODEL_POOL: "primary",
  MATTER_MODEL_PRIMARY_BASE_URL: "https://models.example.invalid/v1",
  MATTER_MODEL_PRIMARY_API_KEY: "dev-secret",
  MATTER_MODEL_PRIMARY_MODELS: "model-a",
  MATTER_IMAGE_POOL: "draw-images",
  MATTER_IMAGE_DRAW_IMAGES_BASE_URL: "https://images.example.invalid/v1",
  MATTER_IMAGE_DRAW_IMAGES_API_KEY: "dev-image-secret",
  MATTER_IMAGE_DRAW_IMAGES_MODELS: "image-a",
  MATTER_IMAGE_DRAW_IMAGES_SHAPE: "images",
});

beforeEach(() => {
  resetImageAdmissionForTests();
  resetImageGovernors();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("local image demo fixture", () => {
  it("is exactly the PNG the repository's image fixture builder produces", () => {
    const fixture = readFileSync("scripts/fixtures/local-image-demo.png");
    const built = Buffer.from(FIXTURE_IMAGE_DATA_URL.slice(FIXTURE_IMAGE_DATA_URL.indexOf(",") + 1), "base64");
    expect(fixture.equals(built)).toBe(true);
  });
});

describe("local image demo against the real readers and route", () => {
  it("real image stations pass through the real readers with the gate live", () => {
    const options = launcher.parseLocalImageDemoArguments([]);
    const environment = launcher.createLocalImageDemoEnvironment({ ...DEVELOPER }, options);
    expect(imageSurfaceMode(environment)).toBe("live");
    expect(imageSurfaceConfigured(environment)).toBe(true);
    expect(readModelPool(environment).map((candidate) => candidate.baseUrl)).toEqual(["https://models.example.invalid/v1"]);
    expect(readImagePool(environment).map((candidate) => candidate.baseUrl)).toEqual(["https://images.example.invalid/v1"]);
  });

  for (const shape of ["images", "chat"] as const) {
    describe(`fake image relay, ${shape} shape`, () => {
      it("is the only image station the runtime sees, even after Next merges .env.local", async () => {
        const relay = launcher.createFakeImageRelay({ shape, delayMs: 0 });
        const listening = await relay.listen();
        try {
          const options = launcher.parseLocalImageDemoArguments(["--fake-image", `--image-shape=${shape}`]);
          const ours = launcher.createLocalImageDemoEnvironment({ ...DEVELOPER }, options, listening);
          // Next fills in only variables that are absent; simulate its .env.local load.
          const merged = { ...DEVELOPER, ...ours };
          const pool = readImagePool(merged);
          expect(pool).toHaveLength(1);
          expect(pool[0]?.baseUrl).toBe(listening.baseUrl);
          expect(new URL(pool[0]!.baseUrl).hostname).toBe("127.0.0.1");
          expect(imageSurfaceMode(merged)).toBe("live");
          expect(imageSurfaceConfigured(merged)).toBe(true);
          // The chat pool is still the developer's own.
          expect(readModelPool(merged).map((candidate) => candidate.apiKey)).toEqual(["dev-secret"]);
        } finally {
          await relay.close();
        }
      });

      it("draws through the real image route and transport with the contract's headers", async () => {
        const relay = launcher.createFakeImageRelay({ shape, delayMs: 0 });
        const listening = await relay.listen();
        try {
          const options = launcher.parseLocalImageDemoArguments(["--fake-image", `--image-shape=${shape}`]);
          const environment = launcher.createLocalImageDemoEnvironment({ ...DEVELOPER }, options, listening);
          const response = await post(environment);
          expect(response.status).toBe(200);
          expect(response.headers.get("content-type")).toBe("image/png");
          expect(response.headers.get(IMAGE_RESPONSE_HEADERS.width)).toBe("1024");
          expect(response.headers.get(IMAGE_RESPONSE_HEADERS.height)).toBe("1024");
          const bytes = Buffer.from(await response.arrayBuffer());
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          expect(sha256).toBe(relay.sha256);
          expect(response.headers.get(IMAGE_RESPONSE_HEADERS.sha256)).toBe(sha256);
        } finally {
          await relay.close();
        }
      });
    });
  }

  it("a failing fake relay settles as a refusal, not a picture", async () => {
    const relay = launcher.createFakeImageRelay({ shape: "images", delayMs: 0, failEvery: 1 });
    const listening = await relay.listen();
    try {
      const options = launcher.parseLocalImageDemoArguments(["--fake-image"]);
      const environment = launcher.createLocalImageDemoEnvironment({ ...DEVELOPER }, options, listening);
      const response = await post(environment);
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.headers.get("content-type")).not.toBe("image/png");
    } finally {
      await relay.close();
    }
  });
});

function post(environment: Record<string, string | undefined>): Promise<Response> {
  const image = createPoolAdapter(readImagePool(environment), IMAGE_POOL_LIMITS);
  const request = new Request("http://localhost:3000/matter/api/image", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      requestVersion: IMAGE_REQUEST_VERSION,
      id: "img_local",
      locale: "en-US",
      passage: { nodeId: "thought1", text: "A hand reaching past the edge of a table." },
    }),
  });
  // The text step is the developer's real pool in production; a fixed brief
  // stands in for it here so the test sends nothing off the machine.
  return handleImageRequest(request, { brief: fixtureImageBriefAdapter, image }, { environment })
    .catch(imageErrorResponse);
}
