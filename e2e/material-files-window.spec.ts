import { expect, test } from "@playwright/test";

const PERFORMANCE_ROW_COUNT = 2_000;
const WINDOWED_ROW_BUDGET = 64;
const TOTAL_ELEMENT_BUDGET = 4_700;

test("windows the 2,000-row material index without losing deep selection or copy", async ({
  context,
  page,
}) => {
  test.setTimeout(45_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");

  const sidebar = page.locator("aside.material-files");
  const body = sidebar.locator(".material-files__body");
  const rows = sidebar.locator(".material-file");
  const root = sidebar.locator('.material-file[data-authored-index="0"]');
  const last = sidebar.locator(`.material-file[data-authored-index="${PERFORMANCE_ROW_COUNT - 1}"]`);

  await expect(page.locator("[data-thought-id]")).toHaveCount(PERFORMANCE_ROW_COUNT);
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(sidebar).not.toHaveAttribute("data-projection-stale", "true");
  await expect(sidebar.locator(".material-files__tree")).toHaveAttribute(
    "aria-label",
    `Markdown material tree, ${PERFORMANCE_ROW_COUNT} entries`,
  );
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);
  expect(await page.locator("*").count()).toBeLessThanOrEqual(TOTAL_ELEMENT_BUDGET);

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(last).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);

  await last.locator(".material-file__open").click();
  await expect(last).toHaveAttribute(
    "data-active",
    "true",
  );

  await sidebar.getByRole("button", { name: "Select", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "select");
  await last.getByRole("checkbox").check();

  await body.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(root).toBeVisible();
  await root.getByRole("checkbox").check();
  await expect(sidebar).toContainText("2 selected");

  await sidebar.getByRole("button", { name: "Copy 2 selected thoughts" }).click();
  await expect(sidebar).toContainText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("\n\n")).toHaveLength(2);
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);
});

test("keeps the file index inert during a deferred navigation projection", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");

  const sidebar = page.locator("aside.material-files");
  const firstOpen = sidebar.locator(".material-file__open").first();
  await expect(page.locator("[data-thought-id]")).toHaveCount(PERFORMANCE_ROW_COUNT);
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(sidebar).not.toHaveAttribute("data-projection-stale", "true");

  await page.evaluate(() => {
    type Snapshot = Readonly<{ stale: boolean; inert: boolean; rowDisabled: boolean }>;
    const sidebar = document.querySelector<HTMLElement>("aside.material-files");
    const row = sidebar?.querySelector<HTMLButtonElement>(".material-file__open");
    if (sidebar === null || row === null) throw new Error("Missing material file controls.");
    const snapshots: Snapshot[] = [];
    const capture = () => snapshots.push({
      stale: sidebar.hasAttribute("data-projection-stale"),
      inert: sidebar.inert,
      rowDisabled: row?.disabled ?? true,
    });
    capture();
    const observer = new MutationObserver(capture);
    observer.observe(sidebar, {
      attributes: true,
      attributeFilter: ["data-projection-stale", "inert"],
      childList: true,
      subtree: true,
    });
    (window as Window & { __matterIndexProjectionSnapshots?: Snapshot[] })
      .__matterIndexProjectionSnapshots = snapshots;
  });

  await firstOpen.click();
  await expect(sidebar).not.toHaveAttribute("data-projection-stale", "true");
  const snapshots = await page.evaluate(() =>
    (window as Window & {
      __matterIndexProjectionSnapshots?: ReadonlyArray<{
        stale: boolean;
        inert: boolean;
        rowDisabled: boolean;
      }>;
    }).__matterIndexProjectionSnapshots ?? [],
  );
  expect(snapshots.some(({ stale, inert, rowDisabled }) => stale && inert && rowDisabled)).toBe(true);
  expect(snapshots.at(-1)).toEqual({ stale: false, inert: false, rowDisabled: false });
});

for (const viewport of [
  { name: "390px", width: 390, height: 844 },
  { name: "320px", width: 320, height: 844 },
]) {
  test(`keeps the 2,000-row material index touch-sized and windowed at ${viewport.name}`, async ({
    context,
    page,
  }) => {
    test.setTimeout(45_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize(viewport);
    await page.goto("/matter/performance");

    const sidebar = page.locator("aside.material-files");
    const body = sidebar.locator(".material-files__body");
    const rows = sidebar.locator(".material-file");
    const root = sidebar.locator('.material-file[data-authored-index="0"]');
    const last = sidebar.locator(
      `.material-file[data-authored-index="${PERFORMANCE_ROW_COUNT - 1}"]`,
    );

    await expect(page.locator("[data-thought-id]")).toHaveCount(PERFORMANCE_ROW_COUNT);
    await expect(sidebar).not.toHaveAttribute("data-open", "true");
    await page.getByRole("button", { name: "Show material files" }).click();
    await expect(sidebar).toHaveAttribute("data-open", "true");
    await expect(sidebar).not.toHaveAttribute("data-projection-stale", "true");
    await expect(page.locator(".tool-rail")).toBeHidden();

    const rowGeometry = await rows.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, minimumHeight: getComputedStyle(element).minHeight };
    }));
    expect(rowGeometry.length).toBeGreaterThan(0);
    expect(rowGeometry.every(({ height, minimumHeight }) => height === 48 && minimumHeight === "48px"))
      .toBe(true);
    expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);

    await sidebar.getByRole("button", { name: "Select", exact: true }).click();
    await expect(sidebar).toHaveAttribute("data-mode", "select");
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(last).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);
    await last.getByRole("checkbox").check();

    await body.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(root).toBeVisible();
    await root.getByRole("checkbox").check();
    await expect(sidebar).toContainText("2 selected");
    expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);

    await sidebar.getByRole("button", { name: "Copy 2 selected thoughts" }).click();
    await expect(sidebar).toContainText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split("\n\n")).toHaveLength(2);
  });
}
