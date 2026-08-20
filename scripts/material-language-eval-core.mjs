export const SUPPORTED_LOCALES = Object.freeze([
  "zh-CN",
  "zh-TW",
  "ja-JP",
  "de-DE",
  "en-US",
]);

export const SOURCE_LENGTH_BUCKETS = Object.freeze(["short", "medium", "long"]);
export const EVAL_REPEATS = 2;

/**
 * Expands a committed base corpus across one scenario-owned interaction axis.
 * The core deliberately knows nothing about prompts, providers, or material.
 */
export function buildEvaluationMatrix(baseCases, axes) {
  const rows = [];
  for (const base of baseCases) {
    for (const axis of axes) {
      rows.push(Object.freeze({
        id: `${base.id}/${axis.id}`,
        locale: base.locale,
        classId: base.classId,
        lengthBucket: base.lengthBucket,
        base,
        axis,
      }));
    }
  }
  return Object.freeze(rows);
}

export function inspectCorpusCoverage({ baseCases, axes, classes }) {
  const failures = [];
  const expectedBaseCount = SUPPORTED_LOCALES.length * classes.length;
  if (baseCases.length !== expectedBaseCount) {
    failures.push(`base-count:${baseCases.length}/${expectedBaseCount}`);
  }
  if (axes.length !== 3) failures.push(`axis-count:${axes.length}/3`);

  const ids = new Set();
  const pairs = new Set();
  const axisIds = new Set();
  for (const axis of axes) {
    if (!safeId(axis.id)) failures.push("unsafe-axis-id");
    if (axisIds.has(axis.id)) failures.push(`duplicate-axis:${axis.id}`);
    axisIds.add(axis.id);
  }
  for (const item of baseCases) {
    if (!safeId(item.id)) failures.push("unsafe-case-id");
    if (ids.has(item.id)) failures.push(`duplicate-case:${item.id}`);
    ids.add(item.id);
    if (!SUPPORTED_LOCALES.includes(item.locale)) failures.push(`locale:${item.id}`);
    if (!classes.includes(item.classId)) failures.push(`class:${item.id}`);
    if (!SOURCE_LENGTH_BUCKETS.includes(item.lengthBucket)) failures.push(`length:${item.id}`);
    const pair = `${item.locale}/${item.classId}`;
    if (pairs.has(pair)) failures.push(`duplicate-pair:${pair}`);
    pairs.add(pair);
  }

  for (const locale of SUPPORTED_LOCALES) {
    for (const classId of classes) {
      if (!pairs.has(`${locale}/${classId}`)) failures.push(`missing:${locale}/${classId}`);
    }
    for (const bucket of SOURCE_LENGTH_BUCKETS) {
      const count = baseCases.filter(
        (item) => item.locale === locale && item.lengthBucket === bucket,
      ).length;
      if (count !== 4) failures.push(`length-balance:${locale}/${bucket}:${count}/4`);
    }
  }

  const matrix = buildEvaluationMatrix(baseCases, axes);
  if (matrix.length !== 180) failures.push(`matrix-count:${matrix.length}/180`);
  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze(failures),
    baseCount: baseCases.length,
    matrixCount: matrix.length,
  });
}

export function expectedEvaluationCalls(matrix, repeats = EVAL_REPEATS) {
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    throw new Error("Evaluation repeats must be a positive whole number.");
  }
  return matrix.length * repeats;
}

export function requireConfirmedCallCount(matrix, confirmedCalls, repeats = EVAL_REPEATS) {
  const expected = expectedEvaluationCalls(matrix, repeats);
  if (!Number.isSafeInteger(confirmedCalls) || confirmedCalls !== expected) {
    throw new Error(`Live evaluation requires confirmCalls=${expected} before any request.`);
  }
  return expected;
}

/**
 * Executes exactly the frozen matrix. A failed call occupies its planned slot;
 * it is never retried or replaced with an extra call.
 */
export async function executeEvaluationMatrix({
  matrix,
  confirmedCalls,
  repeats = EVAL_REPEATS,
  invoke,
  paceMs = 0,
  sleep = defaultSleep,
  onProgress = () => undefined,
}) {
  const callCount = requireConfirmedCallCount(matrix, confirmedCalls, repeats);
  const samples = [];
  const privateRecords = [];
  let completed = 0;

  for (const item of matrix) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const metadata = Object.freeze({
        caseId: item.id,
        locale: item.locale,
        classId: item.classId,
        axisId: item.axis.id,
        lengthBucket: item.lengthBucket,
        repeat,
      });
      let result;
      try {
        result = normalizeInvocationResult(await invoke(item, repeat));
      } catch {
        result = Object.freeze({
          outcome: "unavailable",
          reason: "UNAVAILABLE",
          latencyMs: 0,
          privateData: null,
        });
      }
      const sample = Object.freeze({
        ...metadata,
        outcome: result.outcome,
        reason: result.reason,
        latencyMs: result.latencyMs,
      });
      samples.push(sample);
      privateRecords.push(Object.freeze({
        sample,
        material: result.privateData,
      }));
      completed += 1;
      onProgress(Object.freeze({ completed, callCount, sample }));
      if (paceMs > 0 && completed < callCount) await sleep(paceMs);
    }
  }

  return Object.freeze({
    callCount,
    samples: Object.freeze(samples),
    privateRecords: Object.freeze(privateRecords),
  });
}

export function summarizeEvaluation(samples) {
  const byLocale = groupedStats(samples, (sample) => sample.locale, SUPPORTED_LOCALES);
  const axisIds = [...new Set(samples.map((sample) => sample.axisId))].sort();
  const byAxis = groupedStats(samples, (sample) => sample.axisId, axisIds);
  const byLengthBucket = groupedStats(
    samples,
    (sample) => sample.lengthBucket,
    SOURCE_LENGTH_BUCKETS,
  );
  const totals = statsFor(samples);
  const groups = new Map();
  for (const sample of samples) {
    const group = groups.get(sample.caseId) ?? [];
    group.push(sample);
    groups.set(sample.caseId, group);
  }
  let stableCases = 0;
  for (const own of groups.values()) {
    if (own.length !== EVAL_REPEATS) continue;
    const states = own.map(adjudicationState);
    if (states.every((state) => state !== "unavailable") && new Set(states).size === 1) {
      stableCases += 1;
    }
  }
  const reasons = {};
  for (const sample of samples) {
    if (sample.reason === null) continue;
    reasons[sample.reason] = (reasons[sample.reason] ?? 0) + 1;
  }
  return Object.freeze({
    cases: groups.size,
    calls: samples.length,
    ...totals,
    stability: Object.freeze({
      stableCases,
      totalCases: groups.size,
      rate: ratio(stableCases, groups.size),
    }),
    reasons: Object.freeze(reasons),
    byLocale,
    byAxis,
    byLengthBucket,
  });
}

export function createReviewerPackets(privateRecords) {
  const accepted = privateRecords
    .filter((record) => record.sample.outcome === "accepted")
    .sort((left, right) => sampleKey(left.sample).localeCompare(sampleKey(right.sample)));
  const rows = accepted.map((record, index) => Object.freeze({
    reviewId: `review-${String(index + 1).padStart(4, "0")}`,
    scenario: reviewValue(record.material, "scenario"),
    locale: record.sample.locale,
    classId: record.sample.classId,
    axisId: record.sample.axisId,
    lengthBucket: record.sample.lengthBucket,
    passage: reviewValue(record.material, "passage"),
    before: reviewValue(record.material, "before"),
    after: reviewValue(record.material, "after"),
    lineage: reviewArray(record.material, "lineage"),
    direction: reviewOptional(record.material, "direction"),
    amount: reviewNumber(record.material, "amount"),
    response: reviewValue(record.material, "response"),
    decision: emptyDecision(),
  }));
  return Object.freeze({
    expectedReviewIds: Object.freeze(rows.map((row) => row.reviewId)),
    reviewerA: Object.freeze(seededShuffle(rows, 0x4d415454)),
    reviewerB: Object.freeze(seededShuffle(rows, 0x45524941)),
  });
}

export function reviewContent(row) {
  return Object.freeze({
    reviewId: row.reviewId,
    scenario: row.scenario,
    locale: row.locale,
    classId: row.classId,
    axisId: row.axisId,
    lengthBucket: row.lengthBucket,
    passage: row.passage,
    before: row.before,
    after: row.after,
    lineage: row.lineage,
    direction: row.direction,
    amount: row.amount,
    response: row.response,
  });
}

export function summarizeHumanReviews(reviewerA, reviewerB, expectedReviewIds) {
  const expected = new Set(expectedReviewIds);
  const left = reviewMap(reviewerA, expected);
  const right = reviewMap(reviewerB, expected);
  if (!left.ok || !right.ok || expected.size === 0) {
    return pendingReview(expected.size);
  }

  let criticalDrift = 0;
  let useful = 0;
  for (const id of expected) {
    const a = left.rows.get(id)?.decision;
    const b = right.rows.get(id)?.decision;
    if (!completeDecision(a) || !completeDecision(b)) return pendingReview(expected.size);
    if (a.criticalDrift || b.criticalDrift) criticalDrift += 1;
    if (
      !a.criticalDrift && !b.criticalDrift &&
      a.useful && b.useful &&
      a.preservesVoice && b.preservesVoice &&
      a.preservesUnfinishedness && b.preservesUnfinishedness &&
      a.preservesSeam && b.preservesSeam
    ) useful += 1;
  }
  return Object.freeze({
    complete: true,
    reviewedOutputs: expected.size,
    criticalDrift,
    useful,
    usefulRate: ratio(useful, expected.size),
  });
}

export function evaluatePromotion(scenario, metrics, humanReview = pendingReview(0)) {
  if (scenario === "text-swap") {
    return Object.freeze({
      scenario,
      status: "calibration-only",
      pass: false,
      reasons: Object.freeze([
        "Text Swap numeric promotion thresholds are not frozen.",
        ...(humanReview.complete ? [] : ["Independent human review is incomplete."]),
      ]),
      humanReview,
    });
  }
  if (scenario !== "transform") {
    return Object.freeze({
      scenario,
      status: "invalid-scenario",
      pass: false,
      reasons: Object.freeze(["Unknown evaluation scenario."]),
      humanReview,
    });
  }

  const reasons = [];
  if (metrics.acceptanceRate < 0.85) reasons.push("Static acceptance is below 85% overall.");
  for (const [locale, entry] of Object.entries(metrics.byLocale)) {
    if (entry.acceptanceRate < 0.8) reasons.push(`Static acceptance is below 80% for locale ${locale}.`);
  }
  for (const [axis, entry] of Object.entries(metrics.byAxis)) {
    if (entry.acceptanceRate < 0.8) reasons.push(`Static acceptance is below 80% for degree ${axis}.`);
  }
  if (metrics.stability.rate < 0.95) reasons.push("Temperature-zero adjudication stability is below 95%.");
  if (!humanReview.complete) {
    reasons.push("Independent human review is incomplete.");
  } else {
    if (humanReview.criticalDrift !== 0) reasons.push("Accepted output contains critical drift.");
    if (humanReview.usefulRate < 0.9) reasons.push("Human-confirmed useful expansion is below 90%.");
  }
  return Object.freeze({
    scenario,
    status: reasons.length === 0 ? "pass" : "blocked",
    pass: reasons.length === 0,
    reasons: Object.freeze(reasons),
    humanReview,
  });
}

export function formatSafeEvaluationSummary(scenario, metrics, promotion) {
  const axes = Object.entries(metrics.byAxis)
    .map(([axis, entry]) => `${axis}:${percent(entry.acceptanceRate)}`)
    .join(" ");
  const locales = Object.entries(metrics.byLocale)
    .map(([locale, entry]) => `${locale}:${percent(entry.acceptanceRate)}`)
    .join(" ");
  return [
    `language-eval: ${scenario} ${metrics.cases} cases ${metrics.calls} calls`,
    `language-eval: accepted ${metrics.accepted}/${metrics.calls} (${percent(metrics.acceptanceRate)}) stability ${percent(metrics.stability.rate)} p95 ${metrics.latencyMs.p95}ms`,
    `language-eval: locales ${locales}`,
    `language-eval: axes ${axes}`,
    `language-eval: promotion ${promotion.status}`,
  ].join("\n");
}

function normalizeInvocationResult(value) {
  const allowedOutcomes = new Set(["accepted", "rejected", "timeout", "unavailable", "busy", "malformed"]);
  const outcome = allowedOutcomes.has(value?.outcome) ? value.outcome : "malformed";
  const reason = typeof value?.reason === "string" && /^[A-Z][A-Z0-9_]{0,47}$/u.test(value.reason)
    ? value.reason
    : null;
  const latencyMs = Number.isFinite(value?.latencyMs)
    ? Math.max(0, Math.round(value.latencyMs))
    : 0;
  return Object.freeze({
    outcome,
    reason,
    latencyMs,
    privateData: isRecord(value?.privateData) ? value.privateData : null,
  });
}

function groupedStats(samples, keyOf, keys) {
  const result = {};
  for (const key of keys) result[key] = statsFor(samples.filter((sample) => keyOf(sample) === key));
  return Object.freeze(result);
}

function statsFor(samples) {
  const latencies = samples.map((sample) => sample.latencyMs).sort((left, right) => left - right);
  const accepted = samples.filter((sample) => sample.outcome === "accepted").length;
  const rejected = samples.filter((sample) => sample.outcome === "rejected").length;
  const unavailable = samples.length - accepted - rejected;
  return Object.freeze({
    calls: samples.length,
    accepted,
    rejected,
    unavailable,
    acceptanceRate: ratio(accepted, samples.length),
    latencyMs: Object.freeze({
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
      max: latencies.at(-1) ?? 0,
    }),
  });
}

function reviewMap(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== expected.size) return { ok: false, rows: new Map() };
  const mapped = new Map();
  for (const row of rows) {
    if (!isRecord(row) || !expected.has(row.reviewId) || mapped.has(row.reviewId)) {
      return { ok: false, rows: new Map() };
    }
    mapped.set(row.reviewId, row);
  }
  return { ok: mapped.size === expected.size, rows: mapped };
}

function completeDecision(value) {
  return isRecord(value) &&
    typeof value.criticalDrift === "boolean" &&
    typeof value.useful === "boolean" &&
    typeof value.preservesVoice === "boolean" &&
    typeof value.preservesUnfinishedness === "boolean" &&
    typeof value.preservesSeam === "boolean";
}

function emptyDecision() {
  return Object.freeze({
    criticalDrift: null,
    useful: null,
    preservesVoice: null,
    preservesUnfinishedness: null,
    preservesSeam: null,
    notes: "",
  });
}

function pendingReview(expectedOutputs) {
  return Object.freeze({
    complete: false,
    reviewedOutputs: 0,
    expectedOutputs,
    criticalDrift: null,
    useful: null,
    usefulRate: null,
  });
}

function adjudicationState(sample) {
  if (sample.outcome === "accepted") return "accepted";
  if (sample.outcome === "rejected") return "rejected";
  return "unavailable";
}

function quantile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function ratio(part, total) {
  return total === 0 ? 0 : Number((part / total).toFixed(6));
}

function percent(value) {
  return `${Math.round(value * 1_000) / 10}%`;
}

function safeId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value);
}

function sampleKey(sample) {
  return `${sample.caseId}/${String(sample.repeat).padStart(2, "0")}`;
}

function seededShuffle(values, initialSeed) {
  const result = [...values];
  let seed = initialSeed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const target = seed % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function reviewValue(material, key) {
  return isRecord(material) && typeof material[key] === "string" ? material[key] : "";
}

function reviewOptional(material, key) {
  const value = reviewValue(material, key);
  return value === "" ? null : value;
}

function reviewNumber(material, key) {
  const value = isRecord(material) ? material[key] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function reviewArray(material, key) {
  const value = isRecord(material) ? material[key] : undefined;
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? Object.freeze([...value])
    : Object.freeze([]);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
