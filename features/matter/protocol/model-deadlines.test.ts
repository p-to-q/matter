import { describe, expect, it } from "vitest";
import {
  LABEL_CLIENT_TIMEOUT_MS,
  LABEL_PROVIDER_TIMEOUT_MS,
  LABEL_ROUTE_TIMEOUT_MS,
} from "./label-contract";
import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  INQUIRY_ROUTE_TIMEOUT_MS,
} from "./inquiry-contract";
import {
  REPAIR_CLIENT_TIMEOUT_MS,
  REPAIR_PROVIDER_CEILING_MS,
  REPAIR_ROUTE_TIMEOUT_MS,
} from "./repair-contract";
import { INQUIRY_PROVIDER_DEADLINE_MS } from "../server/inquiry-harness";
import { maxDuration as inquiryMaxDuration } from "../../../app/api/inquiry/route";
import { maxDuration as labelMaxDuration } from "../../../app/api/label/route";
import { maxDuration as repairMaxDuration } from "../../../app/api/repair/route";

describe("model delivery deadline lattice", () => {
  it("leaves a distinct route and browser transport margin", () => {
    expect(REPAIR_PROVIDER_CEILING_MS).toBeLessThan(REPAIR_ROUTE_TIMEOUT_MS);
    expect(REPAIR_ROUTE_TIMEOUT_MS).toBeLessThan(REPAIR_CLIENT_TIMEOUT_MS);
    expect(LABEL_PROVIDER_TIMEOUT_MS).toBeLessThan(LABEL_ROUTE_TIMEOUT_MS);
    expect(LABEL_ROUTE_TIMEOUT_MS).toBeLessThan(LABEL_CLIENT_TIMEOUT_MS);
    expect(INQUIRY_PROVIDER_DEADLINE_MS).toBeLessThan(INQUIRY_ROUTE_TIMEOUT_MS);
    expect(INQUIRY_ROUTE_TIMEOUT_MS).toBeLessThan(INQUIRY_CLIENT_TIMEOUT_MS);
  });

  it("stays below each platform route allowance", () => {
    expect(REPAIR_CLIENT_TIMEOUT_MS).toBeLessThan(repairMaxDuration * 1_000);
    expect(LABEL_CLIENT_TIMEOUT_MS).toBeLessThan(labelMaxDuration * 1_000);
    expect(INQUIRY_CLIENT_TIMEOUT_MS).toBeLessThan(inquiryMaxDuration * 1_000);
  });
});
