import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "../../../app/api/health/route";
import { healthSnapshot } from "../server/health-route";
import { readImageSurfaceAvailability } from "./image-surface-availability";

/**
 * The browser reads one literal out of the health document and the server
 * writes it from another file. Each side tests itself against a hand-written
 * copy of the other, so renaming the server's word would hide the control with
 * every unit test green. This reads the real document through the real reader.
 */

const originalEnvironment = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnvironment };
});

function configure(adapter: string, pools: boolean) {
  vi.stubEnv("NODE_ENV", "production");
  for (const name of Object.keys(process.env)) {
    if (/^MATTER_(MODEL|IMAGE|LABEL)_/u.test(name)) delete process.env[name];
  }
  delete process.env.MATTER_PROVIDER_SESSION_KEYS;
  process.env.MATTER_IMAGE_ADAPTER = adapter;
  if (!pools) return;
  process.env.MATTER_MODEL_POOL = "primary";
  process.env.MATTER_MODEL_PRIMARY_BASE_URL = "https://models.example/v1";
  process.env.MATTER_MODEL_PRIMARY_API_KEY = "test-only";
  process.env.MATTER_MODEL_PRIMARY_MODELS = "fast";
  process.env.MATTER_IMAGE_POOL = "draw";
  process.env.MATTER_IMAGE_DRAW_BASE_URL = "https://images.example/v1";
  process.env.MATTER_IMAGE_DRAW_API_KEY = "test-only";
  process.env.MATTER_IMAGE_DRAW_MODELS = "image-a";
  process.env.MATTER_IMAGE_DRAW_SHAPE = "images";
}

const readThroughHealthRoute = () => readImageSurfaceAvailability({
  fetch: async () => GET(),
});

describe("the picture control against the real health document", () => {
  it("is available for a configured, open profile", async () => {
    configure("live", true);

    expect(healthSnapshot().surfaces.imageGeneration).toBe("available");
    await expect(readThroughHealthRoute()).resolves.toBe("available");
  });

  it.each([
    ["a closed gate", "off", true],
    ["a live gate with no relay configured", "live", false],
    ["a fixture, which is never a reason to offer a paid control", "fixture", true],
  ] as const)("is unavailable for %s", async (_label, adapter, pools) => {
    configure(adapter, pools);

    await expect(readThroughHealthRoute()).resolves.toBe("unavailable");
  });

  it("is unavailable when the document does not carry the surface at all", async () => {
    configure("live", true);
    const document = await GET().json() as { surfaces: Record<string, unknown> };
    delete document.surfaces.imageGeneration;

    await expect(readImageSurfaceAvailability({ fetch: async () => Response.json(document) }))
      .resolves.toBe("unavailable");
  });
});
