import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import {
  createWikiOccurrenceRegistry,
  type WikiOccurrenceAttribution,
  type WikiOccurrenceRegistry,
} from "../wiki/wiki-occurrence-registry";

type OccurrenceOwnerSlot = Readonly<{ abi: 1; registry: WikiOccurrenceRegistry }>;

// One origin-local registry survives Fast Refresh beside the lexical port that
// mints into it; a second registry would orphan every live token.
const OWNER_KEY = Symbol.for("ptoq.matter.wiki-occurrence-registry");
const ownerHost = globalThis as unknown as {
  [key: symbol]: OccurrenceOwnerSlot | undefined;
};
const slot: OccurrenceOwnerSlot = ownerHost[OWNER_KEY]?.abi === 1
  ? ownerHost[OWNER_KEY]!
  : Object.freeze({ abi: 1, registry: createWikiOccurrenceRegistry() });
ownerHost[OWNER_KEY] = slot;
const registry = slot.registry;

const TOKEN_BYTES = 16;

/**
 * Mints one opaque random occurrence id for an applied edit. The id is never
 * derived from text or position; without a secure random source the edit
 * simply carries no attribution.
 */
export function mintMatterWikiOccurrence(attribution: WikiOccurrenceAttribution): string | null {
  const token = randomToken();
  if (token === null) return null;
  return registry.register(token, attribution, monotonicNow()) ? token : null;
}

/**
 * Keeps the tokens of one committed publication beyond the short unclaimed
 * window, and returns the publication narrowed to the edits still
 * attributable. A token released before its commit (the registry bound, its
 * unclaimed window) leaves its word corrected but unmarked, rather than
 * marking a word whose settlement nothing could record.
 */
export function claimMatterWikiPublication(
  publication: MaterialLexicalOccurrencePublication,
): MaterialLexicalOccurrencePublication {
  const nowMs = monotonicNow();
  const edits = publication.edits.filter((edit) => registry.claim(edit.occurrence, nowMs));
  return edits.length === publication.edits.length
    ? publication
    : Object.freeze({ ...publication, edits: Object.freeze(edits) });
}

/**
 * Keeps a committed occurrence attributable while the person decides about it
 * in the takeover or the Wiki surface it handed off to.
 */
export function renewMatterWikiOccurrence(occurrenceId: string): void {
  registry.renew(occurrenceId, monotonicNow());
}

/** Consumes one attribution; a second take of the same id returns nothing. */
export function takeMatterWikiOccurrence(occurrenceId: string): WikiOccurrenceAttribution | null {
  return registry.take(occurrenceId, monotonicNow());
}

function randomToken(): string | null {
  const source = globalThis.crypto;
  if (typeof source?.getRandomValues !== "function") return null;
  try {
    const bytes = source.getRandomValues(new Uint8Array(TOKEN_BYTES));
    let token = "";
    for (const byte of bytes) token += byte.toString(16).padStart(2, "0");
    return token;
  } catch {
    return null;
  }
}

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
