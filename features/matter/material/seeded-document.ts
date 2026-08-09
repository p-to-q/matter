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
  MAX_TREE_DEPTH,
  createEmptyTree,
  validateThoughtTree,
} from "../tree/invariants";
import type { ThoughtNode, ThoughtTree, TreeCommand } from "../tree/model";

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

export const SEEDED_IMAGINED_LIVES_TEXT = "被允许想象的其他生活";

export const SEEDED_DOCUMENT_TEXT_VARIANTS = [
  {
    id: "quiet",
    label: "v1",
    text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
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


const BRANCH_TEXTS_BY_PARENT: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [SEEDED_DOCUMENT_NODE_IDS.root]: Object.freeze([
    "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
    "过去之所以动人，也许因为它让今天暂时看见另一种安排。",
    "怀念不是返回原处，而是确认还有没有继续想象的入口。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.imaginedLives]: Object.freeze([
    "被允许想象的生活，不必立刻证明自己有效。",
    "另一种生活先以可能的样子存在，再慢慢找到它的形状。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.imaginedTime]: Object.freeze([
    "那种时间的价值，也许正在于它没有急着把一切变成结果。",
    "如果时间不只用来交付，迟疑也可以成为一种方向。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.presentDistance]: Object.freeze([
    "今天的距离也许来自我们已经习惯用现在的尺度解释过去。",
    "过去显得遥远，并不代表它曾经完整地存在过。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.presentFailure]: Object.freeze([
    "不完整并不是缺陷，它让今天仍有重新想象的缝隙。",
    "正因为无法被完全证明，这个入口才没有被封死。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.presentOpening]: Object.freeze([
    "入口不必把人带回过去，它只需要让别的安排暂时可见。",
    "只要还可以被看见，怀念就不只是回去的路线。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.bodilyMemory]: Object.freeze([
    "身体记住的不是年代，而是它曾经可以朝向别处的节奏。",
    "有些怀念先以步速和停顿回来，语言只是在后面追上它。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.bodilyGesture]: Object.freeze([
    "停顿留下的方向，比一句解释更早让身体知道该往哪里去。",
    "当语言追上动作时，记忆已经先替它保留了余地。",
  ]),
  [SEEDED_DOCUMENT_NODE_IDS.bodilyReturn]: Object.freeze([
    "所以这段话不急着把过去说清楚，只先留住调整方向的感觉。",
    "身体保留下来的那一点余地，足够让下一句话继续生长。",
  ]),
});

const BRANCH_TEXTS = Object.freeze([
  "这条想法还可以继续往下走，但先保留它没有说完的部分。",
  "这里暂时不替它下结论，只让一个更具体的方向留在旁边。",
  "它和前一句仍然有一点距离，这一点距离也可以成为新的入口。",
]);

const BOOTSTRAP_NODES: readonly ThoughtNode[] = [
  {
    id: SEEDED_DOCUMENT_NODE_IDS.root,
    text: SEEDED_DOCUMENT_TEXT_VARIANTS[0].text,
    parentId: null,
    children: [],
    createdAt: "2026-08-03T08:00:00.000Z",
    updatedAt: "2026-08-03T08:00:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    text: SEEDED_IMAGINED_LIVES_TEXT,
    parentId: SEEDED_DOCUMENT_NODE_IDS.root,
    children: [],
    createdAt: "2026-08-03T08:01:00.000Z",
    updatedAt: "2026-08-03T08:01:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.imaginedTime,
    text: "也许怀念的是一种不必立刻证明效率的时间，它还没有被切成可以交付的单位。",
    parentId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    children: [],
    createdAt: "2026-08-03T08:02:00.000Z",
    updatedAt: "2026-08-03T08:02:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.imaginedRelations,
    text: "也许那里的人与人之间还有一些不必被计算的往来，慢一点也不会立刻失去位置。",
    parentId: SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
    children: [],
    createdAt: "2026-08-03T08:03:00.000Z",
    updatedAt: "2026-08-03T08:03:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
    text: "过去为什么在今天显得遥远",
    parentId: SEEDED_DOCUMENT_NODE_IDS.root,
    children: [],
    createdAt: "2026-08-03T08:04:00.000Z",
    updatedAt: "2026-08-03T08:04:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.presentFailure,
    text: "它未必真的存在过；正因为不完整，才更容易被今天的缺口照亮。",
    parentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
    children: [],
    createdAt: "2026-08-03T08:05:00.000Z",
    updatedAt: "2026-08-03T08:05:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.presentOpening,
    text: "怀念不是回去的路线，更像一个还没有被封死的入口，让别的安排暂时可以被看见。",
    parentId: SEEDED_DOCUMENT_NODE_IDS.presentDistance,
    children: [],
    createdAt: "2026-08-03T08:06:00.000Z",
    updatedAt: "2026-08-03T08:06:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
    text: "身体怎样保存这种怀念",
    parentId: SEEDED_DOCUMENT_NODE_IDS.root,
    children: [],
    createdAt: "2026-08-03T08:07:00.000Z",
    updatedAt: "2026-08-03T08:07:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.bodilyGesture,
    text: "有些记忆先以步速、停顿和说话时的犹豫回来，语言只是在后面追上它们。",
    parentId: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
    children: [],
    createdAt: "2026-08-03T08:08:00.000Z",
    updatedAt: "2026-08-03T08:08:00.000Z",
  },
  {
    id: SEEDED_DOCUMENT_NODE_IDS.bodilyReturn,
    text: "所以这段话不急着把过去说清楚，只想留住那一点仍能让身体调整方向的感觉。",
    parentId: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
    children: [],
    createdAt: "2026-08-03T08:09:00.000Z",
    updatedAt: "2026-08-03T08:09:00.000Z",
  },
] as const;

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

  const bootstrapNodes = variant === "root" ? BOOTSTRAP_NODES.slice(0, 1) : BOOTSTRAP_NODES;
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
): TreeCommand {
  const text = branchChildText(tree, parentId);

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

function branchChildText(tree: ThoughtTree, parentId: string): string {
  const parent = tree.nodes[parentId];
  const options = BRANCH_TEXTS_BY_PARENT[parentId] ?? BRANCH_TEXTS;
  return options[(parent?.children.length ?? 0) % options.length] ?? BRANCH_TEXTS[0];
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
