"use client";

import type { RefObject } from "react";
import { materialAddressOutline } from "../interaction/material-address-outline";
import type { MaterialAddressProjection } from "../interaction/projected-layout-receipt";

export type MaterialAddressVariant = "actionable" | "native" | "structural";

/**
 * A whole-node structural selection is a softer optical object than a precise
 * material address, so it keeps the older label pill's rounding instead of the
 * receipt's tight radius. The scale lives here, once, because React and the
 * pointer hot path have to reach the same decision for one projection.
 */
const VARIANT_CORNER_SCALE: Readonly<Record<MaterialAddressVariant, number>> = {
  actionable: 1,
  native: 1,
  structural: 2.7,
};

export function materialAddressVariantOutline(
  projection: MaterialAddressProjection | null,
  variant: MaterialAddressVariant,
) {
  if (projection === null) return null;
  return materialAddressOutline(projection, {
    cornerRadius: projection.metrics.cornerRadius * (VARIANT_CORNER_SCALE[variant] ?? 1),
  });
}

function readVariant(layer: HTMLElement): MaterialAddressVariant {
  const variant = layer.dataset.addressVariant;
  return variant === "structural" || variant === "native" ? variant : "actionable";
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
  const path = layer.querySelector<SVGPathElement>(".material-address-layer__path");
  const outline = materialAddressVariantOutline(projection, readVariant(layer));
  if (projection === null || outline === null) {
    path?.removeAttribute("d");
    delete layer.dataset.materialAddressPainted;
    delete layer.dataset.materialAddressReady;
    delete layer.dataset.addressDirection;
    delete layer.dataset.addressPartition;
    return;
  }
  layer.dataset.materialAddressReady = "true";
  layer.dataset.addressDirection = projection.direction;
  layer.dataset.addressPartition = projection.basis.partitionKey;
  if (path === null) {
    // Without a path element there is nothing painted, so the fallback has to
    // keep the address visible rather than the layer claiming it.
    delete layer.dataset.materialAddressPainted;
    return;
  }
  path.setAttribute("d", outline.path);
  layer.dataset.materialAddressPainted = "true";
}
