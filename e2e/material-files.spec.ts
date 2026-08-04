import { expect, test } from "@playwright/test";

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

    const sidebar = page.getByRole("complementary", { name: "Material files" });
    const toggle = page.getByRole("button", { name: /material files/i }).first();
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(sidebar).toHaveAttribute("data-open", "true");
    await expect(sidebar.locator(".material-file")).toHaveCount(1);

    const rootFile = sidebar.locator(`.material-file[data-created-at][data-updated-at]`).first();
    await expect(rootFile).toHaveAttribute("data-created-at", "2026-08-03T08:00:00.000Z");
    await rootFile.locator(".material-file__open").click();
    await expect(page.locator(`[data-thought-id="${rootId}"]`)).toHaveAttribute("data-selected", "true");

    const branch = page.getByRole("button", { name: "Extend related thought", exact: true });
    await branch.click();
    await rootFile.locator(".material-file__open").click();
    await branch.click();
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
    const reloadedSidebar = page.getByRole("complementary", { name: "Material files" });
    const reloadToggle = page.getByRole("button", { name: /material files/i }).first();
    if ((await reloadToggle.getAttribute("aria-expanded")) !== "true") await reloadToggle.click();
    await expect(reloadedSidebar.locator(".material-file")).toHaveCount(3);
    await expect(page.locator("[data-thought-id]")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Undo last change" })).toBeDisabled();

    const activeSidebar = reloadedSidebar;
    await activeSidebar.locator(".material-file__open").first().click();
    await page.getByRole("button", { name: "Extend related thought", exact: true }).click();
    await expect(activeSidebar.locator(".material-file")).toHaveCount(4);

    const childTitle = await activeSidebar.locator(".material-file__title").nth(1).textContent();
    if (childTitle === null) throw new Error("derived child title missing");
    await activeSidebar.getByRole("button", { name: /Collapse/ }).click();
    await expect(activeSidebar.locator(".material-file")).toHaveCount(1);
    await expect(page.locator("[data-thought-id]")).toHaveCount(1);

    const search = activeSidebar.getByRole("searchbox", { name: "Filter material files" });
    await search.fill(childTitle.slice(0, 5));
    await expect(activeSidebar.locator(".material-file")).toHaveCount(2);
    await expect(activeSidebar.locator(".material-file[data-direct-match=true]")).toHaveCount(1);
    await expect(page.locator("[data-thought-id]")).toHaveCount(1);
    await search.fill("");

    await activeSidebar.getByRole("button", { name: /Expand/ }).click();
    await expect(activeSidebar.locator(".material-file")).toHaveCount(4);
    const checks = activeSidebar.getByRole("checkbox", { name: /for copying/ });
    await checks.nth(0).check();
    await checks.nth(3).check();
    await expect(activeSidebar).toContainText("2 selected");
    await activeSidebar.getByRole("button", { name: "Copy 2 selected thoughts" }).click();
    await expect(activeSidebar).toContainText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(originalText)).toBe(true);
    expect(copied.split("\n\n")).toHaveLength(2);

    await page.getByRole("button", { name: "Undo last change" }).click();
    await expect(activeSidebar.locator(".material-file")).toHaveCount(3);
    await expect(activeSidebar).toContainText("1 selected");
    await expect(page.locator("[data-thought-id]")).toHaveCount(3);
    expect(browserErrors).toEqual([]);
  });
}
