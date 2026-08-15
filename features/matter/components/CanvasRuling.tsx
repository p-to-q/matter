export type CanvasRulingProps = Readonly<{
  active: boolean;
}>;

/**
 * A paper-owned orientation layer. It deliberately knows nothing about the
 * tree, viewport, or measured layout so it cannot become a second geometry
 * authority.
 */
export function CanvasRuling({ active }: CanvasRulingProps) {
  return (
    <div
      aria-hidden="true"
      className="canvas-ruling"
      data-active={active || undefined}
      data-canvas-ruling="structural"
    />
  );
}
