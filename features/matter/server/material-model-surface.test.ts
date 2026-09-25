import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { materialModelSurfaceAuthorized } from "./material-model-surface";

describe("material model surface authority", () => {
  it.each([
    ["matter-transform", "MATTER_TRANSFORM_SURFACE"],
    ["matter-text-swap", "MATTER_TEXT_SWAP_SURFACE"],
  ] as const)("separates %s product authority from provider promotion", (scenario, gate) => {
    expect(materialModelSurfaceAuthorized(scenario, {
      NODE_ENV: "production",
      [gate]: "public",
      MATTER_TRANSFORM_ADAPTER: "off",
      MATTER_TEXT_SWAP_ADAPTER: "off",
    })).toBe(true);
    expect(materialModelSurfaceAuthorized(scenario, {
      NODE_ENV: "production",
      [gate]: "off",
      MATTER_TRANSFORM_ADAPTER: "live",
      MATTER_TEXT_SWAP_ADAPTER: "live",
    })).toBe(false);
  });

  it("fails closed on missing, unknown-runtime, or unknown surface declarations", () => {
    expect(materialModelSurfaceAuthorized("matter-transform", { NODE_ENV: "production" })).toBe(false);
    expect(materialModelSurfaceAuthorized("matter-transform", {})).toBe(false);
    expect(materialModelSurfaceAuthorized("matter-transform", { NODE_ENV: "staging" })).toBe(false);
    expect(materialModelSurfaceAuthorized("matter-transform", {
      NODE_ENV: "production",
      MATTER_TRANSFORM_SURFACE: "enabled",
    })).toBe(false);
    expect(materialModelSurfaceAuthorized("matter-transform", {
      NODE_ENV: "test",
      MATTER_TRANSFORM_SURFACE: "enabled",
    })).toBe(false);
  });

  it("preserves the local fixture path when no surface is declared", () => {
    expect(materialModelSurfaceAuthorized("matter-transform", { NODE_ENV: "test" })).toBe(true);
    expect(materialModelSurfaceAuthorized("matter-text-swap", { NODE_ENV: "development" })).toBe(true);
  });
});
