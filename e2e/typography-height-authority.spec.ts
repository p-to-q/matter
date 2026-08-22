import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import ts from "typescript";
import { createPerformanceThoughtTree } from "../features/matter/material/seeded-document";

type AuthorityModule = typeof import(
  "../features/matter/components/typography-height-authority"
);

const C1_BATCHES = Object.freeze([32, 64, 128] as const);
type C1PerformanceRun = Readonly<{
  cacheSize: number;
  current: boolean;
  durationMs: number;
  heightCount: number;
  minimumHeight: number;
  nodeIdCount: number;
}>;

test.describe("production typography height authority", () => {
  test("publishes only complete positive snapshots and invalidates font and style epochs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await installAuthority(page);

    const receipt = await page.evaluate(async () => {
      await document.fonts.ready;
      const authorityModule = (globalThis as typeof globalThis & {
        __matterTypographyHeightAuthority?: AuthorityModule;
      }).__matterTypographyHeightAuthority;
      if (authorityModule === undefined) throw new Error("Typography authority was not installed.");
      const container = document.querySelector<HTMLElement>(".matter-canvas");
      if (container === null) throw new Error("Matter canvas is unavailable.");
      const authority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "ltr",
          documentEpoch: 7,
          grammarEpoch: 1,
          locale: "zh-CN",
          styleEpoch: 2,
        },
        document,
        limit: 8,
      });
      const items = [
        {
          columnWidthPx: 520,
          dir: "ltr" as const,
          locale: "zh-CN",
          nodeId: "root",
          root: true,
          text: "我们怀念的也许不是一个真实存在过的过去。",
        },
        {
          columnWidthPx: 520,
          dir: "ltr" as const,
          locale: "zh-CN",
          nodeId: "child",
          root: false,
          text: "而是那个过去在今天仍然允许我们想象的其他生活。",
        },
        {
          columnWidthPx: 520,
          dir: "ltr" as const,
          locale: "zh-CN",
          nodeId: "child-duplicate",
          root: false,
          text: "而是那个过去在今天仍然允许我们想象的其他生活。",
        },
      ];
      const truthOwner = document.createElement("ol");
      truthOwner.className = "spatial-thoughts";
      truthOwner.inert = true;
      truthOwner.setAttribute("aria-hidden", "true");
      Object.assign(truthOwner.style, {
        left: "-100000px",
        position: "fixed",
        top: "0",
        visibility: "hidden",
      });
      const truthHeights = items.map((item) => {
        const row = document.createElement("li");
        row.className = "spatial-thought";
        if (!item.root) row.dataset.parentId = "truth-parent";
        const button = document.createElement("button");
        button.className = "spatial-thought__text";
        button.dir = item.dir;
        button.lang = item.locale;
        button.textContent = item.text;
        row.append(button);
        truthOwner.append(row);
        return button;
      });
      container.append(truthOwner);
      const expectedHeights = truthHeights.map((button) => button.offsetHeight);
      truthOwner.remove();

      const firstToken = authority.begin("tree:7:full");
      if (firstToken === null) throw new Error("Fonts were unexpectedly loading.");
      const cold = authority.measure({ batchSize: 32, items, token: firstToken });
      const warm = authority.measure({ batchSize: 32, items, token: firstToken });
      if (cold === null || warm === null) throw new Error("Typography snapshot did not settle.");
      const coldCacheSize = authority.cacheSize;

      document.fonts.dispatchEvent(new Event("loading"));
      const blockedDuringLoading = authority.begin("tree:7:full") === null;
      const staleDuringLoading = authority.measure({ batchSize: 32, items, token: firstToken });
      const cacheSizeDuringLoading = authority.cacheSize;
      document.fonts.dispatchEvent(new Event("loadingerror"));
      const settledToken = authority.begin("tree:7:full");
      if (settledToken === null) throw new Error("Fallback font epoch did not settle.");
      const fallback = authority.measure({ batchSize: 32, items, token: settledToken });
      if (fallback === null) throw new Error("Fallback typography snapshot did not settle.");
      document.fonts.dispatchEvent(new Event("loading"));
      document.fonts.dispatchEvent(new Event("loadingdone"));
      const loadedToken = authority.begin("tree:7:full");
      if (loadedToken === null) throw new Error("Loaded font epoch did not settle.");
      const loaded = authority.measure({ batchSize: 32, items, token: loadedToken });
      if (loaded === null) throw new Error("Loaded typography snapshot did not settle.");

      const styleToken = authority.begin("tree:7:full");
      if (styleToken === null) throw new Error("Style token did not settle.");
      const styleMutation = document.createElement("style");
      styleMutation.textContent =
        ".matter-canvas .spatial-thought__text { letter-spacing: .01px !important; }";
      document.head.append(styleMutation);
      const staleAfterUnannouncedStyle = authority.measure({
        batchSize: 32,
        items,
        token: styleToken,
      });
      styleMutation.remove();
      const cacheSizeAfterUnannouncedStyle = authority.cacheSize;

      const tokenBeforeContext = authority.begin("tree:7:full");
      if (tokenBeforeContext === null) throw new Error("Context token did not settle.");
      authority.setContext({
        dir: "rtl",
        documentEpoch: 8,
        grammarEpoch: 1,
        locale: "ar",
        styleEpoch: 3,
      });
      const staleAfterContext = authority.measure({
        batchSize: 32,
        items,
        token: tokenBeforeContext,
      });
      const cacheSizeAfterContext = authority.cacheSize;
      const probesBeforeDestroy = document.querySelectorAll(
        "[data-typography-authority-probes]",
      ).length;
      const destroyToken = authority.begin("tree:8:full");
      if (destroyToken === null || !authority.isCurrent(destroyToken)) {
        throw new Error("Destroy token was not current before cleanup.");
      }
      authority.destroy();
      const currentAfterDestroy = authority.isCurrent(destroyToken);
      const probesAfterDestroy = document.querySelectorAll(
        "[data-typography-authority-probes], [data-typography-authority-measurement]",
      ).length;

      const noFontsAuthority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "ltr",
          documentEpoch: 9,
          grammarEpoch: 1,
          locale: "zh-CN",
          styleEpoch: 1,
        },
        document,
        fontFaceSet: null,
      });
      const noFontsToken = noFontsAuthority.begin("tree:9:full");
      if (noFontsToken === null) throw new Error("FontFaceSet-free authority did not begin.");
      const noFontsSnapshot = noFontsAuthority.measure({
        batchSize: 32,
        items: [items[0]!],
        token: noFontsToken,
      });
      const noFontsCurrent = noFontsAuthority.isCurrent(noFontsToken);
      noFontsAuthority.destroy();
      const noFontsProbeResidue = document.querySelectorAll(
        "[data-typography-authority-probes], [data-typography-authority-measurement]",
      ).length;

      const delayedLoadingFonts = new EventTarget() as EventTarget & {
        readonly status: string;
      };
      let fontStatusReads = 0;
      Object.defineProperty(delayedLoadingFonts, "status", {
        get: () => {
          fontStatusReads += 1;
          return fontStatusReads >= 4 ? "loading" : "loaded";
        },
      });
      const delayedLoadingAuthority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "ltr",
          documentEpoch: 10,
          grammarEpoch: 1,
          locale: "zh-CN",
          styleEpoch: 1,
        },
        document,
        fontFaceSet: delayedLoadingFonts,
      });
      const delayedLoadingToken = delayedLoadingAuthority.begin("tree:10:full");
      if (delayedLoadingToken === null) throw new Error("Delayed-loading authority did not begin.");
      const delayedLoadingSnapshot = delayedLoadingAuthority.measure({
        batchSize: 32,
        items: [items[0]!],
        token: delayedLoadingToken,
      });
      const delayedLoadingCacheSize = delayedLoadingAuthority.cacheSize;
      delayedLoadingAuthority.destroy();

      const rtlAuthority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "rtl",
          documentEpoch: 11,
          grammarEpoch: 1,
          locale: "ar",
          styleEpoch: 1,
        },
        document,
      });
      const rtlToken = rtlAuthority.begin("tree:11:full");
      if (rtlToken === null) throw new Error("RTL authority did not begin.");
      const rtlSnapshot = rtlAuthority.measure({
        batchSize: 32,
        items: [{
          columnWidthPx: 520,
          dir: "rtl",
          locale: "ar",
          nodeId: "rtl-material",
          root: false,
          text: "ربما لا نتذكر الماضي نفسه، بل المساحة التي ما زال يفتحها.",
        }],
        token: rtlToken,
      });
      rtlAuthority.destroy();

      return {
        blockedDuringLoading,
        cacheSizeAfterContext,
        cacheSizeAfterUnannouncedStyle,
        cacheSizeDuringLoading,
        coldCacheSize,
        coldHeights: cold.heights,
        coldNodeIds: cold.nodeIds,
        currentAfterDestroy,
        duplicateSharedKey: cold.keys[1] === cold.keys[2],
        delayedLoadingCacheSize,
        delayedLoadingSnapshot,
        expectedHeights,
        fallbackBasis: fallback.basis,
        loadedFontEpoch: loaded.basis.fontEpoch,
        noFontsCurrent,
        noFontsHeight: noFontsSnapshot?.heights[0] ?? null,
        noFontsProbeResidue,
        probesAfterDestroy,
        probesBeforeDestroy,
        rtlHeight: rtlSnapshot?.heights[0] ?? null,
        staleAfterContext,
        staleAfterUnannouncedStyle,
        staleDuringLoading,
        warmHeights: warm.heights,
      };
    });

    expect(receipt.coldHeights).toEqual(receipt.expectedHeights);
    expect(receipt.warmHeights).toEqual(receipt.coldHeights);
    expect(receipt.coldNodeIds).toEqual(["root", "child", "child-duplicate"]);
    expect(receipt.duplicateSharedKey).toBe(true);
    expect(receipt.delayedLoadingSnapshot).toBeNull();
    expect(receipt.delayedLoadingCacheSize).toBe(0);
    expect(receipt.coldCacheSize).toBe(2);
    expect(receipt.blockedDuringLoading).toBe(true);
    expect(receipt.staleDuringLoading).toBeNull();
    expect(receipt.cacheSizeDuringLoading).toBe(0);
    expect(receipt.fallbackBasis).toMatchObject({
      documentEpoch: 7,
      fontEpoch: 1,
      grammarEpoch: 1,
      projectionKey: "tree:7:full",
      styleEpoch: 2,
    });
    expect(receipt.loadedFontEpoch).toBe(2);
    expect(receipt.staleAfterUnannouncedStyle).toBeNull();
    expect(receipt.cacheSizeAfterUnannouncedStyle).toBe(0);
    expect(receipt.staleAfterContext).toBeNull();
    expect(receipt.cacheSizeAfterContext).toBe(0);
    expect(receipt.probesBeforeDestroy).toBe(1);
    expect(receipt.probesAfterDestroy).toBe(0);
    expect(receipt.currentAfterDestroy).toBe(false);
    expect(receipt.noFontsCurrent).toBe(true);
    expect(receipt.noFontsHeight).toBeGreaterThan(0);
    expect(receipt.noFontsProbeResidue).toBe(0);
    expect(receipt.rtlHeight).toBeGreaterThan(0);
  });

  test("isolates invalidation observers across pre-commit font loading and destroy", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await installAuthority(page);

    const receipt = await page.evaluate(async () => {
      await document.fonts.ready;
      const authorityModule = (globalThis as typeof globalThis & {
        __matterTypographyHeightAuthority?: AuthorityModule;
      }).__matterTypographyHeightAuthority;
      if (authorityModule === undefined) throw new Error("Typography authority was not installed.");
      const container = document.querySelector<HTMLElement>(".matter-canvas");
      if (container === null) throw new Error("Matter canvas is unavailable.");

      const fonts = new EventTarget() as EventTarget & { readonly status: string };
      let statusReads = 0;
      let forcedStatus: "loaded" | "loading" | null = null;
      Object.defineProperty(fonts, "status", {
        get: () => forcedStatus ?? (++statusReads >= 4 ? "loading" : "loaded"),
      });
      const invalidations: string[] = [];
      const authority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "ltr",
          documentEpoch: 12,
          grammarEpoch: 1,
          locale: "zh-CN",
          styleEpoch: 1,
        },
        document,
        fontFaceSet: fonts,
        onInvalidated: (reason) => {
          invalidations.push(reason);
          throw new Error("The render invalidation sink is intentionally unavailable.");
        },
      });
      const token = authority.begin("tree:12:full");
      if (token === null) throw new Error("Delayed-loading authority did not begin.");
      const snapshot = authority.measure({
        batchSize: 32,
        items: [{
          columnWidthPx: 520,
          dir: "ltr",
          locale: "zh-CN",
          nodeId: "font-trigger",
          root: true,
          text: "首次出现的字形可以在测量期间才触发字体加载。",
        }],
        token,
      });
      const cacheSizeAfterPreCommit = authority.cacheSize;

      forcedStatus = "loaded";
      fonts.dispatchEvent(new Event("loadingdone"));
      const tokenAfterDone = authority.begin("tree:12:full");
      if (tokenAfterDone === null) throw new Error("Done settlement did not reopen authority.");

      forcedStatus = "loading";
      fonts.dispatchEvent(new Event("loading"));
      forcedStatus = "loaded";
      // A failed FontFaceSet cycle may expose both completion events. It is
      // still one settlement epoch and one render invalidation.
      fonts.dispatchEvent(new Event("loadingdone"));
      fonts.dispatchEvent(new Event("loadingerror"));
      const tokenAfterError = authority.begin("tree:12:full");
      if (tokenAfterError === null) throw new Error("Error settlement did not reopen authority.");
      const fontEpochBeforeDestroy = authority.fontEpoch;
      authority.destroy();

      forcedStatus = "loading";
      fonts.dispatchEvent(new Event("loading"));
      forcedStatus = "loaded";
      fonts.dispatchEvent(new Event("loadingdone"));
      fonts.dispatchEvent(new Event("loadingerror"));
      return {
        cacheSizeAfterPreCommit,
        currentAfterDestroy: authority.isCurrent(tokenAfterError),
        fontEpochAfterDestroy: authority.fontEpoch,
        fontEpochBeforeDestroy,
        invalidations,
        probeResidue: document.querySelectorAll(
          "[data-typography-authority-probes], [data-typography-authority-measurement]",
        ).length,
        snapshot,
      };
    });

    expect(receipt).toEqual({
      cacheSizeAfterPreCommit: 0,
      currentAfterDestroy: false,
      fontEpochAfterDestroy: 2,
      fontEpochBeforeDestroy: 2,
      invalidations: ["font-loading", "font-settled", "font-loading", "font-settled"],
      probeResidue: 0,
      snapshot: null,
    });
  });

  test("rejects a dishonest width atomically and removes every measurement replica", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await installAuthority(page);

    const receipt = await page.evaluate(async () => {
      await document.fonts.ready;
      const authorityModule = (globalThis as typeof globalThis & {
        __matterTypographyHeightAuthority?: AuthorityModule;
      }).__matterTypographyHeightAuthority;
      if (authorityModule === undefined) throw new Error("Typography authority was not installed.");
      const container = document.querySelector<HTMLElement>(".matter-canvas");
      if (container === null) throw new Error("Matter canvas is unavailable.");
      const authority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "ltr",
          documentEpoch: 1,
          grammarEpoch: 1,
          locale: "zh-CN",
          styleEpoch: 1,
        },
        document,
      });
      const token = authority.begin("tree:1:full");
      if (token === null) throw new Error("Fonts were unexpectedly loading.");
      let error = "";
      try {
        authority.measure({
          batchSize: 32,
          items: [
            {
              columnWidthPx: 520,
              dir: "ltr",
              locale: "zh-CN",
              nodeId: "valid-first",
              root: true,
              text: "第一项本来可以产生一个合法高度。",
            },
            {
              columnWidthPx: 280,
              dir: "ltr",
              locale: "zh-CN",
              nodeId: "dishonest-width",
              root: false,
              text: "第二项谎称使用窄列，整批必须失败。",
            },
          ],
          token,
        });
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      const cacheSize = authority.cacheSize;
      const measurementOwners = document.querySelectorAll(
        "[data-typography-authority-measurement]",
      ).length;
      authority.destroy();
      const limitedAuthority = new authorityModule.TypographyHeightAuthority({
        container,
        context: {
          dir: "ltr",
          documentEpoch: 2,
          grammarEpoch: 1,
          locale: "zh-CN",
          styleEpoch: 1,
        },
        document,
        limit: 1,
      });
      const limitedToken = limitedAuthority.begin("tree:2:full");
      if (limitedToken === null) throw new Error("Limited authority did not begin.");
      let limitError = "";
      try {
        limitedAuthority.measure({
          batchSize: 32,
          items: [
            {
              columnWidthPx: 520,
              dir: "ltr",
              locale: "zh-CN",
              nodeId: "first-unique",
              root: true,
              text: "第一条唯一材料。",
            },
            {
              columnWidthPx: 520,
              dir: "ltr",
              locale: "zh-CN",
              nodeId: "second-unique",
              root: false,
              text: "第二条唯一材料。",
            },
          ],
          token: limitedToken,
        });
      } catch (caught) {
        limitError = caught instanceof Error ? caught.message : String(caught);
      }
      const limitedCacheSize = limitedAuthority.cacheSize;
      limitedAuthority.destroy();
      return { cacheSize, error, limitError, limitedCacheSize, measurementOwners };
    });

    expect(receipt).toEqual({
      cacheSize: 0,
      error: "Typography item width disagrees with its epoch authority.",
      limitError: "Typography request exceeds the owner cache limit.",
      limitedCacheSize: 0,
      measurementOwners: 0,
    });
  });

  test("matches the real 280px and 236px responsive canvas columns", async ({ page }) => {
    const receipts = [];
    for (const viewport of [
      { columnWidthPx: 280, height: 844, width: 390 },
      { columnWidthPx: 236, height: 720, width: 320 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/matter");
      await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
      await installAuthority(page);
      receipts.push(await page.evaluate(async ({ columnWidthPx }) => {
        await document.fonts.ready;
        const authorityModule = (globalThis as typeof globalThis & {
          __matterTypographyHeightAuthority?: AuthorityModule;
        }).__matterTypographyHeightAuthority;
        if (authorityModule === undefined) throw new Error("Typography authority was not installed.");
        const container = document.querySelector<HTMLElement>(".matter-canvas");
        if (container === null) throw new Error("Matter canvas is unavailable.");
        const authority = new authorityModule.TypographyHeightAuthority({
          container,
          context: {
            dir: "ltr",
            documentEpoch: 1,
            grammarEpoch: 1,
            locale: "zh-CN",
            styleEpoch: 1,
          },
          document,
        });
        const items = [
          {
            columnWidthPx,
            dir: "ltr" as const,
            locale: "zh-CN",
            nodeId: "responsive-root",
            root: true,
            text: "窄屏仍然需要保留真实换行。",
          },
          {
            columnWidthPx,
            dir: "ltr" as const,
            locale: "zh-CN",
            nodeId: "responsive-child",
            root: false,
            text: "标点、中文和 Matter mixed text 也不能猜测高度。",
          },
        ];
        const truth = items.map((item) => {
          const row = document.createElement("li");
          row.className = "spatial-thought";
          if (!item.root) row.dataset.parentId = "responsive-parent";
          const button = document.createElement("button");
          button.className = "spatial-thought__text";
          button.dir = item.dir;
          button.lang = item.locale;
          button.textContent = item.text;
          row.append(button);
          container.append(row);
          const height = button.offsetHeight;
          row.remove();
          return height;
        });
        const token = authority.begin(`responsive:${columnWidthPx}`);
        if (token === null) throw new Error("Responsive authority did not begin.");
        const snapshot = authority.measure({ batchSize: 32, items, token });
        authority.destroy();
        return { heights: snapshot?.heights ?? null, truth };
      }, { columnWidthPx: viewport.columnWidthPx }));
    }
    for (const receipt of receipts) expect(receipt.heights).toEqual(receipt.truth);
  });

  test("records cold 2,000-height production-owner candidates", async ({ page }) => {
    test.skip(
      process.env.MATTER_RUN_TYPOGRAPHY_C1_BENCH !== "true",
      "Run explicitly before selecting the production measurement batch.",
    );
    const runCount = Number.parseInt(process.env.MATTER_TYPOGRAPHY_C1_ROUNDS ?? "3", 10);
    expect(Number.isSafeInteger(runCount) && runCount > 0).toBe(true);
    test.setTimeout(Math.max(120_000, runCount * C1_BATCHES.length * 10_000));
    await page.setViewportSize({ width: 1280, height: 800 });
    const tree = createPerformanceThoughtTree();
    const items = Object.values(tree.nodes).map((node, index) => ({
      nodeId: node.id,
      root: node.parentId === null,
      text: `${node.text} · production-owner-${index.toString(36)}`,
    }));
    expect(items).toHaveLength(2_000);

    const receipt = C1_BATCHES.map((batchSize) => ({
      batchSize,
      runs: [] as C1PerformanceRun[],
    }));
    for (let round = 0; round < runCount; round += 1) {
      for (let offset = 0; offset < C1_BATCHES.length; offset += 1) {
        const batchSize = C1_BATCHES[(round + offset) % C1_BATCHES.length]!;
        await page.goto(`/matter?typography-c1=${round}-${batchSize}`);
        await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
        await installAuthority(page);
        const run = await page.evaluate(async ({ activeBatch, inputs, roundIndex }) => {
          await document.fonts.ready;
          const authorityModule = (globalThis as typeof globalThis & {
            __matterTypographyHeightAuthority?: AuthorityModule;
          }).__matterTypographyHeightAuthority;
          if (authorityModule === undefined) throw new Error("Typography authority was not installed.");
          const container = document.querySelector<HTMLElement>(".matter-canvas");
          if (container === null) throw new Error("Matter canvas is unavailable.");
          const authority = new authorityModule.TypographyHeightAuthority({
            container,
            context: {
              dir: "ltr",
              documentEpoch: roundIndex,
              grammarEpoch: 1,
              locale: "zh-CN",
              styleEpoch: 1,
            },
            document,
          });
          const token = authority.begin(`2k:${activeBatch}:${roundIndex}`);
          if (token === null) throw new Error("Cold authority did not begin.");
          const start = performance.now();
          const snapshot = authority.measure({
            batchSize: activeBatch,
            items: inputs.map((item) => ({
              columnWidthPx: 520,
              dir: "ltr" as const,
              locale: "zh-CN",
              ...item,
            })),
            token,
          });
          const durationMs = performance.now() - start;
          if (snapshot === null) throw new Error("Cold authority did not settle.");
          const runReceipt = {
            cacheSize: authority.cacheSize,
            current: authority.isCurrent(snapshot.basis),
            durationMs,
            heightCount: snapshot.heights.length,
            minimumHeight: Math.min(...snapshot.heights),
            nodeIdCount: snapshot.nodeIds.length,
          };
          authority.destroy();
          return runReceipt;
        }, { activeBatch: batchSize, inputs: items, roundIndex: round });
        receipt.find((candidate) => candidate.batchSize === batchSize)!.runs.push(run);
      }
    }
    const summaries = receipt.map(({ batchSize, runs }) => {
      const durations = runs.map(({ durationMs }) => durationMs).sort((left, right) => left - right);
      return {
        batchSize,
        gatePassed: runs.every(({ durationMs }) => durationMs < 50 && durationMs <= 63),
        maximumMs: durations.at(-1)!,
        medianMs: durations[Math.floor(durations.length / 2)]!,
        minimumMs: durations[0]!,
        peakReplicaDom: batchSize * 2 + 1,
        runs,
      };
    });
    const survivors = summaries.filter(({ gatePassed }) => gatePassed);
    const fastestMedian = Math.min(...survivors.map(({ medianMs }) => medianMs));
    const selected = survivors
      .filter(({ medianMs }) => medianMs <= fastestMedian * 1.1)
      .sort((left, right) => left.peakReplicaDom - right.peakReplicaDom)[0] ?? null;
    const fullReceipt = { runCount, selectedBatch: selected?.batchSize ?? null, summaries };
    console.log(`Matter typography C1 2k: ${JSON.stringify(fullReceipt)}`);
    await test.info().attach("typography-c1-2k.json", {
      body: JSON.stringify(fullReceipt, null, 2),
      contentType: "application/json",
    });
    for (const candidate of receipt) {
      for (const run of candidate.runs) {
        expect(run.cacheSize).toBe(2_000);
        expect(run.current).toBe(true);
        expect(run.heightCount).toBe(2_000);
        expect(run.minimumHeight).toBeGreaterThan(0);
        expect(run.nodeIdCount).toBe(2_000);
      }
    }
    expect(fullReceipt.selectedBatch).not.toBeNull();
  });
});

async function installAuthority(page: Page): Promise<void> {
  const [ledgerSource, authoritySource] = await Promise.all([
    readFile(resolve(process.cwd(), "features/matter/layout/typography-height-ledger.ts"), "utf8"),
    readFile(resolve(process.cwd(), "features/matter/components/typography-height-authority.ts"), "utf8"),
  ]);
  const compilerOptions = {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  } as const;
  const compiledLedger = ts.transpileModule(ledgerSource, { compilerOptions }).outputText;
  const compiledAuthority = ts.transpileModule(authoritySource, { compilerOptions }).outputText;
  await page.evaluate(async ({ authority, ledger }) => {
    const ledgerUrl = URL.createObjectURL(new Blob([ledger], { type: "text/javascript" }));
    const authorityUrl = URL.createObjectURL(new Blob([
      authority.replace("../layout/typography-height-ledger", ledgerUrl),
    ], { type: "text/javascript" }));
    try {
      const authorityModule = await import(authorityUrl) as AuthorityModule;
      (globalThis as typeof globalThis & { __matterTypographyHeightAuthority?: AuthorityModule })
        .__matterTypographyHeightAuthority = authorityModule;
    } finally {
      URL.revokeObjectURL(authorityUrl);
      URL.revokeObjectURL(ledgerUrl);
    }
  }, { authority: compiledAuthority, ledger: compiledLedger });
}
