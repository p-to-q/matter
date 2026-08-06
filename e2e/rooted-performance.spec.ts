import { expect, test } from "@playwright/test";
import { attributeColdCanvasTasks } from "../features/matter/components/performance-receipt-attribution";

test("records the production 2,000-node renderer receipt", async ({ page }) => {
  // The explicit three-round release receipt includes 240 structural actions.
  // A one-round diagnostic remains short enough for local attribution.
  test.setTimeout(process.env.MATTER_PERFORMANCE_ROUNDS === "1" ? 300_000 : 900_000);
  test.skip(
    process.env.MATTER_RUN_PERFORMANCE_RECEIPT !== "true",
    "Run explicitly against a production build with the performance fixture enabled.",
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    type MatterPerformanceReceipt = {
      firstContentfulPaint: number | null;
      layoutReady: number | null;
      longTasks: Array<{ startTime: number; duration: number }>;
      longAnimationFrames: Array<{
        startTime: number;
        duration: number;
        blockingDuration: number | null;
      }>;
      longAnimationFrameSupported: boolean;
      marks: Record<string, number | null>;
    };
    const receipt: MatterPerformanceReceipt = {
      firstContentfulPaint: null,
      layoutReady: null,
      longTasks: [],
      longAnimationFrames: [],
      longAnimationFrameSupported: false,
      marks: {},
    };
    (window as Window & { __matterPerformanceReceipt?: MatterPerformanceReceipt })
      .__matterPerformanceReceipt = receipt;

    try {
      const paints = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            receipt.firstContentfulPaint ??= entry.startTime;
          }
        }
      });
      paints.observe({ type: "paint", buffered: true });
      const longTasks = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          receipt.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      longTasks.observe({ type: "longtask", buffered: true });
      const supportedEntryTypes = PerformanceObserver.supportedEntryTypes ?? [];
      if (supportedEntryTypes.includes("long-animation-frame")) {
        receipt.longAnimationFrameSupported = true;
        const longAnimationFrames = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const frame = entry as PerformanceEntry & { blockingDuration?: number };
            receipt.longAnimationFrames.push({
              startTime: frame.startTime,
              duration: frame.duration,
              blockingDuration: typeof frame.blockingDuration === "number"
                ? frame.blockingDuration
                : null,
            });
          }
        });
        longAnimationFrames.observe({ type: "long-animation-frame", buffered: true });
      }
    } catch {
      // The receipt still records layout readiness in browsers without these entries.
    }

    const markLayoutReady = () => {
      if (receipt.layoutReady !== null) return;
      if (document.querySelector(".matter-canvas[data-layout-ready='true']") !== null) {
        receipt.layoutReady = performance.now();
      }
    };
    const observer = new MutationObserver(markLayoutReady);
    observer.observe(document, {
      attributes: true,
      attributeFilter: ["data-layout-ready"],
      childList: true,
      subtree: true,
    });
    markLayoutReady();
  });
  await page.goto("/matter/performance");
  await expect(page.locator("[data-thought-id]")).toHaveCount(2_000);
  await expect(page.locator("aside.material-files")).toHaveAttribute("data-open", "true");
  await expect(page.locator("aside.material-files")).not.toHaveAttribute("data-projection-stale", "true");

  const measurementRounds = process.env.MATTER_PERFORMANCE_ROUNDS === "1" ? 1 : 3;
  const measurementSamples = process.env.MATTER_PERFORMANCE_SAMPLES === "1" ? 1 : 20;
  const rawReceipt = await page.evaluate(async ({ rounds, samplesPerRound }) => {
    type MatterPerformanceReceipt = {
      firstContentfulPaint: number | null;
      layoutReady: number | null;
      longTasks: Array<{ startTime: number; duration: number }>;
      longAnimationFrames: Array<{
        startTime: number;
        duration: number;
        blockingDuration: number | null;
      }>;
      longAnimationFrameSupported: boolean;
      marks: Record<string, number | null>;
    };
    const initial = (window as Window & { __matterPerformanceReceipt?: MatterPerformanceReceipt })
      .__matterPerformanceReceipt;

    const waitForCount = (count: number) =>
      new Promise<void>((resolve, reject) => {
        const startedAt = performance.now();
        let timer: number | null = null;
        let mutationObserver: MutationObserver | null = null;
        const finish = (error?: Error) => {
          mutationObserver?.disconnect();
          if (timer !== null) window.clearTimeout(timer);
          if (error !== undefined) reject(error);
          else resolve();
        };
        const check = () => {
          if (document.querySelectorAll("[data-thought-id]").length === count) {
            finish();
            return true;
          }
          if (performance.now() - startedAt > 5_000) {
            finish(new Error(`Timed out waiting for ${count} rendered thoughts.`));
            return true;
          }
          return false;
        };
        if (check()) return;
        mutationObserver = new MutationObserver(() => {
          check();
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        timer = window.setTimeout(
          () => finish(new Error(`Timed out waiting for ${count} rendered thoughts.`)),
          5_100,
        );
      });
    const nextPaint = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    const navigation = () => {
      const bridge = (window as Window & {
        __matterPerformanceNavigation?: {
          focus: (nodeId: string) => void;
          showFull: () => void;
          toggleFold: (nodeId: string) => void;
        };
      }).__matterPerformanceNavigation;
      if (bridge === undefined) throw new Error("Missing performance navigation bridge.");
      return bridge;
    };
    const actNavigation = async (
      action: "focus" | "showFull" | "toggleFold",
      nodeId: string | null,
      expectedCount: number,
    ) => {
      const startedAt = performance.now();
      const bridge = navigation();
      if (action === "showFull") bridge.showFull();
      else bridge[action](nodeId ?? "");
      await waitForCount(expectedCount);
      await nextPaint();
      return performance.now() - startedAt;
    };
    const select = async (ownerSelector: string) => {
      const button = document.querySelector<HTMLButtonElement>(
        `${ownerSelector} > [data-thought-text-id]`,
      );
      if (!button) throw new Error(`Missing thought selector: ${ownerSelector}`);
      button.click();
      await nextPaint();
    };
    const percentile = (values: number[], fraction: number) => {
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
    };

    const root = '[data-thought-id="perf_thought_0000"]';
    const deep = '[data-thought-id="perf_thought_0009"]';
    const foldSamples: number[][] = [];
    const focusSamples: number[][] = [];
    const selectionSamples: number[][] = [];

    for (let warmup = 0; warmup < 3; warmup += 1) {
      await select(root);
      await actNavigation("toggleFold", "perf_thought_0000", 1);
      await actNavigation("toggleFold", "perf_thought_0000", 2_000);
      await select(root);
      await actNavigation("focus", "perf_thought_0000", 1);
      await actNavigation("showFull", null, 2_000);
    }

    const measurementStartTime = performance.now();
    for (let round = 0; round < rounds; round += 1) {
      const folds: number[] = [];
      const focuses: number[] = [];
      const selections: number[] = [];
      for (let sample = 0; sample < samplesPerRound; sample += 1) {
        const target = sample % 2 === 0 ? root : deep;
        const startedAt = performance.now();
        await select(target);
        selections.push(performance.now() - startedAt);
        await select(root);
        folds.push(await actNavigation("toggleFold", "perf_thought_0000", 1));
        folds.push(await actNavigation("toggleFold", "perf_thought_0000", 2_000));
        await select(root);
        focuses.push(await actNavigation("focus", "perf_thought_0000", 1));
        focuses.push(await actNavigation("showFull", null, 2_000));
      }
      foldSamples.push(folds);
      focusSamples.push(focuses);
      selectionSamples.push(selections);
    }
    const measurementEndTime = performance.now();

    const summarize = (rounds: number[][]) =>
      rounds.map((values) => ({
        median: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        max: Math.max(...values),
      }));
    const markNames = [
      "matter:performance:initial-canvas-committed",
      "matter:performance:height-read-start",
      "matter:performance:height-read-complete",
      "matter:performance:pure-layout-start",
      "matter:performance:pure-layout-complete",
      "matter:performance:geometry-dom-published",
      "matter:performance:published-canvas-commit",
    ];
    const marks = Object.fromEntries(markNames.map((name) => {
      const entry = performance.getEntriesByName(name, "mark")[0];
      return [name, entry?.startTime ?? null];
    }));
    return {
      initial: {
        firstContentfulPaint: initial?.firstContentfulPaint ?? null,
        layoutReady: initial?.layoutReady ?? null,
      },
      fold: summarize(foldSamples),
      focus: summarize(focusSamples),
      selection: summarize(selectionSamples),
      longTasks: {
        count: initial?.longTasks.length ?? 0,
        max: initial?.longTasks.length === 0
          ? 0
          : Math.max(...(initial?.longTasks ?? []).map(({ duration }) => duration)),
        total: initial?.longTasks.reduce((total, entry) => total + entry.duration, 0) ?? 0,
        entries: initial?.longTasks ?? [],
      },
      longAnimationFrames: {
        supported: initial?.longAnimationFrameSupported ?? false,
        count: initial?.longAnimationFrames.length ?? 0,
        max: initial?.longAnimationFrames.length === 0
          ? 0
          : Math.max(...(initial?.longAnimationFrames ?? []).map(({ duration }) => duration)),
        entries: initial?.longAnimationFrames ?? [],
      },
      marks,
      measurementWindow: {
        startTime: measurementStartTime,
        endTime: measurementEndTime,
      },
      elementCount: document.querySelectorAll("*").length,
    };
  }, { rounds: measurementRounds, samplesPerRound: measurementSamples });
  const summarizeTimingEntries = <T extends { startTime: number; duration: number }>(
    entries: readonly T[],
  ) => ({
    count: entries.length,
    max: entries.length === 0 ? 0 : Math.max(...entries.map(({ duration }) => duration)),
    total: entries.reduce((total, entry) => total + entry.duration, 0),
    entries,
  });
  const entriesInsideMeasurement = <T extends { startTime: number; duration: number }>(
    entries: readonly T[],
  ) => entries.filter(({ startTime, duration }) =>
    startTime >= rawReceipt.measurementWindow.startTime &&
    startTime + duration <= rawReceipt.measurementWindow.endTime
  );
  const attributedLongTasks = attributeColdCanvasTasks(
    rawReceipt.longTasks.entries,
    rawReceipt.marks,
  );
  const attributedLongAnimationFrames = attributeColdCanvasTasks(
    rawReceipt.longAnimationFrames.entries,
    rawReceipt.marks,
  );
  const receipt = {
    ...rawReceipt,
    longTasks: {
      ...rawReceipt.longTasks,
      cold: summarizeTimingEntries(attributedLongTasks.filter(({ overlapsColdCanvas }) =>
        overlapsColdCanvas
      )),
      measurement: summarizeTimingEntries(entriesInsideMeasurement(rawReceipt.longTasks.entries)),
      coldAttribution: attributedLongTasks,
    },
    longAnimationFrames: {
      ...rawReceipt.longAnimationFrames,
      cold: summarizeTimingEntries(attributedLongAnimationFrames.filter(({ overlapsColdCanvas }) =>
        overlapsColdCanvas
      )),
      measurement: summarizeTimingEntries(
        entriesInsideMeasurement(rawReceipt.longAnimationFrames.entries),
      ),
      coldAttribution: attributedLongAnimationFrames,
    },
  };

  console.log(`Matter 2k production receipt: ${JSON.stringify(receipt)}`);
  await test.info().attach("production-2k-receipt.json", {
    body: JSON.stringify(receipt, null, 2),
    contentType: "application/json",
  });
  const blockingRounds = [...receipt.fold, ...receipt.focus].filter(
    ({ p95 }) => p95 >= 200,
  ).length;
  expect(receipt.initial.layoutReady).not.toBeNull();
  expect(receipt.marks["matter:performance:initial-canvas-committed"]).not.toBeNull();
  expect(receipt.marks["matter:performance:height-read-start"]).not.toBeNull();
  expect(receipt.marks["matter:performance:height-read-complete"]).not.toBeNull();
  expect(receipt.marks["matter:performance:pure-layout-start"]).not.toBeNull();
  expect(receipt.marks["matter:performance:pure-layout-complete"]).not.toBeNull();
  expect(receipt.marks["matter:performance:geometry-dom-published"]).not.toBeNull();
  expect(receipt.marks["matter:performance:published-canvas-commit"]).not.toBeNull();
  expect(receipt.elementCount).toBeLessThanOrEqual(4_700);
  expect(blockingRounds).toBeLessThan(2);
  expect(receipt.longTasks.max).toBeLessThan(100);
});
