import { strict as assert } from "node:assert";
import { test } from "node:test";
import { acceptsIntegrationBudgetDebt } from "./build-main-integration.mjs";

const runtime = "runtime-artifact: Capability wiki-runtime uses 29610 gzip bytes; budget is 27648.";
const settings = "runtime-artifact: Capability wiki-settings uses 11745 gzip bytes; budget is 10752.";
const entry = "runtime-artifact: Capability wiki-settings entry features/matter/components/CanvasChrome.tsx -> ./WikiSettingsSection uses 49420 cold gzip bytes; entry budget is 49152.";
const authorityEntry = "runtime-artifact: Capability wiki-runtime entry features/matter/persistence/use-wiki-authority.ts -> ./wiki-runtime-core uses 35175 cold gzip bytes; entry budget is 34816.";
const bridgeEntry = "runtime-artifact: Capability wiki-runtime entry features/matter/persistence/wiki-runtime-bridge.ts -> ./wiki-runtime-core uses 35175 cold gzip bytes; entry budget is 34816.";
const initialAssets = "runtime-artifact: initial gzip assets uses 406022 bytes; budget is 405504.";

test("accepts only the named integration debt and expires on version change", () => {
  for (const output of [runtime, settings, entry, authorityEntry, bridgeEntry, initialAssets,
    [runtime, authorityEntry, bridgeEntry, settings, entry, initialAssets].join("\n")]) {
    assert.equal(acceptsIntegrationBudgetDebt("0.2.0-preview.64", 1, output), true);
    assert.equal(acceptsIntegrationBudgetDebt("0.2.0-preview.65", 1, output), false);
    assert.equal(acceptsIntegrationBudgetDebt("0.2.0", 1, output), false);
  }
});

test("never accepts compilation, global-budget, unrelated capability or malformed failures", () => {
  for (const output of ["", "Build failed", "runtime-artifact: Initial gzip exceeds budget.",
    "runtime-artifact: Capability persistence uses 99999 gzip bytes; budget is 27648.",
    runtime + "\nError: manifest missing", runtime.replace("27648", "99999"),
    authorityEntry.replace("use-wiki-authority", "another-owner"),
    authorityEntry.replace("34816", "99999"),
    bridgeEntry.replace("wiki-runtime-core", "another-capability"),
    initialAssets.replace("405504", "99999")]) {
    assert.equal(acceptsIntegrationBudgetDebt("0.2.0-preview.64", 1, output), false);
  }
  assert.equal(acceptsIntegrationBudgetDebt("0.2.0-preview.64", null, runtime), false);
  assert.equal(acceptsIntegrationBudgetDebt("0.2.0-preview.64", 2, runtime), false);
});
