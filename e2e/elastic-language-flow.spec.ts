import { expect, test, type Page } from "@playwright/test";
import { settleLassoGeometry } from "./lasso-driver";
import { fixtureUiCopy, fixtureVoiceAdmissionName } from "./matter-ui-copy";

const ROOT_ID = "thought_fixture_root";
const SOURCE = "我们怀念的也许不是一个真实存在过的过去";
const EXPANDED = "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去";
const ROOT_SUFFIX = "，而是那个过去在今天仍然允许我们想象的其他生活。";

test("Elastic Language commits one laptop drag, then Undo, Redo, and reload stay exact", async ({ page }) => {
  await runElasticReceipt(page, "drag");
});

test("Elastic Language keeps its keyboard alternative and reduced-motion arrival atomic", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await runElasticReceipt(page, "keyboard");
  await expect(page.locator(".transform-text")).toHaveCount(0);
});

test("both literal grips stay visible in the paper's light and dark appearances", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const grips = page.locator(".stretch-handle");
  const selectedCopy = page.locator(".language-split-selected-copy");
  const addressPath = page.locator('.material-address-layer[data-address-variant="actionable"] .material-address-layer__path');
  const appearance = page.locator('[data-chrome-control="appearance"]');
  await expect(grips).toHaveCount(2);
  await appearance.click({ force: true });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-theme", "light");
  expect(await gripColors(grips)).toEqual(["rgb(22, 29, 39)", "rgb(22, 29, 39)"]);
  await expect(selectedCopy).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(addressPath).toHaveCSS("fill", "rgba(22, 29, 39, 0.18)");

  await appearance.click({ force: true });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-theme", "dark");
  expect(await gripColors(grips)).toEqual(["rgb(240, 242, 243)", "rgb(240, 242, 243)"]);
  await expect(selectedCopy).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(addressPath).toHaveCSS("fill", "rgba(240, 242, 243, 0.1)");

  const neutralAddressBox = await addressPath.boundingBox();
  expect(neutralAddressBox).not.toBeNull();
  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await lower.press("End");
  await expect.poll(async () => (await addressPath.boundingBox())?.height ?? 0).toBeGreaterThan(
    neutralAddressBox!.height + 100,
  );
  const surfaceReceipt = await addressPath.evaluate((path) => {
    const projection = document.querySelector<HTMLElement>(".language-split-projection");
    const handle = document.querySelector<HTMLElement>(".stretch-handle");
    if (projection === null || handle === null) {
      throw new Error("elastic visual receipt missing");
    }
    return {
      addressFill: getComputedStyle(path).fill,
      projectionBackground: getComputedStyle(projection, "::before").backgroundColor,
      handleShadow: getComputedStyle(handle, "::after").boxShadow,
    };
  });
  expect(surfaceReceipt.addressFill).toBe("rgba(240, 242, 243, 0.1)");
  expect(surfaceReceipt.projectionBackground).toBe("rgba(0, 0, 0, 0)");
  expect(surfaceReceipt.handleShadow).toContain("4px");
});

test("font loading revokes actionable geometry until either font outcome settles", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const address = page.locator('.material-address-layer[data-address-variant="actionable"]');
  const grips = page.locator(".stretch-handle");
  await expect(address).toHaveAttribute("data-material-address-painted", "true");
  await expect(grips).toHaveCount(2);

  const unrelatedFontReceipt = await page.evaluate(() => {
    const face = new FontFace("Independent Chrome Font", 'local("Arial")');
    document.fonts.dispatchEvent(new FontFaceSetLoadEvent("loading", { fontfaces: [] }));
    document.fonts.dispatchEvent(new FontFaceSetLoadEvent("loadingdone", { fontfaces: [face] }));
    return {
      semanticSelection: document.querySelector(".lasso-layer")?.getAttribute("data-selected"),
      painted: document.querySelector<HTMLElement>(
        '.material-address-layer[data-address-variant="actionable"]',
      )?.hasAttribute("data-material-address-painted") ?? false,
      grips: document.querySelectorAll(".stretch-handle").length,
    };
  });
  expect(unrelatedFontReceipt).toEqual({
    semanticSelection: "true",
    painted: true,
    grips: 2,
  });

  for (const outcome of ["loadingdone", "loadingerror"] as const) {
    const immediate = await page.evaluate(() => {
      document.fonts.dispatchEvent(new Event("loading"));
      const layer = document.querySelector<HTMLElement>(
        '.material-address-layer[data-address-variant="actionable"]',
      );
      return {
        semanticSelection: document.querySelector(".lasso-layer")?.getAttribute("data-selected"),
        painted: layer?.hasAttribute("data-material-address-painted") ?? false,
        fragments: document.querySelectorAll(".lasso-selection-fragment").length,
        grips: document.querySelectorAll(".stretch-handle").length,
      };
    });
    expect(immediate).toEqual({
      semanticSelection: "true",
      painted: false,
      fragments: 0,
      grips: 0,
    });
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }));
    await expect(address).not.toHaveAttribute("data-material-address-painted", "true");
    await expect(grips).toHaveCount(0);

    await page.evaluate((eventName) => {
      document.fonts.dispatchEvent(new Event(eventName));
    }, outcome);
    await expect(address).toHaveAttribute("data-material-address-painted", "true");
    await expect(grips).toHaveCount(2);
  }
});

test("native copy releases stale paint before measuring a new range", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const native = page.locator('.material-address-layer[data-address-variant="native"]');
  const nativePath = native.locator(".material-address-layer__path");
  const setRootRange = async (start: number, end: number) => page.evaluate(
    ({ endOffset, nodeId, startOffset }) => {
      const root = document.querySelector<HTMLElement>(`[data-thought-text-id="${nodeId}"]`);
      const text = root === null
        ? null
        : document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode();
      const selection = window.getSelection();
      if (!(text instanceof Text) || selection === null) throw new Error("native fixture text missing");
      const range = document.createRange();
      range.setStart(text, startOffset);
      range.setEnd(text, endOffset);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return document.querySelector(
        '.material-address-layer[data-address-variant="native"]',
      )?.hasAttribute("data-material-address-painted") ?? false;
    },
    { endOffset: end, nodeId: ROOT_ID, startOffset: start },
  );

  expect(await setRootRange(0, 6)).toBe(false);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  const firstPath = await nativePath.getAttribute("d");
  expect(firstPath).not.toBeNull();

  // selectionchange must synchronously stop the old path from suppressing the
  // browser's new range; the replacement custom path arrives on the next rAF.
  expect(await setRootRange(9, 16)).toBe(false);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  await expect.poll(() => nativePath.getAttribute("d")).not.toBe(firstPath);
  const secondPath = await nativePath.getAttribute("d");

  // A literal same-node range spanning visual rows owns the same reading
  // corridor as Lasso: one path covers the first-row continuation and the
  // last-row return without proximity-snapping either true endpoint.
  expect(await setRootRange(0, `${SOURCE}${ROOT_SUFFIX}`.length - 1)).toBe(false);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  await expect.poll(() => nativePath.getAttribute("d")).not.toBe(secondPath);
  const multiLineNative = await nativePath.evaluate((path) => {
    if (!(path instanceof SVGGeometryElement)) throw new Error("native path missing");
    const root = document.querySelector<HTMLElement>(
      '[data-thought-text-id="thought_fixture_root"]',
    );
    if (!(root instanceof HTMLElement)) throw new Error("native range root missing");
    const text = document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode();
    if (!(text instanceof Text)) throw new Error("native range text missing");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.length - 1);
    const measuredColumn = root.getBoundingClientRect();
    const fragments = [...range.getClientRects()]
      .filter((rect) => rect.width > .5 && rect.height > .5)
      .sort((left, right) => left.top - right.top || left.left - right.left);
    const rows: Array<{ bottom: number; left: number; right: number; top: number }> = [];
    for (const fragment of fragments) {
      const row = rows.find((candidate) =>
        fragment.top <= candidate.bottom + 1 && fragment.bottom >= candidate.top - 1
      );
      if (row === undefined) {
        rows.push({
          bottom: fragment.bottom,
          left: fragment.left,
          right: fragment.right,
          top: fragment.top,
        });
      } else {
        row.bottom = Math.max(row.bottom, fragment.bottom);
        row.left = Math.min(row.left, fragment.left);
        row.right = Math.max(row.right, fragment.right);
        row.top = Math.min(row.top, fragment.top);
      }
    }
    rows.sort((left, right) => left.top - right.top);
    const first = rows[0];
    const last = rows.at(-1);
    if (first === undefined || last === undefined) throw new Error("native rows missing");
    const firstPoint = new DOMPoint(
      (first.right + measuredColumn.right) / 2,
      (first.top + first.bottom) / 2,
    );
    const lastPoint = new DOMPoint(
      (measuredColumn.left + last.left) / 2,
      (last.top + last.bottom) / 2,
    );
    const d = path.getAttribute("d") ?? "";
    return {
      closes: (d.match(/Z/g) ?? []).length,
      firstGap: measuredColumn.right - first.right,
      firstInside: path.isPointInFill(firstPoint),
      lastGap: last.left - measuredColumn.left,
      lastInside: path.isPointInFill(lastPoint),
      rowCount: rows.length,
      starts: (d.match(/M/g) ?? []).length,
    };
  });
  expect(multiLineNative.rowCount).toBeGreaterThan(1);
  expect(multiLineNative.firstGap).toBeGreaterThan(2);
  expect(multiLineNative.lastGap).toBeGreaterThan(2);
  expect(multiLineNative).toMatchObject({
    closes: 1,
    firstInside: true,
    lastInside: true,
    starts: 1,
  });

  const collapsedPainted = await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    return document.querySelector(
      '.material-address-layer[data-address-variant="native"]',
    )?.hasAttribute("data-material-address-painted") ?? false;
  });
  expect(collapsedPainted).toBe(false);
  await expect(native).not.toHaveAttribute("data-material-address-painted", "true");

  await setRootRange(0, 6);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  const crossNode = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-thought-text-id]"));
    const first = roots[0] === undefined
      ? null
      : document.createTreeWalker(roots[0], NodeFilter.SHOW_TEXT).nextNode();
    const second = roots[1] === undefined
      ? null
      : document.createTreeWalker(roots[1], NodeFilter.SHOW_TEXT).nextNode();
    const selection = window.getSelection();
    if (!(first instanceof Text) || !(second instanceof Text) || selection === null) {
      throw new Error("cross-node fixture text missing");
    }
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(second, Math.min(5, second.length));
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return {
      collapsed: selection.isCollapsed,
      painted: document.querySelector(
        '.material-address-layer[data-address-variant="native"]',
      )?.hasAttribute("data-material-address-painted") ?? false,
    };
  });
  expect(crossNode).toEqual({ collapsed: false, painted: false });
  await expect(native).not.toHaveAttribute("data-material-address-painted", "true");
});

test("a real double-click gives native copy sole paint ownership over structural selection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);

  const shell = page.locator("main.matter-shell");
  const root = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  const label = root.locator(".spatial-thought__label");
  const native = page.locator('.material-address-layer[data-address-variant="native"]');
  const structural = page.locator('.material-address-layer[data-address-variant="structural"]');
  const revision = await shell.getAttribute("data-tree-revision");
  await expect(structural).toHaveAttribute("data-material-address-painted", "true");
  await page.evaluate(() => document.fonts.ready);
  const before = await materialTextLayoutReceipt(root);

  await label.dblclick({ position: { x: 80, y: 12 } });
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    return selection !== null && !selection.isCollapsed && selection.toString().length > 0;
  })).toBe(true);
  await expect(shell).toHaveAttribute("data-material-address-owner", "native");
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  await expect(structural).not.toHaveAttribute("data-material-address-painted", "true");
  await expect(root).toHaveAttribute("aria-pressed", "true");
  await expect(shell).toHaveAttribute("data-tree-revision", revision ?? "");
  await expect(label).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(label).toHaveCSS("box-shadow", "none");
  expect(await materialTextLayoutReceipt(root)).toEqual(before);
});

test("structural selection paint never changes text wrapping or material geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const root = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await page.evaluate(() => document.fonts.ready);
  const before = await materialTextLayoutReceipt(root);
  expect(before.rows.length).toBeGreaterThan(1);

  await root.click();
  await expect(root).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.material-address-layer[data-address-variant="structural"]'),
  ).toHaveAttribute("data-material-address-painted", "true");
  const after = await materialTextLayoutReceipt(root);

  expect(after).toEqual(before);
});

test("a direct double-click keeps canonical geometry while native copy takes ownership", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const shell = page.locator("main.matter-shell");
  const root = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await page.evaluate(() => document.fonts.ready);
  const before = await materialTextLayoutReceipt(root);

  await root.dblclick({ position: { x: 80, y: 12 } });
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    return selection !== null && !selection.isCollapsed && selection.toString().length > 0;
  })).toBe(true);
  await expect(shell).toHaveAttribute("data-material-address-owner", "native");
  await expect(
    page.locator('.material-address-layer[data-address-variant="native"]'),
  ).toHaveAttribute("data-material-address-painted", "true");
  expect(await materialTextLayoutReceipt(root)).toEqual(before);
});

test("structural and native selection paint without changing material line geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const root = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  const before = await materialLineGeometry(root);
  expect(before.lines.length).toBeGreaterThan(1);

  await selectRoot(page);
  await expect(page.locator(
    '.material-address-layer[data-address-variant="structural"]',
  )).toHaveAttribute("data-material-address-painted", "true");
  const structural = await materialLineGeometry(root);
  expect(structural).toEqual(before);

  await root.locator(".spatial-thought__label").dblclick({ position: { x: 80, y: 12 } });
  await expect(page.locator("main.matter-shell"))
    .toHaveAttribute("data-material-address-owner", "native");
  await expect(page.locator(
    '.material-address-layer[data-address-variant="native"]',
  )).toHaveAttribute("data-material-address-painted", "true");
  expect(await materialLineGeometry(root)).toEqual(before);
});

test("one outline owns the address from neutral through both grips", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);

  // A whole-node structural selection reads line by line, the way the label it
  // replaced did, so it closes one capsule per line box rather than one region.
  const structural = page.locator('.material-address-layer[data-address-variant="structural"]');
  await expect(structural).toHaveAttribute("data-material-address-painted", "true");
  const structuralPath = structural.locator(".material-address-layer__path");
  const structuralD = await structuralPath.getAttribute("d");
  expect(structuralD ?? "").not.toBe("");
  const structuralRows = await page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`)
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((rect) => rect.height > 8).length;
    });
  expect(structuralRows).toBeGreaterThan(1);
  expect((structuralD ?? "").match(/M/g) ?? []).toHaveLength(structuralRows);
  expect((structuralD ?? "").match(/Z/g) ?? []).toHaveLength(structuralRows);
  expect(await structuralPath.evaluate((node) => getComputedStyle(node).stroke)).not.toBe("none");
  await expect(structuralPath).toHaveCSS("stroke-width", "1px");
  expect(await structural.evaluate((node) => getComputedStyle(node).clipPath)).not.toBe("none");
  // The label pill only steps aside once that path exists.
  await expect(page.locator('.spatial-thought[data-selected="true"] .spatial-thought__label'))
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const actionable = page.locator('.material-address-layer[data-address-variant="actionable"]');
  const actionablePath = actionable.locator(".material-address-layer__path");
  await expect(actionable).toHaveAttribute("data-material-address-painted", "true");
  const addressCopy = page.locator(".language-split-address-copy");
  await expect(addressCopy).toHaveText(`${SOURCE}，`);
  await expect(page.locator(".language-split-seam")).toHaveText("，");
  const neutralFill = await actionablePath.evaluate((node) => getComputedStyle(node).fill);
  const neutralD = await actionablePath.getAttribute("d");
  expect((neutralD ?? "").match(/M/g) ?? []).toHaveLength(1);
  const seamCoverage = await actionablePath.evaluate((path) => {
    if (!(path instanceof SVGGeometryElement)) throw new Error("address path missing");
    const seam = document.querySelector<HTMLElement>(".language-split-seam");
    if (seam === null) throw new Error("protected punctuation seam missing");
    const range = document.createRange();
    range.selectNodeContents(seam);
    const seamBox = range.getBoundingClientRect();
    const outline = path.getBoundingClientRect();
    const seamMidY = (seamBox.top + seamBox.bottom) / 2;
    return {
      airAfterSeam: outline.right - seamBox.right,
      coversBottom: outline.bottom >= seamBox.bottom,
      coversTop: outline.top <= seamBox.top,
      seamAirInside: path.isPointInFill(new DOMPoint(seamBox.right + 5, seamMidY)),
      seamInkInside: path.isPointInFill(new DOMPoint(seamBox.right - .5, seamMidY)),
    };
  });
  expect(seamCoverage.coversTop).toBe(true);
  expect(seamCoverage.coversBottom).toBe(true);
  expect(seamCoverage.airAfterSeam).toBeGreaterThan(5);
  expect(seamCoverage.seamInkInside).toBe(true);
  expect(seamCoverage.seamAirInside).toBe(true);
  const opticalAir = await actionablePath.evaluate((path) => {
    const selectedCopy = document.querySelector<HTMLElement>(".language-split-address-copy");
    if (selectedCopy === null) throw new Error("selected address copy missing");
    const range = document.createRange();
    range.selectNodeContents(selectedCopy);
    const fragments = [...range.getClientRects()].sort(
      (left, right) => left.top - right.top || left.left - right.left,
    );
    const rows: Array<{ bottom: number; height: number; top: number }> = [];
    for (const fragment of fragments) {
      const current = rows.at(-1);
      const belongs = current !== undefined &&
        fragment.top <= current.bottom + 1 && fragment.bottom >= current.top - 1;
      if (!belongs || current === undefined) {
        rows.push({ bottom: fragment.bottom, height: fragment.height, top: fragment.top });
      } else {
        current.top = Math.min(current.top, fragment.top);
        current.bottom = Math.max(current.bottom, fragment.bottom);
        current.height = current.bottom - current.top;
      }
    }
    const outline = path.getBoundingClientRect();
    const first = rows[0];
    const last = rows.at(-1);
    if (first === undefined || last === undefined) throw new Error("selected language rows missing");
    const halfLeading = rows.slice(1).reduce((minimum, row, index) =>
      Math.min(minimum, Math.max(0, row.top - rows[index]!.bottom) / 2),
    Number.POSITIVE_INFINITY);
    const heights = rows.map((row) => row.height).sort((left, right) => left - right);
    const middle = Math.floor(heights.length / 2);
    const medianHeight = heights.length % 2 === 1
      ? heights[middle]!
      : (heights[middle - 1]! + heights[middle]!) / 2;
    const preferred = Math.max(2, Math.min(medianHeight * .245, 14));
    return {
      bottom: outline.bottom - last.bottom,
      expected: Number.isFinite(halfLeading) ? Math.min(preferred, halfLeading) : preferred,
      top: first.top - outline.top,
    };
  });
  expect(Math.abs(opticalAir.top - opticalAir.bottom)).toBeLessThan(.25);
  expect(Math.abs(opticalAir.top - opticalAir.expected)).toBeLessThan(.5);
  const neutralCorridor = await readingCorridorCoverage(page);
  expect(neutralCorridor.rowCount).toBeGreaterThan(1);
  expect(neutralCorridor.firstToLogicalEndGap).toBeGreaterThan(2);
  expect(neutralCorridor.lastFromLogicalStartGap).toBeGreaterThan(2);
  expect(neutralCorridor.firstToLogicalEndInside).toBe(true);
  expect(neutralCorridor.lastFromLogicalStartInside).toBe(true);
  // Painted means the single-selection fallback is released, so the two never
  // stack and no frame can show grips over an unpainted address.
  await expect(page.locator(".material-address-selection-set--fallback[data-single-address-fallback]"))
    .toBeHidden();

  const lower = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
  const upper = page.getByRole("slider", { name: "用上握点设置所选文字的展开程度" });
  for (const [kind, grip] of [["lower", lower], ["upper", upper]] as const) {
    await grip.press("Home");
    await grip.press("End");
    await expect(actionable).toHaveAttribute("data-material-address-painted", "true");
    await expect(actionable).toHaveAttribute(
      "data-address-direction",
      kind === "lower" ? "selection-then-slot" : "slot-then-selection",
    );
    await expect(page.locator(".language-split-address-copy")).toHaveText(`${SOURCE}，`);
    const engagedD = await actionablePath.getAttribute("d");
    expect((engagedD ?? "").match(/M/g) ?? []).toHaveLength(1);
    expect(engagedD).not.toBe(neutralD);
    // The address keeps one colour across neutral and both grips.
    expect(await actionablePath.evaluate((node) => getComputedStyle(node).fill)).toBe(neutralFill);
    // Grips stay present and keep their physical rule while the outline owns paint.
    await expect(page.locator(".stretch-handle")).toHaveCount(2);
    if (kind === "lower") {
      const lowerCorridor = await readingCorridorCoverage(page);
      expect(lowerCorridor.lastToLogicalEndGap).toBeGreaterThan(2);
      expect(lowerCorridor.lastToLogicalEndInside).toBe(true);
    }
    await grip.press("Home");
  }
});

test("a structural address settles with the narrow index transition", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await page.addStyleTag({
    content: ".matter-material-plane { transition-duration: 1200ms !important; }",
  });

  const layer = page.locator(
    '.material-address-layer[data-address-variant="structural"]',
  );
  const path = page.locator(
    '.material-address-layer[data-address-variant="structural"] .material-address-layer__path',
  );
  const label = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  const plane = page.locator(".matter-material-plane");
  const [pathBefore, labelBefore] = await Promise.all([path.boundingBox(), label.boundingBox()]);
  expect(pathBefore).not.toBeNull();
  expect(labelBefore).not.toBeNull();
  const inlineOffset = pathBefore!.x - labelBefore!.x;

  await plane.evaluate((element) => {
    element.addEventListener("transitionrun", (event) => {
      if (
        event instanceof TransitionEvent && event.target === element &&
        event.propertyName === "transform"
      ) {
        element.setAttribute("data-e2e-transition-phase", "running");
      }
    });
    element.addEventListener("transitionend", (event) => {
      if (
        event instanceof TransitionEvent && event.target === element &&
        event.propertyName === "transform"
      ) {
        element.setAttribute("data-e2e-transition-phase", "ended");
      }
    });
  });
  await page.locator(".material-files-toggle").click({ force: true });
  await expect(plane).toHaveAttribute("data-e2e-transition-phase", "running");
  await expect(layer).not.toHaveAttribute("data-material-address-painted", "true");
  await page.waitForTimeout(300);
  await expect(plane).toHaveAttribute("data-e2e-transition-phase", "running");
  await expect(layer).not.toHaveAttribute("data-material-address-painted", "true");
  await expect(plane)
    .toHaveAttribute("data-index-disclosure", "open");
  await expect(plane).toHaveAttribute("data-e2e-transition-phase", "ended");
  await expect(layer).toHaveAttribute("data-material-address-painted", "true");
  await expect.poll(async () => (await label.boundingBox())?.x ?? 0)
    .toBeGreaterThan(labelBefore!.x + 100);
  await expect.poll(async () => {
    const [nextPath, nextLabel] = await Promise.all([path.boundingBox(), label.boundingBox()]);
    if (nextPath === null || nextLabel === null) return Number.POSITIVE_INFINITY;
    return Math.abs((nextPath.x - nextLabel.x) - inlineOffset);
  }).toBeLessThan(2);
});

test("forced colors keeps structural, actionable, and native text readable", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);

  const path = page.locator('.material-address-layer[data-address-variant="structural"] .material-address-layer__path');
  const label = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await expect(path).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
  expect(await path.evaluate((node) => getComputedStyle(node).stroke)).not.toBe("none");
  expect(await label.evaluate((node) => getComputedStyle(node).color)).not.toBe("rgba(0, 0, 0, 0)");

  await activateLasso(page);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(label, 0));
  const actionable = page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  );
  const actionablePath = actionable.locator(".material-address-layer__path");
  await expect(actionable).toHaveAttribute("data-material-address-painted", "true");
  await expect(actionablePath).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
  expect(await actionablePath.evaluate((node) => getComputedStyle(node).stroke)).not.toBe("none");
  const lower = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
  await lower.press("End");
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-preview-mode", "expand");
  await expect(page.locator(".language-split-slot")).toHaveCSS("border-top-width", "0px");
  expect(await page.locator(".language-split-projection").evaluate(
    (node) => getComputedStyle(node).color,
  )).not.toBe("rgba(0, 0, 0, 0)");

  await page.getByRole("button", {
    name: fixtureUiCopy.toolRail.exitLanguageSelection,
    exact: true,
  }).click();
  await page.evaluate((nodeId) => {
    const labelElement = document.querySelector<HTMLElement>(
      `[data-thought-text-id="${CSS.escape(nodeId)}"] .spatial-thought__label`,
    );
    const textNode = labelElement?.firstChild;
    const selection = window.getSelection();
    if (!(textNode instanceof Text) || selection === null) {
      throw new Error("native forced-colors fixture missing");
    }
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(4, textNode.length));
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, ROOT_ID);
  const native = page.locator('.material-address-layer[data-address-variant="native"]');
  await expect(page.locator("main.matter-shell"))
    .toHaveAttribute("data-material-address-owner", "native");
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  await expect(native).toHaveCSS("display", "none");
  const nativeSelection = await label.evaluate((node) => {
    const style = getComputedStyle(node, "::selection");
    return { background: style.backgroundColor, color: style.color };
  });
  expect(nativeSelection.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(nativeSelection.color).not.toBe("rgba(0, 0, 0, 0)");
});

test("the upper moving partition reflows in the full column and never splits a line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  // A segment that starts mid-line, so the prefix and the moving partition
  // share a canonical line and the split has to be real.
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 1));

  const projection = page.locator(".language-split-projection");
  const witness = projection.locator(".language-split-block--before");
  const moving = projection.locator(".language-split-moving");
  const upper = page.getByRole("slider", { name: "用上握点设置所选文字的展开程度" });

  const witnessBefore = await witness.evaluate((node) =>
    [...node.getClientRects()].map((rect) => [Math.round(rect.x), Math.round(rect.y)]));

  await upper.press("End");
  await expect(projection).toHaveAttribute("data-stretch-handle", "top");
  await expect(projection).toHaveAttribute("data-preview-mode", "expand");
  const rendererHandoff = await projection.evaluate((node) => {
    const canonical = node.parentElement?.querySelector<HTMLElement>(".spatial-thought__text");
    const tail = node.querySelector<HTMLElement>(".language-split-witness-tail");
    return {
      canonicalColor: canonical === undefined || canonical === null
        ? null
        : getComputedStyle(canonical).color,
      tailVisibility: tail === null ? null : getComputedStyle(tail).visibility,
    };
  });
  expect(rendererHandoff).toEqual({
    canonicalColor: "rgba(0, 0, 0, 0)",
    tailVisibility: "hidden",
  });

  const geometry = await projection.evaluate((node) => {
    const column = node.closest(".spatial-thought")!
      .querySelector<HTMLElement>(".spatial-thought__text")!.getBoundingClientRect();
    const slot = node.querySelector<HTMLElement>(".language-split-slot")!.getBoundingClientRect();
    const movingBox = node.querySelector<HTMLElement>(".language-split-moving")!.getBoundingClientRect();
    const before = node.querySelector<HTMLElement>(".language-split-block--before")!;
    const lastPrefixLine = [...before.getClientRects()].at(-1)!;
    const lines = [...node.querySelectorAll<HTMLElement>(".language-split-moving span")]
      .flatMap((span) => [...span.getClientRects()])
      .map((rect) => ({ bottom: rect.bottom, top: rect.top, x: rect.x }));
    return {
      column: { left: column.left, right: column.right },
      lines,
      moving: { left: movingBox.left, right: movingBox.right },
      prefixRight: lastPrefixLine.right,
      slot: { bottom: slot.bottom, top: slot.top },
    };
  });

  // The moving partition owns the whole column, so its first line starts at the
  // column's logical start instead of trailing the prefix's last line.
  expect(Math.round(geometry.moving.left)).toBe(Math.round(geometry.column.left));
  expect(Math.round(geometry.moving.right)).toBe(Math.round(geometry.column.right));
  expect(Math.abs(geometry.lines[0]!.x - geometry.prefixRight)).toBeGreaterThan(24);

  // Nothing is painted across the opened gap.
  for (const line of geometry.lines) {
    expect(line.bottom <= geometry.slot.top + 1 || line.top >= geometry.slot.bottom - 1).toBe(true);
  }

  // The witness is the fixed partition and may not move at all.
  const witnessAfter = await witness.evaluate((node) =>
    [...node.getClientRects()].map((rect) => [Math.round(rect.x), Math.round(rect.y)]));
  expect(witnessAfter).toEqual(witnessBefore);

  // Degree changes the slot, never the moving partition's line breaking.
  const linesAt = async () => moving.evaluate((node) =>
    [...node.querySelectorAll<HTMLElement>("span")]
      .flatMap((span) => [...span.getClientRects()])
      .map((rect) => [Math.round(rect.x), Math.round(rect.width)]));
  const full = await linesAt();
  await upper.press("Home");
  await upper.press("ArrowUp");
  await expect(upper).toHaveAttribute("aria-valuenow", "0.1");
  expect(await linesAt()).toEqual(full);
});

test("the upper grip keeps its upper boundary fixed and pushes selected language down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 1));

  const upper = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const beforeCopy = page.locator(".language-split-before-copy");
  const selectedCopy = page.locator(".language-split-witness .language-split-block--selected");
  const [before, selected, lowerBefore] = await Promise.all([
    beforeCopy.boundingBox(),
    selectedCopy.boundingBox(),
    lower.boundingBox(),
  ]);
  if (before === null || selected === null || lowerBefore === null) {
    throw new Error("upper projection receipt missing");
  }

  await upper.press("End");
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-stretch-handle", "top");
  const projectedSelectedCopy = page.locator(
    ".language-split-moving .language-split-block--selected",
  );
  await expect(projectedSelectedCopy).toBeVisible();
  await expect(lower).toBeVisible();
  // The layout owner stages the projected partition before the paintable
  // receipt remounts both controls. Visibility alone can still observe the old
  // zero-degree controls, so wait on the new semantic value before measuring.
  await expect(upper).toHaveAttribute("aria-valuenow", "1");
  await expect(lower).toHaveAttribute("aria-valuenow", "1");
  await expect.poll(() => page.locator(".language-split-projection").evaluate((node, baseline) => {
    const fixed = node.querySelector<HTMLElement>(".language-split-before-copy");
    const projected = node.querySelector<HTMLElement>(
      ".language-split-moving .language-split-block--selected",
    );
    const lowerGrip = document.querySelector<HTMLElement>(".stretch-handle--bottom");
    if (fixed === null || projected === null || lowerGrip === null) return false;
    const fixedBox = fixed.getBoundingClientRect();
    const projectedBox = projected.getBoundingClientRect();
    const lowerBox = lowerGrip.getBoundingClientRect();
    return Math.abs(fixedBox.y - baseline.beforeY) <= 1 &&
      projectedBox.y > baseline.selectedY + 120 &&
      lowerBox.y > baseline.lowerY + 120;
  }, {
    beforeY: before.y,
    lowerY: lowerBefore.y,
    selectedY: selected.y,
  })).toBe(true);
  await expect(upper).toHaveAttribute("aria-valuenow", "1");
  await expect(lower).toHaveAttribute("aria-valuenow", "1");
});

test("the upper grip on the opening segment pushes every lower material row down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const selected = page.locator(".language-split-block--selected");
  const upper = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const sourceOwner = page.locator(`[data-layout-node-id="${ROOT_ID}"]`);
  const [selectedBefore, sourceBefore, rowsBefore] = await Promise.all([
    selected.boundingBox(),
    sourceOwner.boundingBox(),
    layoutRowTops(page),
  ]);
  if (selectedBefore === null || sourceBefore === null) {
    throw new Error("opening-segment projection receipt is missing");
  }

  await upper.press("End");
  await expect.poll(async () => (await selected.boundingBox())?.y ?? Number.NEGATIVE_INFINITY)
    .toBeGreaterThan(selectedBefore.y + 120);
  const [sourceAfter, rowsAfter] = await Promise.all([
    sourceOwner.boundingBox(),
    layoutRowTops(page),
  ]);
  if (sourceAfter === null) throw new Error("source owner disappeared during expansion");
  expect(Math.abs(sourceAfter.y - sourceBefore.y)).toBeLessThanOrEqual(1);

  for (const [nodeId, beforeY] of Object.entries(rowsBefore)) {
    const afterY = rowsAfter[nodeId];
    if (afterY === undefined) throw new Error(`layout row ${nodeId} disappeared`);
    if (beforeY > sourceBefore.y + 1) {
      expect(afterY).toBeGreaterThan(beforeY + 120);
    } else {
      expect(Math.abs(afterY - beforeY)).toBeLessThanOrEqual(1);
    }
  }
});

test("Elastic Language cancels an unstarted gesture and a late turn without changing material", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    const envelope = route.request().postDataJSON() as {
      protocolVersion: "0.2";
      requestVersion: "transform/2";
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        protocolVersion: envelope.protocolVersion,
        requestVersion: envelope.requestVersion,
        id: envelope.id,
        treeId: envelope.treeId,
        treeRevision: envelope.treeRevision,
        action: {
          id: envelope.id,
          type: "replace-text-range",
          nodeId: envelope.selection.nodeId,
          start: envelope.selection.start,
          end: envelope.selection.end,
          text: EXPANDED,
          intent: "expand",
        },
        presentation: { motionHint: "grow" },
      }),
    }).catch(() => undefined);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const upperGrip = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const box = await grip.boundingBox();
  if (box === null) throw new Error("lower stretch grip missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 4);
  await page.mouse.up();
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(upperGrip).toHaveAttribute("aria-valuenow", "0");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  expect(turnRequests).toBe(0);

  await grip.focus();
  await page.keyboard.press("PageUp");
  await page.keyboard.press("Enter");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await page.waitForTimeout(550);
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
});

test("the first positive degree after the deadzone can be confirmed from the address", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const box = await grip.boundingBox();
  if (box === null) throw new Error("lower stretch grip missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 5);
  await page.mouse.up();

  await expect(grip).toHaveAttribute("aria-valuenow", "0.008");
  await expect(page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  )).toHaveAttribute("data-address-confirmable", "true");
  expect(turnRequests).toBe(0);

  await grip.click();
  await expect(grip).toHaveAttribute("aria-valuenow", "0.008");
  expect(turnRequests).toBe(0);

  const point = await elasticAddressInteriorPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 10, point.y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  await expect(page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  )).toHaveAttribute("data-address-confirmable", "true");
  expect(turnRequests).toBe(0);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await setDocumentVisibility(page, "hidden");
  await setDocumentVisibility(page, "visible");
  await page.mouse.up();
  await expect(page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  )).toHaveAttribute("data-address-confirmable", "true");
  expect(turnRequests).toBe(0);

  await confirmElasticAddress(page);
  await expect.poll(() => turnRequests).toBe(1);
});

test("Elastic Language provider failure stays quiet and leaves material unchanged", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TURN_UNAVAILABLE",
          message: "Synthetic model unavailable.",
          retryable: true,
          fallbackReason: "MODEL_UNAVAILABLE",
        },
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await grip.focus();
  await page.keyboard.press("PageUp");
  await page.keyboard.press("Enter");

  await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
  await expect(page.locator(".matter-guidance__next")).not.toHaveText("暂时无法展开。");
  await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
  await expectLowerSpaceBeforeSuffix(page);
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
  await expect(page.locator("main.matter-shell"))
    .not.toHaveAttribute("data-transform-phase", "requesting");
  await confirmElasticAddress(page);
  await expect.poll(() => turnRequests).toBe(2);
});

test("clicking outside a settled Elastic address cancels without a request", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await grip.press("PageUp");
  await expect(page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  )).toHaveAttribute("data-address-confirmable", "true");

  const paper = await page.locator(".matter-document").boundingBox();
  if (paper === null) throw new Error("Matter paper missing");
  await page.mouse.click(paper.x + 24, paper.y + 24);

  await expect(page.locator(".stretch-handle")).toHaveCount(0);
  await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
  expect(turnRequests).toBe(0);
  await expect(page.getByRole("button", {
    name: `${SOURCE}${ROOT_SUFFIX}`,
    exact: true,
  })).toBeVisible();
});

test("Voice recording suspends selected-language grips while both stop controls remain reachable", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  await expect(page.locator(".stretch-handle")).toHaveCount(2);

  // Both controls deliberately finish the same recording: the rail preserves
  // the fixed instrument, while local feedback keeps the live state reachable.
  const toolRail = page.locator(".tool-rail");
  const voice = toolRail.getByRole("button", { name: fixtureVoiceAdmissionName });
  await voice.click();
  await expect(toolRail.getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", {
    name: fixtureUiCopy.voiceTool.stopRecording,
    exact: true,
  })).toHaveCount(2);
  await expect(page.locator("main.matter-shell"))
    .toHaveAttribute("data-interaction-pending", "true");
  await expect(page.locator("main.matter-shell"))
    .not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.locator(".stretch-handle")).toHaveCount(0);
  await page.keyboard.press("Enter");
  expect(turnRequests).toBe(0);
  // The admission-flow receipt owns Stop, transcription, commit, and Undo.
  // Ending an uncontrolled fake-device recording here would make this Elastic
  // boundary depend on whether a 250 ms MediaRecorder chunk happened to land.
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("Elastic Language keeps both grips touch-sized without a hidden third control", async ({ page }) => {
    await runElasticReceipt(page, "touch");
  });
});

async function runElasticReceipt(
  page: Page,
  input: "drag" | "touch" | "keyboard",
): Promise<void> {
  const browserErrors: string[] = [];
  let turnRequests = 0;
  let requestReceipt: Readonly<{
    amount: number;
    end: number;
    selectedText: string;
  }> | null = null;
  let releaseTurn!: () => void;
  const turnGate = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    const envelope = route.request().postDataJSON() as {
      selection: { end: number; selectedText: string };
      gesture: { amount: number };
    };
    requestReceipt = Object.freeze({
      amount: envelope.gesture.amount,
      end: envelope.selection.end,
      selectedText: envelope.selection.selectedText,
    });
    // Hold the fixture at the wire boundary until the test has observed the
    // requesting geometry. A fixed delay races a loaded runner and can let the
    // committed result remove that transient surface before it is sampled.
    await turnGate;
    await route.continue();
  });

  if (input !== "touch") await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await activateLasso(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await expect(text).toContainText(SOURCE);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const lowerGrip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const upperGrip = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const grip = input === "drag" ? upperGrip : lowerGrip;
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(upperGrip).toHaveAttribute("aria-valuenow", "0");
  await expect(lowerGrip).toHaveAttribute("aria-valuenow", "0");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".language-split-address-copy")).toHaveText(`${SOURCE}，`);
  await expect(page.locator(".stretch-amount-rail")).toHaveCount(0);
  await expectUpperGripAtSelection(page, upperGrip);
  await expectNeutralSelection(page);
  // The transform presentation is intentionally short-lived. Observe its DOM
  // insertion inside the browser so runner load cannot miss the bounded reveal
  // before this test reaches the durable-text assertions below.
  if (input !== "keyboard") await observeTransformReveal(page);

  if (input === "drag") {
    const box = await grip.boundingBox();
    if (box === null) throw new Error("upper stretch grip missing");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Four pixels are the mouse deadzone; 64px of physical travel therefore
    // settles the fixture's exact 0.5 degree rather than an adjacent length.
    await page.mouse.move(x, y - 64, { steps: 5 });
    await page.mouse.up();
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    expect(turnRequests).toBe(0);
    await confirmElasticPocket(page);
  } else if (input === "touch") {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const gripBox = await grip.boundingBox();
    if (gripBox === null) throw new Error("touch lower grip missing");
    expect(gripBox.width).toBeGreaterThanOrEqual(48);
    expect(gripBox.height).toBeGreaterThanOrEqual(48);
    // Touch owns an eight-pixel deadzone, so 68px reaches the same 0.5 degree.
    await dragByTouch(page, grip, 68);
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    expect(turnRequests).toBe(0);
    await confirmElasticPocket(page, "touch");
  } else {
    await grip.focus();
    await page.keyboard.press("PageUp");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    expect(turnRequests).toBe(0);
    await page.keyboard.press("Enter");
  }

  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  await expect(page.locator(".matter-guidance__next")).toHaveText("已确认，正在展开。");
  await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
  await expect(page.locator(".stretch-handle__ratio")).toHaveCount(0);
  if (input === "drag") {
    await expect(page.locator(".language-split-projection"))
      .toHaveAttribute("data-stretch-handle", "top");
  } else {
    await expectLowerSpaceBeforeSuffix(page);
  }
  await expect(lowerGrip).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  releaseTurn();
  // A fresh development server may compile the fixture route only after this
  // first explicit confirmation. Keep that infrastructure wait local; the
  // interaction and request-count assertions above retain the normal budget.
  await expect(text).toContainText(EXPANDED, { timeout: 15_000 });
  expect(turnRequests).toBe(1);
  expect(requestReceipt).toEqual({
    amount: 0.5,
    end: SOURCE.length,
    selectedText: SOURCE,
  });
  await expect(text).toHaveText(`${EXPANDED}${ROOT_SUFFIX}`);
  if (input === "keyboard") {
    const animations = await page.locator(".transform-text__group").evaluateAll((groups) =>
      groups.map((group) => getComputedStyle(group).animationName),
    );
    expect(animations.every((name) => name === "none")).toBe(true);
  } else {
    const groupCount = await readObservedTransformRevealGroupCount(page);
    expect(groupCount).toBeGreaterThanOrEqual(2);
    expect(groupCount).toBeLessThanOrEqual(4);
  }
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect(text).toHaveText(`${SOURCE}${ROOT_SUFFIX}`);
  await expect(page.locator(".transform-text")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+Z");
  await expect(text).toHaveText(`${EXPANDED}${ROOT_SUFFIX}`);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`))
    .toHaveText(`${EXPANDED}${ROOT_SUFFIX}`);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  expect(turnRequests).toBe(1);
  expect(browserErrors).toEqual([]);
}

async function observeTransformReveal(page: Page): Promise<void> {
  await page.evaluate(() => {
    const receiptKey = "__matterTransformRevealGroupCount";
    const receiptWindow = window as Window & { [receiptKey]?: number };
    delete receiptWindow[receiptKey];
    const capture = (): boolean => {
      const value = document.querySelector(".transform-text")
        ?.getAttribute("data-transform-reveal-groups");
      if (value === null || value === undefined) return false;
      const groupCount = Number(value);
      if (!Number.isSafeInteger(groupCount)) return false;
      receiptWindow[receiptKey] = groupCount;
      return true;
    };
    if (capture()) return;
    const observer = new MutationObserver(() => {
      if (!capture()) return;
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function readObservedTransformRevealGroupCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const receiptKey = "__matterTransformRevealGroupCount";
    const receiptWindow = window as Window & { [receiptKey]?: number };
    const groupCount = receiptWindow[receiptKey];
    delete receiptWindow[receiptKey];
    return groupCount ?? 0;
  });
}

async function confirmElasticAddress(
  page: Page,
  input: "mouse" | "touch" = "mouse",
): Promise<void> {
  const point = await elasticAddressInteriorPoint(page);
  if (input === "touch") {
    await page.touchscreen.tap(point.x, point.y);
  } else await page.mouse.click(point.x, point.y);
}

async function confirmElasticPocket(
  page: Page,
  input: "mouse" | "touch" = "mouse",
): Promise<void> {
  const slot = page.locator(
    '.language-split-projection[data-preview-mode="expand"] .language-split-slot',
  );
  const box = await slot.boundingBox();
  if (box === null) throw new Error("Elastic pocket missing");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const path = page.locator(
    '.material-address-layer[data-address-variant="actionable"] .material-address-layer__path',
  );
  await expect(path).toHaveAttribute("d", /.+/u);
  expect(await path.evaluate((element, clientPoint) => {
    if (!(element instanceof SVGGeometryElement)) return false;
    const matrix = element.getScreenCTM();
    if (matrix === null) return false;
    const local = new DOMPoint(clientPoint.x, clientPoint.y).matrixTransform(matrix.inverse());
    return element.isPointInFill(local) && document.elementFromPoint(
      clientPoint.x,
      clientPoint.y,
    ) === element;
  }, point)).toBe(true);
  if (input === "touch") await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function elasticAddressInteriorPoint(page: Page): Promise<Readonly<{ x: number; y: number }>> {
  const layer = page.locator('.material-address-layer[data-address-variant="actionable"]');
  await expect(layer).toHaveAttribute("data-address-confirmable", "true");
  const path = layer.locator(".material-address-layer__path");
  let point: Readonly<{ x: number; y: number }> | null = null;
  await expect.poll(async () => {
    point = await path.evaluate((element) => {
      const path = element;
      if (!(path instanceof SVGGeometryElement)) throw new Error("Elastic address path missing");
      const box = path.getBoundingClientRect();
      const matrix = path.getScreenCTM();
      if (matrix === null) return null;
      for (let y = box.top + 2; y < box.bottom - 2; y += 4) {
        for (let x = box.left + 2; x < box.right - 2; x += 4) {
          const local = new DOMPoint(x, y).matrixTransform(matrix.inverse());
          if (path.isPointInFill(local)) return { x, y };
        }
      }
      return null;
    });
    return point;
  }).not.toBeNull();
  if (point === null) throw new Error("Elastic address has no confirmable interior point");
  return point;
}

async function setDocumentVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function expectLowerSpaceBeforeSuffix(page: Page): Promise<void> {
  const suffix = page.locator(".language-split-block--after");
  const selection = page.locator(".language-split-block--selected");
  const projection = page.locator(".language-split-projection");
  await expect(projection).toHaveAttribute(
    "data-stretch-handle",
    "bottom",
  );
  await expect(projection).toHaveAttribute("data-preview-mode", "expand");
  await expect(page.locator('.material-address-layer[data-address-variant="actionable"]'))
    .toHaveAttribute("data-material-address-painted", "true");
  // The semantic degree can settle before the replacement receipt has mounted
  // its expanded flow boxes. Poll the current boxes through that atomic
  // handoff; a one-shot read can observe the old neutral spacing under load.
  await expect.poll(async () => {
    const [selectionBox, suffixBox] = await Promise.all([
      selection.boundingBox(),
      suffix.boundingBox(),
    ]);
    if (selectionBox === null || suffixBox === null) return 0;
    return suffixBox.y - (selectionBox.y + selectionBox.height);
  }).toBeGreaterThan(20);
}

async function readingCorridorCoverage(page: Page): Promise<Readonly<{
  firstToLogicalEndGap: number;
  firstToLogicalEndInside: boolean;
  lastFromLogicalStartGap: number;
  lastFromLogicalStartInside: boolean;
  lastToLogicalEndGap: number;
  lastToLogicalEndInside: boolean;
  rowCount: number;
}>> {
  return page.locator(
    '.material-address-layer[data-address-variant="actionable"] .material-address-layer__path',
  ).evaluate((path) => {
    if (!(path instanceof SVGGeometryElement)) throw new Error("actionable path missing");
    const address = document.querySelector<HTMLElement>(".language-split-address-copy");
    const column = address?.closest(".spatial-thought")
      ?.querySelector<HTMLElement>(".spatial-thought__text")
      ?.getBoundingClientRect();
    if (address === null || address === undefined || column === undefined) {
      throw new Error("reading-corridor fixture missing");
    }
    const range = document.createRange();
    range.selectNodeContents(address);
    const fragments = [...range.getClientRects()]
      .filter((rect) => rect.width > .5 && rect.height > .5)
      .sort((left, right) => left.top - right.top || left.left - right.left);
    const rows: Array<{ bottom: number; left: number; right: number; top: number }> = [];
    for (const fragment of fragments) {
      const row = rows.find((candidate) =>
        fragment.top <= candidate.bottom + 1 && fragment.bottom >= candidate.top - 1
      );
      if (row === undefined) {
        rows.push({
          bottom: fragment.bottom,
          left: fragment.left,
          right: fragment.right,
          top: fragment.top,
        });
      } else {
        row.bottom = Math.max(row.bottom, fragment.bottom);
        row.left = Math.min(row.left, fragment.left);
        row.right = Math.max(row.right, fragment.right);
        row.top = Math.min(row.top, fragment.top);
      }
    }
    rows.sort((left, right) => left.top - right.top);
    const first = rows[0];
    const last = rows.at(-1);
    if (first === undefined || last === undefined) throw new Error("address rows missing");
    const firstY = (first.top + first.bottom) / 2;
    const lastY = (last.top + last.bottom) / 2;
    const firstEndX = (first.right + column.right) / 2;
    const lastStartX = (column.left + last.left) / 2;
    const lastEndX = (last.right + column.right) / 2;
    return {
      firstToLogicalEndGap: column.right - first.right,
      firstToLogicalEndInside: path.isPointInFill(new DOMPoint(firstEndX, firstY)),
      lastFromLogicalStartGap: last.left - column.left,
      lastFromLogicalStartInside: path.isPointInFill(new DOMPoint(lastStartX, lastY)),
      lastToLogicalEndGap: column.right - last.right,
      lastToLogicalEndInside: path.isPointInFill(new DOMPoint(lastEndX, lastY)),
      rowCount: rows.length,
    };
  });
}

async function expectNeutralSelection(page: Page): Promise<void> {
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-preview-mode", "neutral");
  const address = page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  );
  await expect(address).toHaveAttribute("data-material-address-painted", "true");
  await expect(address.locator(".material-address-layer__path")).toBeVisible();
  await expect(page.locator(
    ".material-address-selection-set--fallback[data-single-address-fallback]",
  )).toBeHidden();
}

async function expectUpperGripAtSelection(
  page: Page,
  grip: ReturnType<Page["locator"]>,
): Promise<void> {
  const [gripBox, addressBox] = await Promise.all([
    grip.boundingBox(),
    page.locator(
      '.material-address-layer[data-address-variant="actionable"] .material-address-layer__path',
    ).boundingBox(),
  ]);
  expect(gripBox).not.toBeNull();
  expect(addressBox).not.toBeNull();
  const lowerEdge = gripBox!.y + gripBox!.height;
  // The invisible hit target sits just above the painted address; the visible
  // 22x2 grip grows from that edge without becoming part of its geometry.
  expect(Math.abs(addressBox!.y - lowerEdge)).toBeLessThanOrEqual(18);
}

async function gripColors(grips: ReturnType<Page["locator"]>): Promise<readonly string[]> {
  return grips.evaluateAll((controls) => controls.map((control) =>
    getComputedStyle(control).color,
  ));
}

async function layoutRowTops(page: Page): Promise<Readonly<Record<string, number>>> {
  return page.locator("[data-layout-node-id]").evaluateAll((elements) =>
    Object.fromEntries(elements.flatMap((element) => {
      const nodeId = element.getAttribute("data-layout-node-id");
      return nodeId === null ? [] : [[nodeId, element.getBoundingClientRect().y]];
    })),
  );
}

async function dragByTouch(
  page: Page,
  target: ReturnType<Page["locator"]>,
  deltaY: number,
): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error("touch drag target missing");
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1, radiusX: 1, radiusY: 1 }],
    });
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + deltaY * step, id: 1, radiusX: 1, radiusY: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function selectRoot(page: Page): Promise<void> {
  const rootText = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await rootText.click();
  await expect(rootText).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
  // Canvas geometry and lasso target snapshots settle at the rendering edge.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function materialTextLayoutReceipt(target: ReturnType<Page["locator"]>) {
  return target.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node instanceof Text && node.data.length > 0) textNodes.push(node);
    }
    const first = textNodes[0];
    const last = textNodes.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error("material text receipt requires canonical text");
    }
    const range = document.createRange();
    // Element ranges include both an inline wrapper's box and its descendant
    // text rects after selection mounts. Span only canonical text nodes so the
    // receipt compares glyph geometry, independent of paint-only DOM shape.
    range.setStart(first, 0);
    range.setEnd(last, last.data.length);
    const own = (value: number) => Math.round(value * 100) / 100;
    const rect = element.getBoundingClientRect();
    const rows = [...range.getClientRects()]
      .filter((row) => row.width > 0 && row.height > 0)
      .map((row) => ({
        x: own(row.x),
        y: own(row.y),
        width: own(row.width),
        height: own(row.height),
      }));
    range.detach();
    return {
      box: {
        x: own(rect.x),
        y: own(rect.y),
        width: own(rect.width),
        height: own(rect.height),
      },
      rows,
    };
  });
}

async function materialLineGeometry(
  material: ReturnType<Page["locator"]>,
): Promise<Readonly<{
  height: number;
  lines: readonly Readonly<{ bottom: number; left: number; right: number; top: number }>[];
  width: number;
}>> {
  return material.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    try {
      const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const fragments: DOMRect[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!(node instanceof Text) || node.data.length === 0) continue;
        range.selectNodeContents(node);
        fragments.push(...range.getClientRects());
      }
      const visibleFragments = fragments
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((left, right) => left.top - right.top || left.left - right.left);
      const lines: Array<{ bottom: number; left: number; right: number; top: number }> = [];
      for (const fragment of visibleFragments) {
        const row = lines.find((candidate) =>
          Math.min(candidate.bottom, fragment.bottom) - Math.max(candidate.top, fragment.top) > 1
        );
        if (row === undefined) {
          lines.push({
            bottom: fragment.bottom,
            left: fragment.left,
            right: fragment.right,
            top: fragment.top,
          });
        } else {
          row.bottom = Math.max(row.bottom, fragment.bottom);
          row.left = Math.min(row.left, fragment.left);
          row.right = Math.max(row.right, fragment.right);
          row.top = Math.min(row.top, fragment.top);
        }
      }
      const box = element.getBoundingClientRect();
      const precision = (value: number) => Math.round(value * 100) / 100;
      return {
        height: precision(box.height),
        lines: lines.map((line) => ({
          bottom: precision(line.bottom),
          left: precision(line.left),
          right: precision(line.right),
          top: precision(line.top),
        })),
        width: precision(box.width),
      };
    } finally {
      range.detach();
    }
  });
}

async function activateLasso(page: Page): Promise<void> {
  await page.getByRole("button", {
    name: fixtureUiCopy.toolRail.circleSelectLanguage,
    exact: true,
  }).click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
  await settleLassoGeometry(page);
}

async function segmentProbeRect(
  text: ReturnType<Page["locator"]>,
  segmentIndex: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return text.evaluate((element, index) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const content = textNode.data;
    const delimiters = new Set(["，", "。", "；", "：", "！", "？", "、", "…", ",", ".", ";", ":", "!", "?"]);
    const segments: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (let cursor = 0; cursor < content.length; cursor += 1) {
      if (!delimiters.has(content[cursor]!)) continue;
      if (cursor > start) segments.push({ start, end: cursor });
      start = cursor + 1;
      while (content[start] === " ") start += 1;
    }
    if (start < content.length) segments.push({ start, end: content.length });
    const segment = segments[index];
    if (segment === undefined) throw new Error("fixture segment missing");
    const range = document.createRange();
    range.setStart(textNode, segment.start);
    range.setEnd(textNode, segment.end);
    const rect = Array.from(range.getClientRects()).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (rect === undefined) throw new Error("fixture fragment missing");
    return {
      x: rect.left + rect.width / 2 - 2,
      y: rect.top + rect.height / 2 - 2,
      width: 4,
      height: 4,
    };
  }, segmentIndex);
}

async function drawEarlyReleaseLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  await page.mouse.move(rect.x - margin, rect.y + Math.min(18, rect.height * .45), { steps: 2 });
  await page.mouse.up();
}
