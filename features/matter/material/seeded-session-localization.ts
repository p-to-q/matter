import {
  estimateSerializedInverseBytes,
  verifyHistoryTops,
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
      /** A stack whose next step no longer matched the localized material was released. */
      historyReleased: boolean;
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
 *
 * Its cost must not grow with the journal. When no untouched seed passage or
 * title differs for the language, it answers "unchanged" without reading
 * history. Otherwise it rewrites every memento's seed copy, re-measures only
 * the rewritten steps, and dry-runs only the next Undo and Redo against the
 * localized tree, as journal recovery does. A deeper stale step never stops
 * translation: the engine refuses it at use, like any other.
 */
export const relocalizeSeededSession: SeededSessionRelocalizer = (
  tree,
  history,
  locale,
) => {
  if (
    (tree.id !== SEEDED_DOCUMENT_TREE_ID && tree.id !== SEEDED_ROOT_ONLY_TREE_ID) ||
    !seedCopyDiffers(tree, locale)
  ) {
    return unchanged(tree, history);
  }
  if (!validateThoughtTree(tree).ok) {
    return localizationFailure("SEED_LOCALIZATION_INVALID_TREE", tree, history);
  }

  let candidateTree = tree;
  let treeChanged = false;

  for (const spec of SEEDED_BOOTSTRAP_NODES) {
    const node = candidateTree.nodes[spec.id];
    if (
      node === undefined ||
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

  const localizedHistory = localizeSeededHistory(history, locale);
  if (localizedHistory === null) {
    return localizationFailure("SEED_LOCALIZATION_INVALID_HISTORY", tree, history);
  }
  if (!treeChanged && !localizedHistory.changed) return unchanged(tree, history);
  const verified = verifyHistoryTops(candidateTree, localizedHistory.history);
  return Object.freeze({
    ok: true,
    changed: true,
    tree: candidateTree,
    history: verified.history,
    historyReleased: verified.released,
  });
};

/** Whether any untouched seed passage or the canonical seed title reads differently in `locale`. */
function seedCopyDiffers(tree: ThoughtTree, locale: MatterLocale): boolean {
  for (const spec of SEEDED_BOOTSTRAP_NODES) {
    const node = tree.nodes[spec.id];
    if (node !== undefined && isOwnedSeedNode(node, spec) && node.text !== seededNodeText(locale, spec.copyKey)) {
      return true;
    }
  }
  return typeof tree.title === "string" &&
    isCanonicalSeededTitle(tree.title) &&
    tree.title !== seededMaterialCopy(locale).title;
}

function unchanged(tree: ThoughtTree, history: TreeHistory): SeededSessionRelocalization {
  return Object.freeze({ ok: true, changed: false, tree, history, historyReleased: false });
}

function isOwnedSeedNode(node: ThoughtNode, spec: BootstrapNode): boolean {
  return node.id === spec.id &&
    node.createdAt === spec.createdAt &&
    node.updatedAt === spec.updatedAt &&
    isCanonicalSeededNodeText(spec.copyKey, node.text);
}

function localizeSeededHistory(
  history: TreeHistory,
  locale: MatterLocale,
): Readonly<{ changed: boolean; history: TreeHistory }> | null {
  const entries = localizeHistoryEntries(history.entries, locale);
  const redoEntries = localizeHistoryEntries(history.redoEntries, locale);
  if (entries === null || redoEntries === null) return null;
  const changed = entries.changed || redoEntries.changed;
  if (!changed) return Object.freeze({ changed: false, history });
  return Object.freeze({
    changed: true,
    history: { entries: entries.entries, redoEntries: redoEntries.entries },
  });
}

function localizeHistoryEntries(
  entries: readonly TreeHistoryEntry[],
  locale: MatterLocale,
): Readonly<{ changed: boolean; entries: TreeHistoryEntry[] }> | null {
  let changed = false;
  const localized: TreeHistoryEntry[] = [];
  for (const entry of entries) {
    const inverse = localizeHistoryCommand(entry.inverse, locale);
    if (inverse === entry.inverse) {
      localized.push(entry);
      continue;
    }
    // Only a rewritten memento is measured again; its new count is exact.
    const retainedInverseBytes = estimateSerializedInverseBytes(inverse);
    if (!Number.isSafeInteger(retainedInverseBytes)) return null;
    changed = true;
    localized.push({
      commandId: entry.commandId,
      source: entry.source,
      inverse,
      retainedInverseBytes,
    });
  }
  return Object.freeze({ changed, entries: localized });
}

function localizeHistoryCommand(
  command: TreeCommand,
  locale: MatterLocale,
): TreeCommand {
  const mutation = localizeHistoryMutation(command.mutation, locale);
  return mutation === command.mutation ? command : { ...command, mutation };
}

function localizeHistoryMutation(
  mutation: TreeMutation,
  locale: MatterLocale,
): TreeMutation {
  if (mutation.type === "initialize-root") {
    const root = localizeHistoryNode(mutation.root, locale);
    return root === mutation.root ? mutation : { ...mutation, root };
  }
  if (mutation.type === "clear-root") {
    const expectedRoot = localizeHistoryNode(
      mutation.expectedRoot,
      locale,
    );
    return expectedRoot === mutation.expectedRoot ? mutation : { ...mutation, expectedRoot };
  }
  if (mutation.type === "insert-node") {
    const node = localizeHistoryNode(mutation.node, locale);
    return node === mutation.node ? mutation : { ...mutation, node };
  }
  if (mutation.type === "remove-subtree" || mutation.type === "restore-subtree") {
    const detached = localizeDetachedSubtree(mutation.detached, locale);
    return detached === mutation.detached ? mutation : { ...mutation, detached };
  }
  if (mutation.type === "move-node") {
    const expectedNode = localizeHistoryNode(
      mutation.expectedNode,
      locale,
    );
    return expectedNode === mutation.expectedNode ? mutation : { ...mutation, expectedNode };
  }
  if (mutation.type === "replace-text") {
    const expectedText = localizeSeedText(mutation.nodeId, mutation.expectedText, locale);
    const text = localizeSeedText(mutation.nodeId, mutation.text, locale);
    return expectedText === mutation.expectedText && text === mutation.text
      ? mutation
      : { ...mutation, expectedText, text };
  }
  if (mutation.type === "replace-title") {
    const expectedTitle = localizeSeedTitle(mutation.expectedTitle, locale);
    const title = localizeSeedTitle(mutation.title, locale);
    return expectedTitle === mutation.expectedTitle && title === mutation.title
      ? mutation
      : { ...mutation, expectedTitle, title };
  }
  return mutation;
}

function localizeDetachedSubtree(
  detached: DetachedSubtree,
  locale: MatterLocale,
): DetachedSubtree {
  let changed = false;
  const nodes: Record<string, ThoughtNode> = {};
  for (const [id, node] of Object.entries(detached.nodes)) {
    const localized = localizeHistoryNode(node, locale);
    nodes[id] = localized;
    changed ||= localized !== node;
  }
  return changed ? { ...detached, nodes } : detached;
}

function localizeHistoryNode(
  node: ThoughtNode,
  locale: MatterLocale,
): ThoughtNode {
  const spec = BOOTSTRAP_BY_ID.get(node.id);
  if (spec === undefined || !isOwnedSeedNode(node, spec)) return node;
  const text = seededNodeText(locale, spec.copyKey);
  return node.text === text ? node : { ...node, text };
}

function localizeSeedText(
  nodeId: string,
  text: string,
  locale: MatterLocale,
): string {
  const spec = BOOTSTRAP_BY_ID.get(nodeId);
  return spec !== undefined && isCanonicalSeededNodeText(spec.copyKey, text)
    ? seededNodeText(locale, spec.copyKey)
    : text;
}

function localizeSeedTitle(title: string, locale: MatterLocale): string {
  return isCanonicalSeededTitle(title) ? seededMaterialCopy(locale).title : title;
}

function localizationFailure(
  errorCode: Extract<SeededSessionRelocalization, { ok: false }>["errorCode"],
  tree: ThoughtTree,
  history: TreeHistory,
): SeededSessionRelocalization {
  return Object.freeze({ ok: false, errorCode, tree, history });
}
