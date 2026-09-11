import type { CanvasLanguage } from "../components/canvas-preferences";
import type { LayoutProjectionItem } from "../components/layout-projection";
import type { ColumnarLayout } from "../layout/model";
import {
  rebaseProjectedLayoutReceipt,
  type ProjectedLayoutBasis,
  type ProjectedLayoutReceipt,
} from "./projected-layout-receipt";

export type StructuralMaterialGeometryBasis = Readonly<{
  box: Readonly<{ height: number; width: number; x: number; y: number }>;
  lifecycleKey: string;
  locale: CanvasLanguage;
  measurementRevision: number;
  nodeId: string;
  root: boolean;
  surface: "label" | "root";
  text: string;
}>;

export type StructuralMaterialMeasurement = Readonly<{
  geometryBasis: StructuralMaterialGeometryBasis;
  receipt: ProjectedLayoutReceipt;
}>;

/** Projects only the facts that can change a whole-node client-space receipt. */
export function projectStructuralMaterialGeometryBasis(
  layout: ColumnarLayout | null,
  projection: readonly LayoutProjectionItem[],
  nodeId: string | null,
  locale: CanvasLanguage,
  measurementRevision: number,
  surface: StructuralMaterialGeometryBasis["surface"],
  lifecycleKey: string,
): StructuralMaterialGeometryBasis | null {
  if (
    layout === null || nodeId === null || !Number.isSafeInteger(measurementRevision) ||
    measurementRevision < 0 ||
    lifecycleKey.length === 0
  ) return null;
  const item = projection.find((candidate) => candidate.node.id === nodeId);
  const box = layout.boxes.find((candidate) => candidate.nodeId === nodeId);
  if (item === undefined || box === undefined) return null;
  return Object.freeze({
    box: Object.freeze({ height: box.height, width: box.width, x: box.x, y: box.y }),
    lifecycleKey,
    locale,
    measurementRevision,
    nodeId,
    root: item.parentId === null,
    surface,
    text: item.node.text,
  });
}

export function sameStructuralMaterialGeometryBasis(
  left: StructuralMaterialGeometryBasis,
  right: StructuralMaterialGeometryBasis,
): boolean {
  return left.nodeId === right.nodeId && left.text === right.text && left.root === right.root &&
    left.lifecycleKey === right.lifecycleKey && left.surface === right.surface &&
    left.locale === right.locale && left.measurementRevision === right.measurementRevision &&
    left.box.x === right.box.x && left.box.y === right.box.y &&
    left.box.width === right.box.width && left.box.height === right.box.height;
}

/** Reuses browser geometry only when both its owner and rendered shape still match. */
export function rebaseStructuralMaterialMeasurement(
  measurement: StructuralMaterialMeasurement | null,
  geometryBasis: StructuralMaterialGeometryBasis | null,
  receiptBasis: ProjectedLayoutBasis,
): ProjectedLayoutReceipt | null {
  if (measurement === null || geometryBasis === null) return null;
  const current = measurement.receipt.basis;
  if (
    current.addressKey !== receiptBasis.addressKey ||
    current.nodeId !== receiptBasis.nodeId ||
    current.partitionKey !== receiptBasis.partitionKey ||
    current.treeId !== receiptBasis.treeId ||
    current.viewportKey !== receiptBasis.viewportKey ||
    !sameStructuralMaterialGeometryBasis(measurement.geometryBasis, geometryBasis)
  ) return null;
  return rebaseProjectedLayoutReceipt(measurement.receipt, receiptBasis);
}
