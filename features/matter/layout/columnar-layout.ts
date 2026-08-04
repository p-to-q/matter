import type {
  ColumnarLayoutInput,
  ColumnarLayoutResult,
  LayoutBox,
  LayoutEdge,
  LayoutError,
  LayoutErrorCode,
  LayoutNode,
} from "./model";

type LayoutFailure = { ok: false; error: LayoutError };

function failure(
  code: LayoutErrorCode,
  nodeId?: string,
): LayoutFailure {
  return nodeId === undefined
    ? { ok: false, error: { code } }
    : { ok: false, error: { code, nodeId } };
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function validateConfiguration(
  input: ColumnarLayoutInput,
): LayoutFailure | null {
  if (!Number.isSafeInteger(input.layoutEpoch) || input.layoutEpoch < 0) {
    return failure("INVALID_LAYOUT_EPOCH");
  }
  if (!isFiniteNumber(input.origin.x) || !isFiniteNumber(input.origin.y)) {
    return failure("INVALID_ORIGIN");
  }
  if (!isFiniteNumber(input.columnWidth) || input.columnWidth <= 0) {
    return failure("INVALID_COLUMN_WIDTH");
  }
  if (!isFiniteNumber(input.columnGap) || input.columnGap < 0) {
    return failure("INVALID_COLUMN_GAP");
  }
  if (!isFiniteNumber(input.siblingGap) || input.siblingGap < 0) {
    return failure("INVALID_SIBLING_GAP");
  }
  return null;
}

type ValidatedTree = {
  childrenByIndex: number[][];
  parentIndexByIndex: Array<number | null>;
};

function validateTree(
  nodes: readonly LayoutNode[],
  columnWidth: number,
): ValidatedTree | LayoutFailure {
  if (nodes.length === 0) {
    return { childrenByIndex: [], parentIndexByIndex: [] };
  }

  const seen = new Map<string, number>();
  const activePath: number[] = [];
  const childrenByIndex: number[][] = nodes.map(() => []);
  const parentIndexByIndex: Array<number | null> = nodes.map(() => null);

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) {
      return failure("INVALID_PREORDER");
    }
    if (node.id.length === 0) {
      return failure("INVALID_NODE_ID");
    }
    if (seen.has(node.id)) {
      return failure("DUPLICATE_NODE_ID", node.id);
    }
    if (!Number.isSafeInteger(node.depth) || node.depth < 0) {
      return failure("INVALID_DEPTH", node.id);
    }
    if (
      !isFiniteNumber(node.size.width) ||
      !isFiniteNumber(node.size.height) ||
      node.size.width <= 0 ||
      node.size.height <= 0
    ) {
      return failure("INVALID_NODE_SIZE", node.id);
    }
    if (
      node.presentation !== undefined &&
      (
        !isFiniteNumber(node.presentation.topExtent) ||
        !isFiniteNumber(node.presentation.bottomExtent) ||
        node.presentation.topExtent < 0 ||
        node.presentation.bottomExtent < 0
      )
    ) {
      return failure("INVALID_PRESENTATION_EXTENT", node.id);
    }
    if (node.size.width > columnWidth) {
      return failure("NODE_WIDTH_EXCEEDS_COLUMN", node.id);
    }

    if (index === 0) {
      if (node.parentId !== null || node.depth !== 0) {
        return failure("INVALID_ROOT", node.id);
      }
    } else {
      if (node.parentId === null || node.depth === 0) {
        return failure("INVALID_ROOT", node.id);
      }
      const parentIndex = seen.get(node.parentId);
      if (parentIndex === undefined) {
        return failure("MISSING_PARENT", node.id);
      }
      if (node.depth > activePath.length) {
        return failure("INVALID_DEPTH", node.id);
      }
      const preorderParentIndex = activePath[node.depth - 1];
      if (preorderParentIndex !== parentIndex) {
        return failure("INVALID_PREORDER", node.id);
      }
      childrenByIndex[parentIndex]?.push(index);
      parentIndexByIndex[index] = parentIndex;
    }

    activePath.length = node.depth;
    activePath[node.depth] = index;
    seen.set(node.id, index);
  }

  return { childrenByIndex, parentIndexByIndex };
}

function isFailure(
  value: ValidatedTree | LayoutFailure,
): value is LayoutFailure {
  return "ok" in value && !value.ok;
}

function publishLayout(
  layoutEpoch: number,
  boxes: LayoutBox[],
  edges: LayoutEdge[],
  bounds: { x: number; y: number; width: number; height: number },
): ColumnarLayoutResult {
  for (const box of boxes) {
    Object.freeze(box);
  }
  for (const edge of edges) {
    for (const point of edge.points) {
      Object.freeze(point);
    }
    Object.freeze(edge.points);
    Object.freeze(edge);
  }

  const layout = Object.freeze({
    layoutEpoch,
    boxes: Object.freeze(boxes),
    edges: Object.freeze(edges),
    bounds: Object.freeze(bounds),
  });
  return Object.freeze({ ok: true, layout });
}

/**
 * Derives a top-anchored columnar tree without consulting the DOM. The first
 * child occupies its parent's y coordinate; each later child begins after the
 * preceding sibling's complete subtree, so branches cannot collide.
 */
export function layoutColumnarTree(
  input: ColumnarLayoutInput,
): ColumnarLayoutResult {
  const configurationFailure = validateConfiguration(input);
  if (configurationFailure !== null) {
    return configurationFailure;
  }

  const validated = validateTree(input.nodes, input.columnWidth);
  if (isFailure(validated)) {
    return validated;
  }

  if (input.nodes.length === 0) {
    return publishLayout(input.layoutEpoch, [], [], {
      x: input.origin.x,
      y: input.origin.y,
      width: 0,
      height: 0,
    });
  }

  const subtreeMinOffsets = new Array<number>(input.nodes.length);
  const subtreeMaxOffsets = new Array<number>(input.nodes.length);
  const childOffsets = new Array<number>(input.nodes.length).fill(0);

  // Reverse preorder guarantees that every child's subtree is known first.
  for (let index = input.nodes.length - 1; index >= 0; index -= 1) {
    const node = input.nodes[index];
    if (node === undefined) {
      return failure("INVALID_PREORDER");
    }

    const topExtent = node.presentation?.topExtent ?? 0;
    const bottomExtent = node.presentation?.bottomExtent ?? 0;
    let subtreeMin = -topExtent;
    let subtreeMax = node.size.height + bottomExtent;
    let packedChildrenMax = Number.NEGATIVE_INFINITY;
    const childIndices = validated.childrenByIndex[index] ?? [];
    for (let childOrder = 0; childOrder < childIndices.length; childOrder += 1) {
      const childIndex = childIndices[childOrder];
      if (childIndex === undefined) {
        return failure("INVALID_PREORDER", node.id);
      }
      const childMin = subtreeMinOffsets[childIndex];
      const childMax = subtreeMaxOffsets[childIndex];
      if (childMin === undefined || childMax === undefined) {
        return failure("INVALID_PREORDER", node.id);
      }
      // The first child keeps source-top alignment. Later siblings are offset
      // by their own upper overflow so complete presentation intervals cannot
      // collide even when future projections publish an upper extent.
      const offset = childOrder === 0
        ? 0
        : packedChildrenMax + input.siblingGap - childMin;
      childOffsets[childIndex] = offset;
      packedChildrenMax = offset + childMax;
      subtreeMin = Math.min(subtreeMin, offset + childMin);
      subtreeMax = Math.max(subtreeMax, packedChildrenMax);
      if (![offset, packedChildrenMax, subtreeMin, subtreeMax].every(isFiniteNumber)) {
        return failure("LAYOUT_OVERFLOW", node.id);
      }
    }

    if (!isFiniteNumber(subtreeMax - subtreeMin)) {
      return failure("LAYOUT_OVERFLOW", node.id);
    }
    subtreeMinOffsets[index] = subtreeMin;
    subtreeMaxOffsets[index] = subtreeMax;
  }

  const yPositions = new Array<number>(input.nodes.length);
  yPositions[0] = input.origin.y;
  const boxes: LayoutBox[] = [];
  let maxX = input.origin.x;
  let minY = input.origin.y;
  let maxY = input.origin.y;

  for (let index = 0; index < input.nodes.length; index += 1) {
    const node = input.nodes[index];
    if (node === undefined) {
      return failure("INVALID_PREORDER");
    }

    if (index > 0) {
      const parentIndex = validated.parentIndexByIndex[index];
      if (parentIndex === undefined || parentIndex === null) {
        return failure("MISSING_PARENT", node.id);
      }
      const parentY = yPositions[parentIndex];
      if (parentY === undefined) {
        return failure("INVALID_PREORDER", node.id);
      }
      yPositions[index] = parentY + (childOffsets[index] ?? 0);
    }

    const x = input.origin.x + node.depth * (input.columnWidth + input.columnGap);
    const y = yPositions[index];
    const subtreeMin = subtreeMinOffsets[index];
    const subtreeMax = subtreeMaxOffsets[index];
    const subtreeHeight = subtreeMin === undefined || subtreeMax === undefined
      ? undefined
      : subtreeMax - subtreeMin;
    if (
      y === undefined ||
      subtreeHeight === undefined ||
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      !isFiniteNumber(x + node.size.width) ||
      !isFiniteNumber(y + node.size.height)
    ) {
      return failure("LAYOUT_OVERFLOW", node.id);
    }

    boxes.push({
      nodeId: node.id,
      parentId: node.parentId,
      depth: node.depth,
      x,
      y,
      width: node.size.width,
      height: node.size.height,
      subtreeHeight,
    });
    maxX = Math.max(maxX, x + node.size.width);
    minY = Math.min(minY, y - (node.presentation?.topExtent ?? 0));
    maxY = Math.max(maxY, y + node.size.height + (node.presentation?.bottomExtent ?? 0));
  }

  const boxById = new Map(boxes.map((box) => [box.nodeId, box]));
  const edges: LayoutEdge[] = [];
  for (const box of boxes) {
    if (box.parentId === null) {
      continue;
    }
    const parent = boxById.get(box.parentId);
    if (parent === undefined) {
      return failure("MISSING_PARENT", box.nodeId);
    }
    const start = {
      x: parent.x + parent.width,
      y: parent.y + parent.height / 2,
    };
    const end = { x: box.x, y: box.y + box.height / 2 };
    const elbowX = start.x + (end.x - start.x) / 2;
    if (!isFiniteNumber(elbowX)) {
      return failure("LAYOUT_OVERFLOW", box.nodeId);
    }
    edges.push({
      parentId: parent.nodeId,
      childId: box.nodeId,
      points: [start, { x: elbowX, y: start.y }, { x: elbowX, y: end.y }, end],
    });
  }

  const bounds = {
    x: input.origin.x,
    y: minY,
    width: maxX - input.origin.x,
    height: maxY - minY,
  };
  if (
    !isFiniteNumber(bounds.x) ||
    !isFiniteNumber(bounds.y) ||
    !isFiniteNumber(bounds.width) ||
    !isFiniteNumber(bounds.height)
  ) {
    return failure("LAYOUT_OVERFLOW");
  }
  return publishLayout(input.layoutEpoch, boxes, edges, bounds);
}
