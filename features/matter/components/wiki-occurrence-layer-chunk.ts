"use client";

import { preloadableComponent } from "./preloadable-component";

/**
 * The render-edge half of Wiki disclosure: the settle, the mark, and the
 * takeover. One preloadable cell is shared by the paper, which mounts it with
 * the first live occurrence, and by the occurrence driver's loader, which
 * treats the driver and this layer as one disclosure: no occurrence goes live
 * until both have arrived.
 */
export const WikiOccurrenceLayer = preloadableComponent(
  () => import("./WikiOccurrenceLayer").then((module) => module.WikiOccurrenceLayer),
);
