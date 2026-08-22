import { expect, test } from "@playwright/test";

const PERFORMANCE_ROW_COUNT = 2_000;
/**
 * Selection exposes the complete rooted outline even when browse disclosure is
 * locally closed. From the root that is every thought except the root itself.
 */
const SELECTABLE_ROW_COUNT = PERFORMANCE_ROW_COUNT - 1;
const FIRST_SELECTABLE_INDEX = 1;
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
  const first = sidebar.locator(`.material-file[data-authored-index="${FIRST_SELECTABLE_INDEX}"]`);
  const last = sidebar.locator(`.material-file[data-authored-index="${PERFORMANCE_ROW_COUNT - 1}"]`);

  await expect(page.locator("[data-thought-id]")).toHaveCount(PERFORMANCE_ROW_COUNT);
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(sidebar).not.toHaveAttribute("data-projection-stale", "true");

  // One level is a handful of rows; the shell stays small before selection.
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);
  expect(await page.locator("*").count()).toBeLessThanOrEqual(TOTAL_ELEMENT_BUDGET);

  // Every mounted browse row owns exactly one leading slot. Virtual clipping
  // retains authored endpoints: sibling guides join an arrow to the next arrow
  // or local terminal point. A branch-tail guide instead closes one final open
  // branch at its authored last descendant; the window may clip but not move it.
  const virtualGrammar = await sidebar.evaluate((element) => {
    const rows = Array.from(element.querySelectorAll<HTMLElement>(".material-file"));
    const rowsByIndex = new Map(rows.map((row) => [
      Number(row.dataset.projectionIndex),
      row,
    ]));
    const leadingSlotsAreExclusive = rows.every((row) => {
      const arrow = row.querySelectorAll(
        ".material-file__structure-control[data-structure-action='expanded'], .material-file__structure-control[data-structure-action='collapsed']",
      ).length;
      const terminal = row.querySelectorAll(".material-file__terminal-marker").length;
      const blank = row.querySelectorAll(".material-file__context-space:not(.material-file__terminal-marker)").length;
      return arrow + terminal + blank === 1;
    });
    const guides = Array.from(element.querySelectorAll<HTMLElement>(".material-files__tree-guide"));
    const mountedEndpointsFollowGrammar = guides.every((guide) => {
      const source = rowsByIndex.get(Number(guide.dataset.guideFrom));
      const target = rowsByIndex.get(Number(guide.dataset.guideTo));
      const sourceIsArrow = source === undefined || source.querySelector(
        ".material-file__structure-control[data-structure-action='expanded'], .material-file__structure-control[data-structure-action='collapsed']",
      ) !== null;
      if (guide.dataset.guideKind === "branch-tail") {
        const sourceOwnsTail = source === undefined || (
          source.dataset.nodeId === guide.dataset.guideBranch &&
          source.dataset.expanded === "true"
        );
        const targetIsDescendant = source === undefined || target === undefined || (
          Number(target.dataset.projectionIndex) > Number(source.dataset.projectionIndex) &&
          Number(getComputedStyle(target).getPropertyValue("--material-file-depth")) >
            Number(getComputedStyle(source).getPropertyValue("--material-file-depth"))
        );
        return sourceIsArrow && sourceOwnsTail && targetIsDescendant;
      }
      const targetIsArrowOrTerminal = target === undefined || target.querySelector(
        ".material-file__structure-control[data-structure-action='expanded'], .material-file__structure-control[data-structure-action='collapsed'], .material-file__terminal-marker",
      ) !== null;
      return sourceIsArrow && targetIsArrowOrTerminal;
    });
    return { guideCount: guides.length, leadingSlotsAreExclusive, mountedEndpointsFollowGrammar };
  });
  expect(virtualGrammar.guideCount).toBeGreaterThan(0);
  expect(virtualGrammar.leadingSlotsAreExclusive).toBe(true);
  expect(virtualGrammar.mountedEndpointsFollowGrammar).toBe(true);

  await sidebar.getByRole("button", { name: "Select", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "select");
  await expect(sidebar.getByRole("tree")).toHaveAttribute("aria-multiselectable", "true");
  await expect(sidebar.locator(".material-files__tree")).toHaveAttribute(
    "aria-label",
    `Markdown material tree, ${SELECTABLE_ROW_COUNT} entries`,
  );
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);
  expect(await page.locator("*").count()).toBeLessThanOrEqual(TOTAL_ELEMENT_BUDGET);

  // Roving tree authority can reach an unmounted endpoint without adding all
  // 1,999 rows to the tab sequence or DOM.
  await first.focus();
  await page.keyboard.press("End");
  await expect(last).toBeFocused();
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);
  await page.keyboard.press(" ");
  await expect(last).toHaveAttribute("aria-selected", "true");

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(last).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);

  await body.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(first).toBeVisible();
  await first.getByRole("checkbox").check();
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

test("keeps stale deferred search rows inert while the search control stays usable", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");

  const sidebar = page.locator("aside.material-files");
  await expect(page.locator("[data-thought-id]")).toHaveCount(PERFORMANCE_ROW_COUNT);
  await sidebar.getByRole("button", { name: "Search thoughts" }).click();
  const search = sidebar.getByRole("searchbox", { name: "Filter material files" });
  await search.fill("材料");
  await expect(sidebar.locator(".material-file")).not.toHaveCount(0);

  await page.evaluate(() => {
    type Snapshot = Readonly<{
      inputDisabled: boolean;
      rowDisabled: boolean;
      stale: boolean;
    }>;
    const sidebar = document.querySelector<HTMLElement>("aside.material-files");
    if (sidebar === null) throw new Error("Missing material file surface.");
    const snapshots: Snapshot[] = [];
    const capture = () => snapshots.push({
      inputDisabled: sidebar.querySelector<HTMLInputElement>("[type='search']")?.disabled ?? true,
      rowDisabled: sidebar.querySelector<HTMLButtonElement>(".material-file__open")?.disabled ?? true,
      stale: sidebar.hasAttribute("data-query-projection-stale"),
    });
    capture();
    const observer = new MutationObserver(capture);
    observer.observe(sidebar, { attributes: true, childList: true, subtree: true });
    (window as Window & { __matterSearchProjectionSnapshots?: Snapshot[] })
      .__matterSearchProjectionSnapshots = snapshots;
  });

  await search.fill("no-material-row-can-match-this-deferred-query");
  await expect(sidebar).not.toHaveAttribute("data-query-projection-stale", "true");
  await expect(sidebar.locator(".material-file")).toHaveCount(0);
  const snapshots = await page.evaluate(() =>
    (window as Window & {
      __matterSearchProjectionSnapshots?: ReadonlyArray<{
        inputDisabled: boolean;
        rowDisabled: boolean;
        stale: boolean;
      }>;
    }).__matterSearchProjectionSnapshots ?? [],
  );
  expect(snapshots.some(({ inputDisabled, rowDisabled, stale }) =>
    stale && rowDisabled && !inputDisabled,
  )).toBe(true);
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
    const first = sidebar.locator(`.material-file[data-authored-index="${FIRST_SELECTABLE_INDEX}"]`);
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

    // A synthetic depth-32 visual stress caps before the title/control budget,
    // with no horizontal escape at either width. Exact level 32 is pure-tested.
    const depthReceipt = await rows.first().evaluate((row) => {
      row.style.setProperty("--material-file-depth", "32");
      const body = row.closest<HTMLElement>(".material-files__body");
      const title = row.querySelector<HTMLElement>(".material-file__title");
      const trailing = row.querySelector<HTMLElement>(".material-file__context-control");
      if (body === null || title === null || trailing === null) {
        throw new Error("Deep material row geometry is unavailable.");
      }
      const rowRect = row.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const trailingRect = trailing.getBoundingClientRect();
      return {
        bodyClientWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        rowRight: rowRect.right,
        titleWidth: titleRect.width,
        trailingRight: trailingRect.right,
      };
    });
    expect(depthReceipt.bodyScrollWidth).toBeLessThanOrEqual(depthReceipt.bodyClientWidth);
    expect(depthReceipt.titleWidth).toBeGreaterThanOrEqual(79);
    expect(depthReceipt.trailingRight).toBeLessThanOrEqual(depthReceipt.rowRight + .5);

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
    await expect(first).toBeVisible();
    await first.getByRole("checkbox").check();
    await expect(sidebar).toContainText("2 selected");
    expect(await rows.count()).toBeLessThanOrEqual(WINDOWED_ROW_BUDGET);

    await sidebar.getByRole("button", { name: "Copy 2 selected thoughts" }).click();
    await expect(sidebar).toContainText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split("\n\n")).toHaveLength(2);
  });
}

test.describe("1024px coarse-pointer material index", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test("keeps every visible index action at least 48px", async ({ page }) => {
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    const sidebar = page.locator("aside.material-files");
    const targets = sidebar.locator([
      ".material-files__mode-action:not(:disabled)",
      ".material-file__structure-control:not(:disabled)",
      ".material-file__context-control:not(:disabled)",
      ".material-file__open:not(:disabled)",
    ].join(","));
    const sizes = await targets.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        ariaLabel: element.getAttribute("aria-label"),
        className: element.className,
        height: rect.height,
        width: rect.width,
      };
    }));
    expect(sizes.length).toBeGreaterThan(0);
    // Chromium may resolve a 48px grid track a few ten-thousandths below the
    // declared size after device-pixel placement.
    expect(sizes.filter(({ height, width }) => height < 47.9 || width < 47.9)).toEqual([]);

    await sidebar.getByRole("button", { name: "Search thoughts" }).click();
    const search = sidebar.getByRole("searchbox", { name: "Filter material files" });
    const searchRect = await search.boundingBox();
    expect(searchRect).not.toBeNull();
    expect(searchRect!.height).toBeGreaterThanOrEqual(48);
    const closeRect = await sidebar.getByRole("button", { name: "Close search" }).boundingBox();
    expect(closeRect).not.toBeNull();
    expect(closeRect!.width).toBeGreaterThanOrEqual(48);
    expect(closeRect!.height).toBeGreaterThanOrEqual(48);
  });
});
