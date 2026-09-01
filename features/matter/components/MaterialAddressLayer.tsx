"use client";

import type { RefObject } from "react";
import type { MaterialAddressProjection } from "../interaction/projected-layout-receipt";

export type MaterialAddressVariant = "actionable" | "native" | "structural";

/** Stable mount point for the single-outline visual owner. */
export function MaterialAddressLayer({
  layerRef,
  projection,
  variant,
}: Readonly<{
  layerRef?: RefObject<HTMLDivElement | null>;
  projection: MaterialAddressProjection | null;
  variant: MaterialAddressVariant;
}>) {
  return (
    <div
      aria-hidden="true"
      className="material-address-layer"
      data-address-direction={projection?.direction}
      data-address-partition={projection?.basis.partitionKey}
      data-address-variant={variant}
      data-material-address-ready={projection !== null || undefined}
      ref={layerRef}
    >
      <svg className="material-address-layer__svg">
        <path className="material-address-layer__path" />
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
  if (projection === null) {
    delete layer.dataset.materialAddressReady;
    delete layer.dataset.addressDirection;
    delete layer.dataset.addressPartition;
    return;
  }
  layer.dataset.materialAddressReady = "true";
  layer.dataset.addressDirection = projection.direction;
  layer.dataset.addressPartition = projection.basis.partitionKey;
}
