import { expect, test, type Locator } from "@playwright/test";

const rootId = "thought_fixture_root";
const originalText =
  "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`material files stay synchronized and copy authored material at ${viewport.name} width`, async ({
    context,
    page,
  }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const sidebar = page.locator("aside.material-files");
    const toggle = page.getByRole("button", { name: /material files/i }).first();
    const setSidebarOpen = async (open: boolean) => {
      if ((await toggle.getAttribute("aria-expanded")) !== String(open)) await toggle.click();
      if (open) {
        await expect(sidebar).toHaveAttribute("data-open", "true");
      } else {
        await expect(sidebar).not.toHaveAttribute("data-open", "true");
      }
    };
    const clickTool = async (button: Locator) => {
      if (viewport.name === "narrow") await setSidebarOpen(false);
      await button.click();
      if (viewport.name === "narrow") await setSidebarOpen(true);
    };
    await setSidebarOpen(true);
    if (viewport.name === "laptop") {
      const openCanvas = await page.locator(".matter-document").boundingBox();
      if (openCanvas === null) throw new Error("open desktop canvas is missing");
      await setSidebarOpen(false);
      const closedCanvas = await page.locator(".matter-document").boundingBox();
      if (closedCanvas === null) throw new Error("closed desktop canvas is missing");
      expect(closedCanvas.x).toBeCloseTo(openCanvas.x, 0);
      expect(closedCanvas.width).toBeCloseTo(openCanvas.width, 0);
      await setSidebarOpen(true);
    }
    await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(sidebar.getByRole("checkbox")).toHaveCount(0);
    await expect(sidebar.locator(".material-files__footer")).toHaveCount(0);
    if (viewport.name === "narrow") {
      await expect(page.locator(".tool-rail")).toBeHidden();
      const drawer = await sidebar.boundingBox();
      expect(drawer).not.toBeNull();
      expect(drawer!.width).toBeLessThanOrEqual(304);
      expect(viewport.width - (drawer!.x + drawer!.width)).toBeGreaterThanOrEqual(55);
    }
    await expect(sidebar.locator(".material-file")).toHaveCount(1);

    const rootFile = sidebar.locator(`.material-file[data-created-at][data-updated-at]`).first();
    await expect(rootFile).toHaveAttribute("data-created-at", "2026-08-03T08:00:00.000Z");
    await rootFile.locator(".material-file__open").click();
    await expect(page.locator(`[data-thought-id="${rootId}"]`)).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("navigation", { name: "Selected thought actions" })).toHaveCount(0);

    const branch = page.getByRole("button", { name: "Extend related thought", exact: true });
    await clickTool(branch);
    await rootFile.locator(".material-file__open").click();
    await clickTool(branch);
    await expect(sidebar.locator(".material-file")).toHaveCount(3);
    await expect(page.locator("[data-thought-id]")).toHaveCount(3);
    await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
    const paths = await sidebar.locator(".material-file").evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-markdown-path")),
    );
    expect(paths[0]).toBe("matter/index.md");
    expect(paths[1]).toMatch(/^matter\/001-.+\/index\.md$/u);
    expect(paths[2]).toMatch(/^matter\/002-.+\/index\.md$/u);

    await page.reload();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const reloadedSidebar = page.locator("aside.material-files");
    const reloadToggle = page.getByRole("button", { name: /material files/i }).first();
    if ((await reloadToggle.getAttribute("aria-expanded")) !== "true") await reloadToggle.click();
    await expect(reloadedSidebar).toHaveAttribute("data-persistence-phase", "saved");
    await expect(reloadedSidebar).toHaveAttribute("data-mode", "browse");
    await expect(reloadedSidebar.getByRole("checkbox")).toHaveCount(0);
    await expect(reloadedSidebar.locator(".material-file")).toHaveCount(3);
    await expect(page.locator("[data-thought-id]")).toHaveCount(3);
    if (viewport.name === "narrow") await setSidebarOpen(false);
    await expect(page.getByRole("button", { name: "Undo last change" })).toBeDisabled();
    if (viewport.name === "narrow") await setSidebarOpen(true);

    const activeSidebar = reloadedSidebar;
    await activeSidebar.locator(".material-file__open").first().click();
    await clickTool(page.getByRole("button", { name: "Extend related thought", exact: true }));
    await expect(activeSidebar.locator(".material-file")).toHaveCount(4);

    const childTitle = await activeSidebar.locator(".material-file__title").nth(1).textContent();
    if (childTitle === null) throw new Error("derived child title missing");
    await activeSidebar.getByRole("button", { name: /Collapse/ }).click();
    await expect(activeSidebar.locator(".material-file")).toHaveCount(1);
    await expect(page.locator("[data-thought-id]")).toHaveCount(1);

    await activeSidebar.getByRole("button", { name: "Search thoughts" }).click();
    await expect(activeSidebar).toHaveAttribute("data-mode", "search");
    const search = activeSidebar.getByRole("searchbox", { name: "Filter material files" });
    await search.fill(childTitle.slice(0, 5));
    await expect(activeSidebar.locator(".material-file")).toHaveCount(2);
    await expect(activeSidebar.locator(".material-file[data-direct-match=true]")).toHaveCount(1);
    await expect(page.locator("[data-thought-id]")).toHaveCount(1);
    await activeSidebar.getByRole("button", { name: "Close search" }).click();
    await expect(activeSidebar).toHaveAttribute("data-mode", "browse");

    await activeSidebar.getByRole("button", { name: /Expand/ }).click();
    await expect(activeSidebar.locator(".material-file")).toHaveCount(4);
    await activeSidebar.getByRole("button", { name: "Select" }).click();
    await expect(activeSidebar).toHaveAttribute("data-mode", "select");
    const checks = activeSidebar.getByRole("checkbox", { name: /for copying/ });
    await expect(checks).toHaveCount(4);
    if (viewport.name === "narrow") {
      const coarseTargets = await activeSidebar.locator(
        "button:not(:disabled), label.material-file__check",
      ).evaluateAll((targets) => targets.map((target) => {
        const rect = target.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(coarseTargets.every((target) => target.width >= 48 && target.height >= 48)).toBe(true);
    }
    await checks.nth(0).check();
    await checks.nth(3).check();
    await expect(activeSidebar).toContainText("2 selected");
    await activeSidebar.getByRole("button", { name: "Copy 2 selected thoughts" }).click();
    await expect(activeSidebar).toContainText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(originalText)).toBe(true);
    expect(copied.split("\n\n")).toHaveLength(2);
    await expect(activeSidebar).toContainText("2 selected");

    await clickTool(page.getByRole("button", { name: "Undo last change" }));
    await expect(activeSidebar.locator(".material-file")).toHaveCount(3);
    await expect(activeSidebar).toContainText("1 selected");
    await expect(page.locator("[data-thought-id]")).toHaveCount(3);
    expect(browserErrors).toEqual([]);
  });
}
