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

export const ROOTED_FIXTURE_TREE_ID = "matter_fixture_rooted_01";

export const ROOTED_FIXTURE_NODE_IDS = {
  root: "thought_fixture_root",
  language: "thought_fixture_language",
  distance: "thought_fixture_distance",
  hesitation: "thought_fixture_hesitation",
  body: "thought_fixture_body",
} as const;

export const HACKATHON_FIXTURE_VERSIONS = [
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

const FIXTURE_HISTORY_LIMITS = {
  maxEntries: 32,
  maxRetainedInverseBytes: 256_000,
};

const FIXTURE_INSERT_TIME = "2026-08-03T08:10:00.000Z";

const FIXTURE_CHILD_TEXTS = [
  "也许这里还缺少一个更具体的例子，但我暂时不想替它下结论。",
  "这条路似乎能继续往下走，只是它和身体之间的关系还没有说清楚。",
  "我记得当时有一种很短的迟疑，后来它反而成了这段想法的入口。",
] as const;

const BOOTSTRAP_NODES: readonly ThoughtNode[] = [
  {
    id: ROOTED_FIXTURE_NODE_IDS.root,
    text: HACKATHON_FIXTURE_VERSIONS[0].text,
    parentId: null,
    children: [],
    createdAt: "2026-08-03T08:00:00.000Z",
    updatedAt: "2026-08-03T08:00:00.000Z",
  },
] as const;

export type RootedMaterialFixture = {
  tree: ThoughtTree;
  history: TreeHistory;
};

/**
 * Builds seed material through the same atomic commit boundary used at runtime.
 * Bootstrap commands are then forgotten: opening a fixture must not present
 * setup work as a person's undo history.
 */
export function createRootedMaterialFixture(): RootedMaterialFixture {
  let tree = createEmptyTree(ROOTED_FIXTURE_TREE_ID);
  let history = createTreeHistory();

  for (const [index, node] of BOOTSTRAP_NODES.entries()) {
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
      FIXTURE_HISTORY_LIMITS,
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
 * Creates the next deterministic fixture action. Its text is closed fixture
 * input, not a product prompt surface. The engine remains the sole owner of
 * parent existence, child limits, insertion bounds, and id-collision checks.
 */
export function createFixtureInsertChildCommand(
  tree: ThoughtTree,
  parentId: string,
  index = tree.nodes[parentId]?.children.length ?? 0,
): TreeCommand {
  const sequence = tree.revision;
  const text = FIXTURE_CHILD_TEXTS[sequence % FIXTURE_CHILD_TEXTS.length];
  const nodeId = `thought_fixture_added_r${sequence}`;

  return {
    id: `fixture_insert_r${sequence}`,
    source: "fixture",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation: {
      type: "insert-node",
      node: {
        id: nodeId,
        text,
        parentId,
        children: [],
        createdAt: FIXTURE_INSERT_TIME,
        updatedAt: FIXTURE_INSERT_TIME,
      },
      parentId,
      index,
      expectedParentChildren: [...(tree.nodes[parentId]?.children ?? [])],
    },
    createdAt: FIXTURE_INSERT_TIME,
  };
}

export function createFixtureReplaceTextCommand(
  tree: ThoughtTree,
  nodeId: string,
  text: string,
): TreeCommand {
  const node = tree.nodes[nodeId];
  const sequence = tree.revision;
  return {
    id: `fixture_replace_r${sequence}`,
    source: "fixture",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation: {
      type: "replace-text",
      nodeId,
      expectedText: node?.text ?? "",
      expectedUpdatedAt: node?.updatedAt ?? "",
      text,
      updatedAt: FIXTURE_INSERT_TIME,
    },
    createdAt: FIXTURE_INSERT_TIME,
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
