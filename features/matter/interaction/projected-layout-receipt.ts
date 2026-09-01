import type { ClientTextRect } from "./range-measurement";

export type ClientBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type ProjectedLayoutBasis = Readonly<{
  addressKey: string;
  documentEpoch: number;
  layoutEpoch: number;
  nodeId: string;
  partitionKey: string;
  treeId: string;
  viewportKey: string;
}>;

export type ProjectedLayoutRow = Readonly<{
  blockEnd: number;
  blockStart: number;
  inlineEnd: number;
  inlineStart: number;
}>;

export type ProjectedLayoutReceipt = Readonly<{
  basis: ProjectedLayoutBasis;
  column: Readonly<{
    blockEnd: number;
    blockStart: number;
    inlineEnd: number;
    inlineStart: number;
  }>;
  coordinateSpace: "client-css-px";
  metrics: Readonly<{
    blockOutset: number;
    cornerRadius: number;
    inlineOutset: number;
  }>;
  rows: readonly ProjectedLayoutRow[];
  run: Readonly<{
    endInline: number;
    endRow: number;
    startInline: number;
    startRow: number;
  }>;
  textDirection: "ltr" | "rtl";
  writingMode: "horizontal-tb";
}>;

export type MaterialAddressProjection = Readonly<{
  attachmentProgress: number;
  basis: ProjectedLayoutBasis;
  column: ProjectedLayoutReceipt["column"];
  coordinateSpace: ProjectedLayoutReceipt["coordinateSpace"];
  direction: "neutral" | "selection-then-slot" | "slot-then-selection";
  metrics: ProjectedLayoutReceipt["metrics"];
  rows: readonly ProjectedLayoutRow[];
  run: ProjectedLayoutReceipt["run"];
  slot: Readonly<{ blockEnd: number; blockStart: number }> | null;
  textDirection: ProjectedLayoutReceipt["textDirection"];
  writingMode: ProjectedLayoutReceipt["writingMode"];
}>;

export const MATERIAL_ADDRESS_ENGAGEMENT_AMOUNT = 0.1;
export const MATERIAL_ADDRESS_NATIVE_FRAGMENT_LIMIT = 256;
export const MATERIAL_ADDRESS_NATIVE_ROW_LIMIT = 64;

const REFERENCE_LINE_HEIGHT = 20;
const LINE_BLOCK_TOLERANCE_PX = 1;

/**
 * Freezes one post-layout range measurement. It owns browser geometry only;
 * degree, handle choice, and operation lifecycle stay in disposable projection.
 */
export function createProjectedLayoutReceipt(input: Readonly<{
  basis: ProjectedLayoutBasis;
  column: ClientBounds;
  textDirection: string;
  rects: readonly ClientTextRect[];
  writingMode: string;
}>): ProjectedLayoutReceipt | null {
  if (
    input.writingMode !== "horizontal-tb" ||
    (input.textDirection !== "ltr" && input.textDirection !== "rtl") ||
    !validBounds(input.column) ||
    !validBasis(input.basis) ||
    !Array.isArray(input.rects) ||
    input.rects.length === 0 ||
    input.rects.some((rect) => !validRect(rect))
  ) return null;

  const rows = groupIntoRows(input.rects);
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const medianHeight = median(rows.map((row) => row.blockEnd - row.blockStart));
  const scale = medianHeight / REFERENCE_LINE_HEIGHT;
  const column = Object.freeze({
    blockEnd: rounded(input.column.bottom),
    blockStart: rounded(input.column.top),
    inlineEnd: rounded(input.column.right),
    inlineStart: rounded(input.column.left),
  });
  if (rows.some((row) =>
    row.inlineStart < column.inlineStart - 1 ||
    row.inlineEnd > column.inlineEnd + 1 ||
    row.blockStart < column.blockStart - 1 ||
    row.blockEnd > column.blockEnd + 1
  )) return null;

  return Object.freeze({
    basis: ownBasis(input.basis),
    column,
    coordinateSpace: "client-css-px",
    metrics: Object.freeze({
      blockOutset: rounded(clamp(3 * scale, 2, 8)),
      cornerRadius: rounded(clamp(4 * scale, 3, 12)),
      inlineOutset: rounded(clamp(10 * scale, 8, 24)),
    }),
    rows,
    run: Object.freeze({
      endInline: input.textDirection === "ltr" ? last.inlineEnd : last.inlineStart,
      endRow: rows.length - 1,
      startInline: input.textDirection === "ltr" ? first.inlineStart : first.inlineEnd,
      startRow: 0,
    }),
    textDirection: input.textDirection,
    writingMode: "horizontal-tb",
  });
}

/**
 * Projects cached client geometry through one degree. Equal amounts produce
 * equal geometry for pointer, touch, and keyboard; no input-mode state enters.
 */
export function projectMaterialAddress(input: Readonly<{
  amount: number;
  handle: "top" | "bottom" | null;
  maximumDepth: number;
  receipt: ProjectedLayoutReceipt;
}>): MaterialAddressProjection | null {
  if (
    !Number.isFinite(input.amount) ||
    !Number.isFinite(input.maximumDepth) ||
    input.maximumDepth < 0 ||
    (input.handle !== null && input.handle !== "top" && input.handle !== "bottom")
  ) return null;
  const amount = clamp(input.amount, 0, 1);
  const depth = rounded(amount * input.maximumDepth);
  if (input.handle === null || amount === 0 || depth === 0) {
    return Object.freeze({
      attachmentProgress: 0,
      basis: input.receipt.basis,
      column: input.receipt.column,
      coordinateSpace: input.receipt.coordinateSpace,
      direction: "neutral",
      metrics: input.receipt.metrics,
      rows: input.receipt.rows,
      run: input.receipt.run,
      slot: null,
      textDirection: input.receipt.textDirection,
      writingMode: input.receipt.writingMode,
    });
  }

  const attachmentProgress = rounded(clamp(
    amount / MATERIAL_ADDRESS_ENGAGEMENT_AMOUNT,
    0,
    1,
  ));
  if (input.handle === "bottom") {
    const last = input.receipt.rows.at(-1)!;
    return Object.freeze({
      attachmentProgress,
      basis: ownBasis({
        ...input.receipt.basis,
        partitionKey: `${input.receipt.basis.partitionKey}:selection-then-slot`,
      }),
      column: input.receipt.column,
      coordinateSpace: input.receipt.coordinateSpace,
      direction: "selection-then-slot",
      metrics: input.receipt.metrics,
      rows: input.receipt.rows,
      run: input.receipt.run,
      slot: Object.freeze({ blockStart: last.blockEnd, blockEnd: rounded(last.blockEnd + depth) }),
      textDirection: input.receipt.textDirection,
      writingMode: input.receipt.writingMode,
    });
  }

  const shiftedRows = Object.freeze(input.receipt.rows.map((row) => Object.freeze({
    ...row,
    blockStart: rounded(row.blockStart + depth),
    blockEnd: rounded(row.blockEnd + depth),
  })));
  const first = input.receipt.rows[0]!;
  return Object.freeze({
    attachmentProgress,
    basis: ownBasis({
      ...input.receipt.basis,
      partitionKey: `${input.receipt.basis.partitionKey}:slot-then-selection`,
    }),
    column: input.receipt.column,
    coordinateSpace: input.receipt.coordinateSpace,
    direction: "slot-then-selection",
    metrics: input.receipt.metrics,
    rows: shiftedRows,
    run: input.receipt.run,
    slot: Object.freeze({
      blockStart: first.blockStart,
      blockEnd: rounded(first.blockStart + depth),
    }),
    textDirection: input.receipt.textDirection,
    writingMode: input.receipt.writingMode,
  });
}

function groupIntoRows(rects: readonly ClientTextRect[]): readonly ProjectedLayoutRow[] {
  const ordered = [...rects].sort((left, right) => left.y - right.y || left.x - right.x);
  const rows: Array<{ blockEnd: number; blockStart: number; inlineEnd: number; inlineStart: number }> = [];
  for (const rect of ordered) {
    const blockStart = rect.y;
    const blockEnd = rect.y + rect.height;
    const inlineStart = rect.x;
    const inlineEnd = rect.x + rect.width;
    const row = rows.at(-1);
    const belongsToCurrentRow = row !== undefined &&
      blockStart <= row.blockEnd + LINE_BLOCK_TOLERANCE_PX &&
      blockEnd >= row.blockStart - LINE_BLOCK_TOLERANCE_PX;
    if (!belongsToCurrentRow || row === undefined) {
      rows.push({ blockStart, blockEnd, inlineStart, inlineEnd });
      continue;
    }
    row.blockStart = Math.min(row.blockStart, blockStart);
    row.blockEnd = Math.max(row.blockEnd, blockEnd);
    row.inlineStart = Math.min(row.inlineStart, inlineStart);
    row.inlineEnd = Math.max(row.inlineEnd, inlineEnd);
  }
  rows.sort((left, right) => left.blockStart - right.blockStart || left.inlineStart - right.inlineStart);
  return Object.freeze(rows.map((row) => Object.freeze({
    blockEnd: rounded(row.blockEnd),
    blockStart: rounded(row.blockStart),
    inlineEnd: rounded(row.inlineEnd),
    inlineStart: rounded(row.inlineStart),
  })));
}

function validBasis(basis: ProjectedLayoutBasis): boolean {
  return typeof basis.addressKey === "string" && basis.addressKey.length > 0 &&
    typeof basis.nodeId === "string" && basis.nodeId.length > 0 &&
    typeof basis.treeId === "string" && basis.treeId.length > 0 &&
    typeof basis.partitionKey === "string" && basis.partitionKey.length > 0 &&
    typeof basis.viewportKey === "string" && basis.viewportKey.length > 0 &&
    Number.isSafeInteger(basis.documentEpoch) && basis.documentEpoch >= 0 &&
    Number.isSafeInteger(basis.layoutEpoch) && basis.layoutEpoch >= 0;
}

function validRect(rect: ClientTextRect): boolean {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
    rect.width > 0 && rect.height > 0;
}

function validBounds(bounds: ClientBounds): boolean {
  return Number.isFinite(bounds.left) && Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.right) && Number.isFinite(bounds.bottom) &&
    bounds.right > bounds.left && bounds.bottom > bounds.top;
}

function ownBasis(basis: ProjectedLayoutBasis): ProjectedLayoutBasis {
  return Object.freeze({ ...basis });
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
