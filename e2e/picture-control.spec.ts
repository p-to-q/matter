import { addChildUnder } from "./under-driver";
import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { localizeOutcome } from "../features/matter/components/canvas-guidance";
import {
  CANVAS_LANGUAGE_OPTIONS,
  DEFAULT_CANVAS_PREFERENCES,
  type CanvasLanguage,
} from "../features/matter/components/canvas-preferences";
import { pictureControlCopy } from "../features/matter/components/picture-control-copy";
import { pictureCopy } from "../features/matter/components/picture-copy";
import { IMAGE_RESPONSE_HEADERS } from "../features/matter/protocol/image-contract";
import { SEEDED_DOCUMENT_NODE_IDS } from "../features/matter/material/seeded-document";
import { PICTURE_HEIGHT, PICTURE_WIDTH, PNG, readBlobRow } from "./picture-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT_ID = SEEDED_DOCUMENT_NODE_IDS.root;
const OTHER_ID = SEEDED_DOCUMENT_NODE_IDS.bodilyMemory;
const LANGUAGE = DEFAULT_CANVAS_PREFERENCES.language;
const copy = pictureControlCopy(LANGUAGE);
const PNG_SHA256 = createHash("sha256").update(PNG).digest("hex");

// The picture control renders only when the health read says `available`, and
// production has the gate off. These journeys answer that read and the image
// route in the browser; nothing in the application exposes a hook for it.
async function answerHealthAvailable(page: Page): Promise<void> {
  await page.route("**/api/health", (route) => route.fulfill({
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify({
      protocolVersion: 1,
      status: "ok",
      surfaces: { material: "available", imageGeneration: "available" },
    }),
  }));
}

type ImageRouteBehavior = "picture" | "shed" | "failed" | "hold";

type ImageRoute = {
  behavior: ImageRouteBehavior;
  bodies: unknown[];
  requests: number;
  aborted: number;
  deliver(): void;
};

async function routeImage(page: Page, initial: ImageRouteBehavior = "picture"): Promise<ImageRoute> {
  const held: Route[] = [];
  const state: ImageRoute = {
    behavior: initial,
    bodies: [],
    requests: 0,
    aborted: 0,
    deliver() {
      for (const route of held.splice(0)) void fulfillPicture(route);
    },
  };
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/image")) state.aborted += 1;
  });
  await page.route("**/api/image", async (route) => {
    state.requests += 1;
    state.bodies.push(route.request().postDataJSON());
    switch (state.behavior) {
      case "picture":
        await fulfillPicture(route);
        return;
      case "hold":
        held.push(route);
        return;
      case "shed":
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "IMAGE_UNAVAILABLE", message: "Busy.", retryable: true },
          }),
        });
        return;
      case "failed":
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "IMAGE_FAILED", message: "Failed.", retryable: false },
          }),
        });
    }
  });
  return state;
}

async function fulfillPicture(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      [IMAGE_RESPONSE_HEADERS.width]: String(PICTURE_WIDTH),
      [IMAGE_RESPONSE_HEADERS.height]: String(PICTURE_HEIGHT),
      [IMAGE_RESPONSE_HEADERS.sha256]: PNG_SHA256,
    },
    body: Buffer.from(PNG),
  }).catch(() => undefined);
}

async function openMatter(page: Page, viewport = { width: 1280, height: 800 }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
}

async function openPointTalk(page: Page, nodeId = ROOT_ID): Promise<Locator> {
  await page.locator(`[data-thought-text-id="${nodeId}"]`).hover();
  await page.locator("[data-node-action=point-talk]").click();
  const field = page.locator('.point-talk[data-presence="present"]');
  await expect(field).toHaveAttribute("data-placed", "");
  return field;
}

async function thoughtIds(page: Page): Promise<string[]> {
  return page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id")).filter((id): id is string => id !== null),
  );
}

function control(page: Page): Locator {
  return page.locator("[data-picture-control]");
}

async function drawToPreview(page: Page, field: Locator): Promise<void> {
  await control(page).click();
  await field.getByRole("button", { name: copy.draw, exact: true }).click();
  await expect(field.getByRole("button", { name: copy.keep, exact: true })).toBeVisible();
}

function previewImage(field: Locator): Locator {
  return field.locator('.passage-picture[data-picture-state="resident"] img');
}

function passagePicture(page: Page, nodeId = ROOT_ID): Locator {
  return page.locator(`[data-thought-id="${nodeId}"] .passage-picture[data-picture-state="resident"] img`);
}

async function decoded(image: Locator): Promise<number> {
  return image.evaluate((element) => (element as HTMLImageElement).naturalWidth);
}

async function undo(page: Page): Promise<void> {
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
}

async function persistCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls);
}

async function blobTransactions(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __blobTransactions: number }).__blobTransactions);
}

test.describe("the picture control", () => {
  test("a closed gate renders no control anywhere in the field", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const images = await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page);
    await expect(page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" })).toBeFocused();
    // The real health read answers `fixture` here, which is not a reason to offer a paid control.
    await page.waitForTimeout(600);
    await expect(control(page)).toHaveCount(0);
    const reached: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      reached.push(await page.evaluate(() => {
        const active = document.activeElement;
        return active?.closest(".point-talk") === null || active === null
          ? "outside"
          : (active.getAttribute("aria-label") ?? active.textContent ?? "").trim();
      }));
    }
    expect(reached.join("|")).not.toContain(copy.control);
    expect(reached.join("|")).not.toContain(copy.controlName);
    await expect(field.getByRole("button", { name: copy.control })).toHaveCount(0);
    expect(images.requests).toBe(0);
    expect(browserErrors).toEqual([]);
  });

  test("arm, back, draw, preview, Keep: one undoable step that survives a reload", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.addInitScript(() => {
      (window as unknown as { __blobTransactions: number }).__blobTransactions = 0;
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function transaction(
        this: IDBDatabase,
        stores: string | string[],
        ...rest: [IDBTransactionMode?, IDBTransactionOptions?]
      ) {
        if ((Array.isArray(stores) ? stores : [stores]).includes("blobs")) {
          (window as unknown as { __blobTransactions: number }).__blobTransactions += 1;
        }
        return original.call(this, stores, ...rest);
      } as typeof original;
      // Observe, without a production hook, whether the page asks for persistent storage.
      (window as unknown as { __persistCalls: number }).__persistCalls = 0;
      Object.defineProperty(StorageManager.prototype, "persist", {
        configurable: true,
        value: async () => {
          (window as unknown as { __persistCalls: number }).__persistCalls += 1;
          return true;
        },
      });
    });
    await answerHealthAvailable(page);
    const images = await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page);

    // Between the Voice button and the black submit button, and a plain text button.
    await expect(control(page)).toHaveText(copy.control);
    await expect(control(page)).toHaveAttribute("aria-label", copy.controlName);
    expect(copy.controlName).toContain(copy.control);
    const order = await field.evaluate((bubble) => Array.from(bubble.querySelectorAll("form button"))
      .map((button) => button.getAttribute("class") ?? ""));
    expect(order.map((name) => name.split(" ")[0])).toEqual([
      "point-talk__voice",
      "point-talk__text-button",
      "point-talk__submit",
    ]);
    const plain = await control(page).evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopWidth, icon: element.querySelector("svg") !== null };
    });
    expect(plain).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px", icon: false });

    // Arming never sends, and Back returns to the control.
    await control(page).click();
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
    await expect(field.getByText(copy.armWarningBilled, { exact: true })).toHaveCount(0);
    expect(images.requests).toBe(0);
    await field.getByRole("button", { name: copy.back, exact: true }).click();
    await expect(control(page)).toBeFocused();
    expect(images.requests).toBe(0);
    await page.keyboard.press("Enter");
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(control(page)).toBeFocused();
    await expect(field).toHaveCount(1);

    images.behavior = "hold";
    await control(page).click();
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.drawing, { exact: true })).toBeVisible();
    await expect(field.getByRole("button", { name: copy.stopWaiting, exact: true })).toBeFocused();
    await expect(page.locator('main [role="status"]').filter({ hasText: copy.announceDrawing }))
      .toHaveCount(1);
    expect(images.requests).toBe(1);
    images.behavior = "picture";
    images.deliver();

    const keep = field.getByRole("button", { name: copy.keep, exact: true });
    await expect(keep).toBeVisible();
    await expect(field.getByRole("button", { name: copy.discard, exact: true })).toBeVisible();
    await expect.poll(() => decoded(previewImage(field))).toBeGreaterThan(0);
    await expect(previewImage(field)).toHaveAttribute("alt", pictureCopy(LANGUAGE).alt);
    expect((await field.boundingBox())!.width).toBeLessThanOrEqual(280);
    // A press outside the bubble does not decline paid work.
    await page.locator(`[data-thought-text-id="${OTHER_ID}"]`).click();
    await expect(keep).toBeVisible();

    const before = await blobTransactions(page);
    // Nothing before Keep has asked the browser to keep storage persistent.
    expect(await persistCalls(page)).toBe(0);
    await keep.click();
    await expect(field).toHaveCount(0);
    // A Kept picture is paid and irreplaceable, so Keep asks, once.
    expect(await persistCalls(page)).toBe(1);
    await expect(passagePicture(page)).toHaveAttribute("alt", pictureCopy(LANGUAGE).alt);
    await expect.poll(() => decoded(passagePicture(page))).toBeGreaterThan(0);
    await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toBeFocused();
    await expect(page.locator('main [role="status"]').filter({ hasText: copy.announceKept }))
      .toHaveCount(1);
    expect(await blobTransactions(page)).toBeGreaterThan(before);
    expect(await readBlobRow(page, createHash("sha256").update(PNG).digest("hex"))).not.toBeNull();

    // Undo and Redo move the pointer alone: no network and no blob store.
    const quiet = await blobTransactions(page);
    await undo(page);
    await expect(page.locator(`[data-thought-id="${ROOT_ID}"] .passage-picture`)).toHaveCount(0);
    await page.keyboard.press("Control+Shift+Z");
    await expect(passagePicture(page)).toBeVisible();
    expect(await blobTransactions(page)).toBe(quiet);
    expect(images.requests).toBe(1);

    await expect(page.locator(".material-files")).toHaveAttribute("data-persistence-phase", "saved");
    await page.reload();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await expect.poll(() => decoded(passagePicture(page))).toBeGreaterThan(0);
    expect(browserErrors).toEqual([]);
  });

  test("the typed direction is not a picture direction, and nothing but Draw sends", async ({ page }) => {
    await answerHealthAvailable(page);
    const images = await routeImage(page, "hold");
    await openMatter(page);
    const field = await openPointTalk(page);
    const direction = page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" });
    await direction.fill("换一种更凝练的说法");
    await control(page).click();
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
    await field.getByRole("button", { name: copy.back, exact: true }).click();
    // The typed words wait where they were, untouched, and nothing was sent.
    await expect(direction).toHaveValue("换一种更凝练的说法");
    expect(images.requests).toBe(0);
    await control(page).click();
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.drawing, { exact: true })).toBeVisible();
    expect(images.requests).toBe(1);
    // The request carries the passage and never the direction.
    expect(Object.keys(images.bodies[0] as Record<string, unknown>).sort())
      .toEqual(["id", "locale", "passage", "protocolVersion", "requestVersion"]);
    expect(JSON.stringify(images.bodies[0])).not.toContain("更凝练");
  });

  test("Discard leaves no picture, no pointer, and nothing in the blob store", async ({ page }) => {
    await answerHealthAvailable(page);
    await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page);
    await drawToPreview(page, field);
    await field.getByRole("button", { name: copy.discard, exact: true }).click();
    await expect(field).toHaveCount(0);
    await expect(page.locator(`[data-thought-id="${ROOT_ID}"] .passage-picture`)).toHaveCount(0);
    expect(await readBlobRow(page, PNG_SHA256)).toBeNull();
    await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toBeFocused();
  });

  test("Stop waiting aborts the request, says so once, and the next arm warns", async ({ page }) => {
    await answerHealthAvailable(page);
    const images = await routeImage(page, "hold");
    await openMatter(page);
    const field = await openPointTalk(page);
    await control(page).click();
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.drawing, { exact: true })).toBeVisible();
    await field.getByRole("button", { name: copy.stopWaiting, exact: true }).click();
    await expect.poll(() => images.aborted).toBe(1);
    await expect(control(page)).toBeFocused();
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText(localizeOutcome({ owner: "picture", reason: "stopped" }, LANGUAGE));
    await control(page).click();
    await expect(field.getByText(copy.armWarningBilled, { exact: true })).toBeVisible();
  });

  test("a passage that changes while a picture is drawn makes it stale", async ({ page }) => {
    await answerHealthAvailable(page);
    const images = await routeImage(page, "hold");
    await page.route("**/api/text-swap", async (route) => {
      const envelope = route.request().postDataJSON() as {
        protocolVersion: "0.2";
        requestVersion: "text-swap/2";
        id: string;
        treeId: string;
        treeRevision: number;
        selection: { end: number };
      };
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
            nodeId: ROOT_ID,
            start: 0,
            end: envelope.selection.end,
            text: "我们也许怀念的，并不是一个曾经真实存在的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
            intent: "paraphrase",
          },
          presentation: { motionHint: "settle" },
        }),
      });
    });
    await openMatter(page);
    let field = await openPointTalk(page);
    await page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" }).fill("换一种更凝练的说法");
    await page.getByRole("button", { name: "改写", exact: true }).click();
    await expect(field).toHaveCount(0);

    field = await openPointTalk(page);
    await control(page).click();
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.drawing, { exact: true })).toBeVisible();
    // Undo restores the passage's earlier words under the drawing.
    await undo(page);
    await expect(field).toHaveCount(0);
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText(localizeOutcome({ owner: "picture", reason: "stale" }, LANGUAGE));
    images.deliver();
    await expect(page.locator(`[data-thought-id="${ROOT_ID}"] .passage-picture`)).toHaveCount(0);
    expect(await readBlobRow(page, PNG_SHA256)).toBeNull();
  });

  test("a shed request is retryable; a failed one is not, and the next arm repeats the warning", async ({ page }) => {
    await answerHealthAvailable(page);
    const images = await routeImage(page, "shed");
    await openMatter(page);
    const field = await openPointTalk(page);
    await control(page).click();
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.notDrawn, { exact: true })).toBeVisible();
    await expect(field.getByRole("button", { name: copy.tryAgain, exact: true })).toBeVisible();
    await field.getByRole("button", { name: copy.tryAgain, exact: true }).click();
    // The shed cost nothing, so the second arm carries no warning.
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
    images.behavior = "failed";
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.notDrawnUsed, { exact: true })).toBeVisible();
    await expect(field.getByRole("button", { name: copy.tryAgain, exact: true })).toHaveCount(0);
    await field.getByRole("button", { name: copy.back, exact: true }).click();
    await expect(control(page)).toBeFocused();
    await control(page).click();
    await expect(field.getByText(copy.armWarningBilled, { exact: true })).toBeVisible();
    expect(images.requests).toBe(2);
  });

  test("while one picture is drawn nothing else can start one", async ({ page }) => {
    await answerHealthAvailable(page);
    const images = await routeImage(page, "hold");
    await openMatter(page);
    const field = await openPointTalk(page);
    await control(page).click();
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByText(copy.drawing, { exact: true })).toBeVisible();
    await page.locator(`[data-thought-text-id="${OTHER_ID}"]`).hover();
    await page.locator(`[data-thought-text-id="${OTHER_ID}"]`).click();
    await page.waitForTimeout(300);
    await expect(page.locator(".point-talk")).toHaveCount(1);
    await expect(field.getByText(copy.drawing, { exact: true })).toBeVisible();
    await expect(page.locator("[data-node-action=point-talk]")).toHaveCount(0);
    expect(images.requests).toBe(1);
  });

  test("a second tab is refused while the first is drawing, and may draw once the first has its picture", async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await answerHealthAvailable(first);
    await answerHealthAvailable(second);
    const firstImages = await routeImage(first, "hold");
    const secondImages = await routeImage(second, "hold");
    await openMatter(first);
    await openMatter(second);

    const firstField = await openPointTalk(first);
    await control(first).click();
    await firstField.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(firstField.getByText(copy.drawing, { exact: true })).toBeVisible();
    await expect.poll(() => firstImages.requests).toBe(1);

    const secondField = await openPointTalk(second);
    await control(second).click();
    await secondField.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(secondField.getByText(copy.anotherInFlight, { exact: true })).toBeVisible();
    // Refused before anything was sent, so nothing could be billed.
    expect(secondImages.requests).toBe(0);
    expect(firstImages.requests).toBe(1);
    await expect(firstField.getByText(copy.drawing, { exact: true })).toBeVisible();

    // The first tab's picture arrives and its wait is over, which frees the other tab.
    firstImages.behavior = "picture";
    firstImages.deliver();
    await expect(firstField.getByRole("button", { name: copy.keep, exact: true })).toBeVisible();
    await secondField.getByRole("button", { name: copy.tryAgain, exact: true }).click();
    await secondField.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(secondField.getByText(copy.drawing, { exact: true })).toBeVisible();
    await expect.poll(() => secondImages.requests).toBe(1);
  });

  test("a paid picture survives another tab's save and a language switch, and Keep still works", async ({ context }) => {
    const browserErrors: string[] = [];
    const reader = await context.newPage();
    const writer = await context.newPage();
    reader.on("pageerror", (error) => browserErrors.push(error.message));
    await answerHealthAvailable(reader);
    await routeImage(reader);
    await openMatter(reader);
    await openMatter(writer);
    for (const page of [reader, writer]) {
      await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
    }
    const field = await openPointTalk(reader);
    await drawToPreview(reader, field);
    const shell = reader.locator("main.matter-shell");
    const revisionBefore = await shell.getAttribute("data-tree-revision");
    const passage = reader.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    const wording = await passage.innerText();

    // Another tab saves a branch; this tab would normally take it up at once.
    const written = await addChildUnder(writer, ROOT_ID, { settle: "committed" });
    await expect(writer.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
    await reader.waitForTimeout(900);
    await expect(reader.locator(`[data-thought-id="${written}"]`)).toHaveCount(0);
    await expect(shell).toHaveAttribute("data-tree-revision", revisionBefore!);
    await expect(field.getByRole("button", { name: copy.keep, exact: true })).toBeVisible();
    await expect(previewImage(field)).toBeVisible();

    // A language switch relocalizes seed copy only once the picture has settled.
    const german = pictureControlCopy("de-DE");
    const option = CANVAS_LANGUAGE_OPTIONS.find((candidate) => candidate.value === "de-DE")!;
    await reader.locator('[data-chrome-control="language"]').click();
    await reader.getByRole("menuitemradio", { name: option.label, exact: true }).click();
    await expect(field.getByRole("button", { name: german.keep, exact: true })).toBeVisible();
    await expect(field.getByRole("button", { name: german.discard, exact: true })).toBeVisible();
    await expect(previewImage(field)).toBeVisible();
    await reader.waitForTimeout(600);
    await expect(passage).toHaveText(wording);

    await field.getByRole("button", { name: german.keep, exact: true }).click();
    await expect(field).toHaveCount(0);
    await expect(passagePicture(reader)).toBeVisible();
    // Settled, the deferred relocalization runs, and the kept picture stays on its passage.
    await expect(passage).not.toHaveText(wording);
    await expect(passagePicture(reader)).toBeVisible();
    expect(await readBlobRow(reader, PNG_SHA256)).not.toBeNull();
    expect(browserErrors).toEqual([]);
  });

  test("the whole turn is reachable by keyboard alone", async ({ page }) => {
    await answerHealthAvailable(page);
    await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page);
    await expect(page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" })).toBeFocused();
    for (let step = 0; step < 4; step += 1) {
      if (await control(page).evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(control(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(field.getByRole("button", { name: copy.draw, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field.getByRole("button", { name: copy.keep, exact: true })).toBeVisible();
    // The arrival is said, and the preview group has a name to read.
    await expect(page.locator('main [role="status"]').filter({ hasText: copy.announceArrived }))
      .toHaveCount(1);
    const group = field.getByRole("group", { name: pictureCopy(LANGUAGE).alt });
    await expect(group).toBeFocused();
    // A paid picture is not thrown away by the most incidental key: Escape only
    // returns focus to the Keep and Discard group.
    await field.getByRole("button", { name: copy.keep, exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(group).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(field.getByRole("button", { name: copy.keep, exact: true })).toBeVisible();
    await expect(previewImage(field)).toBeVisible();
    // Discard is the explicit control, and it is reachable from the group by Tab.
    await page.keyboard.press("Tab");
    await expect(field.getByRole("button", { name: copy.keep, exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field.getByRole("button", { name: copy.discard, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field).toHaveCount(0);
    await expect(page.locator(`[data-thought-id="${ROOT_ID}"] .passage-picture`)).toHaveCount(0);
    await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toBeFocused();
  });

  test("the field stays inside a 390 px screen in every language", async ({ page }) => {
    await answerHealthAvailable(page);
    await routeImage(page, "hold");
    await openMatter(page);
    const languageControl = page.locator('[data-chrome-control="language"]');
    for (const option of CANVAS_LANGUAGE_OPTIONS) {
      // The language menu is a desktop control; the field is judged at phone width.
      await page.setViewportSize({ width: 1280, height: 800 });
      await languageControl.click();
      await page.getByRole("menuitemradio", { name: option.label, exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
      const localized = pictureControlCopy(option.value as CanvasLanguage);
      const field = await openPointTalk(page);
      await expect(control(page)).toHaveText(localized.control);
      await expect(control(page)).toHaveAttribute("aria-label", localized.controlName);
      const row = await field.evaluate((bubble) => {
        const rect = bubble.getBoundingClientRect();
        const form = bubble.querySelector("form")!;
        return {
          right: rect.right,
          left: rect.left,
          height: rect.height,
          overflowing: form.scrollWidth > form.clientWidth + 1,
          page: document.documentElement.scrollWidth,
        };
      });
      expect(row.left).toBeGreaterThanOrEqual(0);
      expect(row.right).toBeLessThanOrEqual(390);
      expect(row.overflowing).toBe(false);
      expect(row.page).toBeLessThanOrEqual(390);
      await control(page).click();
      const arm = await field.evaluate((bubble) => {
        const rect = bubble.getBoundingClientRect();
        return { left: rect.left, right: rect.right, page: document.documentElement.scrollWidth };
      });
      expect(arm.left).toBeGreaterThanOrEqual(0);
      expect(arm.right).toBeLessThanOrEqual(390);
      expect(arm.page).toBeLessThanOrEqual(390);
      await expect(field.getByText(localized.armStatement, { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.locator(".point-talk")).toHaveCount(0);
    }
  });

  test("German and Chinese copy appear when the language is switched", async ({ page }) => {
    await answerHealthAvailable(page);
    await routeImage(page);
    await openMatter(page);
    const languageControl = page.locator('[data-chrome-control="language"]');
    for (const language of ["de-DE", "zh-CN"] as const) {
      const option = CANVAS_LANGUAGE_OPTIONS.find((candidate) => candidate.value === language)!;
      await languageControl.click();
      await page.getByRole("menuitemradio", { name: option.label, exact: true }).click();
      const localized = pictureControlCopy(language);
      const field = await openPointTalk(page);
      await expect(control(page)).toHaveText(localized.control);
      await control(page).click();
      await expect(field.getByText(localized.armStatement, { exact: true })).toBeVisible();
      await field.getByRole("button", { name: localized.draw, exact: true }).click();
      await expect(field.getByRole("button", { name: localized.keep, exact: true })).toBeVisible();
      await expect(field.getByRole("button", { name: localized.discard, exact: true })).toBeVisible();
      await previewImage(field).waitFor();
      await expect(previewImage(field)).toHaveAttribute("alt", pictureCopy(language).alt);
      await field.getByRole("button", { name: localized.discard, exact: true }).click();
      await expect(page.locator(".point-talk")).toHaveCount(0);
    }
  });
});

