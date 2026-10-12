import type { ThoughtTree } from "../tree/model";

/**
 * One selection session of the index's select mode. Ticking a passage pulls its
 * ancestors in as context; the person may untick any of them, and an unticked
 * row is not ticked again by a later pull. It is transient index state: it
 * never enters the document, and it is dropped when select mode closes.
 */
export type SelectionSession = Readonly<{
  /** Every checked row, context included; the copy and the count read this. */
  ticked: ReadonlySet<string>;
  /** Rows the person ticked themselves. A checked row outside it is context. */
  explicit: ReadonlySet<string>;
  /** Rows the person unticked in this session; a pull never re-ticks them. */
  declined: ReadonlySet<string>;
}>;

type Nodes = ThoughtTree["nodes"];

export const EMPTY_SELECTION_SESSION: SelectionSession = Object.freeze({
  ticked: new Set<string>(),
  explicit: new Set<string>(),
  declined: new Set<string>(),
});

/**
 * Ancestors of a passage, nearest first, up to but excluding the invisible
 * document root. A broken chain or a cycle ends the walk.
 */
export function selectionAncestorIds(nodes: Nodes, nodeId: string): readonly string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([nodeId]);
  let current = own(nodes, nodeId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const node = own(nodes, current);
    if (node === undefined || node.role === "document-root") break;
    ancestors.push(current);
    current = node.parentId;
  }
  return ancestors;
}

/**
 * Ticking an unchecked row checks it and pulls in each ancestor the person has
 * not declined; unticking a checked row unchecks only that row. Unticking the
 * last checked row ends the session, so its declined memory goes too.
 */
export function toggleSelectionRow(
  nodes: Nodes,
  session: SelectionSession,
  nodeId: string,
): SelectionSession {
  if (!Object.hasOwn(nodes, nodeId)) return session;
  const ticked = new Set(session.ticked);
  const explicit = new Set(session.explicit);
  const declined = new Set(session.declined);

  if (ticked.has(nodeId)) {
    ticked.delete(nodeId);
    explicit.delete(nodeId);
    if (ticked.size === 0) return EMPTY_SELECTION_SESSION;
    declined.add(nodeId);
    return Object.freeze({ ticked, explicit, declined });
  }

  ticked.add(nodeId);
  explicit.add(nodeId);
  declined.delete(nodeId);
  for (const ancestorId of selectionAncestorIds(nodes, nodeId)) {
    if (!declined.has(ancestorId)) ticked.add(ancestorId);
  }
  return Object.freeze({ ticked, explicit, declined });
}

/** A checked row that is there only because a descendant pulled it in. */
export function isContextRow(session: SelectionSession, nodeId: string): boolean {
  return session.ticked.has(nodeId) && !session.explicit.has(nodeId);
}

/** Drops ids that no longer name a passage, so an edit cannot leave a ghost row ticked. */
export function pruneSelectionSession(nodes: Nodes, session: SelectionSession): SelectionSession {
  const keep = (ids: ReadonlySet<string>) => {
    const kept = new Set(Array.from(ids).filter((id) => Object.hasOwn(nodes, id)));
    return kept.size === ids.size ? ids : kept;
  };
  const ticked = keep(session.ticked);
  if (ticked.size === 0) return EMPTY_SELECTION_SESSION;
  const explicit = keep(session.explicit);
  const declined = keep(session.declined);
  return ticked === session.ticked && explicit === session.explicit && declined === session.declined
    ? session
    : Object.freeze({ ticked, explicit, declined });
}

function own(nodes: Nodes, nodeId: string) {
  return Object.hasOwn(nodes, nodeId) ? nodes[nodeId] : undefined;
}
