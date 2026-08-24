import {
  canReplayTreeHistory,
  estimateSerializedInverseBytes,
  type TreeHistory,
  type TreeHistoryEntry,
} from "../tree/history";
import { applyTreeCommand } from "../tree/engine";
import { validateThoughtTree } from "../tree/invariants";
import type {
  DetachedSubtree,
  ThoughtNode,
  ThoughtTree,
  TreeCommand,
  TreeMutation,
} from "../tree/model";
import type { MatterLocale } from "../config/locales";
import {
  isCanonicalSeededNodeText,
  isCanonicalSeededTitle,
  SEEDED_MATERIAL_COPY_CHUNK_SENTINEL,
  seededMaterialCopy,
  seededNodeText,
} from "./seeded-material-copy";
import {
  SEEDED_BOOTSTRAP_NODES,
  SEEDED_DOCUMENT_TREE_ID,
  SEEDED_ROOT_ONLY_TREE_ID,
  type BootstrapNode,
} from "./seeded-document";

export type SeededSessionRelocalization =
  | Readonly<{
      ok: true;
      changed: boolean;
      tree: ThoughtTree;
      history: TreeHistory;
    }>
  | Readonly<{
      ok: false;
      errorCode: "SEED_LOCALIZATION_INVALID_TREE" | "SEED_LOCALIZATION_INVALID_HISTORY";
      tree: ThoughtTree;
      history: TreeHistory;
    }>;

export type SeededSessionRelocalizer = (
  tree: ThoughtTree,
  history: TreeHistory,
  locale: MatterLocale,
) => SeededSessionRelocalization;

const BOOTSTRAP_BY_ID = new Map(
  SEEDED_BOOTSTRAP_NODES.map((node) => [node.id, node] as const),
);
const SEED_LOCALIZATION_CHUNK_SENTINEL = "matter-seeded-session-localization";

/**
 * Re-encodes only untouched preview composition in the selected language.
 * This proof is loaded after mount because ordinary material use never needs
 * its journal migration machinery. The Store still invokes it synchronously
 * against current state and publishes its tree/history candidate atomically.
 */
export const relocalizeSeededSession: SeededSessionRelocalizer = (
  tree,
  history,
  locale,
) => {
  if (tree.id !== SEEDED_DOCUMENT_TREE_ID && tree.id !== SEEDED_ROOT_ONLY_TREE_ID) {
    return Object.freeze({ ok: true, changed: false, tree, history });
  }
  if (!validateThoughtTree(tree).ok) {
    return localizationFailure("SEED_LOCALIZATION_INVALID_TREE", tree, history);
  }
  if (!historyBytesAreExact(history) || !canReplayTreeHistory(tree, history)) {
    return localizationFailure("SEED_LOCALIZATION_INVALID_HISTORY", tree, history);
  }

  const textDetachedNodeIds = textDetachedSeedNodeIds(history);
  let candidateTree = tree;
  let treeChanged = false;

  for (const spec of SEEDED_BOOTSTRAP_NODES) {
    const node = candidateTree.nodes[spec.id];
    if (
      node === undefined ||
      textDetachedNodeIds.has(node.id) ||
      !isOwnedSeedNode(node, spec)
    ) {
      continue;
    }
    const text = seededNodeText(locale, spec.copyKey);
    if (node.text === text) continue;
    const applied = applyTreeCommand(candidateTree, {
      id: `${SEED_LOCALIZATION_CHUNK_SENTINEL}_${SEEDED_MATERIAL_COPY_CHUNK_SENTINEL}_${locale}_${spec.copyKey}_${candidateTree.revision}`,
      source: "fixture",
      expectedTreeId: candidateTree.id,
      expectedRevision: candidateTree.revision,
      createdAt: node.updatedAt,
      mutation: {
        type: "replace-text",
        nodeId: node.id,
        expectedText: node.text,
        expectedUpdatedAt: node.updatedAt,
        text,
        // Localization changes system copy, not the authored time that proves
        // its ownership and distinguishes it from a person's material.
        updatedAt: node.updatedAt,
      },
    });
    if (!applied.ok) {
      return localizationFailure("SEED_LOCALIZATION_INVALID_TREE", tree, history);
    }
    candidateTree = applied.tree;
    treeChanged = true;
  }

  if (
    typeof candidateTree.title === "string" &&
    !historyHasTitleReplacement(history) &&
    isCanonicalSeededTitle(candidateTree.title)
  ) {
    const title = seededMaterialCopy(locale).title;
    if (candidateTree.title !== title) {
      const applied = applyTreeCommand(candidateTree, {
        id: `${SEED_LOCALIZATION_CHUNK_SENTINEL}_${SEEDED_MATERIAL_COPY_CHUNK_SENTINEL}_${locale}_title_${candidateTree.revision}`,
        source: "fixture",
        expectedTreeId: candidateTree.id,
        expectedRevision: candidateTree.revision,
        createdAt: "1970-01-01T00:00:00.000Z",
        mutation: {
          type: "replace-title",
          expectedTitle: candidateTree.title,
          title,
        },
      });
      if (!applied.ok) {
        return localizationFailure("SEED_LOCALIZATION_INVALID_TREE", tree, history);
      }
      candidateTree = applied.tree;
      treeChanged = true;
    }
  }

  const localizedHistory = localizeSeededHistory(history, locale, textDetachedNodeIds);
  if (localizedHistory === null || !canReplayTreeHistory(candidateTree, localizedHistory.history)) {
    return localizationFailure("SEED_LOCALIZATION_INVALID_HISTORY", tree, history);
  }
  if (!treeChanged && !localizedHistory.changed) {
    return Object.freeze({ ok: true, changed: false, tree, history });
  }
  return Object.freeze({
    ok: true,
    changed: true,
    tree: candidateTree,
    history: localizedHistory.history,
  });
};

function isOwnedSeedNode(node: ThoughtNode, spec: BootstrapNode): boolean {
  return node.id === spec.id &&
    node.createdAt === spec.createdAt &&
    node.updatedAt === spec.updatedAt &&
    isCanonicalSeededNodeText(spec.copyKey, node.text);
}

function historyEntries(history: TreeHistory): readonly TreeHistoryEntry[] {
  return [...history.entries, ...(history.redoEntries ?? [])];
}

function historyBytesAreExact(history: TreeHistory): boolean {
  let total = 0;
  for (const entry of historyEntries(history)) {
    const bytes = estimateSerializedInverseBytes(entry.inverse);
    if (entry.retainedInverseBytes !== bytes) return false;
    total += bytes;
    if (!Number.isSafeInteger(total)) return false;
  }
  return total === history.retainedInverseBytes;
}

function textDetachedSeedNodeIds(history: TreeHistory): ReadonlySet<string> {
  const detached = new Set<string>();
  for (const entry of historyEntries(history)) {
    const mutation = entry.inverse.mutation;
    if (mutation.type === "replace-text" && BOOTSTRAP_BY_ID.has(mutation.nodeId)) {
      detached.add(mutation.nodeId);
    }
  }
  return detached;
}

function historyHasTitleReplacement(history: TreeHistory): boolean {
  return historyEntries(history).some(({ inverse }) => inverse.mutation.type === "replace-title");
}

function localizeSeededHistory(
  history: TreeHistory,
  locale: MatterLocale,
  textDetachedNodeIds: ReadonlySet<string>,
): Readonly<{ changed: boolean; history: TreeHistory }> | null {
  const entries = localizeHistoryEntries(history.entries, locale, textDetachedNodeIds);
  const redoEntries = localizeHistoryEntries(
    history.redoEntries ?? [],
    locale,
    textDetachedNodeIds,
  );
  if (entries === null || redoEntries === null) return null;
  const changed = entries.changed || redoEntries.changed;
  if (!changed) return Object.freeze({ changed: false, history });
  const retainedInverseBytes = [...entries.entries, ...redoEntries.entries]
    .reduce((total, entry) => total + entry.retainedInverseBytes, 0);
  if (!Number.isSafeInteger(retainedInverseBytes)) return null;
  return Object.freeze({
    changed: true,
    history: {
      entries: entries.entries,
      redoEntries: redoEntries.entries,
      retainedInverseBytes,
    },
  });
}

function localizeHistoryEntries(
  entries: readonly TreeHistoryEntry[],
  locale: MatterLocale,
  textDetachedNodeIds: ReadonlySet<string>,
): Readonly<{ changed: boolean; entries: TreeHistoryEntry[] }> | null {
  let changed = false;
  const localized: TreeHistoryEntry[] = [];
  for (const entry of entries) {
    const inverse = localizeHistoryCommand(entry.inverse, locale, textDetachedNodeIds);
    const retainedInverseBytes = estimateSerializedInverseBytes(inverse);
    if (!Number.isSafeInteger(retainedInverseBytes)) return null;
    if (inverse !== entry.inverse || retainedInverseBytes !== entry.retainedInverseBytes) {
      changed = true;
      localized.push({ ...entry, inverse, retainedInverseBytes });
    } else {
      localized.push(entry);
    }
  }
  return Object.freeze({ changed, entries: localized });
}

function localizeHistoryCommand(
  command: TreeCommand,
  locale: MatterLocale,
  textDetachedNodeIds: ReadonlySet<string>,
): TreeCommand {
  const mutation = localizeHistoryMutation(command.mutation, locale, textDetachedNodeIds);
  return mutation === command.mutation ? command : { ...command, mutation };
}

function localizeHistoryMutation(
  mutation: TreeMutation,
  locale: MatterLocale,
  textDetachedNodeIds: ReadonlySet<string>,
): TreeMutation {
  if (mutation.type === "initialize-root") {
    const root = localizeHistoryNode(mutation.root, locale, textDetachedNodeIds);
    return root === mutation.root ? mutation : { ...mutation, root };
  }
  if (mutation.type === "clear-root") {
    const expectedRoot = localizeHistoryNode(
      mutation.expectedRoot,
      locale,
      textDetachedNodeIds,
    );
    return expectedRoot === mutation.expectedRoot ? mutation : { ...mutation, expectedRoot };
  }
  if (mutation.type === "insert-node") {
    const node = localizeHistoryNode(mutation.node, locale, textDetachedNodeIds);
    return node === mutation.node ? mutation : { ...mutation, node };
  }
  if (mutation.type === "remove-subtree" || mutation.type === "restore-subtree") {
    const detached = localizeDetachedSubtree(mutation.detached, locale, textDetachedNodeIds);
    return detached === mutation.detached ? mutation : { ...mutation, detached };
  }
  if (mutation.type === "move-node") {
    const expectedNode = localizeHistoryNode(
      mutation.expectedNode,
      locale,
      textDetachedNodeIds,
    );
    return expectedNode === mutation.expectedNode ? mutation : { ...mutation, expectedNode };
  }
  // A replace-text inverse proves that passage has left system ownership; its
  // exact expected and replacement bytes must remain untouched.
  return mutation;
}

function localizeDetachedSubtree(
  detached: DetachedSubtree,
  locale: MatterLocale,
  textDetachedNodeIds: ReadonlySet<string>,
): DetachedSubtree {
  let changed = false;
  const nodes: Record<string, ThoughtNode> = {};
  for (const [id, node] of Object.entries(detached.nodes)) {
    const localized = localizeHistoryNode(node, locale, textDetachedNodeIds);
    nodes[id] = localized;
    changed ||= localized !== node;
  }
  return changed ? { ...detached, nodes } : detached;
}

function localizeHistoryNode(
  node: ThoughtNode,
  locale: MatterLocale,
  textDetachedNodeIds: ReadonlySet<string>,
): ThoughtNode {
  if (textDetachedNodeIds.has(node.id)) return node;
  const spec = BOOTSTRAP_BY_ID.get(node.id);
  if (spec === undefined || !isOwnedSeedNode(node, spec)) return node;
  const text = seededNodeText(locale, spec.copyKey);
  return node.text === text ? node : { ...node, text };
}

function localizationFailure(
  errorCode: Extract<SeededSessionRelocalization, { ok: false }>["errorCode"],
  tree: ThoughtTree,
  history: TreeHistory,
): SeededSessionRelocalization {
  return Object.freeze({ ok: false, errorCode, tree, history });
}
