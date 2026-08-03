import type {
  RelationshipObject,
  SceneDocument,
  SceneObject,
  ThoughtObject,
} from "./protocol";

export type DocumentContextLimits = {
  ancestors: number;
  children: number;
  related: number;
};

export type DocumentContext = {
  focus: ThoughtObject;
  /** Nearest ancestry, presented from the highest included ancestor downward. */
  ancestors: ThoughtObject[];
  children: ThoughtObject[];
  /** Explicitly linked thoughts not already present in the hierarchy context. */
  related: ThoughtObject[];
};

export const DEFAULT_DOCUMENT_CONTEXT_LIMITS: DocumentContextLimits = {
  ancestors: 4,
  children: 6,
  related: 6,
};

const MAX_CONTEXT_ITEMS_PER_GROUP = 20;

function boundedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CONTEXT_ITEMS_PER_GROUP, Math.max(0, Math.floor(value)));
}

function orderedObjects(scene: SceneDocument): SceneObject[] {
  const seen = new Set<string>();
  const orderedIds = [...scene.order, ...Object.keys(scene.objects).sort()];

  return orderedIds.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const object = scene.objects[id];
    return object ? [object] : [];
  });
}

function isThought(object: SceneObject | undefined): object is ThoughtObject {
  return object?.type === "thought";
}

function connectedThoughtId(
  relationship: RelationshipObject,
  focusId: string,
): string | undefined {
  if (relationship.fromId === focusId) return relationship.toId;
  if (relationship.toId === focusId) return relationship.fromId;
  return undefined;
}

/**
 * Reads a compact, deterministic document view around one thought.
 * Invalid focus IDs return null; malformed ancestry stops at the last valid node.
 */
export function readDocumentContext(
  scene: SceneDocument,
  focusId: string,
  requestedLimits: Partial<DocumentContextLimits> = {},
): DocumentContext | null {
  const focus = scene.objects[focusId];
  if (!isThought(focus)) return null;

  const limits: DocumentContextLimits = {
    ancestors: boundedLimit(
      requestedLimits.ancestors,
      DEFAULT_DOCUMENT_CONTEXT_LIMITS.ancestors,
    ),
    children: boundedLimit(
      requestedLimits.children,
      DEFAULT_DOCUMENT_CONTEXT_LIMITS.children,
    ),
    related: boundedLimit(
      requestedLimits.related,
      DEFAULT_DOCUMENT_CONTEXT_LIMITS.related,
    ),
  };
  const ordered = orderedObjects(scene);
  const includedIds = new Set([focus.id]);

  const nearestAncestors: ThoughtObject[] = [];
  let parentId = focus.parentId;
  while (parentId && nearestAncestors.length < limits.ancestors) {
    if (includedIds.has(parentId)) break;
    const parent = scene.objects[parentId];
    if (!isThought(parent)) break;
    nearestAncestors.push(parent);
    includedIds.add(parent.id);
    parentId = parent.parentId;
  }
  const ancestors = nearestAncestors.reverse();

  const children = ordered
    .filter(
      (object): object is ThoughtObject =>
        isThought(object) &&
        object.parentId === focus.id &&
        !includedIds.has(object.id),
    )
    .slice(0, limits.children);
  children.forEach((child) => includedIds.add(child.id));

  const linkedIds = new Set<string>();
  for (const object of ordered) {
    if (object.type !== "relationship") continue;
    const connectedId = connectedThoughtId(object, focus.id);
    if (connectedId) linkedIds.add(connectedId);
  }

  const related = ordered
    .filter(
      (object): object is ThoughtObject =>
        isThought(object) &&
        linkedIds.has(object.id) &&
        !includedIds.has(object.id),
    )
    .slice(0, limits.related);

  return { focus, ancestors, children, related };
}
