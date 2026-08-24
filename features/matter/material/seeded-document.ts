/**
 * The document Matter opens with, and the material its Branch tool offers.
 *
 * This is product composition, not a test fixture: it is what a person meets
 * on first load, and every durable id below is in their IndexedDB. The
 * `matter_fixture_*` and `thought_fixture_*` spellings are kept exactly as they
 * are for that reason — they are persisted identifiers, and renaming one to
 * match a refactor orphans every document already saved under it.
 *
 * The Branch continuations are the one place the product composes material a
 * person did not speak. That is a stated preview boundary rather than a
 * generative surface: they are fixed sentences that decline to finish the
 * thought, and they will be replaced by the bounded transform turn when it
 * lands (#12). Identity and time still belong to the person; see
 * `createBranchChildCommand`.
 */

import {
  commitTreeCommand,
  createTreeHistory,
  type TreeHistory,
} from "../tree/history";
import {
  MAX_CHILDREN_PER_NODE,
  MAX_NODE_TEXT_CODE_UNITS,
  MAX_TREE_DEPTH,
  createEmptyTree,
  validateThoughtTree,
} from "../tree/invariants";
import type { ThoughtNode, ThoughtTree, TreeCommand } from "../tree/model";
import { MATTER_LOCALE, type MatterLocale } from "../config/locales";
import {
  seededFallbackBranchTexts,
  seededInitialNodeText,
  type SeededBranchTextResolver,
  type SeededPassageKey,
} from "./seeded-material-core";

export const SEEDED_DOCUMENT_TREE_ID = "matter_fixture_rooted_01";
export const SEEDED_ROOT_ONLY_TREE_ID = "matter_fixture_rooted_02";

export type SeededDocumentVariant = "root" | "expanded";

export const SEEDED_DOCUMENT_NODE_IDS = {
  root: "thought_fixture_root",
  imaginedLives: "thought_fixture_imagined_lives",
  imaginedTime: "thought_fixture_imagined_time",
  imaginedRelations: "thought_fixture_imagined_relations",
  presentDistance: "thought_fixture_present_distance",
  presentFailure: "thought_fixture_present_failure",
  presentOpening: "thought_fixture_present_opening",
  bodilyMemory: "thought_fixture_bodily_memory",
  bodilyGesture: "thought_fixture_bodily_gesture",
  bodilyReturn: "thought_fixture_bodily_return",
} as const;

export const SEEDED_IMAGINED_LIVES_TEXT = seededInitialNodeText("imaginedLives");

export const SEEDED_DOCUMENT_TEXT_VARIANTS = [
  {
    id: "quiet",
    label: "v1",
    text: seededInitialNodeText("root"),
  },
  {
    id: "expanded",
    label: "v2",
    text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象几种还没有被彻底放弃的生活。",
  },
  {
    id: "precise",
    label: "v3",
    text: "我们怀念的也许不是过去本身，而是它在今天仍然保留的一点余地：让另一种生活继续显得可能。",
  },
] as const;

const SEED_HISTORY_LIMITS = {
  maxEntries: 32,
  maxRetainedInverseBytes: 256_000,
};

export type BootstrapNode = Omit<ThoughtNode, "text"> &
  Readonly<{ copyKey: SeededPassageKey }>;

export const SEEDED_BOOTSTRAP_NODES: readonly BootstrapNode[] = [
  {
    id: SEEDED_DOCUMENT_NODE_IDS.root,
    copyKey: "root",
    parentId: null,
    children: [],
    createdAt: "2026-08-03T08:00:00.000Z",
    updatedAt: "2026-08-03T08:00:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    copyKey: "imaginedLives",
    parentId: SEEDED_DOCUMENT_NODE_IDS.root,
    children: [],
    createdAt: "2026-08-03T08:01:00.000Z",
    updatedAt: "2026-08-03T08:01:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.imaginedTime,
    copyKey: "imaginedTime",
    parentId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    children: [],
    createdAt: "2026-08-03T08:02:00.000Z",
    updatedAt: "2026-08-03T08:02:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.imaginedRelations,
    copyKey: "imaginedRelations",
    parentId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    children: [],
    createdAt: "2026-08-03T08:03:00.000Z",
    updatedAt: "2026-08-03T08:03:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
    copyKey: "presentDistance",
    parentId: SEEDED_DOCUMENT_NODE_IDS.root,
    children: [],
    createdAt: "2026-08-03T08:04:00.000Z",
    updatedAt: "2026-08-03T08:04:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.presentFailure,
    copyKey: "presentFailure",
    parentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
    children: [],
    createdAt: "2026-08-03T08:05:00.000Z",
    updatedAt: "2026-08-03T08:05:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.presentOpening,
    copyKey: "presentOpening",
    parentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
    children: [],
    createdAt: "2026-08-03T08:06:00.000Z",
    updatedAt: "2026-08-03T08:06:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
    copyKey: "bodilyMemory",
    parentId: SEEDED_DOCUMENT_NODE_IDS.root,
    children: [],
    createdAt: "2026-08-03T08:07:00.000Z",
    updatedAt: "2026-08-03T08:07:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.bodilyGesture,
    copyKey: "bodilyGesture",
    parentId: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
    children: [],
    createdAt: "2026-08-03T08:08:00.000Z",
    updatedAt: "2026-08-03T08:08:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.bodilyReturn,
    copyKey: "bodilyReturn",
    parentId: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
    children: [],
    createdAt: "2026-08-03T08:09:00.000Z",
    updatedAt: "2026-08-03T08:09:00.000Z",
  },
] as const;

const BOOTSTRAP_BY_ID = new Map(
  SEEDED_BOOTSTRAP_NODES.map((node) => [node.id, node] as const),
);

function seededPassageKeyForNodeId(nodeId: string): SeededPassageKey | null {
  return BOOTSTRAP_BY_ID.get(nodeId)?.copyKey ?? null;
}

export type SeededDocument = {
  tree: ThoughtTree;
  history: TreeHistory;
};

/**
 * Builds seed material through the same atomic commit boundary used at runtime.
 * Bootstrap commands are then forgotten: opening a fixture must not present
 * setup work as a person's undo history.
 */
export function createSeededDocument(
  variant: SeededDocumentVariant = "expanded",
): SeededDocument {
  let tree = createEmptyTree(
    variant === "root" ? SEEDED_ROOT_ONLY_TREE_ID : SEEDED_DOCUMENT_TREE_ID,
  );
  let history = createTreeHistory();

  const bootstrapSpecs = variant === "root"
    ? SEEDED_BOOTSTRAP_NODES.slice(0, 1)
    : SEEDED_BOOTSTRAP_NODES;
  const bootstrapNodes = bootstrapSpecs.map(materializeBootstrapNode);
  for (const [index, node] of bootstrapNodes.entries()) {
    const command: TreeCommand =
      index === 0
        ? {
            id: "fixture_bootstrap_root",
            source: "fixture",
            expectedTreeId: tree.id,
            expectedRevision: tree.revision,
            mutation: { type: "initialize-root", root: cloneNode(node) },
            createdAt: node.createdAt,
          }
        : createBootstrapInsertCommand(tree, node, index);

    const committed = commitTreeCommand(
      tree,
      history,
      command,
      SEED_HISTORY_LIMITS,
    );
    if (!committed.ok) {
      throw new Error(
        `Invalid rooted fixture at ${node.id}: ${committed.error.code} ${committed.error.message}`,
      );
    }
    tree = committed.tree;
    history = committed.history;
  }

  return { tree, history: createTreeHistory() };
}

/**
 * Composes the next Branch child.
 *
 * The text is closed preview composition, not a product prompt surface: until
 * the generative turn exists, Branch offers a continuation rather than writing
 * one. Identity and time are supplied by the caller and are ordinary durable
 * material — a person's own node, created when they created it. They were once
 * derived from the tree revision and a frozen constant, which put a fixed past
 * timestamp and a synthetic id into exported Markdown for every branch anyone
 * made. The engine remains the sole owner of parent existence, child limits,
 * insertion bounds, and id-collision checks.
 */
export function createBranchChildCommand(
  tree: ThoughtTree,
  parentId: string,
  values: Readonly<{ nodeId: string; createdAt: string }>,
  index = tree.nodes[parentId]?.children.length ?? 0,
  locale: MatterLocale = MATTER_LOCALE.simplifiedChinese,
  resolveTexts: SeededBranchTextResolver = seededFallbackBranchTexts,
): TreeCommand {
  const text = branchChildText(tree, parentId, locale, resolveTexts);

  return {
    id: `branch_${values.nodeId}`,
    source: "fixture",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation: {
      type: "insert-node",
      node: {
        id: values.nodeId,
        text,
        parentId,
        children: [],
        createdAt: values.createdAt,
        updatedAt: values.createdAt,
      },
      parentId,
      index,
      expectedParentChildren: [...(tree.nodes[parentId]?.children ?? [])],
    },
    createdAt: values.createdAt,
  };
}

function branchChildText(
  tree: ThoughtTree,
  parentId: string,
  locale: MatterLocale,
  resolveTexts: SeededBranchTextResolver,
): string {
  const parent = tree.nodes[parentId];
  const parentKey = seededPassageKeyForNodeId(parentId);
  const floor = seededFallbackBranchTexts(locale);
  let options = floor;
  try {
    const resolved = resolveTexts(locale, parentKey);
    if (
      resolved.length > 0 &&
      resolved.every((text) =>
        typeof text === "string" &&
        text.trim().length > 0 &&
        text.length <= MAX_NODE_TEXT_CODE_UNITS
      )
    ) {
      options = resolved;
    }
  } catch {
    // Interaction-only copy can fail to load or execute without weakening the
    // synchronous Branch action. The closed locale floor is always available.
  }
  return options[(parent?.children.length ?? 0) % options.length]
    ?? floor[0]
    ?? seededFallbackBranchTexts(locale)[0];
}

function materializeBootstrapNode(spec: BootstrapNode): ThoughtNode {
  const { copyKey, ...node } = spec;
  return {
    ...node,
    children: [...node.children],
    text: seededInitialNodeText(copyKey),
  };
}

const PERFORMANCE_NODE_COUNT = 2_000;
const PERFORMANCE_MAX_DEPTH = 10;
const PERFORMANCE_SEED = 0x4d415454;
const PERFORMANCE_START_TIME = Date.parse("2026-08-03T09:00:00.000Z");

const PERFORMANCE_PHRASES = [
  "这个念头还没有完成，",
  "我想先把它放在这里。",
  "也许问题不在答案，而在我们怎样靠近它；",
  "声音经过一段停顿以后，意思变得不太一样。",
  "The material should keep that uncertainty visible.",
  "手势确定范围，结构保存来路，AI 只改变眼前这一小块材料。",
] as const;

/**
 * Produces a large, fixed-seed query input without allocating 2,000 undo
 * mementos. It is never default application state; validation is the trust
 * boundary for this intentionally direct performance-fixture construction.
 */
export function createPerformanceThoughtTree(): ThoughtTree {
  const random = createSeededRandom(PERFORMANCE_SEED);
  const nodes: Record<string, ThoughtNode> = {};
  const depths: number[] = [];

  for (let index = 0; index < PERFORMANCE_MAX_DEPTH; index += 1) {
    const id = performanceNodeId(index);
    const parentId = index === 0 ? null : performanceNodeId(index - 1);
    const timestamp = performanceTimestamp(index);
    nodes[id] = {
      id,
      text: performanceText(index, random),
      parentId,
      children: index + 1 < PERFORMANCE_MAX_DEPTH ? [performanceNodeId(index + 1)] : [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    depths[index] = index + 1;
  }

  const availableParents = Array.from(
    { length: PERFORMANCE_MAX_DEPTH - 1 },
    (_, index) => index,
  );

  for (let index = PERFORMANCE_MAX_DEPTH; index < PERFORMANCE_NODE_COUNT; index += 1) {
    if (availableParents.length === 0) {
      throw new Error("The deterministic performance tree exhausted its parent capacity.");
    }
    const parentSlot = Math.floor(random() * availableParents.length);
    const parentIndex = availableParents[parentSlot];
    const parent = nodes[performanceNodeId(parentIndex)];
    const depth = depths[parentIndex] + 1;
    const id = performanceNodeId(index);
    const timestamp = performanceTimestamp(index);

    nodes[id] = {
      id,
      text: performanceText(index, random),
      parentId: parent.id,
      children: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    depths[index] = depth;
    parent.children.push(id);

    if (parent.children.length >= Math.min(6, MAX_CHILDREN_PER_NODE)) {
      availableParents.splice(parentSlot, 1);
    }
    if (depth < PERFORMANCE_MAX_DEPTH) {
      availableParents.push(index);
    }
  }

  const tree: ThoughtTree = {
    protocolVersion: "0.2",
    id: "matter_fixture_performance_2000",
    rootId: performanceNodeId(0),
    nodes,
    revision: 0,
  };
  const validation = validateThoughtTree(tree);
  if (!validation.ok) {
    throw new Error(
      `Invalid performance fixture: ${validation.error.code} ${validation.error.message}`,
    );
  }
  return tree;
}

function createBootstrapInsertCommand(
  tree: ThoughtTree,
  node: ThoughtNode,
  sequence: number,
): TreeCommand {
  const parent = node.parentId === null ? undefined : tree.nodes[node.parentId];
  if (parent === undefined) {
    throw new Error(`Fixture node ${node.id} names a parent that has not been committed.`);
  }
  return {
    id: `fixture_bootstrap_${sequence}`,
    source: "fixture",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation: {
      type: "insert-node",
      node: cloneNode(node),
      parentId: parent.id,
      index: parent.children.length,
      expectedParentChildren: [...parent.children],
    },
    createdAt: node.createdAt,
  };
}

function cloneNode(node: ThoughtNode): ThoughtNode {
  return { ...node, children: [...node.children] };
}

function performanceNodeId(index: number): string {
  return `perf_thought_${index.toString().padStart(4, "0")}`;
}

function performanceTimestamp(index: number): string {
  return new Date(PERFORMANCE_START_TIME + index * 1_000).toISOString();
}

function performanceText(index: number, random: () => number): string {
  const phraseCount = 1 + Math.floor(random() * 4);
  const parts: string[] = [];
  for (let phraseIndex = 0; phraseIndex < phraseCount; phraseIndex += 1) {
    const offset = Math.floor(random() * PERFORMANCE_PHRASES.length);
    parts.push(PERFORMANCE_PHRASES[(index + phraseIndex + offset) % PERFORMANCE_PHRASES.length]);
  }
  return parts.join("");
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

// Keep this local constant coupled to the fixture shape, not to product limits.
if (PERFORMANCE_MAX_DEPTH > MAX_TREE_DEPTH) {
  throw new Error("The performance fixture depth exceeds the tree-engine limit.");
}
