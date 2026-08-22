import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import ts from "typescript";

type AuthorityModule = typeof import(
  "../features/matter/components/typography-height-authority"
);
type PublicationModule = typeof import(
  "../features/matter/layout/complete-layout-publication"
);

test("C2 complete publication reproduces all current 2,000 production boxes", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await installC2(page);

  const receipt = await page.evaluate(async () => {
    await document.fonts.ready;
    const modules = (globalThis as typeof globalThis & {
      __matterC2?: Readonly<{
        authority: AuthorityModule;
        publication: PublicationModule;
      }>;
    }).__matterC2;
    if (modules === undefined) throw new Error("C2 modules were not installed.");
    const canvas = document.querySelector<HTMLElement>(".matter-canvas");
    if (canvas === null) throw new Error("Matter canvas is unavailable.");
    const elements = Array.from(
      canvas.querySelectorAll<HTMLElement>("[data-layout-node-id]"),
    );
    const depthById = new Map<string, number>();
    const projection = elements.map((element) => {
      const id = element.dataset.layoutNodeId;
      if (id === undefined) throw new Error("Layout node identity is unavailable.");
      const parentId = element.dataset.parentId ?? null;
      const depth = parentId === null ? 0 : (depthById.get(parentId) ?? -1) + 1;
      if (depth < 0) throw new Error("Production preorder parent is unavailable.");
      depthById.set(id, depth);
      return Object.freeze({ depth, node: Object.freeze({ id }), parentId });
    });
    const style = getComputedStyle(canvas);
    const readPixels = (name: string) => {
      const value = Number.parseFloat(style.getPropertyValue(name));
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} is unavailable.`);
      return value;
    };
    const columnWidth = readPixels("--matter-column-width");
    const columnGap = readPixels("--matter-column-gap");
    const siblingGap = readPixels("--matter-sibling-gap");
    const authority = new modules.authority.TypographyHeightAuthority({
      container: canvas,
      context: {
        dir: "ltr",
        documentEpoch: 1,
        grammarEpoch: 1,
        locale: "zh-CN",
        styleEpoch: 1,
      },
      document,
    });
    const token = authority.begin("c2:production:2k");
    if (token === null) throw new Error("C2 authority did not begin.");
    const items = elements.map((element, index) => {
      const button = element.querySelector<HTMLElement>(".spatial-thought__text");
      if (button === null) throw new Error("Material text is unavailable.");
      return {
        columnWidthPx: columnWidth,
        dir: "ltr" as const,
        locale: "zh-CN",
        nodeId: projection[index]!.node.id,
        root: projection[index]!.parentId === null,
        text: button.textContent ?? "",
      };
    });
    const measurementStartedAt = performance.now();
    const snapshot = authority.measure({
      batchSize: modules.authority.TYPOGRAPHY_HEIGHT_BATCH_SIZE,
      items,
      token,
    });
    const measurementDurationMs = performance.now() - measurementStartedAt;
    if (snapshot === null || !authority.isCurrent(snapshot.basis)) {
      throw new Error("C2 height snapshot is unavailable or stale.");
    }
    const layoutStartedAt = performance.now();
    const result = modules.publication.publishCompleteLayout({
      expectedBasis: snapshot.basis,
      layout: {
        columnGap,
        columnWidth,
        layoutEpoch: 1,
        origin: { x: 0, y: 0 },
        siblingGap,
      },
      projection,
      snapshot,
    });
    const layoutDurationMs = performance.now() - layoutStartedAt;
    if (!result.ok || !authority.isCurrent(result.publication.basis)) {
      throw new Error(result.ok ? "C2 publication became stale." : result.error.code);
    }
    let maximumDifferencePx = 0;
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index]!;
      const box = result.publication.layout.boxes[index]!;
      const match = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0(?:px)?\)$/.exec(
        element.style.transform,
      );
      if (match === null) throw new Error("Production transform is unavailable.");
      const currentX = Number(match[1]);
      const currentY = Number(match[2]);
      const button = element.querySelector<HTMLElement>(".spatial-thought__text");
      if (button === null) throw new Error("Material text is unavailable.");
      maximumDifferencePx = Math.max(
        maximumDifferencePx,
        Math.abs(box.x - currentX),
        Math.abs(box.y - currentY),
        Math.abs(box.width - columnWidth),
        Math.abs(box.height - button.offsetHeight),
      );
    }
    const currentCanvasWidth = Number.parseFloat(
      canvas.style.getPropertyValue("--matter-canvas-width"),
    );
    const currentCanvasHeight = Number.parseFloat(
      canvas.style.getPropertyValue("--matter-canvas-height"),
    );
    maximumDifferencePx = Math.max(
      maximumDifferencePx,
      Math.abs(result.publication.layout.bounds.width - currentCanvasWidth),
      Math.abs(result.publication.layout.bounds.height - currentCanvasHeight),
    );
    const currentBeforeDestroy = authority.isCurrent(result.publication.basis);
    authority.destroy();
    return {
      boxCount: result.publication.layout.boxes.length,
      currentBeforeDestroy,
      layoutDurationMs,
      maximumDifferencePx,
      measurementDurationMs,
      probeResidue: canvas.querySelectorAll(
        "[data-typography-authority-probes], [data-typography-authority-measurement]",
      ).length,
    };
  });

  console.log(`Matter C2 production parity: ${JSON.stringify(receipt)}`);
  await test.info().attach("complete-layout-production-parity.json", {
    body: JSON.stringify(receipt, null, 2),
    contentType: "application/json",
  });
  expect(receipt.boxCount).toBe(2_000);
  expect(receipt.currentBeforeDestroy).toBe(true);
  expect(receipt.maximumDifferencePx).toBe(0);
  expect(receipt.probeResidue).toBe(0);
});

async function installC2(page: Page): Promise<void> {
  const paths = {
    authority: "features/matter/components/typography-height-authority.ts",
    columnar: "features/matter/layout/columnar-layout.ts",
    ledger: "features/matter/layout/typography-height-ledger.ts",
    publication: "features/matter/layout/complete-layout-publication.ts",
  } as const;
  const [authoritySource, columnarSource, ledgerSource, publicationSource] = await Promise.all(
    Object.values(paths).map((path) => readFile(resolve(process.cwd(), path), "utf8")),
  );
  const compilerOptions = {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  } as const;
  const compile = (source: string) => ts.transpileModule(source, { compilerOptions }).outputText;
  await page.evaluate(async (sources) => {
    const urls: string[] = [];
    const createUrl = (source: string) => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      urls.push(url);
      return url;
    };
    const ledgerUrl = createUrl(sources.ledger);
    const authorityUrl = createUrl(
      sources.authority.replace("../layout/typography-height-ledger", ledgerUrl),
    );
    const columnarUrl = createUrl(sources.columnar);
    const publicationUrl = createUrl(
      sources.publication.replace("./columnar-layout", columnarUrl),
    );
    try {
      const [authority, publication] = await Promise.all([
        import(authorityUrl) as Promise<AuthorityModule>,
        import(publicationUrl) as Promise<PublicationModule>,
      ]);
      (globalThis as typeof globalThis & {
        __matterC2?: Readonly<{
          authority: AuthorityModule;
          publication: PublicationModule;
        }>;
      }).__matterC2 = Object.freeze({ authority, publication });
    } finally {
      for (const url of urls) URL.revokeObjectURL(url);
    }
  }, {
    authority: compile(authoritySource),
    columnar: compile(columnarSource),
    ledger: compile(ledgerSource),
    publication: compile(publicationSource),
  });
}
