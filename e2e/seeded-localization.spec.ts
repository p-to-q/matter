import { expect, test, type Page } from "@playwright/test";
import { CANVAS_LANGUAGE_OPTIONS } from "../features/matter/components/canvas-preferences";
import { SEEDED_DOCUMENT_NODE_IDS, SEEDED_DOCUMENT_TREE_ID } from "../features/matter/material/seeded-document";
import { seededNodeText } from "../features/matter/material/seeded-material-copy";

const PREFERENCES_KEY = "matter.canvas-preferences.v1";

test("the preview seed follows all five languages and keeps the last one after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");

  const html = page.locator("html");
  const root = seedText(page, SEEDED_DOCUMENT_NODE_IDS.root);
  const subtitle = seedText(page, SEEDED_DOCUMENT_NODE_IDS.imaginedLives);
  const languageControl = page.locator('[data-chrome-control="language"]');

  for (const option of CANVAS_LANGUAGE_OPTIONS) {
    await languageControl.click();
    await page.getByRole("menuitemradio", { name: option.label, exact: true }).click();

    await expect(html).toHaveAttribute("lang", option.value);
    await expect(root).toHaveText(seededNodeText(option.value, "root"));
    await expect(subtitle).toHaveText(seededNodeText(option.value, "imaginedLives"));
  }

  const finalLocale = CANVAS_LANGUAGE_OPTIONS.at(-1)?.value;
  if (finalLocale === undefined) throw new Error("The closed language list is empty.");
  const finalRoot = seededNodeText(finalLocale, "root");
  const finalSubtitle = seededNodeText(finalLocale, "imaginedLives");

  await expect.poll(() => storedSeedText(
    page,
    SEEDED_DOCUMENT_TREE_ID,
    SEEDED_DOCUMENT_NODE_IDS.root,
  )).toBe(finalRoot);
  await expect(page.locator(".material-files")).toHaveAttribute("data-persistence-phase", "saved");
  await page.reload();

  await expect(html).toHaveAttribute("lang", finalLocale);
  await expect(root).toHaveText(finalRoot);
  await expect(subtitle).toHaveText(finalSubtitle);
  await expect.poll(() => page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    return stored === null ? null : JSON.parse(stored).language;
  }, PREFERENCES_KEY)).toBe(finalLocale);
});

function seedText(page: Page, nodeId: string) {
  return page.locator(`[data-thought-text-id="${nodeId}"]`);
}

async function storedSeedText(page: Page, treeId: string, nodeId: string): Promise<string | null> {
  return page.evaluate(({ databaseName, id, targetNodeId }) => new Promise<string | null>((resolve) => {
    const request = indexedDB.open(databaseName);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction("snapshots", "readonly");
      const read = transaction.objectStore("snapshots").get(id);
      read.onerror = () => resolve(null);
      read.onsuccess = () => {
        const value = read.result as {
          bundle?: { files?: Record<string, string> };
        } | undefined;
        const files = value?.bundle?.files;
        database.close();
        if (files === undefined) {
          resolve(null);
          return;
        }
        const identityLine = `\nid: ${targetNodeId}\n`;
        const markdown = Object.values(files).find((content) =>
          typeof content === "string" && content.includes(identityLine),
        );
        if (markdown === undefined) {
          resolve(null);
          return;
        }
        const bodyStart = markdown.indexOf("\n---\n");
        resolve(bodyStart < 0 ? null : markdown.slice(bodyStart + 5).trim());
      };
    };
  }), { databaseName: "ptoq-matter", id: treeId, targetNodeId: nodeId });
}
