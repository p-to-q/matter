import { expect, test, type Page } from "@playwright/test";
import { parseMatterBuildId } from "../features/matter/config/build-identity";
import { fixtureUiCopy } from "./matter-ui-copy";

// Build and serve the fixture with this same explicit identity. The journey
// changes only the health response, never the application's compiled identity.
const BUILD_ID = parseMatterBuildId(process.env.MATTER_BUILD_ID ?? process.env.VERCEL_DEPLOYMENT_ID);
const copy = fixtureUiCopy.materialFiles;

async function openChangedMatter(page: Page) {
  await page.addInitScript(() => {
    const send = window.fetch;
    (window as Window & { __deploymentHealthReads?: number }).__deploymentHealthReads = 0;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      // Image availability shares this URL; only the version observer omits credentials.
      if (url.endsWith("/api/health") && init?.credentials === "omit") {
        const owner = window as Window & { __deploymentHealthReads?: number };
        owner.__deploymentHealthReads = (owner.__deploymentHealthReads ?? 0) + 1;
      }
      return send.call(this, input, init);
    };
  });
  const healthReads = () => page.evaluate(() =>
    (window as Window & { __deploymentHealthReads?: number }).__deploymentHealthReads ?? 0);
  const paidRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\//u.test(request.url())) {
      paidRequests.push(request.url());
    }
  });
  await page.route("**/api/health", async (route) => {
    await route.fulfill({ contentType: "application/json", headers: { "cache-control": "no-store" },
      body: JSON.stringify({ protocolVersion: "0.2", status: "ok", basePath: "/matter",
        buildId: BUILD_ID === "other_fixture_build" ? "other_fixture_build_2" : "other_fixture_build",
        surfaces: { material: "available", imageGeneration: "unavailable" } }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await page.bringToFront();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const sidebar = page.locator("aside.material-files");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
  await expect(page.locator('[data-guidance-state="matter-changed"]')).toBeVisible();
  expect(await healthReads()).toBe(1);
  return { sidebar, paidRequests, healthReads };
}

test.describe("manual artifact change guidance", () => {
  test.skip(BUILD_ID === null, "Requires the same MATTER_BUILD_ID for the build, fixture server and test process.");

  test("quiet guidance never navigates; Archive owns a guarded, explicit reload", async ({ page }) => {
    await page.addInitScript(() => {
      const read = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function (this: Blob) {
        return new Promise<void>((resolve) => {
          (window as Window & { __releaseVersionArchiveRead?: () => void }).__releaseVersionArchiveRead = resolve;
        }).then(() => read.call(this));
      };
    });
    const { sidebar, paidRequests, healthReads } = await openChangedMatter(page);
    const material = await page.locator("[data-thought-text-id]").allTextContents();
    let navigations = 0;
    // Hydration may replace history in the same document; count actual page loads.
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
    });
    await sidebar.getByRole("button", { name: copy.archive, exact: true }).click();
    const archive = sidebar.getByRole("region", { name: copy.archivePanel });
    const reload = archive.getByRole("button", { name: copy.archiveReloadPage, exact: true });
    await expect(archive).toContainText(copy.archiveDeploymentChanged);
    await expect(reload).toBeEnabled();

    await archive.getByLabel(copy.archiveChooseMaterialArchive).setInputFiles({
      name: "held-version-check.zip", mimeType: "application/zip", buffer: Buffer.from("Not an archive."),
    });
    await expect(archive).toHaveAttribute("aria-busy", "true");
    await expect(reload).toBeDisabled();
    // A stale enabled control still has no authority while Archive owns work.
    await reload.evaluate((button: HTMLButtonElement) => { button.disabled = false; button.click(); });
    expect(navigations).toBe(0);
    await page.evaluate(() => (window as Window & { __releaseVersionArchiveRead?: () => void }).__releaseVersionArchiveRead?.());
    await expect(archive).toContainText(copy.archiveErrorInvalid);
    await expect(reload).toBeEnabled();
    expect(await page.locator("[data-thought-text-id]").allTextContents()).toEqual(material);
    expect(await healthReads()).toBe(1);
    expect(paidRequests).toEqual([]);

    const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await reload.click();
    await navigation;
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    expect(await page.locator("[data-thought-text-id]").allTextContents()).toEqual(material);
    expect(navigations).toBe(1);
  });

  test("a held name and then unsaved material cannot grant reload authority", async ({ page }) => {
    const { sidebar, paidRequests } = await openChangedMatter(page);
    let navigations = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
    });
    await sidebar.locator(".material-files__context-title").click();
    const title = sidebar.getByRole("textbox", { name: copy.canvasTitle, exact: true });
    await title.fill("An unsaved fixture name");
    await expect(title).toBeFocused();
    await expect(page.locator('[data-guidance-state="matter-changed"]')).toHaveCount(0);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
        if (this.name === "snapshots") throw new DOMException("fixture storage full", "QuotaExceededError");
        return put.apply(this, args);
      };
    });
    await title.press("Enter");
    await expect(sidebar).toHaveAttribute("data-persistence-phase", "error");
    await sidebar.getByRole("button", { name: copy.archive, exact: true }).click();
    const archive = sidebar.getByRole("region", { name: copy.archivePanel });
    const reload = archive.getByRole("button", { name: copy.archiveReloadPage, exact: true });
    await expect(reload).toBeDisabled();
    const blockedArchive = await archive.textContent();
    // React's rendered disabled prop still suppresses its handler after DOM tampering.
    // Direct stale-callback rejection is proved by requestDeploymentReload's unit cases.
    await reload.evaluate((button: HTMLButtonElement) => { button.disabled = false; button.click(); });
    await expect(archive).toHaveText(blockedArchive ?? "");
    await expect(sidebar.locator(".material-files__context-title")).toHaveText("An unsaved fixture name");
    expect(navigations).toBe(0);
    expect(paidRequests).toEqual([]);
  });
});
