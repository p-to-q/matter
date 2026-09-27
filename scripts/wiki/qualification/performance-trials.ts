export type WikiPerformanceTrial = Readonly<{
  compileMicros: number;
  lookupP95Micros: number;
}>;

export type WikiPerformanceTrialBudget = Readonly<{
  maximumCompileMicros: number;
  maximumLookupP95Micros: number;
}>;

/** Selects one complete trial; metrics from separate trials are never spliced. */
export function selectBestCompleteWikiPerformanceTrial<T extends WikiPerformanceTrial>(
  trials: readonly T[],
  budget: WikiPerformanceTrialBudget,
): T {
  const first = trials[0];
  if (first === undefined) throw new Error("The Wiki performance trial set is empty.");
  if (!(budget.maximumCompileMicros > 0) || !(budget.maximumLookupP95Micros > 0)) {
    throw new RangeError("Wiki performance trial budgets must be positive.");
  }
  return trials.slice(1).reduce((best, candidate) =>
    compareTrial(candidate, best, budget) < 0 ? candidate : best, first);
}

function compareTrial(
  left: WikiPerformanceTrial,
  right: WikiPerformanceTrial,
  budget: WikiPerformanceTrialBudget,
): number {
  const leftCompile = left.compileMicros / budget.maximumCompileMicros;
  const leftLookup = left.lookupP95Micros / budget.maximumLookupP95Micros;
  const rightCompile = right.compileMicros / budget.maximumCompileMicros;
  const rightLookup = right.lookupP95Micros / budget.maximumLookupP95Micros;
  return Math.max(leftCompile, leftLookup) - Math.max(rightCompile, rightLookup) ||
    leftCompile + leftLookup - rightCompile - rightLookup ||
    left.compileMicros - right.compileMicros ||
    left.lookupP95Micros - right.lookupP95Micros;
}
