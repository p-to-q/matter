import { expect, test, type Locator } from "@playwright/test";
import { MATTER_DATABASE_VERSION } from "../features/matter/persistence/matter-database";
import { fixtureUiCopy } from "./matter-ui-copy";

const rootId = "thought_fixture_root";

test("a v3 model-label cache upgrades atomically and converges to its global bound", async ({ page }) => {
  await page.goto("/robots.txt");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("ptoq-matter");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("database deletion failed"));
      request.onblocked = () => reject(new Error("database deletion was blocked"));
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter", 3);
      request.onupgradeneeded = () => {
        const database = request.result;
        const labels = database.createObjectStore("labels", { keyPath: "key" });
        labels.createIndex("treeId", "treeId");
        labels.put({
          storageSchemaVersion: 1,
          key: "tree_upgrade manual_name",
          treeId: "tree_upgrade",
          nodeId: "manual_name",
          label: "person-owned name",
          origin: "user",
          basis: null,
          updatedAt: "2026-09-01T00:00:00.000Z",
        });
        for (let index = 0; index < 4_002; index += 1) {
          const nodeId = `legacy_${index}`;
          labels.put({
            storageSchemaVersion: 1,
            key: `tree_upgrade ${nodeId}`,
            treeId: "tree_upgrade",
            nodeId,
            label: `legacy ${index}`,
            origin: "model",
            basis: "0123456789abcdef12",
            updatedAt: new Date(index).toISOString(),
          });
        }
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error("v3 database creation failed"));
      request.onblocked = () => reject(new Error("v3 database creation was blocked"));
    });
  });

  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect.poll(() => page.evaluate(async () =>
    new Promise<{
      count: number;
      hasEvictionIndex: boolean;
      manualLabel: string | null;
      modelCount: number;
      version: number;
    }>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter");
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("labels", "readonly");
        const store = transaction.objectStore("labels");
        const countRequest = store.count();
        const modelCountRequest = store.index("originUpdatedAt").count(
          IDBKeyRange.bound(["model", ""], ["model", "\uffff"]),
        );
        const manualRequest = store.get("tree_upgrade manual_name");
        transaction.oncomplete = () => {
          resolve({
            count: countRequest.result,
            hasEvictionIndex: store.indexNames.contains("originUpdatedAt"),
            manualLabel: manualRequest.result?.label ?? null,
            modelCount: modelCountRequest.result,
            version: database.version,
          });
          database.close();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("label inspection failed"));
        };
      };
      request.onerror = () => reject(request.error ?? new Error("upgraded database open failed"));
    })
  )).toEqual({
    count: 4_001,
    hasEvictionIndex: true,
    manualLabel: "person-owned name",
    modelCount: 4_000,
    version: MATTER_DATABASE_VERSION,
  });
});

test("the material index names a thought instead of previewing it", async ({ page }) => {
  const labelRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/label")) labelRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  // The root is the level the index is inside, so its name is the context line.
  const heading = page.locator(".material-files__context-title span");
  const material = await page
    .locator(`[data-thought-id="${rootId}"] [data-thought-text-id]`)
    .innerText();

  // The document title is independent from the opening passage. It stays short
  // and stable while the visible root keeps the person's complete sentence.
  const title = (await heading.innerText()).trim();
  expect(title.length).toBeGreaterThan(1);
  expect(Array.from(title).length).toBeLessThanOrEqual(32);
  expect(title).toBe("被允许想象的其他生活");
  expect(material.startsWith(title)).toBe(false);

  // Every built-in seed passage has a product-owned localized name. Opening
  // the expanded index must not spend label requests on example copy.
  await expect(page.locator(".material-file")).toHaveCount(10);
  await page.waitForTimeout(300);
  expect(labelRequests).toHaveLength(0);
});

test("a name a person types survives a reload and outranks the model", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".material-files")).toHaveAttribute("data-persistence-phase", "saved");

  const row = page.locator(".material-file").first();
  await row.focus();
  await row.press("F2");
  await expect(row.locator(".material-file__rename")).toBeFocused();
  await row.locator(".material-file__rename").dispatchEvent("keydown", {
    key: "Escape",
    isComposing: true,
  });
  await expect(row.locator(".material-file__rename")).toBeVisible();
  await row.locator(".material-file__rename").press("Escape");
  await expect(row).toBeFocused();

  await openNameEditor(row.locator(".material-file__open"));
  const editor = row.locator(".material-file__rename");
  await expect(editor).toBeVisible();
  await editor.fill("过去的另一种生活");
  await editor.press("Enter");
  await expect(row).toBeFocused();
  await expect(row.locator(".material-file__title")).toHaveText("过去的另一种生活");
  await expect(row).toHaveAttribute("data-label-origin", "user");
  const renamedNodeId = await row.getAttribute("data-node-id");
  expect(renamedNodeId).not.toBeNull();

  // The name is durable, and nothing automatic may take it back.
  const labelRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/label")) return;
    const payload = request.postDataJSON() as { basis?: { nodeId?: unknown } } | null;
    if (payload?.basis?.nodeId === renamedNodeId) labelRequests.push(request.url());
  });
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const reloaded = page.locator(".material-file").first();
  await expect(reloaded.locator(".material-file__title")).toHaveText("过去的另一种生活");
  await page.waitForTimeout(500);
  expect(labelRequests).toHaveLength(0);

  // Search finds a row by the name that is actually on screen.
  await page.getByRole("button", { name: fixtureUiCopy.materialFiles.searchThoughts }).click();
  await page.getByRole("searchbox", { name: fixtureUiCopy.materialFiles.filterMaterialFiles }).fill("另一种");
  await expect(page.locator(".material-file")).toHaveCount(1);
  await page.getByRole("button", { name: fixtureUiCopy.materialFiles.closeSearch }).click();

  // Clearing the name returns the row to automatic naming.
  await openNameEditor(reloaded.locator(".material-file__open"));
  await reloaded.locator(".material-file__rename").fill("");
  await reloaded.locator(".material-file__rename").press("Enter");
  await expect(reloaded.locator(".material-file__title")).not.toHaveText("过去的另一种生活");
});

test("a manual name survives locale-owned label-driver replacement", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const row = page.locator(".material-file").first();
  await expect(row).toBeVisible();
  await row.focus();
  await row.press("F2");
  const editor = row.locator(".material-file__rename");
  await expect(editor).toBeFocused();
  await editor.fill("跨语言保留的名字");
  await editor.press("Enter");
  await expect(row.locator(".material-file__title")).toHaveText("跨语言保留的名字");

  await page.locator('[data-chrome-control="language"]').click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(row.locator(".material-file__title")).toHaveText("跨语言保留的名字");
  await expect(row).toHaveAttribute("data-label-origin", "user");
});

test("a label is generated once, not once per reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  // Seed names are fixed. A person-created Branch remains ordinary material
  // and proves the generated-label cache without spending on the example.
  const labelResponse = page.waitForResponse((response) => response.url().includes("/api/label"));
  await page.getByRole("button", {
    name: fixtureUiCopy.toolRail.extendRelatedThought,
    exact: true,
  }).click();
  await expect(page.locator(".material-file")).toHaveCount(11);
  await labelResponse;
  await page.waitForTimeout(400);
  const generatedRow = page.locator(".material-file").last();
  const generatedNodeId = await generatedRow.getAttribute("data-node-id");
  if (generatedNodeId === null) throw new Error("The generated Branch row is missing its node id.");
  const first = await generatedRow.locator(".material-file__title").innerText();

  const afterReload: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/label")) afterReload.push(request.url());
  });
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`.material-file[data-node-id="${generatedNodeId}"] .material-file__title`))
    .toHaveText(first);
  await page.waitForTimeout(600);
  expect(afterReload).toHaveLength(0);
});

/**
 * Opens the row's name editor through the component's own handler. Playwright's
 * synthetic double click interleaves a selection click and a re-render, which
 * makes the gesture — not the behaviour under test — the flaky part.
 *
 * The touch long press is deliberately not covered here: driving it through a
 * synthetic pointer sequence proved to test the harness rather than the
 * product. It is verified by hand in a real browser at 375 px.
 */
async function openNameEditor(target: Locator): Promise<void> {
  await target.dispatchEvent("dblclick");
}

test("a thought is named without waiting for the label endpoint", async ({ page }) => {
  await page.route("**/api/label", async () => {
    // Never fulfilled: the endpoint is indistinguishable from an outage.
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const title = page.locator(".material-file").first().locator(".material-file__title");
  await expect(title).not.toHaveText("");
  expect(Array.from((await title.innerText()).trim()).length).toBeLessThanOrEqual(32);
});
