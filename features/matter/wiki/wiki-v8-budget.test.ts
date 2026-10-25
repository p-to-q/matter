import { describe, expect, it } from "vitest";
import { createEmptyWikiState, createInitialWikiState } from "./wiki-evidence";
import { encodeWikiStateAsV7, parseWikiState, wikiStateStorageBytes, type WikiV7State } from "./wiki-codec";
import { validateWikiState } from "./wiki-invariants";
import { encodeWikiExport, decodeWikiExport, MAX_WIKI_EXPORT_BYTES } from "./wiki-export";
import { MAX_WIKI_STATE_BYTES, MAX_WIKI_V7_STATE_BYTES, MAX_WIKI_V8_MIGRATION_HEADROOM_BYTES,
  MAX_WIKI_LEXEMES, MAX_WIKI_TOMBSTONES } from "./wiki-model";

describe("V8 lossless rollback subset and additive bytes", () => {
  it("adds exactly 206 bytes to an empty V7 state within its 256-byte allowance", () => {
    const state = createEmptyWikiState();
    const encoded = encodeWikiStateAsV7(state);
    if (!encoded.ok) throw new Error("The empty state must be representable.");
    expect(wikiStateStorageBytes(state) - wikiStateStorageBytes(encoded.state)).toBe(206);
    expect(MAX_WIKI_V8_MIGRATION_HEADROOM_BYTES).toBe(256);
    expect(MAX_WIKI_STATE_BYTES).toBe(MAX_WIKI_V7_STATE_BYTES + 256);
    expect(parseWikiState(encoded.state)).toEqual({ ok: true, state });
  });

  it("refuses every nonrepresentable V8 fact instead of silently discarding it", () => {
    const state = createInitialWikiState();
    for (const candidate of [
      { ...state, outcomeCounters: { ...state.outcomeCounters, reverted: 1 } },
      { ...state, preferences: { ...state.preferences, nearSound: [{ locale: "en-US" as const, enabled: false }] } },
      { ...state, lexemes: state.lexemes.map((entry) => entry.id === 1
        ? { ...entry, provenance: "learned" as const, confirmedAtRevision: 0 } : entry) },
      { ...state, lexemes: state.lexemes.map((entry) => entry.id === 1
        ? { ...entry, provenance: "imported" as const, importBatchId: "batch-1", confirmedAtRevision: 0 } : entry) },
      { ...state, ruleMaturity: [{ lexemeId: 4, channel: "spoken" as const, boundary: "word" as const,
        form: "P to Q", keptSettlements: 1 as const, establishedAt: null, lastRevertedAtRevision: null }] },
    ]) expect(encodeWikiStateAsV7(candidate).ok).toBe(false);
  });

  it("does not change provenance through legacy starter inference", () => {
    const state = createInitialWikiState();
    const customStarter = { ...state, lexemes: state.lexemes.map((entry) => entry.id === 1
      ? { ...entry, canonical: "Custom" } : entry) };
    expect(validateWikiState(customStarter).ok).toBe(false);
    expect(encodeWikiStateAsV7(customStarter).ok).toBe(false);
    const collectedStarter = { ...state, lexemes: state.lexemes.map((entry) => entry.id === 1
      ? { ...entry, provenance: "collected" as const } : entry) };
    expect(validateWikiState(collectedStarter).ok).toBe(true);
    expect(encodeWikiStateAsV7(collectedStarter).ok).toBe(false);
    const manualStarter = { ...state, lexemes: state.lexemes.map((entry) => entry.id === 1
      ? { ...entry, provenance: "manual" as const, confirmedAtRevision: 0 } : entry) };
    const manual = encodeWikiStateAsV7(manualStarter);
    expect(manual.ok).toBe(true);
    if (manual.ok) expect(parseWikiState(manual.state)).toEqual({ ok: true, state: manualStarter });
  });

  it("keeps a valid maximum-byte legacy recovery row saveable and exportable", () => {
    const empty = encodeWikiStateAsV7(createEmptyWikiState());
    if (!empty.ok) throw new Error("The empty fixture must be representable.");
    const lexemes = Array.from({ length: MAX_WIKI_LEXEMES }, (_, index) => ({ id: index + 1,
      locale: "en-US" as const, canonical: `T${index.toString().padStart(5, "0")}`,
      scope: "both" as const, provenance: "human-confirmed" as const, confirmedAtRevision: 1 }));
    const tombstones = Array.from({ length: MAX_WIKI_TOMBSTONES }, (_, index) => ({
        lexemeId: index + 1, channel: "spoken" as const, boundary: "word" as const,
        form: "source", rejectedAtRevision: 1 }));
    const legacy: WikiV7State = { ...empty.state, revision: 1, nextLexemeId: MAX_WIKI_LEXEMES + 1,
      lexemes, aliasTombstones: tombstones };
    let remaining = MAX_WIKI_V7_STATE_BYTES - wikiStateStorageBytes(legacy);
    for (const entry of lexemes) {
      const count = Math.min(122, Math.floor(remaining / 4));
      entry.canonical += "😀".repeat(count);
      remaining -= count * 4;
      if (remaining > 0 && remaining < 4 && count < 122) {
        entry.canonical += "x".repeat(remaining);
        remaining = 0;
      }
    }
    for (const entry of tombstones) {
      const count = Math.min(58, Math.floor(remaining / 4));
      entry.form += "😀".repeat(count);
      remaining -= count * 4;
      if (remaining > 0 && remaining < 4 && count < 58) {
        entry.form += "x".repeat(remaining);
        remaining = 0;
      }
    }
    expect(remaining).toBe(0);
    expect(wikiStateStorageBytes(legacy)).toBe(MAX_WIKI_V7_STATE_BYTES);
    const migrated = parseWikiState(legacy);
    if (!migrated.ok) throw new Error(migrated.message);
    expect(wikiStateStorageBytes(migrated.state)).toBeLessThanOrEqual(MAX_WIKI_STATE_BYTES);
    expect(wikiStateStorageBytes(migrated.state) - wikiStateStorageBytes(legacy)).toBeLessThanOrEqual(256);
    const exported = encodeWikiExport(migrated.state);
    if (!exported.ok) throw new Error(exported.code);
    expect(exported.bytes.byteLength).toBeLessThanOrEqual(MAX_WIKI_EXPORT_BYTES);
    expect(decodeWikiExport(exported.bytes)).toMatchObject({ ok: true });
  });

  it("truthfully refuses future Wiki exports and oversized bytes", () => {
    const future = new TextEncoder().encode(JSON.stringify({ format: "matter-wiki", formatVersion: 2,
      state: { ...createEmptyWikiState(), schemaVersion: 9 } }));
    expect(decodeWikiExport(future)).toEqual({ ok: false, code: "NEWER_VERSION" });
    expect(decodeWikiExport(new Uint8Array(MAX_WIKI_EXPORT_BYTES + 1)))
      .toEqual({ ok: false, code: "BOUND_EXCEEDED" });
  });
});
