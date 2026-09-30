import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import type { ThoughtTree } from "../tree/model";
import { settleWikiImplicitOccurrence } from "../wiki/wiki-learning-policy";
import { WIKI_OCCURRENCE_REGISTRY_BOUNDS } from "../wiki/wiki-occurrence-registry";

/**
 * Pure lifecycle of one committed Wiki occurrence:
 * `pending → perceived → settled | censored`, each exactly once.
 *
 * It owns no clock, DOM, or storage: the browser driver measures time,
 * visibility, and geometry and feeds them here as values. The occurrence's
 * only tie to material is its committed address, so Material Undo is never
 * observed; an address that stops holding simply censors the occurrence.
 */

export const WIKI_OCCURRENCE_PERCEPTION = Object.freeze({
  /** Cumulative time the disclosed word must be perceivable. */
  visibleMs: 1_500,
  /** Share of the word's painted area inside the visual viewport. */
  viewportFraction: 0.5,
});

/** Settles before the registry forgets the attribution it would record. */
export const WIKI_OCCURRENCE_LIFETIME_MS = WIKI_OCCURRENCE_REGISTRY_BOUNDS.claimedTtlMs - 15_000;

/**
 * Live occurrences beyond this are censored oldest first. It is the registry's
 * claimed bound, so every live mark keeps a claimed attribution the registry
 * never evicts to make room for a newer candidate.
 */
export const MAX_LIVE_WIKI_OCCURRENCES = WIKI_OCCURRENCE_REGISTRY_BOUNDS.maxClaimed;

export type WikiOccurrenceAddress = Readonly<{
  treeId: string;
  documentEpoch: number;
  nodeId: string;
  nodeUpdatedAt: string;
  start: number;
  end: number;
  /** The committed canonical word at the address. */
  canonicalText: string;
}>;

export type WikiOccurrenceProgress = Readonly<{
  /** The morph ran, or the static mark was painted where motion is off. */
  disclosed: boolean;
  /** Cumulative perceivable time before perception. */
  visibleMs: number;
  perceived: boolean;
  /** Informed facts, counted only after perception. */
  furtherAdmissions: number;
  dwellMs: number;
  copiedOrExported: boolean;
}>;

export type LiveWikiOccurrence = Readonly<{
  id: string;
  address: WikiOccurrenceAddress;
  /** The heard form. Transient content: memory only, never stored or logged. */
  sourceText: string;
  admittedAtMs: number;
  progress: WikiOccurrenceProgress;
}>;

export type MaterialView = Readonly<{ tree: ThoughtTree; documentEpoch: number }>;

export const INITIAL_WIKI_OCCURRENCE_PROGRESS: WikiOccurrenceProgress = Object.freeze({
  disclosed: false,
  visibleMs: 0,
  perceived: false,
  furtherAdmissions: 0,
  dwellMs: 0,
  copiedOrExported: false,
});

/**
 * Opens one live occurrence per attributed edit whose committed word still
 * stands. A publication that no longer matches the current material yields
 * nothing: it was overtaken before anyone could see it.
 */
export function admitWikiOccurrences(
  publication: MaterialLexicalOccurrencePublication,
  material: MaterialView,
  nowMs: number,
): readonly LiveWikiOccurrence[] {
  const node = material.tree.nodes[publication.nodeId];
  if (
    node === undefined ||
    material.tree.id !== publication.treeId ||
    material.documentEpoch !== publication.documentEpoch ||
    node.updatedAt !== publication.nodeUpdatedAt
  ) return Object.freeze([]);
  const admitted: LiveWikiOccurrence[] = [];
  for (const edit of publication.edits) {
    if (
      !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) ||
      edit.start < 0 || edit.end <= edit.start || edit.end > node.text.length
    ) continue;
    admitted.push(Object.freeze({
      id: edit.occurrence,
      address: Object.freeze({
        treeId: publication.treeId,
        documentEpoch: publication.documentEpoch,
        nodeId: publication.nodeId,
        nodeUpdatedAt: publication.nodeUpdatedAt,
        start: edit.start,
        end: edit.end,
        canonicalText: node.text.slice(edit.start, edit.end),
      }),
      sourceText: edit.sourceText,
      admittedAtMs: nowMs,
      progress: INITIAL_WIKI_OCCURRENCE_PROGRESS,
    }));
  }
  return Object.freeze(admitted);
}

/** Whether the unchanged word still stands at its exact committed address. */
export function wikiOccurrenceAddressHolds(
  address: WikiOccurrenceAddress,
  material: MaterialView,
): boolean {
  const node = material.tree.nodes[address.nodeId];
  return node !== undefined &&
    material.tree.id === address.treeId &&
    material.documentEpoch === address.documentEpoch &&
    node.updatedAt === address.nodeUpdatedAt &&
    node.text.slice(address.start, address.end) === address.canonicalText;
}

export type WikiOccurrenceRestoration = Readonly<{
  nodeId: string;
  nodeUpdatedAt: string;
  start: number;
  end: number;
  replacementLength: number;
}>;

/**
 * Carries a sibling occurrence across the person's own restoration of another
 * word in the same node. Only this known edit is followed; any other change to
 * the node still censors.
 */
export function remapWikiOccurrenceAddress(
  address: WikiOccurrenceAddress,
  restoration: WikiOccurrenceRestoration,
  nextUpdatedAt: string,
): WikiOccurrenceAddress | null {
  if (
    address.nodeId !== restoration.nodeId ||
    address.nodeUpdatedAt !== restoration.nodeUpdatedAt
  ) return address;
  const delta = restoration.replacementLength - (restoration.end - restoration.start);
  if (address.end <= restoration.start) {
    return Object.freeze({ ...address, nodeUpdatedAt: nextUpdatedAt });
  }
  if (address.start >= restoration.end) {
    return Object.freeze({
      ...address,
      nodeUpdatedAt: nextUpdatedAt,
      start: address.start + delta,
      end: address.end + delta,
    });
  }
  return null;
}

export type ViewportBounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** Share of the painted word inside the visual viewport, from client rects. */
export function visibleAreaFraction(
  rects: readonly Readonly<{ x: number; y: number; width: number; height: number }>[],
  viewport: ViewportBounds,
): number {
  let total = 0;
  let inside = 0;
  for (const rect of rects) {
    const area = rect.width * rect.height;
    if (!(area > 0) || !Number.isFinite(area)) continue;
    total += area;
    const width = Math.min(rect.x + rect.width, viewport.right) - Math.max(rect.x, viewport.left);
    const height = Math.min(rect.y + rect.height, viewport.bottom) - Math.max(rect.y, viewport.top);
    if (width > 0 && height > 0) inside += width * height;
  }
  return total > 0 ? inside / total : 0;
}

/** Accumulates perceivable time until the disclosed word counts as seen. */
export function advanceWikiOccurrencePerception(
  progress: WikiOccurrenceProgress,
  elapsedMs: number,
  perceivable: boolean,
): WikiOccurrenceProgress {
  const step = wholeMilliseconds(elapsedMs);
  if (progress.perceived || !progress.disclosed || !perceivable || step === 0) {
    return progress;
  }
  const visibleMs = progress.visibleMs + step;
  return Object.freeze({
    ...progress,
    visibleMs,
    perceived: visibleMs >= WIKI_OCCURRENCE_PERCEPTION.visibleMs,
  });
}

/** Foreground dwell counts only after perception and only while visible. */
export function advanceWikiOccurrenceDwell(
  progress: WikiOccurrenceProgress,
  elapsedMs: number,
  pageVisible: boolean,
): WikiOccurrenceProgress {
  const step = wholeMilliseconds(elapsedMs);
  if (!progress.perceived || !pageVisible || step === 0) return progress;
  return Object.freeze({ ...progress, dwellMs: progress.dwellMs + step });
}

/** Policy facts are integers; a non-finite or negative interval adds nothing. */
function wholeMilliseconds(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) && elapsedMs > 0
    ? Math.min(Math.floor(elapsedMs), Number.MAX_SAFE_INTEGER)
    : 0;
}

export function noteWikiOccurrenceAdmission(progress: WikiOccurrenceProgress): WikiOccurrenceProgress {
  return progress.perceived
    ? Object.freeze({ ...progress, furtherAdmissions: progress.furtherAdmissions + 1 })
    : progress;
}

export function noteWikiOccurrenceCopy(progress: WikiOccurrenceProgress): WikiOccurrenceProgress {
  return progress.perceived && !progress.copiedOrExported
    ? Object.freeze({ ...progress, copiedOrExported: true })
    : progress;
}

export function markWikiOccurrenceDisclosed(progress: WikiOccurrenceProgress): WikiOccurrenceProgress {
  return progress.disclosed ? progress : Object.freeze({ ...progress, disclosed: true });
}

/**
 * Decides the implicit settlement through Wiki's own policy. Triggers close the
 * wait; they never stack, and an unperceived occurrence at page exit is
 * censored rather than approved.
 */
export function decideWikiOccurrenceSettlement(
  occurrence: LiveWikiOccurrence,
  facts: Readonly<{ addressIntact: boolean; pageExit: boolean; nowMs: number }>,
): "pending" | "accepted-implicit" | "censored" {
  const decision = settleWikiImplicitOccurrence({
    perceived: occurrence.progress.perceived,
    addressIntact: facts.addressIntact,
    furtherHumanAdmissions: occurrence.progress.furtherAdmissions,
    foregroundDwellMilliseconds: occurrence.progress.dwellMs,
    copiedOrExported: occurrence.progress.copiedOrExported,
    pageExit: facts.pageExit,
  });
  if (decision !== "pending") return decision;
  // A token the registry is about to forget can no longer be recorded.
  return facts.nowMs - occurrence.admittedAtMs >= WIKI_OCCURRENCE_LIFETIME_MS
    ? "censored"
    : "pending";
}
