import { expect, test, type Locator } from "@playwright/test";

const rootId = "matter_document_root_matter_fixture_rooted_01";
const firstBranchText = "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";
const searchText = "被允许想象的生活";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`the material index arrives expanded, steps by depth, and copies authored material at ${viewport.name} width`, async ({
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
    const rows = sidebar.locator(".material-file");
    const contextRow = sidebar.locator(".material-files__context");
    const contextTitle = sidebar.locator(".material-files__context-title");
    const toggle = page.getByRole("button", { name: /material files/i });
    const setSidebarOpen = async (open: boolean) => {
      if ((await toggle.first().getAttribute("aria-expanded")) !== String(open)) {
        await toggle.first().click();
      }
      if (open) await expect(sidebar).toHaveAttribute("data-open", "true");
      else await expect(sidebar).not.toHaveAttribute("data-open", "true");
    };
    const clickTool = async (button: Locator) => {
      if (viewport.name === "narrow") await setSidebarOpen(false);
      await button.click();
      if (viewport.name === "narrow") await setSidebarOpen(true);
    };

    if (viewport.name === "laptop") {
      // At desk widths the index is part of the shell: the gutter is already
      // reserved for it, so there is nothing to open and no handle to carry.
      await expect(toggle).toHaveCount(0);
      await expect(sidebar).toHaveAttribute("data-open", "true");
    } else {
      await expect(toggle).toHaveCount(1);
      await setSidebarOpen(true);
    }

    await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(sidebar.getByRole("checkbox")).toHaveCount(0);
    await expect(sidebar.locator(".material-files__footer")).toHaveCount(0);
    const identity = sidebar.locator(".material-files__profile");
    await expect(identity).toContainText("采石者");
    await expect(identity).toContainText("仅存于这台设备");
    await expect(identity.locator(".pixel-identicon")).toBeVisible();
    await expect(identity.getByRole("button")).toHaveCount(0);

    if (viewport.name === "narrow") {
      await expect(page.locator(".tool-rail")).toBeHidden();
      const drawer = await sidebar.boundingBox();
      expect(drawer).not.toBeNull();
      // CSS layout resolves to fractional device pixels in Chromium.
      expect(drawer!.width).toBeLessThanOrEqual(304.1);
      expect(viewport.width - (drawer!.x + drawer!.width)).toBeGreaterThanOrEqual(54.9);
    }

    // The title is document metadata; the opening passage is still selectable
    // first-level material and may share its wording with that metadata.
    await expect(contextRow).toHaveAttribute("data-node-id", rootId);
    await expect(rows).toHaveCount(10);
    await expect(sidebar.locator(".material-file__context-control")).toHaveCount(10);
    const rootTitle = (await contextTitle.innerText()).trim();
    expect(rootTitle).toBe("被允许想象的其他生活");
    await expect(rows.locator(".material-file__title").filter({ hasText: /^被允许想象的其他生活$/u }))
      .toHaveCount(1);
    const rowPaths = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-markdown-path")),
    );
    expect(rowPaths.every((path) => /^matter\/(?:00\d-[^/]+\/){1,}index\.md$/u.test(path ?? "")))
      .toBe(true);

    // Every material depth remains visible in the index. In particular, the
    // default title's subtitles must step right rather than visually sharing
    // their parent's level.
    const steps = await rows.evaluateAll((elements) =>
      elements.map((element) => ({
        depth: Number(getComputedStyle(element).getPropertyValue("--material-file-depth")),
        x: Math.round(
          element.querySelector(".material-file__title")!.getBoundingClientRect().x,
        ),
      })),
    );
    const axisByDepth = new Map(steps.map(({ depth, x }) => [depth, x]));
    expect([...axisByDepth.keys()].sort()).toEqual([0, 1, 2]);
    expect(steps.every(({ depth, x }) => axisByDepth.get(depth) === x)).toBe(true);
    expect(axisByDepth.get(1)!).toBeGreaterThan(axisByDepth.get(0)!);
    expect(axisByDepth.get(2)!).toBeGreaterThan(axisByDepth.get(1)!);

    // The document title is metadata, not a selectable thought. Its control
    // opens the title editor without creating a material selection.
    await contextTitle.click();
    await expect(sidebar.getByRole("textbox", { name: "Canvas title" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Selected thought actions" })).toHaveCount(0);

    // One control owns both a compact index and the temporary model boundary:
    // holding a branch aside closes its descendants in this drawer but keeps the
    // same material faintly positioned on the canvas.
    const branch = rows.nth(1);
    const descendantId = await rows.nth(2).getAttribute("data-node-id");
    if (descendantId === null) throw new Error("fixture descendant is missing");
    await branch.locator(".material-file__context-control").click();
    await expect(branch.locator(".material-file__context-control")).toHaveAttribute("aria-pressed", "false");
    await expect(branch.locator(".material-file__context-control")).toHaveAttribute("aria-label", /^Include /u);
    await expect(rows).toHaveCount(8);
    await expect(contextTitle).toHaveText(rootTitle);
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await expect(page.locator(`[data-thought-id="${descendantId}"]`)).toHaveAttribute("data-context-excluded", "true");

    // The branch has one recovery handle. Restoring also reopens the index;
    // held-aside text is never selected merely because it remains visible.
    await branch.locator(".material-file__context-control").click();
    await expect(rows).toHaveCount(10);
    if (viewport.name === "narrow") await setSidebarOpen(false);
    await page.locator(`[data-thought-id="${descendantId}"] [data-thought-text-id]`).click();
    if (viewport.name === "narrow") await setSidebarOpen(true);
    await expect(rows).toHaveCount(10);

    await page.reload();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    if (viewport.name === "narrow") await setSidebarOpen(true);
    await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(contextRow).toHaveAttribute("data-node-id", rootId);
    await expect(rows).toHaveCount(10);
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);

    // Search is flat across the whole tree, and a result carries its position
    // as a path rather than as an indent.
    await sidebar.getByRole("button", { name: "Search thoughts" }).click();
    await expect(sidebar).toHaveAttribute("data-mode", "search");
    await expect(rows).toHaveCount(0);
    await expect(sidebar.locator(".material-files__empty")).toContainText("Type to find a thought.");
    const search = sidebar.getByRole("searchbox", { name: "Filter material files" });
    await search.fill(searchText.slice(0, 5));
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".material-file__path")).toHaveCount(1);
    await sidebar.getByRole("button", { name: "Close search" }).click();
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(rows).toHaveCount(10);

    // The index remains fully available for a new admitted thought.
    await rows.first().locator(".material-file__open").click();
    const before = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-node-id")),
    );
    await clickTool(page.getByRole("button", { name: "Extend related thought", exact: true }));
    await expect(rows).toHaveCount(11);
    const after = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-node-id")),
    );
    const admittedId = after.find((nodeId) => !before.includes(nodeId));
    if (admittedId === undefined) throw new Error("the admitted thought never reached the index");
    await expect(page.locator("[data-thought-id]")).toHaveCount(11);
    await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");

    // Selection spans the branch under the level, not only the level itself.
    await sidebar.getByRole("button", { name: "Select", exact: true }).click();
    await expect(sidebar).toHaveAttribute("data-mode", "select");
    const checks = sidebar.getByRole("checkbox", { name: /for copying/ });
    await expect(checks).toHaveCount(11);
    if (viewport.name === "narrow") {
      const coarseTargets = await sidebar.locator(
        "button:not(:disabled), label.material-file__check",
      ).evaluateAll((targets) => targets.map((target) => {
        const rect = target.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(coarseTargets.every((target) => target.width >= 48 && target.height >= 48)).toBe(true);
    }
    await checks.nth(0).check();
    // Undoing the newest thought must take its selection with it, rather than
    // leave a count that counts a thought that is gone.
    await sidebar.locator(`.material-file[data-node-id="${admittedId}"]`).getByRole("checkbox").check();
    await expect(sidebar).toContainText("2 selected");
    await sidebar.getByRole("button", { name: "Copy 2 selected thoughts" }).click();
    await expect(sidebar).toContainText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(firstBranchText)).toBe(true);
    expect(copied.split("\n\n")).toHaveLength(2);
    await expect(sidebar).toContainText("2 selected");

    await clickTool(page.getByRole("button", { name: "Undo last change" }));
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await expect(sidebar).toContainText("1 selected");
    expect(rootTitle.length).toBeGreaterThan(0);
    expect(browserErrors).toEqual([]);
  });
}

test("storage exhaustion stays discoverable with the narrow material drawer closed", async ({ page }) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "snapshots") throw new DOMException("storage full", "QuotaExceededError");
      return originalPut.apply(this, args);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const toggle = page.getByRole("button", { name: "Show material files; saving needs attention" });
  await expect(toggle).toHaveAttribute("data-persistence-error", "true");
  await toggle.click();

  const sidebar = page.locator("aside.material-files");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "error");
  // Visible text and accessible name must be in the canvas language, not one
  // Chinese label beside an English one.
  await expect(sidebar.locator(".material-files__profile-meta")).toHaveText("存储已满 · 先导出备份");
  await sidebar.getByRole("button", { name: "打开归档，先导出材料再清理存储" }).click();

  const archive = sidebar.getByRole("region", { name: "Material archive" });
  await expect(archive).toContainText("Local storage is full");
  await expect(archive.getByRole("button", { name: "Export a copy" })).toBeEnabled();
  await expect(archive.getByRole("button", { name: "Retry saving" })).toBeEnabled();
});

test("a held-aside index branch is omitted from Ask Matter", async ({ page }) => {
  const requests: Array<{ lineage: Array<{ nodeId: string }>; thoughtCount: number }> = [];
  await page.route("**/api/inquiry", async (route) => {
    const request = route.request().postDataJSON() as {
      protocolVersion: string;
      requestId: string;
      context: { treeId: string; revision: number; scope: "selection" | "tree"; lineage: Array<{ nodeId: string; text: string }>; thoughtCount: number; clipped: boolean };
    };
    requests.push({ lineage: request.context.lineage, thoughtCount: request.context.thoughtCount });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        protocolVersion: request.protocolVersion,
        basis: {
          requestId: request.requestId,
          treeId: request.context.treeId,
          revision: request.context.revision,
          scope: request.context.scope,
        },
        status: "answered",
        text: "剩余材料仍可回答。",
        receipt: {
          scope: request.context.scope,
          lineageNodes: request.context.lineage.length,
          contextCodePoints: request.context.lineage.reduce((total, node) => total + Array.from(node.text).length, 0),
          clipped: request.context.clipped,
          thoughtCount: request.context.thoughtCount,
        },
      }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const rows = page.locator("aside.material-files .material-file");
  const heldDescendantId = await rows.nth(2).getAttribute("data-node-id");
  if (heldDescendantId === null) throw new Error("fixture descendant is missing");
  await rows.nth(1).locator(".material-file__context-control").click();
  await expect(page.locator(`[data-thought-id="${heldDescendantId}"]`)).toHaveAttribute("data-context-excluded", "true");

  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("还剩下什么？");
  await field.press("Enter");
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]?.lineage.map(({ nodeId }) => nodeId)).not.toContain(heldDescendantId);
  expect(requests[0]?.thoughtCount).toBe(7);
});
