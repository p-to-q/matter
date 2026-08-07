import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { isDocumentRoot } from "../tree/document-root";
import type { NavigationState } from "../runtime/navigation";

export const MATERIAL_TITLE_MAX_GRAPHEMES = 32;
export const MATERIAL_KEYWORD_LIMIT = 4;

export type MaterialFileRow = Readonly<{
  nodeId: string;
  parentId: string | null;
  depth: number;
  createdAt: string;
  updatedAt: string;
  authoredIndex: number;
  hasChildren: boolean;
  folded: boolean;
  directMatch: boolean;
}>;

export type MaterialFileEntry = MaterialFileRow & Readonly<{
  title: string;
  keywords: readonly string[];
}>;

export type MaterialFileLabel = Readonly<{
  title: string;
  keywords: readonly string[];
}>;

export type MaterialSelectionResult =
  | Readonly<{ ok: true; text: string; nodeIds: readonly string[] }>
  | Readonly<{ ok: false; error: "EMPTY_SELECTION" | "STALE_SELECTION" }>;

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
  "from", "had", "has", "have", "he", "her", "his", "how", "i", "if", "in",
  "into", "is", "it", "its", "may", "not", "of", "on", "or", "our", "she",
  "so", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "to", "too", "us", "was", "we", "were", "what",
  "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

const CJK_STOPWORDS = new Set([
  "一个", "一些", "不是", "也许", "以及", "但是", "因为", "所以", "然后", "这个",
  "那个", "这些", "那些", "可以", "就是", "还是", "已经", "没有", "我们", "你们",
  "他们", "她们", "它们", "自己", "什么", "怎么", "如何", "如果", "而且", "或者",
  "其实", "相当于", "一下", "一种", "这样", "那样", "这里", "那里", "出来", "进行",
  "需要", "觉得", "比较", "非常", "的", "了", "和", "与", "及", "是", "在", "把",
  "被", "有", "也", "都", "就", "又", "而", "或", "我", "你", "他", "她", "它",
]);

const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });
const LEXICAL_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu;
const CJK_RUN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
const LABEL_CACHE = new WeakMap<ThoughtNode, Readonly<{
  title: string;
  keywords: readonly string[];
  searchText: string;
}>>();
const SOURCE_ROW_CACHE = new WeakMap<ThoughtTree, readonly MaterialFileSourceRow[]>();
const ROW_PROJECTION_CACHE = new WeakMap<ThoughtTree, Map<string, readonly MaterialFileRow[]>>();
const SUBTREE_SLICE_CACHE = new WeakMap<ThoughtTree, Map<string, readonly MaterialFileSourceRow[]>>();
const MAX_ROW_PROJECTIONS_PER_TREE = 64;
const NO_FOLDED_NODES: ReadonlySet<string> = new Set<string>();
const NO_ROWS: readonly MaterialFileRow[] = Object.freeze([]);

/**
 * Produces a stable, non-authoritative label for one Markdown material file.
 * Identity remains the node id; this label may change whenever its text does.
 */
export function deriveMaterialTitle(text: string): string {
  return deriveTitle(text, extractMaterialKeywords(text));
}

/** Resolves one cached display label without making it document authority. */
export function deriveMaterialFileLabel(node: ThoughtNode): MaterialFileLabel {
  return derivedLabel(node);
}

function deriveTitle(text: string, keywords: readonly string[]): string {
  const prepared = prepareDisplayText(text);
  if (prepared.length === 0) return "Untitled thought";

  const explicitHeading = firstExplicitHeading(text);
  if (explicitHeading !== null) return truncateAtGraphemeBoundary(explicitHeading);

  const clauses = splitClauses(prepared);
  const best = clauses
    .map((clause, index) => ({ clause, index, score: scoreClause(clause, index, clauses.length) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.clause ?? prepared;

  if (graphemeLength(best) <= MATERIAL_TITLE_MAX_GRAPHEMES) {
    return cleanTitleEdge(best);
  }

  if (keywords.length >= 2) return keywords.join(" · ");
  return truncateAtGraphemeBoundary(best);
}

/**
 * Ranks repeated and specific words across the complete passage. Selection is
 * deterministic so a render, undo, or reload never renames an unchanged node.
 */
export function extractMaterialKeywords(
  text: string,
  limit = MATERIAL_KEYWORD_LIMIT,
): readonly string[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return Object.freeze([]);
  const prepared = prepareDisplayText(text);
  const tokens = lexicalTokens(prepared);
  const stats = new Map<string, { display: string; count: number; first: number; length: number }>();

  for (const [index, token] of tokens.entries()) {
    const key = normalizeSearchText(token);
    if (!isInformativeToken(key)) continue;
    const existing = stats.get(key);
    if (existing === undefined) {
      stats.set(key, {
        display: token,
        count: 1,
        first: index,
        length: Math.min(scalarLength(token), 10),
      });
    } else {
      existing.count += 1;
    }
  }

  return Object.freeze(
    Array.from(stats.values())
      .sort((left, right) => {
        const leftScore = left.count * 8 + left.length;
        const rightScore = right.count * 8 + right.length;
        return rightScore - leftScore || left.first - right.first;
      })
      .slice(0, Math.min(limit, MATERIAL_KEYWORD_LIMIT))
      .map((stat) => stat.display),
  );
}

/**
 * Projects the authoritative ThoughtTree into a file-like outline. Filtering
 * temporarily reveals matching ancestry without mutating canvas fold state.
 */
export function projectMaterialFileRows(
  tree: ThoughtTree,
  navigation: NavigationState,
): readonly MaterialFileRow[] {
  const cacheKey = rowProjectionCacheKey(navigation);
  const cached = ROW_PROJECTION_CACHE.get(tree)?.get(cacheKey);
  if (cached !== undefined) return cached;
  const rows = projectSourceRows(tree);
  if (rows.length === 0) return Object.freeze([]);
  const focusLineage = navigation.mode === "focus"
    ? matchingNodesAndAncestors(tree, new Set([navigation.focusNodeId]))
    : null;
  const projection = materializeRows(
    navigation,
    rows,
    focusLineage,
    null,
    false,
  ) as readonly MaterialFileRow[];
  let treeCache = ROW_PROJECTION_CACHE.get(tree);
  if (treeCache === undefined) {
    treeCache = new Map();
    ROW_PROJECTION_CACHE.set(tree, treeCache);
  }
  if (treeCache.size >= MAX_ROW_PROJECTIONS_PER_TREE) {
    const oldest = treeCache.keys().next().value;
    if (oldest !== undefined) treeCache.delete(oldest);
  }
  treeCache.set(cacheKey, projection);
  return projection;
}

/**
 * Projects the outline the index actually shows: the root's children, and the
 * descendants of every row that has not been closed. Material arrives expanded,
 * because a thought that was just spoken must be readable without being hunted
 * for; closing is the deliberate act, and it is remembered per row.
 *
 * Closing is the index's own state. It is deliberately not the canvas fold:
 * collapsing a branch to read past it must not restructure the canvas.
 */
export function projectMaterialFileOutline(
  tree: ThoughtTree,
  collapsedNodeIds: ReadonlySet<string>,
  foldedNodeIds: ReadonlySet<string> = NO_FOLDED_NODES,
): readonly MaterialFileRow[] {
  if (tree.rootId === null) return NO_ROWS;
  const rows = projectSourceRows(tree);
  if (rows.length === 0) return NO_ROWS;
  const outline: MaterialFileRow[] = [];
  const hidden = new Set<string>();
  for (const row of rows) {
    const { node } = row;
    if (node.id === tree.rootId) continue;
    const parentId = node.parentId;
    if (parentId !== null && parentId !== tree.rootId) {
      if (hidden.has(parentId) || collapsedNodeIds.has(parentId)) {
        hidden.add(node.id);
        continue;
      }
    }
    outline.push(sourceToRow(row, foldedNodeIds));
  }
  return Object.freeze(outline);
}

/**
 * Flattens every descendant of `rootId` in authored preorder. Selection spans a
 * whole branch, so copying must not be limited to the level currently browsed.
 */
export function projectMaterialFileSubtree(
  tree: ThoughtTree,
  rootId: string | null,
  foldedNodeIds: ReadonlySet<string> = NO_FOLDED_NODES,
): readonly MaterialFileRow[] {
  const anchorId = rootId ?? tree.rootId;
  if (anchorId === null) return NO_ROWS;
  const slice = isDocumentRoot(tree, anchorId) ? projectSourceRows(tree) : subtreeSlice(tree, anchorId);
  if (slice.length === 0) return NO_ROWS;
  return Object.freeze(slice.map((row) => sourceToRow(row, foldedNodeIds)));
}

/**
 * Root-first ancestor ids of `nodeId`, excluding the node. Search results are
 * flat, so position is carried by this path rather than by indentation.
 */
export function projectMaterialAncestry(
  tree: ThoughtTree,
  nodeId: string,
): readonly string[] {
  const ancestry: string[] = [];
  const seen = new Set<string>([nodeId]);
  let current = ownNode(tree, nodeId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    ancestry.push(current);
    current = ownNode(tree, current)?.parentId ?? null;
  }
  return Object.freeze(ancestry.reverse().filter((id) => !isDocumentRoot(tree, id)));
}

/**
 * `labels` are the names actually rendered in the index — a semantic label or a
 * name a person typed. They join the haystack because a person searches for
 * what they can see, and a manual name may share no characters with the
 * material underneath it.
 */
export function projectMaterialFiles(
  tree: ThoughtTree,
  navigation: NavigationState,
  query = "",
  labels?: ReadonlyMap<string, string>,
): readonly MaterialFileEntry[] {
  const rows = projectSourceRows(tree);
  if (rows.length === 0) return Object.freeze([]);

  const normalizedQuery = normalizeSearchText(query.trim());
  const directMatches = new Set<string>();
  if (normalizedQuery.length > 0) {
    const terms = normalizedQuery.split(/\s+/u).filter(Boolean);
    for (const row of rows) {
      const rendered = labels?.get(row.node.id);
      const haystack = rendered === undefined
        ? derivedLabel(row.node).searchText
        : `${derivedLabel(row.node).searchText} ${normalizeSearchText(rendered)}`;
      if (terms.every((term) => haystack.includes(term))) directMatches.add(row.node.id);
    }
  }

  const focusLineage = navigation.mode === "focus"
    ? matchingNodesAndAncestors(tree, new Set([navigation.focusNodeId]))
    : null;
  const included = focusLineage === null
    ? (normalizedQuery.length === 0
        ? null
        : matchingNodesAndAncestors(tree, directMatches))
    : (normalizedQuery.length === 0
        ? focusLineage
        : matchingFocusMatches(tree, directMatches, focusLineage));
  return materializeRows(
    navigation,
    rows,
    included,
    normalizedQuery.length === 0 ? null : directMatches,
    true,
  ) as readonly MaterialFileEntry[];
}

type MaterialFileSourceRow = Readonly<{
  node: ThoughtNode;
  depth: number;
  authoredIndex: number;
}>;

function projectSourceRows(tree: ThoughtTree): readonly MaterialFileSourceRow[] {
  const cached = SOURCE_ROW_CACHE.get(tree);
  if (cached !== undefined) return cached;
  if (tree.rootId === null || !hasOwnNode(tree, tree.rootId)) return Object.freeze([]);
  const rows: MaterialFileSourceRow[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string, depth: number): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = ownNode(tree, nodeId);
    if (node === undefined) return;
    const structuralRoot = isDocumentRoot(tree, node.id);
    if (!structuralRoot) rows.push(Object.freeze({ node, depth, authoredIndex: rows.length }));
    for (const childId of node.children) visit(childId, structuralRoot ? depth : depth + 1);
  };
  visit(tree.rootId, 0);
  const projection = Object.freeze(rows);
  SOURCE_ROW_CACHE.set(tree, projection);
  return projection;
}

function subtreeSlice(tree: ThoughtTree, rootId: string): readonly MaterialFileSourceRow[] {
  let treeCache = SUBTREE_SLICE_CACHE.get(tree);
  if (treeCache === undefined) {
    treeCache = new Map();
    SUBTREE_SLICE_CACHE.set(tree, treeCache);
  }
  const cached = treeCache.get(rootId);
  if (cached !== undefined) return cached;
  const rows = projectSourceRows(tree);
  const start = rows.findIndex((row) => row.node.id === rootId);
  const slice: MaterialFileSourceRow[] = [];
  if (start >= 0) {
    const baseDepth = rows[start]!.depth;
    for (let index = start + 1; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (row.depth <= baseDepth) break;
      slice.push(row);
    }
  }
  const projection = Object.freeze(slice);
  if (treeCache.size >= MAX_ROW_PROJECTIONS_PER_TREE) {
    const oldest = treeCache.keys().next().value;
    if (oldest !== undefined) treeCache.delete(oldest);
  }
  treeCache.set(rootId, projection);
  return projection;
}

function sourceToRow(
  row: MaterialFileSourceRow,
  foldedNodeIds: ReadonlySet<string>,
): MaterialFileRow {
  const { node } = row;
  return Object.freeze({
    nodeId: node.id,
    parentId: node.parentId,
    depth: row.depth,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    authoredIndex: row.authoredIndex,
    hasChildren: node.children.length > 0,
    folded: foldedNodeIds.has(node.id),
    directMatch: true,
  });
}

function rowProjectionCacheKey(navigation: NavigationState): string {
  return JSON.stringify([
    navigation.mode,
    navigation.mode === "focus" ? navigation.focusNodeId : null,
    Array.from(navigation.foldedNodeIds).sort(),
  ]);
}

function materializeRows(
  navigation: NavigationState,
  rows: readonly MaterialFileSourceRow[],
  included: ReadonlySet<string> | null,
  directMatches: ReadonlySet<string> | null,
  includeLabels: boolean,
): readonly MaterialFileRow[] | readonly MaterialFileEntry[] {
  const hiddenByFold = new Set<string>();
  const entries: Array<MaterialFileRow | MaterialFileEntry> = [];
  for (const row of rows) {
    const { node } = row;
    if (included !== null && !included.has(node.id)) continue;
    if (included === null && hiddenByFold.has(node.id)) {
      for (const childId of node.children) hiddenByFold.add(childId);
      continue;
    }
    const folded = navigation.foldedNodeIds.has(node.id);
    const materialRow: MaterialFileRow = Object.freeze({
      nodeId: node.id,
      parentId: node.parentId,
      depth: row.depth,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      authoredIndex: row.authoredIndex,
      hasChildren: node.children.length > 0,
      folded,
      directMatch: directMatches === null || directMatches.has(node.id),
    });
    if (includeLabels) {
      const label = derivedLabel(node);
      entries.push(Object.freeze({ ...materialRow, title: label.title, keywords: label.keywords }));
    } else {
      entries.push(materialRow);
    }
    if (included === null && folded) {
      for (const childId of node.children) hiddenByFold.add(childId);
    }
  }
  return Object.freeze(entries);
}

/** Copies exact node text in authored preorder; labels and metadata stay out. */
export function serializeMaterialSelection(
  tree: ThoughtTree,
  selectedNodeIds: ReadonlySet<string>,
): MaterialSelectionResult {
  if (selectedNodeIds.size === 0) return Object.freeze({ ok: false, error: "EMPTY_SELECTION" });
  for (const nodeId of selectedNodeIds) {
    if (!hasOwnNode(tree, nodeId)) return Object.freeze({ ok: false, error: "STALE_SELECTION" });
  }

  const ordered: ThoughtNode[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = ownNode(tree, nodeId);
    if (node === undefined) return;
    if (selectedNodeIds.has(node.id)) ordered.push(node);
    for (const childId of node.children) visit(childId);
  };
  if (tree.rootId !== null) visit(tree.rootId);
  if (ordered.length !== selectedNodeIds.size) {
    return Object.freeze({ ok: false, error: "STALE_SELECTION" });
  }
  return Object.freeze({
    ok: true,
    text: ordered.map((node) => node.text).join("\n\n"),
    nodeIds: Object.freeze(ordered.map((node) => node.id)),
  });
}

function splitClauses(text: string): string[] {
  return text
    .split(/[\n\r,，。；;：:！!？?]+/u)
    .map(cleanTitleEdge)
    .filter((clause) => clause.length > 0);
}

function derivedLabel(node: ThoughtNode) {
  const cached = LABEL_CACHE.get(node);
  if (cached !== undefined) return cached;
  const keywords = extractMaterialKeywords(node.text);
  const title = deriveTitle(node.text, keywords);
  const label = Object.freeze({
    title,
    keywords,
    searchText: normalizeSearchText(`${title} ${keywords.join(" ")} ${node.text}`),
  });
  LABEL_CACHE.set(node, label);
  return label;
}

function scoreClause(clause: string, index: number, total: number): number {
  const tokens = lexicalTokens(clause);
  const informative = tokens.filter((token) => isInformativeToken(normalizeSearchText(token)));
  const length = scalarLength(clause);
  const center = total <= 1 ? 1 : 1 - Math.abs(index / (total - 1) - 0.5);
  const readableLength = length >= 4 && length <= MATERIAL_TITLE_MAX_GRAPHEMES ? 8 : 0;
  const noisePenalty = tokens.length === 0 ? 10 : (tokens.length - informative.length) / tokens.length * 4;
  return informative.length * 5 + new Set(informative.map(normalizeSearchText)).size * 2 + readableLength + center * 2 - noisePenalty;
}

function lexicalTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(LEXICAL_RUN)) {
    const run = match[0];
    if (!CJK_RUN.test(run)) {
      tokens.push(run);
      continue;
    }
    const graphemes = Array.from(run);
    if (graphemes.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let index = 0; index < graphemes.length - 1; index += 1) {
      tokens.push(`${graphemes[index]}${graphemes[index + 1]}`);
    }
  }
  return tokens;
}

function isInformativeToken(normalized: string): boolean {
  if (normalized.length === 0 || /^\p{N}+$/u.test(normalized)) return false;
  if (ENGLISH_STOPWORDS.has(normalized) || CJK_STOPWORDS.has(normalized)) return false;
  if (/^\p{Script=Latin}$/u.test(normalized)) return false;
  if (/^\p{Script=Han}$/u.test(normalized)) return false;
  return /[\p{L}\p{N}]/u.test(normalized);
}

function prepareDisplayText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\b(?:https?:\/\/|www\.)\S+/giu, " ")
    .replace(/[`*_~]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function firstExplicitHeading(text: string): string | null {
  for (const line of text.normalize("NFC").split(/\r?\n/u)) {
    const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (match?.[1]) return cleanTitleEdge(match[1]);
    if (line.trim().length > 0) return null;
  }
  return null;
}

function cleanTitleEdge(value: string): string {
  return value
    .replace(/^\s*(?:[-+*]>?\s+|>\s*)/u, "")
    .replace(/[\s,，。；;：:！!？?…—-]+$/u, "")
    .trim();
}

function truncateAtGraphemeBoundary(value: string): string {
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(cleanTitleEdge(value)), (part) => part.segment);
  if (graphemes.length <= MATERIAL_TITLE_MAX_GRAPHEMES) return graphemes.join("");
  return `${cleanTitleEdge(graphemes.slice(0, MATERIAL_TITLE_MAX_GRAPHEMES - 1).join(""))}…`;
}

function graphemeLength(value: string): number {
  return Array.from(GRAPHEME_SEGMENTER.segment(value)).length;
}

function scalarLength(value: string): number {
  return Array.from(value).length;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

function matchingNodesAndAncestors(
  tree: ThoughtTree,
  directMatches: ReadonlySet<string>,
): Set<string> {
  const included = new Set<string>();
  for (const nodeId of directMatches) {
    let current: string | null = nodeId;
    const lineage = new Set<string>();
    while (current !== null && !lineage.has(current)) {
      lineage.add(current);
      included.add(current);
      current = ownNode(tree, current)?.parentId ?? null;
    }
  }
  return included;
}

function matchingFocusMatches(
  tree: ThoughtTree,
  directMatches: ReadonlySet<string>,
  focusLineage: ReadonlySet<string>,
): Set<string> {
  const visibleMatches = new Set(
    Array.from(directMatches).filter((nodeId) => focusLineage.has(nodeId)),
  );
  return matchingNodesAndAncestors(tree, visibleMatches);
}

function hasOwnNode(tree: ThoughtTree, nodeId: string): boolean {
  return Object.hasOwn(tree.nodes, nodeId);
}

function ownNode(tree: ThoughtTree, nodeId: string): ThoughtNode | undefined {
  return hasOwnNode(tree, nodeId) ? tree.nodes[nodeId] : undefined;
}
