import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { maxDuration as inquiryPlatformSeconds } from "../../../app/api/inquiry/route";
import { maxDuration as labelPlatformSeconds } from "../../../app/api/label/route";
import { maxDuration as repairPlatformSeconds } from "../../../app/api/repair/route";
import { maxDuration as textSwapPlatformSeconds } from "../../../app/api/text-swap/route";
import { maxDuration as transformPlatformSeconds } from "../../../app/api/turn/route";
import { ADMISSION_REPAIR_WINDOW_MS } from "../runtime/admission-repair";
import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  INQUIRY_ROUTE_TIMEOUT_MS,
} from "../protocol/inquiry-contract";
import {
  LABEL_CLIENT_TIMEOUT_MS,
  LABEL_PROVIDER_TIMEOUT_MS,
  LABEL_ROUTE_TIMEOUT_MS,
} from "../protocol/label-contract";
import {
  REPAIR_CLIENT_TIMEOUT_MS,
  REPAIR_PROVIDER_CEILING_MS,
  REPAIR_ROUTE_TIMEOUT_MS,
} from "../protocol/repair-contract";
import { TEXT_SWAP_CLIENT_TIMEOUT_MS } from "../protocol/text-swap-contract";
import { TRANSFORM_CLIENT_TIMEOUT_MS } from "../protocol/transform-contract";
import { INQUIRY_PROVIDER_DEADLINE_MS } from "../server/inquiry-harness";
import { LABEL_SCENARIO_DEADLINE_MS } from "../server/label-harness";
import { TEXT_SWAP_PROVIDER_TIMEOUT_MS } from "../server/text-swap-harness";
import { TEXT_SWAP_ROUTE_TIMEOUT_MS } from "../server/text-swap-route";
import { TRANSFORM_PROVIDER_TIMEOUT_MS } from "../server/transform-harness";
import { TRANSFORM_ROUTE_TIMEOUT_MS } from "../server/transform-route";
import { MODEL_DEADLINES } from "./model-deadlines";

describe("model delivery deadline lattice", () => {
  it.each([
    ["repair", REPAIR_PROVIDER_CEILING_MS, REPAIR_ROUTE_TIMEOUT_MS, REPAIR_CLIENT_TIMEOUT_MS, repairPlatformSeconds],
    ["label", LABEL_PROVIDER_TIMEOUT_MS, LABEL_ROUTE_TIMEOUT_MS, LABEL_CLIENT_TIMEOUT_MS, labelPlatformSeconds],
    ["inquiry", INQUIRY_PROVIDER_DEADLINE_MS, INQUIRY_ROUTE_TIMEOUT_MS, INQUIRY_CLIENT_TIMEOUT_MS, inquiryPlatformSeconds],
    ["transform", TRANSFORM_PROVIDER_TIMEOUT_MS, TRANSFORM_ROUTE_TIMEOUT_MS, TRANSFORM_CLIENT_TIMEOUT_MS, transformPlatformSeconds],
    ["text swap", TEXT_SWAP_PROVIDER_TIMEOUT_MS, TEXT_SWAP_ROUTE_TIMEOUT_MS, TEXT_SWAP_CLIENT_TIMEOUT_MS, textSwapPlatformSeconds],
  ] as const)("keeps attributable margins for %s", (_name, provider, route, client, platformSeconds) => {
    expect(route - provider).toBeGreaterThanOrEqual(1_000);
    expect(client - route).toBeGreaterThanOrEqual(1_000);
    expect(platformSeconds * 1_000 - client).toBeGreaterThanOrEqual(4_000);
  });

  it("keeps aliases and the repair authority lease on their real owners", () => {
    expect(LABEL_SCENARIO_DEADLINE_MS).toBe(MODEL_DEADLINES.label.providerMs);
    expect(ADMISSION_REPAIR_WINDOW_MS).toBe(MODEL_DEADLINES.repair.authorityLeaseMs);
    expect(REPAIR_CLIENT_TIMEOUT_MS).toBeLessThan(ADMISSION_REPAIR_WINDOW_MS);
  });

  it("keeps Next's required route literals aligned with the neutral owner", () => {
    expect(repairPlatformSeconds).toBe(MODEL_DEADLINES.repair.platformSeconds);
    expect(labelPlatformSeconds).toBe(MODEL_DEADLINES.label.platformSeconds);
    expect(inquiryPlatformSeconds).toBe(MODEL_DEADLINES.inquiry.platformSeconds);
    expect(transformPlatformSeconds).toBe(MODEL_DEADLINES.transform.platformSeconds);
    expect(textSwapPlatformSeconds).toBe(MODEL_DEADLINES.textSwap.platformSeconds);

    for (const [path, seconds] of [
      ["../../../app/api/repair/route.ts", repairPlatformSeconds],
      ["../../../app/api/label/route.ts", labelPlatformSeconds],
      ["../../../app/api/inquiry/route.ts", inquiryPlatformSeconds],
      ["../../../app/api/turn/route.ts", transformPlatformSeconds],
      ["../../../app/api/text-swap/route.ts", textSwapPlatformSeconds],
    ] as const) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).toContain(`export const maxDuration = ${seconds};`);
    }
  });
});
