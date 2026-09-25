import { parseWikiState } from "./wiki-codec";
import { MAX_WIKI_STATE_BYTES, type WikiState } from "./wiki-model";

export const WIKI_EXPORT_FORMAT = "matter-wiki" as const;
export const WIKI_EXPORT_FORMAT_VERSION = 2 as const;
export const WIKI_EXPORT_FILE_NAME = "matter-wiki.json";
export const MAX_WIKI_EXPORT_BYTES = MAX_WIKI_STATE_BYTES * 2;

export type WikiExportEnvelope = Readonly<{
  format: typeof WIKI_EXPORT_FORMAT;
  formatVersion: typeof WIKI_EXPORT_FORMAT_VERSION;
  state: WikiState;
}>;

export type WikiExportResult =
  | Readonly<{ ok: true; bytes: Uint8Array; envelope: WikiExportEnvelope }>
  | Readonly<{ ok: false; code: "INVALID_STATE" | "BOUND_EXCEEDED" }>;

export type WikiExportParseResult =
  | Readonly<{ ok: true; envelope: WikiExportEnvelope }>
  | Readonly<{
      ok: false;
      code: "INVALID_ENCODING" | "INVALID_JSON" | "INVALID_FORMAT" | "BOUND_EXCEEDED";
    }>;

/** One deterministic, lossless format for personal Wiki authority and evidence. */
export function encodeWikiExport(state: unknown): WikiExportResult {
  const parsed = parseWikiState(state);
  if (!parsed.ok) return Object.freeze({ ok: false, code: "INVALID_STATE" });
  const envelope: WikiExportEnvelope = Object.freeze({
    format: WIKI_EXPORT_FORMAT,
    formatVersion: WIKI_EXPORT_FORMAT_VERSION,
    state: parsed.state,
  });
  const bytes = new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`);
  return bytes.byteLength <= MAX_WIKI_EXPORT_BYTES
    ? Object.freeze({ ok: true, bytes, envelope })
    : Object.freeze({ ok: false, code: "BOUND_EXCEEDED" });
}

/** Strict decoder keeps the export auditable without enabling an import UI. */
export function decodeWikiExport(input: Uint8Array): WikiExportParseResult {
  if (input.byteLength > MAX_WIKI_EXPORT_BYTES) {
    return Object.freeze({ ok: false, code: "BOUND_EXCEEDED" });
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return Object.freeze({ ok: false, code: "INVALID_ENCODING" });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }
  if (!isPlainObject(value) || !hasExactKeys(value, ["format", "formatVersion", "state"]) ||
      value.format !== WIKI_EXPORT_FORMAT ||
      value.formatVersion !== 1 && value.formatVersion !== WIKI_EXPORT_FORMAT_VERSION) {
    return Object.freeze({ ok: false, code: "INVALID_FORMAT" });
  }
  const state = parseWikiState(value.state);
  if (!state.ok) return Object.freeze({ ok: false, code: "INVALID_FORMAT" });
  return Object.freeze({
    ok: true,
    envelope: Object.freeze({
      format: WIKI_EXPORT_FORMAT,
      formatVersion: WIKI_EXPORT_FORMAT_VERSION,
      state: state.state,
    }),
  });
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
