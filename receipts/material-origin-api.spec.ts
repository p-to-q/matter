import { expect, test } from "@playwright/test";

import {
  formatMaterialProbeReport,
  runMaterialOriginProbe,
  type MaterialOriginProbeConfig,
} from "../scripts/material-origin-probe";

test("deployed material origin returns strict plans without exposing material", async () => {
  const config = readAuthorizedConfig(process.env.MATTER_MATERIAL_ORIGIN_PROBE_CONFIG);
  const summary = await runMaterialOriginProbe(config, {
    onSample: (sample) => {
      console.log(
        `material-origin: ${sample.surface.padEnd(9)} ${sample.outcome.padEnd(18)}` +
          ` ${String(sample.durationMs).padStart(6)} ms HTTP ${sample.status}`,
      );
    },
  });
  console.log(`material-origin: aggregate ${formatMaterialProbeReport(summary)}`);
  expect(summary.runOk, "the deployed material sampler did not produce a usable strict plan on both surfaces").toBe(true);
  if (config.profile === "promotion") {
    expect(summary.promotionReady, "the 50+50 deployed material receipt missed its frozen operational bound").toBe(true);
  }
});

function readAuthorizedConfig(value: string | undefined): MaterialOriginProbeConfig {
  if (value === undefined) {
    throw new Error("The deployed material receipt can run only through its explicit probe launcher.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The deployed material receipt configuration is invalid.");
  }
  if (!isRecord(parsed)) throw new Error("The deployed material receipt configuration is invalid.");
  return parsed as MaterialOriginProbeConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
