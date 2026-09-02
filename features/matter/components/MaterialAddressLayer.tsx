"use client";

import type { RefObject } from "react";
import { materialAddressOutline } from "../interaction/material-address-outline";
import type { MaterialAddressProjection } from "../interaction/projected-layout-receipt";

export type MaterialAddressVariant = "actionable" | "native" | "structural";

const pathByLayer = new WeakMap<HTMLElement, SVGPathElement>();

/**
 * The whole-node state keeps the label pill's `.44em` rounding, so it is taken
 * from the rows this projection actually measured rather than from a multiple
 * of the precise address radius. The receipt's corner radius is itself a
 * clamped `4 * scale`, so scaling it drifts away from the pill at small type
 * or high zoom; the median row extent tracks the type at every zoom instead.
 *
 * It reads only cached row geometry, so it stays pure and costs no layout.
 */
const STRUCTURAL_ROW_RATIO = 0.44;

export function materialAddressVariantCornerRadius(
  projection: MaterialAddressProjection,
  variant: MaterialAddressVariant,
): number {
  if (variant !== "structural") return projection.metrics.cornerRadius;
  const first = Math.max(0, Math.min(projection.run.startRow, projection.rows.length - 1));
  const last = Math.max(first, Math.min(projection.run.endRow, projection.rows.length - 1));
  const extents = projection.rows
    .slice(first, last + 1)
    .map((row) => row.blockEnd - row.blockStart)
    .filter((extent) => Number.isFinite(extent) && extent > 0)
    .sort((left, right) => left - right);
  if (extents.length === 0) return projection.metrics.cornerRadius;
  const middle = Math.floor(extents.length / 2);
  const median = extents.length % 2 === 1
    ? extents[middle]!
    : (extents[middle - 1]! + extents[middle]!) / 2;
  return median * STRUCTURAL_ROW_RATIO;
}

export function materialAddressVariantOutline(
  projection: MaterialAddressProjection | null,
  variant: MaterialAddressVariant,
) {
  if (projection === null) return null;
  const cornerRadius = materialAddressVariantCornerRadius(projection, variant);
  return materialAddressOutline(projection, {
    cornerRadius,
    // Exact browser copy stays literal. Actionable and whole-node material may
    // absorb only a near-column sliver: a gap that cannot hold two corners is
    // optical noise, while a wider gap remains part of the address's meaning.
    edgeSnapExtent: variant === "native" ? 0 : cornerRadius * 2,
    // Only the softly rounded whole-node state opens arbitrary short internal
    // steps; a precise address changes only the near-column endpoint above.
    minimumStepExtent: variant === "structural" ? cornerRadius * 2 : 0,
  });
}

function readVariant(layer: HTMLElement): MaterialAddressVariant {
  const variant = layer.dataset.addressVariant;
  return variant === "structural" || variant === "native" ? variant : "actionable";
}

function pathForLayer(layer: HTMLElement): SVGPathElement | null {
  const cached = pathByLayer.get(layer);
  if (cached?.isConnected) return cached;
  const path = layer.querySelector<SVGPathElement>(".material-address-layer__path");
  if (path !== null) pathByLayer.set(layer, path);
  return path;
}

/**
 * Stable mount point for the single-outline visual owner.
 *
 * React and the pointer hot path share one pure outline function, so a frame
 * published during a drag cannot disagree with the frame React would render at
 * the same amount. Only a successfully written path claims the paint, which is
 * what lets the older fallback stay visible instead of leaving a frame with
 * grips and no address.
 */
export function MaterialAddressLayer({
  layerRef,
  projection,
  variant,
}: Readonly<{
  layerRef?: RefObject<HTMLDivElement | null>;
  projection: MaterialAddressProjection | null;
  variant: MaterialAddressVariant;
}>) {
  const outline = materialAddressVariantOutline(projection, variant);
  return (
    <div
      aria-hidden="true"
      className="material-address-layer"
      data-address-direction={projection?.direction}
      data-address-partition={projection?.basis.partitionKey}
      data-address-variant={variant}
      data-material-address-painted={outline !== null || undefined}
      data-material-address-ready={projection !== null || undefined}
      ref={layerRef}
    >
      <svg className="material-address-layer__svg">
        <path className="material-address-layer__path" d={outline?.path} />
      </svg>
    </div>
  );
}

/** Pointer frames publish cached projection only; this function never measures. */
export function publishMaterialAddressProjection(
  layer: HTMLElement | null,
  projection: MaterialAddressProjection | null,
): void {
  if (layer === null) return;
  const path = pathForLayer(layer);
  const outline = materialAddressVariantOutline(projection, readVariant(layer));
  if (projection === null || outline === null) {
    if (path?.hasAttribute("d")) path.removeAttribute("d");
    if (layer.dataset.materialAddressPainted !== undefined) {
      delete layer.dataset.materialAddressPainted;
    }
    if (layer.dataset.materialAddressReady !== undefined) {
      delete layer.dataset.materialAddressReady;
    }
    if (layer.dataset.addressDirection !== undefined) delete layer.dataset.addressDirection;
    if (layer.dataset.addressPartition !== undefined) delete layer.dataset.addressPartition;
    return;
  }
  if (layer.dataset.materialAddressReady !== "true") {
    layer.dataset.materialAddressReady = "true";
  }
  if (layer.dataset.addressDirection !== projection.direction) {
    layer.dataset.addressDirection = projection.direction;
  }
  if (layer.dataset.addressPartition !== projection.basis.partitionKey) {
    layer.dataset.addressPartition = projection.basis.partitionKey;
  }
  if (path === null) {
    // Without a path element there is nothing painted, so the fallback has to
    // keep the address visible rather than the layer claiming it.
    delete layer.dataset.materialAddressPainted;
    return;
  }
  if (path.getAttribute("d") !== outline.path) path.setAttribute("d", outline.path);
  if (layer.dataset.materialAddressPainted !== "true") {
    layer.dataset.materialAddressPainted = "true";
  }
}
