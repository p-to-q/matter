export type LayoutPoint = {
  readonly x: number;
  readonly y: number;
};

export type LayoutSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * A visible tree projection with its rendering-edge measurement. Coordinates
 * never enter this input: authored structure and transient measurements are
 * the only sources of layout truth.
 */
export type LayoutNode = {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly size: LayoutSize;
  /** Transient visual overflow around the unchanged source box. */
  readonly presentation?: Readonly<{
    topExtent: number;
    bottomExtent: number;
  }>;
};

export type ColumnarLayoutInput = {
  readonly nodes: readonly LayoutNode[];
  readonly origin: LayoutPoint;
  readonly layoutEpoch: number;
  readonly columnWidth: number;
  readonly columnGap: number;
  readonly siblingGap: number;
};

export type LayoutBox = {
  readonly nodeId: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly subtreeHeight: number;
};

export type LayoutEdge = {
  readonly parentId: string;
  readonly childId: string;
  readonly points: readonly [
    LayoutPoint,
    LayoutPoint,
    LayoutPoint,
    LayoutPoint,
  ];
};

export type LayoutBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ColumnarLayout = {
  readonly layoutEpoch: number;
  readonly boxes: readonly LayoutBox[];
  readonly edges: readonly LayoutEdge[];
  readonly bounds: LayoutBounds;
};

export type LayoutErrorCode =
  | "INVALID_LAYOUT_EPOCH"
  | "INVALID_ORIGIN"
  | "INVALID_COLUMN_WIDTH"
  | "INVALID_COLUMN_GAP"
  | "INVALID_SIBLING_GAP"
  | "INVALID_NODE_ID"
  | "DUPLICATE_NODE_ID"
  | "INVALID_ROOT"
  | "MISSING_PARENT"
  | "INVALID_DEPTH"
  | "INVALID_PREORDER"
  | "INVALID_NODE_SIZE"
  | "INVALID_PRESENTATION_EXTENT"
  | "NODE_WIDTH_EXCEEDS_COLUMN"
  | "LAYOUT_OVERFLOW";

export type LayoutError = {
  readonly code: LayoutErrorCode;
  readonly nodeId?: string;
};

export type ColumnarLayoutResult =
  | { readonly ok: true; readonly layout: ColumnarLayout }
  | { readonly ok: false; readonly error: LayoutError };
