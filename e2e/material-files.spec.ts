import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixtureMaterialFilesToggleName, fixtureUiCopy } from "./matter-ui-copy";
import { CANVAS_PREFERENCES_STORAGE_KEY } from "../features/matter/components/canvas-preferences";
import { MATTER_LOCALES } from "../features/matter/config/locales";
import { materialFilesCopy } from "../features/matter/components/material-files-copy";

const rootId = "matter_document_root_matter_fixture_rooted_01";
const firstBranchText = "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";
const searchText = "被允许想象的生活";

test("mode controls compensate CJK glyph metrics without enlarging archive actions", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");

  for (const locale of MATTER_LOCALES) {
    await page.evaluate(({ key, language }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        language,
        leafFx: true,
        appearance: "auto",
      }));
    }, { key: CANVAS_PREFERENCES_STORAGE_KEY, language: locale });
    await page.reload();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const copy = materialFilesCopy(locale);
    const sidebar = page.locator("aside.material-files");
    const expectedModeSize = locale === "en-US" || locale === "de-DE" ? "10px" : "12px";
    for (const name of [copy.searchThoughts, copy.select, copy.archive]) {
      await expect(sidebar.getByRole("button", { name, exact: true }))
        .toHaveCSS("font-size", expectedModeSize);
    }
    const controls = sidebar.locator(".material-files__controls");
    expect(await controls.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    await sidebar.getByRole("button", { name: copy.archive, exact: true }).click();
    await expect(sidebar.locator(".material-files__section-label"))
      .toHaveCSS("font-size", expectedModeSize);
    await expect(sidebar.getByRole("button", { name: copy.close, exact: true }))
      .toHaveCSS("font-size", expectedModeSize);
    await expect(sidebar.getByRole("button", { name: copy.archiveExportCopy, exact: true }))
      .toHaveCSS("font-size", "9px");
    await expect(sidebar.getByRole("button", { name: copy.archiveImportCopy, exact: true }))
      .toHaveCSS("font-size", "9px");
    expect(await controls.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

async function expectIndexCameraMotion(
  world: Locator,
  action: () => Promise<void>,
): Promise<void> {
  await world.evaluate((element) => {
    delete element.dataset.e2eIndexCameraTransition;
    element.addEventListener("transitionrun", (event) => {
      if (
        event instanceof TransitionEvent &&
        event.target === element &&
        event.propertyName === "transform" &&
        element.dataset.cameraMotion === "index"
      ) {
        element.dataset.e2eIndexCameraTransition = "transform";
      }
    }, { once: true });
  });
  await action();
  // `data-camera-motion` is intentionally removed on transitionend. Record
  // the matching transition before clicking so a loaded worker cannot make a
  // correct short camera motion disappear between actionability and polling.
  await expect(world).toHaveAttribute("data-e2e-index-camera-transition", "transform");
}

test("an index passage lands at the browser's visual centre, including a repeated click", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const row = page.locator("aside.material-files .material-file").nth(8);
  const world = page.locator(".matter-world");
  const nodeId = await row.getAttribute("data-node-id");
  if (nodeId === null) throw new Error("index centring fixture is missing");
  await expectIndexCameraMotion(world, () => row.locator(".material-file__open").click());
  await expectThoughtAtVisualCentre(page, nodeId);
  await expect(world).not.toHaveAttribute("data-camera-motion", "index");

  const shell = page.locator("main.matter-shell");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();
  const paper = await page.locator(".matter-document").boundingBox();
  if (paper === null) throw new Error("canvas pan receipt is missing");
  await page.mouse.move(paper.x + paper.width * .7, paper.y + paper.height * .3);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * .7 + 90, paper.y + paper.height * .3 + 60, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await shell.getAttribute("data-viewport-x")))
    .not.toBe(0);

  await expectIndexCameraMotion(world, () => row.locator(".material-file__open").click());
  await expectThoughtAtVisualCentre(page, nodeId);
  await expect(world).not.toHaveAttribute("data-camera-motion", "index");

  const target = page.locator(`[data-layout-node-id="${nodeId}"] .spatial-thought__text`);
  await target.evaluate((element) => {
    element.style.width = "300px";
    element.style.fontSize = "64px";
  });
  await row.locator(".material-file__open").click();
  await expectThoughtAtVisualCentre(page, nodeId);
  expect(Number(await shell.getAttribute("data-viewport-zoom"))).toBeLessThan(1);
  const fitReceipt = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      height: rect.height,
      viewportHeight: viewport?.height ?? window.innerHeight,
      viewportWidth: viewport?.width ?? window.innerWidth,
      width: rect.width,
    };
  });
  expect(fitReceipt.width).toBeLessThanOrEqual(fitReceipt.viewportWidth * .88 + 1);
  expect(fitReceipt.height).toBeLessThanOrEqual(fitReceipt.viewportHeight * .88 + 1);
});

test("index navigation restores only undersized material type to its readability floor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();

  const shell = page.locator("main.matter-shell");
  await page.locator(".matter-document").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 700,
    clientY: 400,
    ctrlKey: true,
    deltaMode: 0,
    deltaY: 2_000,
  });
  await expect(shell).toHaveAttribute("data-viewport-zoom", "0.6");

  const row = page.locator("aside.material-files .material-file").nth(8);
  const nodeId = await row.getAttribute("data-node-id");
  if (nodeId === null) throw new Error("readability-floor fixture is missing");
  await row.locator(".material-file__open").click();
  await expectThoughtAtVisualCentre(page, nodeId);
  await expect(shell).toHaveAttribute("data-viewport-zoom", "0.883");

  const target = page.locator(`[data-layout-node-id="${nodeId}"] .spatial-thought__text`);
  const firstReceipt = await target.evaluate((element) => {
    const world = element.closest(".matter-world");
    if (!(world instanceof HTMLElement)) throw new Error("readability world is missing");
    return Number.parseFloat(getComputedStyle(element).fontSize) *
      new DOMMatrixReadOnly(getComputedStyle(world).transform).a;
  });
  expect(firstReceipt).toBeGreaterThanOrEqual(15);
  expect(firstReceipt).toBeLessThan(15.1);

  await row.locator(".material-file__open").click();
  await expectThoughtAtVisualCentre(page, nodeId);
  await expect(shell).toHaveAttribute("data-viewport-zoom", "0.883");
});

test("index navigation respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();
  await page.locator(".matter-document").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 700,
    clientY: 400,
    ctrlKey: true,
    deltaMode: 0,
    deltaY: 2_000,
  });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-viewport-zoom", "0.6");
  const row = page.locator("aside.material-files .material-file").nth(8);
  const nodeId = await row.getAttribute("data-node-id");
  if (nodeId === null) throw new Error("reduced-motion centring fixture is missing");
  await row.locator(".material-file__open").click();
  await expect(page.locator(".matter-world")).not.toHaveAttribute("data-camera-motion", "index");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-viewport-zoom", "0.883");
  await expectThoughtAtVisualCentre(page, nodeId);
});

test("a manual Pan gesture takes over the camera at its rendered mid-flight position", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();

  const row = page.locator("aside.material-files .material-file").nth(8);
  const world = page.locator(".matter-world");
  await row.locator(".material-file__open").click();
  await expect(world).toHaveAttribute("data-camera-motion", "index");
  await page.waitForTimeout(60);

  const paper = await page.locator(".matter-document").boundingBox();
  if (paper === null) throw new Error("camera handoff paper is missing");
  await page.mouse.move(paper.x + paper.width * .85, paper.y + paper.height * .15);
  const before = await page.locator("main.matter-shell").evaluate((shell) => {
    const worldElement = shell.querySelector<HTMLElement>(".matter-world");
    if (worldElement === null) throw new Error("camera handoff world is missing");
    const matrix = new DOMMatrixReadOnly(getComputedStyle(worldElement).transform);
    return {
      finalX: Number((shell as HTMLElement).dataset.viewportX),
      finalY: Number((shell as HTMLElement).dataset.viewportY),
      renderedX: matrix.e,
      renderedY: matrix.f,
    };
  });
  expect(Math.hypot(before.finalX - before.renderedX, before.finalY - before.renderedY))
    .toBeGreaterThan(20);

  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>("main.matter-shell");
    if (shell === null) throw new Error("camera handoff shell is missing");
    document.addEventListener("pointerdown", () => {
      const worldElement = shell.querySelector<HTMLElement>(".matter-world");
      if (worldElement === null) throw new Error("camera handoff world is missing");
      const matrix = new DOMMatrixReadOnly(getComputedStyle(worldElement).transform);
      shell.dataset.e2ePointerDownRenderedX = String(matrix.e);
      shell.dataset.e2ePointerDownRenderedY = String(matrix.f);
    }, { capture: true, once: true });
  });
  await page.mouse.down();
  await expect(world).not.toHaveAttribute("data-camera-motion", "index");
  const handedOff = await page.locator("main.matter-shell").evaluate((shell) => ({
    x: Number((shell as HTMLElement).dataset.viewportX),
    y: Number((shell as HTMLElement).dataset.viewportY),
    renderedAtPointerDownX: Number((shell as HTMLElement).dataset.e2ePointerDownRenderedX),
    renderedAtPointerDownY: Number((shell as HTMLElement).dataset.e2ePointerDownRenderedY),
  }));
  expect(Math.hypot(
    handedOff.x - handedOff.renderedAtPointerDownX,
    handedOff.y - handedOff.renderedAtPointerDownY,
  ))
    .toBeLessThan(16);
  await page.mouse.up();
});

test("a dominant narrow drawer shifts index attention into the exposed canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();
  await page.locator(".matter-document").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 200,
    clientY: 430,
    ctrlKey: true,
    deltaMode: 0,
    deltaY: 2_000,
  });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-viewport-zoom", "0.6");
  const sidebar = page.locator("aside.material-files");
  await page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles }).click();
  await expect(sidebar).toHaveAttribute("data-open", "true");
  const row = sidebar.locator(".material-file").nth(8);
  const nodeId = await row.getAttribute("data-node-id");
  if (nodeId === null) throw new Error("narrow attention fixture is missing");
  await row.locator(".material-file__open").click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-viewport-zoom", "0.883");

  await expect.poll(async () => page.locator(
    `[data-layout-node-id="${nodeId}"] .spatial-thought__text`,
  ).evaluate((element) => {
    const target = element.getBoundingClientRect();
    const drawer = document.querySelector("aside.material-files")!.getBoundingClientRect();
    const canvas = document.querySelector(".matter-document")!.getBoundingClientRect();
    const visual = window.visualViewport;
    const expectedX = (Math.max(canvas.left, drawer.right) + canvas.right) / 2;
    const expectedY = (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight) / 2;
    return Math.max(
      Math.abs(target.left + target.width / 2 - expectedX),
      Math.abs(target.top + target.height / 2 - expectedY),
    );
  })).toBeLessThanOrEqual(1);
});

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
    const toggle = page.getByRole("button", { name: fixtureMaterialFilesToggleName });
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
    await expect(sidebar.getByRole("tree", { name: fixtureUiCopy.materialFiles.materialTree(10) })).toHaveCount(1);
    await expect(sidebar.getByRole("treeitem")).toHaveCount(10);
    const accessibleHierarchy = await rows.evaluateAll((elements) => elements.map((row) => ({
      level: Number(row.getAttribute("aria-level")),
      position: Number(row.getAttribute("aria-posinset")),
      setSize: Number(row.getAttribute("aria-setsize")),
    })));
    expect(new Set(accessibleHierarchy.map(({ level }) => level))).toEqual(new Set([1, 2, 3]));
    expect(accessibleHierarchy.every(({ position, setSize }) =>
      position >= 1 && position <= setSize,
    )).toBe(true);
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
    // Sibling guides remain directed arrow-to-control relations. The final
    // expanded sibling adds one branch-scope tail to its own last descendant;
    // it is not a child connector and it never uses the viewport as authority.
    const fixtureBranchId = await rows.nth(0).getAttribute("data-node-id");
    if (fixtureBranchId === null) throw new Error("fixture branch is missing");
    const browseTitleInset = await rows.nth(0).evaluate((row) => {
      const title = row.querySelector<HTMLElement>(".material-file__title");
      if (title === null) throw new Error("fixture title is missing");
      return title.getBoundingClientRect().x - row.getBoundingClientRect().x;
    });
    await expect(sidebar.locator(`[data-guide-parent="${fixtureBranchId}"]`)).toHaveCount(3);
    await expect(sidebar.locator(
      `[data-guide-parent="${fixtureBranchId}"][data-guide-kind="branch-tail"]`,
    )).toHaveCount(1);
    // Every edge begins below its source disclosure. Sibling relations stop
    // above the next control; the tail turns at its last descendant's centre.
    const guideAlignment = await sidebar.locator(".material-files__tree-guide").evaluateAll((guides) => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".material-files .material-file"));
      return guides.map((guide) => {
        const from = Number(guide.getAttribute("data-guide-from"));
        const to = Number(guide.getAttribute("data-guide-to"));
        const kind = guide.getAttribute("data-guide-kind");
        const fromControl = rows[from]?.querySelector<HTMLElement>(
          ".material-file__structure-control[data-structure-action='expanded'], .material-file__structure-control[data-structure-action='collapsed']",
        );
        const toControl = rows[to]?.querySelector<HTMLElement>(
          ".material-file__structure-control, .material-file__context-space",
        );
        if (
          fromControl === null ||
          fromControl === undefined ||
          toControl === null ||
          toControl === undefined
        ) {
          throw new Error("guide endpoint control is missing");
        }
        const guideRect = guide.getBoundingClientRect();
        const fromRect = fromControl.getBoundingClientRect();
        const toRect = toControl.getBoundingClientRect();
        const guideStyle = getComputedStyle(guide);
        const endpointStyle = getComputedStyle(guide, "::after");
        let compressedWidth: number | null = null;
        if (kind === "branch-tail") {
          guide.style.setProperty("--material-file-max-indent", "0px");
          compressedWidth = guide.getBoundingClientRect().width;
          guide.style.removeProperty("--material-file-max-indent");
        }
        return {
          bottom: guideRect.bottom,
          branchId: guide.getAttribute("data-guide-branch"),
          compressedWidth,
          endpointContent: endpointStyle.content,
          fromCenter: fromRect.left + fromRect.width / 2,
          fromMiddle: fromRect.top + fromRect.height / 2,
          guideAxis: kind === "branch-tail"
            ? guideRect.left + Number.parseFloat(guideStyle.borderLeftWidth) / 2
            : guideRect.left + guideRect.width / 2,
          iconSize: fromControl.querySelector("svg") === null
            ? 0
            : Number.parseFloat(getComputedStyle(fromControl.querySelector("svg")!).width),
          fromClearance: 8,
          horizontalEnd: guideRect.right,
          kind,
          sourceId: rows[from]?.dataset.nodeId,
          tailEnd: guide.getAttribute("data-guide-tail-end"),
          targetSlotCenter: toRect.left + toRect.width / 2,
          toClearance: toControl.matches(".material-file__structure-control") ? 8 : 6,
          toMiddle: toRect.top + toRect.height / 2,
          top: guideRect.top,
          width: guideRect.width,
        };
      });
    });
    for (const guide of guideAlignment) {
      expect(Math.abs(guide.guideAxis - guide.fromCenter)).toBeLessThanOrEqual(0.25);
      expect(guide.top - guide.fromMiddle).toBeCloseTo(guide.fromClearance, 0);
      expect(guide.endpointContent).toBe("none");
      expect(guide.iconSize === 0 || Math.abs(guide.iconSize - 11) <= .5).toBe(true);
      if (guide.kind === "branch-tail") {
        expect(guide.tailEnd).toBe("true");
        expect(guide.branchId).toBe(guide.sourceId);
        expect(guide.bottom).toBeCloseTo(guide.toMiddle, 0);
        expect(guide.width).toBeGreaterThan(0);
        expect(guide.width).toBeLessThanOrEqual(14.1);
        expect(guide.targetSlotCenter - guide.horizontalEnd).toBeGreaterThanOrEqual(1.5);
        expect(guide.compressedWidth).toBeLessThanOrEqual(1.1);
      } else {
        expect(guide.toMiddle - guide.bottom).toBeCloseTo(guide.toClearance, 0);
      }
    }
    const rootTitle = (await contextTitle.innerText()).trim();
    expect(rootTitle).toBe("被允许想象的其他生活");
    await expect(rows.locator(".material-file__title").filter({ hasText: /^被允许想象的其他生活$/u }))
      .toHaveCount(1);
    // Each leaf group in this fixture is locally terminal (all siblings are
    // leaves), so another deeper group cannot manufacture terminal points.
    await expect(sidebar.locator(".material-file__terminal-marker")).toHaveCount(0);
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
    await expect(sidebar.getByRole("textbox", { name: fixtureUiCopy.materialFiles.canvasTitle })).toBeVisible();
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
    const branchTitle = await branch.locator(".material-file__title").innerText();
    await expect(branch.locator(".material-file__context-control")).toHaveAttribute(
      "aria-label",
      fixtureUiCopy.materialFiles.includeInWorkingContext(branchTitle),
    );
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
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.searchThoughts }).click();
    const heldSearch = sidebar.getByRole("searchbox", { name: fixtureUiCopy.materialFiles.filterMaterialFiles });
    await heldSearch.fill(searchText.slice(0, 5));
    const heldResult = rows.first();
    await expect(heldResult).toHaveAttribute("data-context-excluded", "true");
    const heldTitle = await heldResult.locator(".material-file__title").innerText();
    await expect(heldResult.locator(".material-file__open")).toHaveAttribute(
      "aria-label",
      fixtureUiCopy.materialFiles.restoreAndView(heldTitle),
    );
    await heldResult.locator(".material-file__open").click();
    await expect(heldResult).not.toHaveAttribute("data-context-excluded", "true");
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.closeSearch }).click();
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
    const searchTrigger = sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.searchThoughts });
    const selectTrigger = sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.select, exact: true });
    const archiveTrigger = sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true });
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
    await expect(sidebar.locator(".material-files__empty")).toContainText(fixtureUiCopy.materialFiles.emptyTypeToFind);
    const search = sidebar.getByRole("searchbox", { name: fixtureUiCopy.materialFiles.filterMaterialFiles });
    await expect(search).toBeFocused();
    await expect(search).toHaveCSS("outline-width", "2px");
    await expect(search).toHaveAttribute("placeholder", fixtureUiCopy.materialFiles.findThought);
    await expect(controls.locator(".material-files__search")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    const controlAxesDuringSearch = {
      archive: await relativeX(archiveTrigger),
      search: await relativeX(sidebar.locator(".material-files__search svg")),
      select: await relativeX(selectTrigger),
    };
    expect(controlAxesDuringSearch.search).toBeCloseTo(controlAxesBeforeSearch.search, 3);
    if (viewport.name === "laptop") {
      expect(controlAxesDuringSearch.select).toBeCloseTo(controlAxesBeforeSearch.select, 3);
      expect(controlAxesDuringSearch.archive).toBeCloseTo(controlAxesBeforeSearch.archive, 3);
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
    await expect(controls.locator("[aria-live='polite']")).toHaveText(fixtureUiCopy.materialFiles.resultCount(1));
    await expect(rows.first().locator(".material-file__path")).toHaveCount(1);
    await search.dispatchEvent("keydown", { key: "Escape", isComposing: true });
    await expect(sidebar).toHaveAttribute("data-mode", "search");
    await search.press("Escape");
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(searchTrigger).toBeFocused();
    await expect(rows).toHaveCount(10);
    // The first Escape belongs to search. A second Escape closes only an
    // overlay drawer and returns keyboard authority to its external handle.
    await page.keyboard.press("Escape");
    if (viewport.name === "narrow") {
      await expect(sidebar).not.toHaveAttribute("data-open", "true");
      await expect(toggle).toBeFocused();
      await toggle.click();
      await expect(sidebar).toHaveAttribute("data-open", "true");
    } else {
      await expect(sidebar).toHaveAttribute("data-open", "true");
      await expect(toggle).toHaveCount(0);
    }

    // The index remains fully available for a new admitted thought.
    await rows.first().locator(".material-file__open").click();
    const before = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-node-id")),
    );
    await clickTool(page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }));
    await expect(rows).toHaveCount(11);
    const after = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-node-id")),
    );
    const admittedId = after.find((nodeId) => !before.includes(nodeId));
    if (admittedId === undefined) throw new Error("the admitted thought never reached the index");
    await expect(page.locator("[data-thought-id]")).toHaveCount(11);
    await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");

    // Selection spans the branch under the level, not only the level itself.
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.select, exact: true }).click();
    await expect(sidebar).toHaveAttribute("data-mode", "select");
    const checks = sidebar.getByRole("checkbox");
    await expect(checks).toHaveCount(11);
    const selectedModeRow = sidebar.locator(`.material-file[data-node-id="${fixtureBranchId}"]`);
    await expect.poll(() => selectedModeRow.evaluate((row) => {
      const title = row.querySelector<HTMLElement>(".material-file__title");
      if (title === null) throw new Error("selected-mode title is missing");
      return title.getBoundingClientRect().x - row.getBoundingClientRect().x;
    })).toBeCloseTo(browseTitleInset, 0);
    await expect(selectedModeRow.locator(".material-file__check-mark")).toHaveCSS("width", "11px");
    await expect(selectedModeRow.locator(".material-file__check-mark")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // Selection has checkboxes rather than structural arrows and must not
    // manufacture arrow rails from that alternate projection.
    await expect(sidebar.locator(".material-files__tree-guide")).toHaveCount(0);
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
    await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(2));
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.copySelectedThoughts(2) }).click();
    await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.copied);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith(firstBranchText)).toBe(true);
    expect(copied.split("\n\n")).toHaveLength(2);
    await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(2));

    await clickTool(page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange }));
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(1));
    expect(rootTitle.length).toBeGreaterThan(0);
    expect(browserErrors).toEqual([]);
  });
}

test("the flat virtual DOM follows tree keyboard semantics", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const sidebar = page.locator("aside.material-files");
  const items = sidebar.getByRole("treeitem");
  await expect(items).toHaveCount(10);
  await items.first().focus();
  await expect(items.first()).toBeFocused();
  await expect(items.first()).toHaveCSS("outline-width", "2px");
  await expect(items.first().locator(".material-file__structure-control")).toHaveAttribute("tabindex", "-1");
  await expect(items.first().locator(".material-file__open")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Tab");
  await expect(items.first().locator(".material-file__context-control--set-aside")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(items.first()).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await expect(items.nth(1)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(items.nth(1)).toHaveAttribute("aria-expanded", "false");
  await expect(items).toHaveCount(8);
  await page.keyboard.press("ArrowRight");
  await expect(items.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(items).toHaveCount(10);
  await page.keyboard.press("ArrowRight");
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();

  const searchTrigger = sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.searchThoughts });
  await searchTrigger.click();
  const search = sidebar.getByRole("searchbox", { name: fixtureUiCopy.materialFiles.filterMaterialFiles });
  await search.fill("时间");
  const result = sidebar.getByRole("listitem").first();
  await expect(result).toBeVisible();
  await search.press("ArrowDown");
  await expect(result).toBeFocused();
  await expect(result.locator(".material-file__open")).toHaveAttribute("tabindex", "-1");
});

test("a mixed sibling group renders one directed arrow-to-terminal guide", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const sidebar = page.locator("aside.material-files");
  const rows = sidebar.locator(".material-file");
  const initialIds = await rows.evaluateAll((elements) =>
    elements.map((element) => element.dataset.nodeId ?? ""),
  );
  const parentId = initialIds[1];
  const firstLeafId = initialIds[2];
  const secondLeafId = initialIds[3];
  if (parentId === undefined || firstLeafId === undefined || secondLeafId === undefined) {
    throw new Error("mixed sibling fixture is incomplete");
  }

  await sidebar.locator(`[data-node-id="${firstLeafId}"] .material-file__open`).click();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
  await expect(rows).toHaveCount(11);
  const afterNestedInsert = await rows.evaluateAll((elements) =>
    elements.map((element) => element.dataset.nodeId ?? ""),
  );
  const nestedLeafId = afterNestedInsert.find((id) => !initialIds.includes(id));
  if (nestedLeafId === undefined) throw new Error("nested leaf was not admitted");

  await sidebar.locator(`[data-node-id="${parentId}"] .material-file__open`).click();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
  await expect(rows).toHaveCount(12);
  const finalIds = await rows.evaluateAll((elements) =>
    elements.map((element) => element.dataset.nodeId ?? ""),
  );
  const directLeafId = finalIds.find((id) =>
    !afterNestedInsert.includes(id),
  );
  if (directLeafId === undefined) throw new Error("direct terminal leaf was not admitted");

  const branchRow = sidebar.locator(`[data-node-id="${firstLeafId}"]`);
  const firstTerminal = sidebar.locator(`[data-node-id="${secondLeafId}"]`);
  const secondTerminal = sidebar.locator(`[data-node-id="${directLeafId}"]`);
  const nestedTerminalLevel = sidebar.locator(`[data-node-id="${nestedLeafId}"]`);
  await expect(branchRow.locator(
    ".material-file__structure-control[data-structure-action='expanded']",
  )).toHaveCount(1);
  await expect(firstTerminal.locator(".material-file__terminal-marker")).toHaveCount(1);
  await expect(secondTerminal.locator(".material-file__terminal-marker")).toHaveCount(1);
  await expect(nestedTerminalLevel.locator(".material-file__terminal-marker")).toHaveCount(0);

  const branchIndex = Number(await branchRow.getAttribute("data-projection-index"));
  const firstTerminalIndex = Number(await firstTerminal.getAttribute("data-projection-index"));
  const secondTerminalIndex = Number(await secondTerminal.getAttribute("data-projection-index"));
  const guide = sidebar.locator(`[data-guide-parent="${parentId}"]`);
  await expect(guide).toHaveCount(1);
  await expect(guide).toHaveAttribute("data-guide-from", String(branchIndex));
  await expect(guide).toHaveAttribute("data-guide-to", String(firstTerminalIndex));
  await expect(sidebar.locator(`[data-guide-from="${firstTerminalIndex}"]`)).toHaveCount(0);
  await expect(sidebar.locator(`[data-guide-from="${secondTerminalIndex}"]`)).toHaveCount(0);

  // Collapsing removes the only interior child row. The local leaf points stay
  // truthful, but the now-adjacent controls must not retain a short connector.
  await branchRow.locator(".material-file__structure-control").click();
  await expect(branchRow).not.toHaveAttribute("data-expanded", "true");
  await expect(sidebar.locator(`[data-guide-parent="${parentId}"]`)).toHaveCount(0);
  await expect(firstTerminal.locator(".material-file__terminal-marker")).toHaveCount(1);
  await expect(secondTerminal.locator(".material-file__terminal-marker")).toHaveCount(1);
  await branchRow.locator(".material-file__structure-control").click();
  await expect(branchRow).toHaveAttribute("data-expanded", "true");
  await expect(sidebar.locator(`[data-guide-parent="${parentId}"]`)).toHaveCount(1);
});

test("deleted local selection and disclosure do not return with Undo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const sidebar = page.locator("aside.material-files");
  const rows = sidebar.locator(".material-file");
  const branch = rows.nth(1);
  const branchId = await branch.getAttribute("data-node-id");
  if (branchId === null) throw new Error("transient disclosure branch is missing");
  await branch.locator(".material-file__structure-control").click();
  await expect(rows).toHaveCount(8);
  await page.locator(`[data-thought-id="${branchId}"] [data-thought-text-id]`).click();
  await page.keyboard.press("Delete");
  await expect(page.locator(`[data-thought-id="${branchId}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect(page.locator(`[data-thought-id="${branchId}"]`)).toHaveCount(1);
  await expect(sidebar.locator(`[data-node-id="${branchId}"]`)).toHaveAttribute("data-expanded", "true");
  await expect(rows).toHaveCount(10);

  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.select, exact: true }).click();
  const leaf = rows.last();
  const leafId = await leaf.getAttribute("data-node-id");
  if (leafId === null) throw new Error("transient selection leaf is missing");
  await leaf.getByRole("checkbox").check();
  await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(1));
  await page.locator(`[data-thought-id="${leafId}"] [data-thought-text-id]`).click();
  await page.keyboard.press("Delete");
  await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(0));
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect(page.locator(`[data-thought-id="${leafId}"]`)).toHaveCount(1);
  await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(0));
  await expect(sidebar.locator(`[data-node-id="${leafId}"]`).getByRole("checkbox")).not.toBeChecked();
});

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

  const toggle = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFilesSavingNeedsAttention });
  await expect(toggle).toHaveAttribute("data-persistence-error", "true");
  await toggle.click();

  const sidebar = page.locator("aside.material-files");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "error");
  // Persistence recovery belongs to the explicit Archive surface. The quiet
  // local identity must not turn into an error banner or acquire an action.
  const identity = sidebar.locator(".material-files__profile");
  await expect(identity).toContainText("采石者");
  await expect(sidebar.locator(".material-files__profile-meta")).toHaveText("仅存于这台设备");
  await expect(identity.getByRole("button")).toHaveCount(0);
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive }).click();

  const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveNoteStorageFull);
  await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy })).toBeEnabled();
  await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveRetrySaving })).toBeEnabled();
});

test("corrupt local material is exported before an explicit atomic repair", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  const sidebar = page.locator("aside.material-files");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("snapshots", "readwrite");
      const store = transaction.objectStore("snapshots");
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = rows[0] as { bundle: unknown } | undefined;
      if (row === undefined) throw new Error("stored material is missing");
      row.bundle = { files: {} };
      store.put(row);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });

  await page.reload();
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "error");
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveNoteCorrupt);
  await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveRepairLocalStorage })).toHaveCount(0);

  const downloadReceipt = page.waitForEvent("download");
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy }).click();
  const download = await downloadReceipt;
  expect(download.suggestedFilename()).toMatch(/\.matter-recovery\.json$/u);
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "error");
  await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveRepairLocalStorage })).toBeEnabled();

  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveRepairLocalStorage }).click();
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
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

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect(page.locator(`[data-thought-id="${parentId}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).not.toHaveAttribute("data-context-excluded", "true");
});

async function expectThoughtAtVisualCentre(page: Page, nodeId: string): Promise<void> {
  await expect.poll(async () => page.locator(
    `[data-layout-node-id="${nodeId}"] .spatial-thought__text`,
  ).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const centreX = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) / 2;
    const centreY = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) / 2;
    return Math.max(
      Math.abs(rect.left + rect.width / 2 - centreX),
      Math.abs(rect.top + rect.height / 2 - centreY),
    );
  })).toBeLessThanOrEqual(1);
}
