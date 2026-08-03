import type { CSSProperties } from "react";
import type { Point, Rect, TextSelection } from "../engine/protocol";
import type { InteractionPhase } from "../store/arrow-store";
import { elasticGridHeight, elasticRowCount } from "../interaction/elastic-lines";

type Props = {
  lassoPoints: Point[];
  selection: TextSelection | null;
  stretchAmount: number;
  stretching: boolean;
  phase: InteractionPhase;
  audioLevel: number;
  transcript: string;
  viewportZoom: number;
  onStretchStart: (
    event: React.PointerEvent<HTMLButtonElement>,
    side: "top" | "bottom",
  ) => void;
  onStretchMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onStretchEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

function bounds(rects: Rect[]) {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { left, top, right, bottom };
}

export function SelectionOverlay({
  lassoPoints,
  selection,
  stretchAmount,
  stretching,
  phase,
  audioLevel,
  transcript,
  viewportZoom,
  onStretchStart,
  onStretchMove,
  onStretchEnd,
}: Props) {
  const lassoPath = lassoPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const elastic = stretchAmount > 0.02;
  const selectionBounds = selection ? bounds(selection.screenRects) : null;
  const elasticHeight = selectionBounds
    ? Math.max(
        selectionBounds.bottom - selectionBounds.top,
        elasticGridHeight(
          stretchAmount,
          elasticRowCount(stretchAmount, 20),
        ) * viewportZoom,
      )
    : 0;
  const listening = phase === "listening";

  return (
    <div
      className="selection-overlay"
      data-state={stretching ? "stretching" : phase}
      style={{ "--voice-level": audioLevel } as CSSProperties}
    >
      <svg className="selection-ink" aria-hidden="true">
        {lassoPath ? <polyline className="lasso-path" points={lassoPath} /> : null}
        {!elastic ? selection?.screenRects.map((rect, index) => (
          <rect
            className="selection-rect"
            key={`${rect.x}-${rect.y}-${index}`}
            x={rect.x - 3}
            y={rect.y - 3}
            width={rect.width + 6}
            height={rect.height + 6}
            rx="4"
          />
        )) : null}
      </svg>

      {selection && selectionBounds ? (
        <>
          <button
            type="button"
            className="stretch-handle stretch-handle--top"
            aria-label="Stretch selection upward"
            style={{
              left: (selectionBounds.left + selectionBounds.right) / 2,
              top: selectionBounds.top,
            }}
            onPointerDown={(event) => onStretchStart(event, "top")}
            onPointerMove={onStretchMove}
            onPointerUp={onStretchEnd}
            onPointerCancel={onStretchEnd}
          />
          <button
            type="button"
            className="stretch-handle stretch-handle--bottom"
            aria-label="Stretch selection downward"
            style={{
              left: (selectionBounds.left + selectionBounds.right) / 2,
              top: elastic ? selectionBounds.top + elasticHeight : selectionBounds.bottom,
            }}
            onPointerDown={(event) => onStretchStart(event, "bottom")}
            onPointerMove={onStretchMove}
            onPointerUp={onStretchEnd}
            onPointerCancel={onStretchEnd}
          />
          {listening && transcript ? (
            <p
              className="selection-transcript"
              style={{ left: selectionBounds.left, top: selectionBounds.bottom + 14 }}
            >
              {transcript}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
