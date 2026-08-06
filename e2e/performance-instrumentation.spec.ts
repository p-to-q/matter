import { expect, test } from "@playwright/test";

const marks = [
  "matter:performance:initial-canvas-committed",
  "matter:performance:height-read-start",
  "matter:performance:height-read-complete",
  "matter:performance:pure-layout-start",
  "matter:performance:pure-layout-complete",
  "matter:performance:geometry-dom-published",
  "matter:performance:published-canvas-commit",
] as const;

test("exposes ordered cold-canvas timing marks only for the performance fixture", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const entries = await page.evaluate((names) => names.map((name) => {
    const entries = performance.getEntriesByName(name, "mark");
    return { name, count: entries.length, startTime: entries[0]?.startTime ?? null };
  }), marks);

  expect(entries.map(({ count }) => count)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  expect(entries.map(({ startTime }) => startTime)).toEqual([...entries]
    .map(({ startTime }) => startTime)
    .sort((left, right) => (left ?? 0) - (right ?? 0)));

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".matter-canvas");
    const root = document.querySelector<HTMLElement>("[data-thought-id='perf_thought_0000']");
    const final = document.querySelector<HTMLElement>("[data-thought-id='perf_thought_1999']");
    return {
      height: canvas?.style.getPropertyValue("--matter-canvas-height") ?? "",
      rootTransform: root?.style.transform ?? "",
      finalTransform: final?.style.transform ?? "",
    };
  });
  expect(geometry.height).toMatch(/px$/);
  expect(geometry.rootTransform).toMatch(/^translate3d\(/);
  expect(geometry.finalTransform).toMatch(/^translate3d\(/);
});
