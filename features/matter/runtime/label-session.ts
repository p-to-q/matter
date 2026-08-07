import {
  MAX_PARENT_EXCERPT_CODE_UNITS,
  MAX_SIBLING_LABELS,
  decideModelRequest,
  deriveProvisionalLabel,
  materialFingerprint,
  normalizeLabelInput,
  type SemanticLabelSource,
} from "../material/semantic-label";
import type { ThoughtTree } from "../tree/model";

/**
 * Owns which label belongs to which node, and when a late answer is still
 * allowed to change it.
 *
 * A label is derived presentation. It never enters `ThoughtTree`, command
 * history, persistence, or an archive, so this state may be rebuilt from the
 * tree at any moment and losing it costs nothing.
 *
 * Everything here is pure: ids, transport, and time belong to the driver.
 */

/**
 * `user` is a name a person typed. It outranks both derived origins, survives
 * edits to the material, and is only replaced when they reset it.
 */
export type LabelOrigin = SemanticLabelSource | "user";

export type LabelEntry = Readonly<{
  label: string;
  origin: LabelOrigin;
  /** Fingerprint of the material this label was derived from; null for a name. */
  basis: string | null;
  revision: number;
  /** The one outstanding operation allowed to replace this label, if any. */
  pendingOperationId: string | null;
  /**
   * True when this label was committed without asking a model that it still
   * wants — during restoration from storage, or while the endpoint is cooling.
   * Without it a deferred node would look settled and never be asked again.
   */
  deferred: boolean;
}>;

/** A label worth keeping across a reload. Provisional labels are recomputed. */
export type DurableLabel = Readonly<{
  nodeId: string;
  label: string;
  origin: "model" | "user";
  basis: string | null;
}>;

export type LabelSessionState = Readonly<{
  treeId: string;
  documentEpoch: number;
  entries: ReadonlyMap<string, LabelEntry>;
}>;

export type LabelReferenceMaterial = Readonly<{
  parentLabel?: string;
  parentExcerpt?: string;
  siblingLabels?: readonly string[];
}>;

/** One node that needs work, with everything the request boundary requires. */
export type LabelWorkItem = Readonly<{
  nodeId: string;
  revision: number;
  basis: string;
  provisional: string;
  locale: string;
  maxGraphemes: number;
  text: string;
  reference: LabelReferenceMaterial;
  requestModel: boolean;
}>;

export type LabelSessionEvent =
  | Readonly<{ type: "document-changed"; treeId: string; documentEpoch: number }>
  | Readonly<{
      type: "begin";
      item: LabelWorkItem;
      operationId: string | null;
      /** The model was wanted but not asked; this node may be asked later. */
      deferred?: boolean;
    }>
  | Readonly<{
      type: "settled";
      nodeId: string;
      basis: string;
      operationId: string;
      label: string;
      source: SemanticLabelSource;
    }>
  | Readonly<{ type: "failed"; nodeId: string; basis: string; operationId: string }>
  | Readonly<{ type: "prune"; liveNodeIds: ReadonlySet<string> }>
  | Readonly<{ type: "restore"; treeId: string; entries: readonly DurableLabel[] }>
  | Readonly<{ type: "rename"; nodeId: string; label: string }>
  | Readonly<{ type: "reset-name"; nodeId: string }>;

export function createLabelSessionState(treeId: string, documentEpoch: number): LabelSessionState {
  return Object.freeze({ treeId, documentEpoch, entries: new Map<string, LabelEntry>() });
}

export function labelFor(state: LabelSessionState, nodeId: string): string | null {
  return state.entries.get(nodeId)?.label ?? null;
}

/**
 * Lists the work the given nodes still need. A node whose material fingerprint
 * already matches its entry is skipped, so re-rendering, scrolling, folding, or
 * an unrelated commit never re-asks the same question.
 */
export function planLabelWork(
  tree: ThoughtTree,
  nodeIds: readonly string[],
  state: LabelSessionState,
  locale: string,
): readonly LabelWorkItem[] {
  const items: LabelWorkItem[] = [];
  const seen = new Set<string>();
  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const node = Object.hasOwn(tree.nodes, nodeId) ? tree.nodes[nodeId] : undefined;
    if (node === undefined || node.text.trim().length === 0) continue;

    const reference = referenceMaterial(tree, nodeId, state);
    const input = normalizeLabelInput({ text: node.text, locale, context: reference });
    const basis = materialFingerprint(input);
    const existing = state.entries.get(nodeId);
    // A name a person typed is never re-derived, whatever the material does.
    if (existing?.origin === "user") continue;
    if (existing !== undefined && existing.basis === basis && !existing.deferred) continue;

    const provisional = deriveProvisionalLabel(input);
    items.push(
      Object.freeze({
        nodeId,
        revision: tree.revision,
        basis,
        provisional: provisional.text,
        locale: input.locale,
        maxGraphemes: input.maxGraphemes,
        text: input.text,
        reference: toReferenceMaterial(reference),
        requestModel: decideModelRequest(input, provisional).request,
      }),
    );
  }
  return Object.freeze(items);
}

export function reduceLabelSession(
  state: LabelSessionState,
  event: LabelSessionEvent,
): LabelSessionState {
  switch (event.type) {
    case "document-changed": {
      if (state.treeId === event.treeId && state.documentEpoch === event.documentEpoch) {
        return state;
      }
      // A document boundary invalidates every label and every outstanding
      // answer, because node ids are only unique within one document.
      return createLabelSessionState(event.treeId, event.documentEpoch);
    }

    case "begin": {
      const existing = state.entries.get(event.item.nodeId);
      const deferred = event.deferred === true;
      if (existing?.origin === "user") return state;
      if (existing !== undefined && existing.basis === event.item.basis) {
        // The label is already correct; only the right to ask later changes.
        if (!existing.deferred || deferred) return state;
        return withEntry(state, event.item.nodeId, {
          ...existing,
          pendingOperationId: event.operationId,
          deferred: false,
        });
      }
      return withEntry(state, event.item.nodeId, {
        label: event.item.provisional,
        origin: "provisional",
        basis: event.item.basis,
        revision: event.item.revision,
        pendingOperationId: event.operationId,
        deferred,
      });
    }

    case "settled": {
      const existing = state.entries.get(event.nodeId);
      // Three independent reasons to drop a late answer: the node is gone, its
      // material moved on, or a newer operation already owns the entry.
      if (existing === undefined) return state;
      if (existing.origin === "user") return state;
      if (existing.basis !== event.basis) return state;
      if (existing.pendingOperationId !== event.operationId) return state;
      if (existing.label === event.label && existing.origin === event.source) {
        return withEntry(state, event.nodeId, { ...existing, pendingOperationId: null });
      }
      return withEntry(state, event.nodeId, {
        ...existing,
        label: event.label,
        origin: event.source,
        pendingOperationId: null,
      });
    }

    case "failed": {
      const existing = state.entries.get(event.nodeId);
      if (existing === undefined) return state;
      if (existing.basis !== event.basis) return state;
      if (existing.pendingOperationId !== event.operationId) return state;
      // Failure is silent: the deterministic label already on screen stands.
      return withEntry(state, event.nodeId, { ...existing, pendingOperationId: null });
    }

    case "restore": {
      // Restoration is only meaningful for the document it was stored under,
      // and it never displaces a label this session already settled.
      if (state.treeId !== event.treeId || event.entries.length === 0) return state;
      const entries = new Map(state.entries);
      let changed = false;
      for (const entry of event.entries) {
        const existing = entries.get(entry.nodeId);
        if (existing?.origin === "user") continue;
        if (existing !== undefined && existing.origin === "model") continue;
        entries.set(entry.nodeId, Object.freeze({
          label: entry.label,
          origin: entry.origin,
          basis: entry.basis,
          revision: existing?.revision ?? 0,
          pendingOperationId: null,
          deferred: false,
        }));
        changed = true;
      }
      return changed ? Object.freeze({ ...state, entries }) : state;
    }

    case "rename": {
      const label = event.label.trim();
      if (label.length === 0) return state;
      const existing = state.entries.get(event.nodeId);
      if (existing?.origin === "user" && existing.label === label) return state;
      return withEntry(state, event.nodeId, {
        label,
        origin: "user",
        basis: null,
        revision: existing?.revision ?? 0,
        pendingOperationId: null,
        deferred: false,
      });
    }

    case "reset-name": {
      const existing = state.entries.get(event.nodeId);
      if (existing?.origin !== "user") return state;
      // Dropping the entry returns the node to derivation on the next plan.
      const entries = new Map(state.entries);
      entries.delete(event.nodeId);
      return Object.freeze({ ...state, entries });
    }

    case "prune": {
      let removed = false;
      const entries = new Map<string, LabelEntry>();
      for (const [nodeId, entry] of state.entries) {
        if (event.liveNodeIds.has(nodeId)) entries.set(nodeId, entry);
        else removed = true;
      }
      return removed ? Object.freeze({ ...state, entries }) : state;
    }

    default:
      return assertNever(event);
  }
}

function withEntry(
  state: LabelSessionState,
  nodeId: string,
  entry: LabelEntry,
): LabelSessionState {
  const entries = new Map(state.entries);
  entries.set(nodeId, Object.freeze(entry));
  return Object.freeze({ ...state, entries });
}

/**
 * Context is deliberately narrow: the parent's label and a short excerpt, plus
 * the labels a new one must be distinguishable from. The whole tree is never
 * sent, and no retrieval happens behind the person's back.
 */
function referenceMaterial(
  tree: ThoughtTree,
  nodeId: string,
  state: LabelSessionState,
): Readonly<{
  parentLabel: string | null;
  parentExcerpt: string | null;
  siblingLabels: readonly string[];
}> {
  const node = tree.nodes[nodeId];
  const parentId = node?.parentId ?? null;
  const parent = parentId === null ? undefined : tree.nodes[parentId];
  const siblings: string[] = [];
  for (const siblingId of parent?.children ?? []) {
    if (siblingId === nodeId) continue;
    const label = state.entries.get(siblingId)?.label;
    if (label !== undefined) siblings.push(label);
    if (siblings.length >= MAX_SIBLING_LABELS) break;
  }
  return Object.freeze({
    parentLabel: parentId === null ? null : state.entries.get(parentId)?.label ?? null,
    parentExcerpt: parent === undefined ? null : excerpt(parent.text),
    siblingLabels: Object.freeze(siblings),
  });
}

/** Cuts to the excerpt bound without ever leaving a lone surrogate on the wire. */
function excerpt(text: string): string {
  if (text.length <= MAX_PARENT_EXCERPT_CODE_UNITS) return text;
  const sliced = text.slice(0, MAX_PARENT_EXCERPT_CODE_UNITS);
  return /[\uD800-\uDBFF]$/u.test(sliced) ? sliced.slice(0, -1) : sliced;
}

function toReferenceMaterial(
  reference: Readonly<{
    parentLabel: string | null;
    parentExcerpt: string | null;
    siblingLabels: readonly string[];
  }>,
): LabelReferenceMaterial {
  return Object.freeze({
    ...(reference.parentLabel === null || reference.parentLabel.length === 0
      ? {}
      : { parentLabel: reference.parentLabel }),
    ...(reference.parentExcerpt === null || reference.parentExcerpt.length === 0
      ? {}
      : { parentExcerpt: reference.parentExcerpt }),
    ...(reference.siblingLabels.length === 0 ? {} : { siblingLabels: reference.siblingLabels }),
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled label session event: ${String(value)}`);
}
