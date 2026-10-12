/**
 * The root-to-target line of an AI operation. Dumb on purpose: the caller owns
 * when it exists and the geometry it draws, in the canvas's own coordinates.
 */
export function OperationLine({ d }: Readonly<{ d: string }>) {
  return (
    <svg aria-hidden="true" className="operation-line" focusable="false">
      <path className="operation-line__path" d={d} />
    </svg>
  );
}
