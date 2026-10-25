import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import {
  createWikiOccurrenceRegistry,
  type WikiOccurrenceAttribution,
  type WikiOccurrenceRegistry,
} from "../wiki/wiki-occurrence-registry";
import { MAX_WIKI_OUTCOME_COUNT, type WikiAppliedRule } from "../wiki/wiki-model";
import type { WikiTransientOutcomes } from "../wiki/wiki-diagnostics";

type OccurrenceOwnerSlot = Readonly<{ abi: 1; registry: WikiOccurrenceRegistry;
  outcomes?: { current: WikiTransientOutcomes } }>;

// One origin-local registry survives Fast Refresh beside the lexical port that
// mints into it; a second registry would orphan every live token.
const OWNER_KEY = Symbol.for("ptoq.matter.wiki-occurrence-registry");
const ownerHost = globalThis as unknown as {
  [key: symbol]: OccurrenceOwnerSlot | undefined;
};
const previous = ownerHost[OWNER_KEY];
const slot = Object.freeze({ abi: 1 as const,
  registry: previous?.abi === 1 && typeof previous.registry.revokePassiveBefore === "function"
    ? previous.registry : createWikiOccurrenceRegistry(),
  outcomes: previous?.outcomes ?? { current: Object.freeze({ censored: 0, failed: 0, unattributed: 0 }) },
});
ownerHost[OWNER_KEY] = slot;
const registry = slot.registry;

const TOKEN_BYTES = 16;

export function recordMatterWikiTransientOutcome(outcome: keyof WikiTransientOutcomes): void {
  slot.outcomes.current = Object.freeze({ ...slot.outcomes.current,
    [outcome]: Math.min(MAX_WIKI_OUTCOME_COUNT, slot.outcomes.current[outcome] + 1) });
}

export const readMatterWikiTransientOutcomes = (): WikiTransientOutcomes => slot.outcomes.current;

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
export function takeMatterWikiOccurrence(occurrenceId: string, passive = false): WikiOccurrenceAttribution | null {
  return registry.take(occurrenceId, monotonicNow(), passive);
}

export function revokeMatterWikiPassiveBefore(revision: number): void {
  registry.revokePassiveBefore(revision);
}

export function revokeMatterWikiOccurrences(rule: WikiAppliedRule, revision: number): void {
  registry.revokeAppliedBefore(rule, revision);
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
