import type { NavigationState } from "../runtime/navigation";

export type MaterialFilesSurface = Readonly<{
  navigation: NavigationState;
  projectionStale: boolean;
  rowInteractionDisabled: boolean;
}>;

/**
 * The file index is a non-authoritative material projection. It may yield to a
 * canvas structural paint, but must never accept an action against rows from a
 * previous navigation projection.
 */
export function projectMaterialFilesSurface(input: Readonly<{
  currentNavigation: NavigationState;
  projectedNavigation: NavigationState;
  interactionPending: boolean;
}>): MaterialFilesSurface {
  const projectionStale = input.currentNavigation !== input.projectedNavigation;
  return Object.freeze({
    navigation: input.projectedNavigation,
    projectionStale,
    rowInteractionDisabled: input.interactionPending || projectionStale,
  });
}
