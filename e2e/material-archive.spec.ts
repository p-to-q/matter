import { expect, test, type Page } from "@playwright/test";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`material archive exports and restores through the confirmed file flow at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const sidebar = page.locator("aside.material-files");
    // The index has no handle at desk widths; below them it is a drawer.
    const toggle = page.getByRole("button", { name: /material files/i }).first();
    if (await toggle.count() > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await expect(sidebar).toHaveAttribute("data-open", "true");
    await sidebar.getByRole("button", { name: "Select", exact: true }).click();
    await sidebar.getByRole("checkbox", { name: /for copying/ }).first().check();
    await expect(sidebar).toContainText("1 selected");
    await sidebar.getByRole("button", { name: "Archive", exact: true }).click();
    const archive = sidebar.getByRole("region", { name: "Material archive" });
    await expect(archive).toBeVisible();
    await expect(archive.getByRole("button", { name: "Export a copy" })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await archive.getByRole("button", { name: "Export a copy" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.matter\.zip$/u);
    const downloadPath = await download.path();
    if (downloadPath === null) throw new Error("Archive download did not produce a local file.");

    await archive.getByLabel("Choose a material archive").setInputFiles(downloadPath);
    await expect(archive).toContainText("Replace current material?");
    await archive.getByRole("button", { name: "Replace", exact: true }).click();
    await expect(sidebar.getByRole("region", { name: "Material archive" })).toHaveCount(0);
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await sidebar.getByRole("button", { name: "Select", exact: true }).click();
    await expect(sidebar).toContainText("0 selected");
    expect(browserErrors).toEqual([]);
  });

  test(`material archive cancellation and invalid files leave current material and session intact at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const root = page.locator('[data-thought-id="thought_fixture_root"]');
    await root.getByRole("button").click();
    await expect(root).toHaveAttribute("data-selected", "true");
    const before = await readMaterialSession(page);

    const sidebar = page.locator("aside.material-files");
    // The index has no handle at desk widths; below them it is a drawer.
    const toggle = page.getByRole("button", { name: /material files/i }).first();
    if (await toggle.count() > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await sidebar.getByRole("button", { name: "Archive", exact: true }).click();
    const archive = sidebar.getByRole("region", { name: "Material archive" });

    const chooserPromise = page.waitForEvent("filechooser");
    await archive.getByRole("button", { name: "Import a copy" }).click();
    await (await chooserPromise).setFiles([]);
    await expect(archive).not.toContainText("Replace current material?");
    expect(await readMaterialSession(page)).toEqual(before);

    await archive.getByLabel("Choose a material archive").setInputFiles({
      name: "not-a-material.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("This is not a ZIP archive."),
    });
    await expect(archive).toContainText("archive");
    await expect(archive).not.toContainText("Replace current material?");
    expect(await readMaterialSession(page)).toEqual(before);
    expect(browserErrors).toEqual([]);
  });

  test(`material archive waits while lasso owns the canvas at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const sidebar = page.locator("aside.material-files");
    const toggle = page.getByRole("button", { name: /material files/i }).first();
    const hasToggle = await toggle.count() > 0;
    if (hasToggle && (await toggle.getAttribute("aria-expanded")) === "true" && viewport.name === "narrow") {
      await toggle.click();
    }
    await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    if (hasToggle && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await sidebar.getByRole("button", { name: "Archive", exact: true }).click();

    const archive = sidebar.getByRole("region", { name: "Material archive" });
    await expect(archive.getByRole("button", { name: "Export a copy" })).toBeDisabled();
    await expect(archive.getByRole("button", { name: "Import a copy" })).toBeDisabled();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
  });
}

async function readMaterialSession(page: Page) {
  return page.locator("main.matter-shell").evaluate((main) => ({
    treeRevision: main.getAttribute("data-tree-revision"),
    view: main.getAttribute("data-view"),
    viewport: [
      main.getAttribute("data-viewport-x"),
      main.getAttribute("data-viewport-y"),
      main.getAttribute("data-viewport-zoom"),
    ],
    nodes: Array.from(document.querySelectorAll<HTMLElement>("[data-thought-id]")).map((node) => ({
      id: node.dataset.thoughtId,
      selected: node.hasAttribute("data-selected"),
      text: node.querySelector<HTMLElement>("[data-thought-text-id]")?.textContent ?? null,
    })),
  }));
}
