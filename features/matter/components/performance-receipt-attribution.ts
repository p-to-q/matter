export type PerformanceTimingEntry = Readonly<{
  startTime: number;
  duration: number;
}>;

export type ColdMarkTimes = Readonly<Record<string, number | null>>;

export type AttributedColdTask = Readonly<{
  startTime: number;
  duration: number;
  endTime: number;
  overlapsColdCanvas: boolean;
  overlappingMarks: readonly string[];
  stage: string | null;
}>;

type NamedMark = Readonly<{ name: string; startTime: number }>;

/**
 * Associates browser main-thread entries with the fixture-only cold-canvas
 * marks. This is receipt analysis, not renderer authority: it intentionally
 * accepts incomplete browser support and never changes the measured path.
 */
export function attributeColdCanvasTasks(
  entries: readonly PerformanceTimingEntry[],
  marks: ColdMarkTimes,
): readonly AttributedColdTask[] {
  const timeline = Object.entries(marks)
    .flatMap(([name, startTime]): NamedMark[] =>
      startTime === null || !Number.isFinite(startTime) ? [] : [{ name, startTime }],
    )
    .sort((left, right) => left.startTime - right.startTime);
  const firstMark = timeline[0]?.startTime;
  const finalMark = timeline.at(-1)?.startTime;

  return Object.freeze(entries.map((entry) => {
    const startTime = finiteNonNegative(entry.startTime);
    const duration = finiteNonNegative(entry.duration);
    const endTime = startTime + duration;
    const overlappingMarks = timeline
      .filter((mark) => mark.startTime >= startTime && mark.startTime <= endTime)
      .map((mark) => mark.name);
    const midpoint = startTime + duration / 2;
    const stageIndex = timeline.findLastIndex((mark) => mark.startTime <= midpoint);
    // Marks observed inside one long task cannot split that task into causal
    // stages: every mark callback ran before the browser yielded. Keep the
    // exact overlapping marks, but only name a stage when the complete entry
    // sits between marks rather than manufacturing midpoint attribution.
    const stage = overlappingMarks.length > 0 || stageIndex === -1
      ? null
      : `${timeline[stageIndex].name} → ${timeline[stageIndex + 1]?.name ?? "after"}`;

    return Object.freeze({
      startTime,
      duration,
      endTime,
      overlapsColdCanvas: firstMark !== undefined && finalMark !== undefined
        && startTime <= finalMark && endTime >= firstMark,
      overlappingMarks: Object.freeze(overlappingMarks),
      stage,
    });
  }));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
