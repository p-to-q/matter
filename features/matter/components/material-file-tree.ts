import type { MaterialFileRow } from "../material/material-files";

export type MaterialFileTreeSemantics = Readonly<{
  level: number;
  positionInSet: number;
  setSize: number;
}>;

export type MaterialFileTreeKeyResult =
  | Readonly<{ kind: "collapse" | "expand" }>
  | Readonly<{ kind: "focus"; index: number }>;

/**
 * The index is virtualized as one flat DOM list. These values preserve its
 * authored hierarchy for assistive technology without constructing a second
 * tree or requiring every sibling to be mounted.
 */
export function projectMaterialFileTreeSemantics(
  rows: readonly MaterialFileRow[],
): readonly MaterialFileTreeSemantics[] {
  if (rows.length === 0) return Object.freeze([]);
  const baseDepth = rows.reduce((minimum, row) => Math.min(minimum, row.depth), rows[0]!.depth);
  const setSizes = new Map<string | null, number>();
  for (const row of rows) setSizes.set(row.parentId, (setSizes.get(row.parentId) ?? 0) + 1);
  const positions = new Map<string | null, number>();
  return Object.freeze(rows.map((row) => {
    const positionInSet = (positions.get(row.parentId) ?? 0) + 1;
    positions.set(row.parentId, positionInSet);
    return Object.freeze({
      level: Math.max(1, row.depth - baseDepth + 1),
      positionInSet,
      setSize: setSizes.get(row.parentId) ?? 1,
    });
  }));
}

/** Standard non-wrapping tree movement over the complete projected outline. */
export function resolveMaterialFileTreeKey(
  rows: readonly MaterialFileRow[],
  currentIndex: number,
  key: string,
  expanded: boolean,
): MaterialFileTreeKeyResult | null {
  const current = rows[currentIndex];
  if (current === undefined) return null;
  if (key === "Home") return Object.freeze({ kind: "focus", index: 0 });
  if (key === "End") return Object.freeze({ kind: "focus", index: rows.length - 1 });
  if (key === "ArrowDown" && currentIndex + 1 < rows.length) {
    return Object.freeze({ kind: "focus", index: currentIndex + 1 });
  }
  if (key === "ArrowUp" && currentIndex > 0) {
    return Object.freeze({ kind: "focus", index: currentIndex - 1 });
  }
  if (key === "ArrowRight") {
    if (!current.hasChildren) return null;
    if (!expanded) return Object.freeze({ kind: "expand" });
    const childIndex = currentIndex + 1;
    return rows[childIndex]?.parentId === current.nodeId
      ? Object.freeze({ kind: "focus", index: childIndex })
      : null;
  }
  if (key !== "ArrowLeft") return null;
  if (current.hasChildren && expanded) return Object.freeze({ kind: "collapse" });
  const parentIndex = rows.findIndex((row) => row.nodeId === current.parentId);
  return parentIndex < 0 ? null : Object.freeze({ kind: "focus", index: parentIndex });
}

/**
 * Local selection and disclosure never survive the disappearance of their
 * node. This prevents Undo from reviving an old transient choice with the same
 * durable id.
 */
export function pruneMaterialFileNodeIds(
  ids: ReadonlySet<string>,
  nodes: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  const next = new Set(Array.from(ids).filter((nodeId) => Object.hasOwn(nodes, nodeId)));
  return next.size === ids.size ? ids : next;
}
