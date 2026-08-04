import { expect, test } from "@playwright/test";

test("records the production 2,000-node renderer receipt", async ({ page }) => {
  test.skip(
    process.env.MATTER_RUN_PERFORMANCE_RECEIPT !== "true",
    "Run explicitly against a production build with the performance fixture enabled.",
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  await expect(page.locator("[data-thought-id]")).toHaveCount(2_000);

  const receipt = await page.evaluate(async () => {
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: false });

    const waitForCount = (count: number) =>
      new Promise<void>((resolve, reject) => {
        const startedAt = performance.now();
        const check = () => {
          if (document.querySelectorAll("[data-thought-id]").length === count) {
            resolve();
            return true;
          }
          if (performance.now() - startedAt > 5_000) {
            reject(new Error(`Timed out waiting for ${count} rendered thoughts.`));
            return true;
          }
          return false;
        };
        if (check()) return;
        const mutationObserver = new MutationObserver(() => {
          if (check()) mutationObserver.disconnect();
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
      });
    const nextPaint = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    const act = async (selector: string, expectedCount: number) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button) throw new Error(`Missing performance control: ${selector}`);
      const startedAt = performance.now();
      button.click();
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

    for (let warmup = 0; warmup < 3; warmup += 1) {
      await select(root);
      await act('[data-tool-id="fold"]', 1);
      await act('[data-tool-id="unfold"]', 2_000);
      await select(deep);
      await act('[data-tool-id="focus"]', 10);
      await act('[data-tool-id="show-all"]', 2_000);
    }

    for (let round = 0; round < 3; round += 1) {
      const folds: number[] = [];
      const focuses: number[] = [];
      for (let sample = 0; sample < 20; sample += 1) {
        await select(root);
        folds.push(await act('[data-tool-id="fold"]', 1));
        folds.push(await act('[data-tool-id="unfold"]', 2_000));
        await select(deep);
        focuses.push(await act('[data-tool-id="focus"]', 10));
        focuses.push(await act('[data-tool-id="show-all"]', 2_000));
      }
      foldSamples.push(folds);
      focusSamples.push(focuses);
    }
    observer.disconnect();

    const summarize = (rounds: number[][]) =>
      rounds.map((values) => ({
        median: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        max: Math.max(...values),
      }));
    return {
      fold: summarize(foldSamples),
      focus: summarize(focusSamples),
      longTasks: {
        count: longTasks.length,
        max: longTasks.length === 0 ? 0 : Math.max(...longTasks),
        total: longTasks.reduce((total, duration) => total + duration, 0),
      },
      elementCount: document.querySelectorAll("*").length,
    };
  });

  console.log(`Matter 2k production receipt: ${JSON.stringify(receipt)}`);
  const blockingRounds = [...receipt.fold, ...receipt.focus].filter(
    ({ p95 }) => p95 >= 200,
  ).length;
  expect(blockingRounds).toBeLessThan(2);
  expect(receipt.longTasks.max).toBeLessThan(100);
});
