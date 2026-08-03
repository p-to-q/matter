import {
  ELASTIC_FIXTURE_EXPANSION,
  type Point,
  type TextSelection,
  type ThoughtObject,
} from "../engine/protocol";
import {
  distributeElasticLines,
  elasticGridHeight,
} from "../interaction/elastic-lines";
import { segmentText } from "../interaction/text-segments";

type Props = {
  thought: ThoughtObject;
  previewPosition?: Point;
  selection: TextSelection | null;
  stretchAmount: number;
  flowShift: number;
  viewportZoom: number;
  fixtureMode: boolean;
  onBranch: (objectId: string) => void;
};

export function ThoughtText({
  thought,
  previewPosition,
  selection,
  stretchAmount,
  flowShift,
  viewportZoom,
  fixtureMode,
  onBranch,
}: Props) {
  const position = previewPosition ?? thought.position;
  const initialPlacement =
    thought.id === "thought_sample" && position.x === 0 && position.y === 0;
  const elasticSelection =
    selection?.objectId === thought.id && stretchAmount > 0.02 ? selection : null;
  const elasticLines = elasticSelection
    ? distributeElasticLines(
        fixtureMode && stretchAmount > 0.12
          ? ELASTIC_FIXTURE_EXPANSION
          : elasticSelection.selectedText,
        stretchAmount,
      )
    : [];
  const selectionWidth = elasticSelection
    ? Math.max(
        ...elasticSelection.screenRects.map((rect) => rect.x + rect.width),
      ) - Math.min(...elasticSelection.screenRects.map((rect) => rect.x))
    : 0;

  return (
    <article
      className={`thought thought--${thought.kind}${
        initialPlacement ? " thought--sample" : ""
      }`}
      data-material
      data-object-id={thought.id}
      data-kind={thought.kind}
      style={{
        left: initialPlacement ? undefined : position.x,
        top: initialPlacement ? undefined : position.y + flowShift,
        width: `min(${thought.width}px, calc(100vw - 56px))`,
        opacity: thought.style.opacity,
      }}
    >
      <span className="thought-copy">
        {elasticSelection ? (
          <>
            <span className="thought-before">{elasticSelection.before}</span>
            <span
              className="elastic-grid"
              data-elastic-grid
              style={{
                width: `min(100%, ${Math.max(220, selectionWidth / viewportZoom)}px)`,
                height: elasticGridHeight(stretchAmount, elasticLines.length),
              }}
            >
              {elasticLines.map((line, index) => (
                <span
                  className="elastic-line"
                  data-elastic-line
                  key={index}
                  style={{ "--line-index": index } as React.CSSProperties}
                >
                  {line.join("")}
                </span>
              ))}
            </span>
            <span className="thought-after">{elasticSelection.after}</span>
          </>
        ) : segmentText(thought.text).map((segment) => {
          const selected =
            selection?.objectId === thought.id &&
            segment.start >= selection.start &&
            segment.end <= selection.end;
          return (
            <span key={`${segment.start}-${segment.end}`}>
              {segment.selectable ? (
                <span
                  className="thought-token"
                  data-selected={selected || undefined}
                  data-arrow-token
                  data-object-id={thought.id}
                  data-start={segment.start}
                  data-end={segment.end}
                >
                  {segment.text}
                </span>
              ) : (
                segment.text
              )}
            </span>
          );
        })}
      </span>
      <button
        type="button"
        className="branch-affordance"
        aria-label="Extend a related thought"
        title="Extend a related thought"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onBranch(thought.id)}
      >
        +
      </button>
    </article>
  );
}
