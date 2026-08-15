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
    if (viewport.name === "narrow") {
      const browseActionTargets = await sidebar.locator(
        ".material-file__structure-control:not(:disabled), .material-file__context-control:not(:disabled)",
      ).evaluateAll((targets) => targets.map((target) => {
        const rect = target.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(browseActionTargets.length).toBeGreaterThan(0);
      for (const target of browseActionTargets) {
        // Chromium can resolve a declared 48px track a fraction below its CSS
        // value after the translated drawer lands on a device-pixel boundary.
        expect(target.width).toBeCloseTo(48, 1);
        expect(target.height).toBeCloseTo(48, 1);
      }
    }
    const activeReceiptRow = rows.first();
    await activeReceiptRow.evaluate((element) => element.setAttribute("data-active", "true"));
    await expect(activeReceiptRow.locator(".material-file__context-control--set-aside")).toHaveCSS("opacity", "0");
    await expect(activeReceiptRow.locator(".material-file__context-control--set-aside")).toHaveCSS("pointer-events", "none");
    await activeReceiptRow.evaluate((element) => element.removeAttribute("data-active"));
    await expect(sidebar.locator(".material-files__tree-guide")).not.toHaveCount(0);
    // The fixture root has three visible direct children. Their two adjacent
    // relations stay separate even though each child owns an open subtree.
    const fixtureBranchId = await rows.nth(0).getAttribute("data-node-id");
    if (fixtureBranchId === null) throw new Error("fixture branch is missing");
    const browseTitleInset = await rows.nth(0).evaluate((row) => {
      const title = row.querySelector<HTMLElement>(".material-file__title");
      if (title === null) throw new Error("fixture title is missing");
      return title.getBoundingClientRect().x - row.getBoundingClientRect().x;
    });
    await expect(sidebar.locator(`[data-guide-parent="${fixtureBranchId}"]`)).toHaveCount(2);
    // Guide geometry is anchored to its own context action, not an independently
    // tuned overlay offset. Endpoints leave the action's centre readable.
    const guideAlignment = await sidebar.locator(`[data-guide-parent="${fixtureBranchId}"]`).evaluateAll((guides) => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".material-files .material-file"));
      return guides.map((guide) => {
        const from = Number(guide.getAttribute("data-guide-from"));
        const to = Number(guide.getAttribute("data-guide-to"));
        const fromControl = rows[from]?.querySelector<HTMLElement>(".material-file__structure-control");
        const toControl = rows[to]?.querySelector<HTMLElement>(".material-file__structure-control");
        if (fromControl === null || fromControl === undefined || toControl === null || toControl === undefined) {
          throw new Error("guide endpoint control is missing");
        }
        const guideRect = guide.getBoundingClientRect();
        const fromRect = fromControl.getBoundingClientRect();
        const toRect = toControl.getBoundingClientRect();
        return {
          bottom: guideRect.bottom,
          fromCenter: fromRect.left + fromRect.width / 2,
          fromMiddle: fromRect.top + fromRect.height / 2,
          guideCenter: guideRect.left + guideRect.width / 2,
          iconSize: Number.parseFloat(getComputedStyle(fromControl.querySelector("svg")!).width),
          fromClearance: fromControl.dataset.structureAction === "leaf" ? 4 : 6,
          toClearance: toControl.dataset.structureAction === "leaf" ? 4 : 6,
          toMiddle: toRect.top + toRect.height / 2,
          top: guideRect.top,
        };
      });
    });
    for (const guide of guideAlignment) {
      expect(Math.abs(guide.guideCenter - guide.fromCenter)).toBeLessThanOrEqual(0.25);
      expect(guide.top - guide.fromMiddle).toBeCloseTo(guide.fromClearance, 0);
      expect(guide.toMiddle - guide.bottom).toBeCloseTo(guide.toClearance, 0);
      expect(guide.iconSize).toBeCloseTo(11, 0);
    }
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

    // Disclosure is directory-only: it compacts the index without changing
    // the canvas or the working-context boundary.
    const disclosureBranch = rows.nth(1);
    const disclosure = disclosureBranch.locator(".material-file__structure-control");
    await expect(disclosure).toHaveAttribute("data-structure-action", "expanded");
    await expect(disclosure).toHaveAttribute("aria-label", /^在材料目录中收起/u);
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("data-structure-action", "collapsed");
    await expect(rows).toHaveCount(8);
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("data-structure-action", "expanded");
    await expect(rows).toHaveCount(10);

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
    await branch.hover();
    await expect(branch.locator(".material-file__context-control--set-aside")).toHaveCSS("opacity", "0.68");
    await branch.locator(".material-file__context-control--set-aside").click();
    await expect(branch.locator(".material-file__context-control")).toHaveAttribute("data-context-action", "restore");
    await expect(branch.locator(".material-file__structure-control")).toHaveAttribute("data-structure-action", "restore");
    await expect(branch.locator(".material-file__restore-plus")).toHaveCSS("width", "11px");
    await expect(branch.locator(".material-file__restore-plus")).toHaveCSS("opacity", "1");
    await expect(branch.locator(".material-file__disclosure-chevron")).toHaveCSS("opacity", "0");
    await expect(branch.locator(".material-file__restore-plus path")).toHaveCSS("stroke-width", "1px");
    await expect(branch.locator(".material-file__context-control")).toHaveAttribute("aria-label", /^重新纳入画面里的材料/u);
    await expect(rows).toHaveCount(8);
    await expect(contextTitle).toHaveText(rootTitle);
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await expect(page.locator(`[data-thought-id="${descendantId}"]`)).toHaveAttribute("data-context-excluded", "true");
    await expect(branch.locator(".material-file__title")).not.toHaveCSS("color", "rgb(22, 29, 39)");

    // The branch has one recovery handle. Restoring also reopens the index;
    // held-aside text is never selected merely because it remains visible.
    await branch.locator(".material-file__context-control").click();
    await expect(branch.locator(".material-file__structure-control")).toHaveAttribute("data-structure-action", "expanded");
    await expect(branch.locator(".material-file__restore-plus")).toHaveCSS("opacity", "0");
    await expect(branch.locator(".material-file__disclosure-chevron")).toHaveCSS("opacity", "1");
    await expect(branch.locator(".material-file__context-control--set-aside")).toHaveAttribute("data-context-action", "set-aside");
    await expect(rows).toHaveCount(10);

    // Search still finds held text. Selecting that result is an explicit
    // recovery act: it returns the necessary lineage without narrowing full view.
    await branch.hover();
    await branch.locator(".material-file__context-control--set-aside").click();
    await expect(rows).toHaveCount(8);
    await sidebar.getByRole("button", { name: "Search thoughts" }).click();
    const heldSearch = sidebar.getByRole("searchbox", { name: "Filter material files" });
    await heldSearch.fill(searchText.slice(0, 5));
    const heldResult = rows.first();
    await expect(heldResult).toHaveAttribute("data-context-excluded", "true");
    await expect(heldResult.locator(".material-file__open")).toHaveAttribute("aria-label", /^重新纳入画面里的材料并查看/u);
    await heldResult.locator(".material-file__open").click();
    await expect(heldResult).not.toHaveAttribute("data-context-excluded", "true");
    await sidebar.getByRole("button", { name: "Close search" }).click();
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
    const controls = sidebar.locator(".material-files__controls");
    const searchTrigger = sidebar.getByRole("button", { name: "Search thoughts" });
    const selectTrigger = sidebar.getByRole("button", { name: "Select", exact: true });
    const archiveTrigger = sidebar.getByRole("button", { name: "Archive", exact: true });
    await page.evaluate(() => document.fonts.ready);
    const relativeX = async (locator: Locator): Promise<number> => locator.evaluate((element) => {
      const controls = element.closest<HTMLElement>(".material-files__controls");
      if (controls === null) throw new Error("material controls are missing");
      return element.getBoundingClientRect().x - controls.getBoundingClientRect().x;
    });
    const controlAxesBeforeSearch = {
      archive: await relativeX(archiveTrigger),
      search: await relativeX(searchTrigger.locator("svg")),
      select: await relativeX(selectTrigger),
    };
    await searchTrigger.click();
    await expect(sidebar).toHaveAttribute("data-mode", "search");
    await expect(rows).toHaveCount(0);
    await expect(sidebar.locator(".material-files__empty")).toContainText("Type to find a thought.");
    const search = sidebar.getByRole("searchbox", { name: "Filter material files" });
    await expect(search).toHaveAttribute("placeholder", "Find thought");
    await expect(controls.locator(".material-files__search")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    const controlAxesDuringSearch = {
      archive: await relativeX(archiveTrigger),
      search: await relativeX(sidebar.locator(".material-files__search svg")),
      select: await relativeX(selectTrigger),
    };
    expect(controlAxesDuringSearch.search).toBeCloseTo(controlAxesBeforeSearch.search, 1);
    if (viewport.name === "laptop") {
      expect(controlAxesDuringSearch.select).toBeCloseTo(controlAxesBeforeSearch.select, 1);
      expect(controlAxesDuringSearch.archive).toBeCloseTo(controlAxesBeforeSearch.archive, 1);
    }
    const searchFit = await search.evaluate((element: HTMLInputElement) => {
      const style = getComputedStyle(element, "::placeholder");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context === null) return { available: element.clientWidth, required: Number.POSITIVE_INFINITY };
      context.font = style.font;
      const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
      return {
        available: element.clientWidth,
        required: context.measureText(element.placeholder).width
          + Math.max(0, Array.from(element.placeholder).length - 1) * letterSpacing,
      };
    });
    expect(searchFit.available).toBeGreaterThan(searchFit.required);
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
    const selectedModeRow = sidebar.locator(`.material-file[data-node-id="${fixtureBranchId}"]`);
    await expect.poll(() => selectedModeRow.evaluate((row) => {
      const title = row.querySelector<HTMLElement>(".material-file__title");
      if (title === null) throw new Error("selected-mode title is missing");
      return title.getBoundingClientRect().x - row.getBoundingClientRect().x;
    })).toBeCloseTo(browseTitleInset, 0);
    await expect(selectedModeRow.locator(".material-file__check-mark")).toHaveCSS("width", "11px");
    await expect(selectedModeRow.locator(".material-file__check-mark")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(sidebar.locator(".material-files__tree-guide")).not.toHaveCount(0);
    const selectGuideAxis = await sidebar.locator(".material-files__tree-guide").first().evaluate((guide) => {
      const fromIndex = Number(guide.getAttribute("data-guide-from"));
      const row = document.querySelectorAll<HTMLElement>(".material-files .material-file")[fromIndex];
      const checkbox = row?.querySelector<HTMLElement>(".material-file__check-mark");
      if (checkbox === null || checkbox === undefined) throw new Error("select guide endpoint is missing");
      const guideRect = guide.getBoundingClientRect();
      const checkboxRect = checkbox.getBoundingClientRect();
      return {
        checkboxCenter: checkboxRect.left + checkboxRect.width / 2,
        guideCenter: guideRect.left + guideRect.width / 2,
      };
    });
    expect(Math.abs(selectGuideAxis.guideCenter - selectGuideAxis.checkboxCenter)).toBeLessThanOrEqual(.25);
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
  await rows.nth(1).hover();
  await rows.nth(1).locator(".material-file__context-control--set-aside").click();
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

test("Undo does not revive a held-aside decision after its branch was deleted", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const rows = page.locator("aside.material-files .material-file");
  const parentId = await rows.nth(1).getAttribute("data-node-id");
  const heldChildId = await rows.nth(2).getAttribute("data-node-id");
  if (parentId === null || heldChildId === null) throw new Error("fixture branch is missing");

  const heldChildRow = rows.nth(2);
  await heldChildRow.hover();
  await heldChildRow.locator(".material-file__context-control--set-aside").click();
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).toHaveAttribute("data-context-excluded", "true");

  await page.locator(`[data-thought-id="${parentId}"] [data-thought-text-id]`).click();
  await page.keyboard.press("Delete");
  await expect(page.locator(`[data-thought-id="${parentId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).toHaveCount(0);

  await page.getByRole("button", { name: "Undo last change", exact: true }).click();
  await expect(page.locator(`[data-thought-id="${parentId}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).not.toHaveAttribute("data-context-excluded", "true");
});
