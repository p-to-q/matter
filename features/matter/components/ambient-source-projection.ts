export type AmbientSourceRect = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

/** Returns the centered object-fit: cover crop for a paper-sized canvas. */
export function projectCoverSourceRect(
  source: Readonly<{ height: number; width: number }>,
  destination: Readonly<{ height: number; width: number }>,
): AmbientSourceRect | null {
  if (!Number.isFinite(source.width) || !Number.isFinite(source.height)
    || !Number.isFinite(destination.width) || !Number.isFinite(destination.height)
    || source.width <= 0 || source.height <= 0 || destination.width <= 0 || destination.height <= 0) {
    return null;
  }

  const sourceAspect = source.width / source.height;
  const destinationAspect = destination.width / destination.height;
  if (sourceAspect > destinationAspect) {
    const width = source.height * destinationAspect;
    return { height: source.height, left: (source.width - width) / 2, top: 0, width };
  }

  const height = source.width / destinationAspect;
  return { height, left: 0, top: (source.height - height) / 2, width: source.width };
}
