import { addChildUnder } from "./under-driver";
import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { localizeOutcome } from "../features/matter/components/canvas-guidance";
import {
  CANVAS_LANGUAGE_OPTIONS,
  CANVAS_PREFERENCES_STORAGE_KEY,
  DEFAULT_CANVAS_PREFERENCES,
  type CanvasLanguage,
} from "../features/matter/components/canvas-preferences";
import { pictureControlCopy } from "../features/matter/components/picture-control-copy";
import { pictureCopy } from "../features/matter/components/picture-copy";
import { IMAGE_RESPONSE_HEADERS } from "../features/matter/protocol/image-contract";
import { SEEDED_DOCUMENT_NODE_IDS } from "../features/matter/material/seeded-document";
import {
  PICTURE_HEIGHT,
  PICTURE_WIDTH,
  PNG,
  pictureOfSize,
  plainArchiveOf,
  readBlobRow,
  replaceWith,
  withPictureOn,
  type PictureFixture,
} from "./picture-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT_ID = SEEDED_DOCUMENT_NODE_IDS.root;
const OTHER_ID = SEEDED_DOCUMENT_NODE_IDS.bodilyMemory;
const LANGUAGE = DEFAULT_CANVAS_PREFERENCES.language;
const copy = pictureControlCopy(LANGUAGE);
const PNG_SHA256 = createHash("sha256").update(PNG).digest("hex");

// Health admits drawing, not discovery; production keeps paid work off.
// These journeys answer that read and the image
// route in the browser; nothing in the application exposes a hook for it.
type HealthRoute = { requests: number; answered: number };
const HEALTH = new WeakMap<Page, HealthRoute>();

async function answerHealth(
  page: Page,
  options: Readonly<{ answer?: "available" | "unavailable"; delayMs?: number; heldUntil?: Promise<void> }> = {},
): Promise<HealthRoute> {
  const state: HealthRoute = { requests: 0, answered: 0 };
  HEALTH.set(page, state);
  await page.route("**/api/health", async (route) => {
    state.requests += 1;
    await options.heldUntil;
    if (options.delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    await route.fulfill({
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({
        protocolVersion: 1,
        status: "ok",
        surfaces: { material: "available", imageGeneration: options.answer ?? "available" },
      }),
    }).catch(() => undefined);
    state.answered += 1;
  });
  return state;
}

async function answerHealthAvailable(page: Page): Promise<void> {
  await answerHealth(page);
}

type ImageRouteBehavior = "picture" | "shed" | "failed" | "hold";

type ImageRoute = {
  behavior: ImageRouteBehavior;
  /** What a delivered picture is; the default is the 512 × 256 landscape fixture. */
  picture: PictureFixture;
  bodies: unknown[];
  requests: number;
  aborted: number;
  deliver(): void;
};

const DEFAULT_PICTURE: PictureFixture = {
  png: PNG,
  sha256: PNG_SHA256,
  pointer: {
    mediaType: "image/png",
    byteLength: PNG.byteLength,
    width: PICTURE_WIDTH,
    height: PICTURE_HEIGHT,
    contentHash: PNG_SHA256,
  },
};

async function routeImage(
  page: Page,
  initial: ImageRouteBehavior = "picture",
  picture: PictureFixture = DEFAULT_PICTURE,
): Promise<ImageRoute> {
  const held: Route[] = [];
  const state: ImageRoute = {
    behavior: initial,
    picture,
    bodies: [],
    requests: 0,
    aborted: 0,
    deliver() {
      for (const route of held.splice(0)) void fulfillPicture(route, state.picture);
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
        await fulfillPicture(route, state.picture);
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

async function fulfillPicture(route: Route, picture: PictureFixture): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      [IMAGE_RESPONSE_HEADERS.width]: String(picture.pointer.width),
      [IMAGE_RESPONSE_HEADERS.height]: String(picture.pointer.height),
      [IMAGE_RESPONSE_HEADERS.sha256]: picture.sha256,
    },
    body: Buffer.from(picture.png),
  }).catch(() => undefined);
}

async function openMatter(page: Page, viewport = { width: 1280, height: 800 }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
}

async function openPointTalk(
  page: Page,
  nodeId: string = ROOT_ID,
  options: Readonly<{ settled?: boolean }> = {},
): Promise<Locator> {
  await page.locator(`[data-thought-text-id="${nodeId}"]`).hover();
  const health = HEALTH.get(page);
  // The mark's own read answers before anyone could press it: the field's row
  // is decided at the press, so a journey that wants the control waits for the
  // answer the way a person's pause on the mark does.
  if (health !== undefined && options.settled !== false) {
    await expect.poll(() => health.answered, { message: "the mark asked, and was answered" })
      .toBeGreaterThan(0);
  }
  await page.locator("[data-node-action=point-talk]").click();
  const field = page.locator('.point-talk[data-presence="present"]');
  await expect(field).toHaveAttribute("data-placed", "");
  return field;
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
  test("a closed gate keeps the plain entry visible, explains it and sends no image request", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const images = await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page);
    await expect(page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" })).toBeFocused();
    // The real health read answers `fixture`, which does not admit paid work.
    await page.waitForTimeout(600);
    await expect(control(page)).toBeVisible();
    await expect(control(page)).toHaveAttribute("aria-disabled", "true");
    await expect(control(page)).toHaveAccessibleDescription(copy.unavailable);
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
    expect(reached).toContain(copy.controlName);
    await control(page).focus();
    await page.keyboard.press("Enter");
    await expect(field.getByRole("status")).toHaveText(copy.unavailable);
    await expect(control(page)).toBeFocused();
    await expect(field.locator(".point-talk__voice")).toBeVisible();
    await expect(field.locator(".point-talk__submit")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("drawing-entry-closed.png") });
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

    // The layout width: the entrance scales the painted box for a moment.
    const layoutWidth = () => field.evaluate((element) => (element as HTMLElement).offsetWidth);
    const rowWidth = await layoutWidth();
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
    // The wait says how long it may be, once, quietly, under the step's own words.
    await expect(field.getByText(copy.drawingExpectation, { exact: true })).toHaveCount(1);
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
    // The preview keeps the row's width: the field never changes size under its steps.
    expect(await layoutWidth()).toBe(rowWidth);
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

// ---------------------------------------------------------------------------
// The popup's action row, when its control starts, and the picture's proportions.
// ---------------------------------------------------------------------------

const ALL_LANGUAGES = CANVAS_LANGUAGE_OPTIONS.map((option) => option.value as CanvasLanguage);

async function prefer(
  page: Page,
  language: CanvasLanguage,
  appearance: "light" | "dark" = "light",
): Promise<void> {
  await page.addInitScript(({ key, preferences }) => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch { /* a blocked store leaves the default language */ }
  }, {
    key: CANVAS_PREFERENCES_STORAGE_KEY,
    preferences: { version: 1, language, leafFx: false, appearance },
  });
}

/** A press on the passage's mark: a hover with a fine pointer, a tap with a coarse one. */
async function openField(page: Page, coarse: boolean, nodeId = ROOT_ID): Promise<Locator> {
  if (!coarse) {
    const field = await openPointTalk(page, nodeId);
    await page.waitForTimeout(350);
    return field;
  }
  await page.locator(`[data-thought-text-id="${nodeId}"]`).tap();
  const health = HEALTH.get(page);
  if (health !== undefined) await expect.poll(() => health.answered).toBeGreaterThan(0);
  await page.locator("[data-node-action=point-talk]").tap();
  const field = page.locator('.point-talk[data-presence="present"]');
  await expect(field).toHaveAttribute("data-placed", "");
  await page.waitForTimeout(350);
  return field;
}

type Box = Readonly<{ x: number; y: number; w: number; h: number; right: number; bottom: number }>;
type ButtonBox = Box & Readonly<{ text: number }>;
type RowGeometry = Readonly<{
  scale: number;
  field: Box;
  input: Box;
  innerWidth: number;
  paddingRight: number;
  mic: Box;
  draw: ButtonBox | null;
  submit: ButtonBox;
  wrapped: boolean;
  clipped: readonly string[];
  rail: Box | null;
  pageWidth: number;
  viewportWidth: number;
}>;

/** The action row as the browser laid it out, in client pixels. */
async function rowGeometry(field: Locator): Promise<RowGeometry> {
  return field.evaluate((root) => {
    const box = (element: Element | null) => {
      if (element === null) throw new Error("the row is missing a part");
      const rect = element.getBoundingClientRect();
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height, right: rect.right, bottom: rect.bottom };
    };
    const textWidth = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().width;
    };
    const form = root.querySelector("form");
    if (form === null) throw new Error("the form row is missing");
    const mic = root.querySelector(".point-talk__voice");
    const drawElement = root.querySelector("[data-picture-control]");
    const submit = root.querySelector(".point-talk__submit");
    if (submit === null) throw new Error("the submit button is missing");
    const clipped = Array.from(root.querySelectorAll<HTMLElement>("form button, form"))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.getAttribute("class") ?? element.tagName);
    const formStyle = getComputedStyle(form);
    const bubbleStyle = getComputedStyle(root);
    const rail = document.querySelector(".tool-rail");
    const railBox = rail === null || getComputedStyle(rail).display === "none" ? null : box(rail);
    const wrapRows = new Set(Array.from(root.querySelectorAll("form button")).map((button) =>
      Math.round(button.getBoundingClientRect().top)));
    const inputBox = box(root.querySelector("input"));
    const submitBox = box(submit);
    return {
      scale: Number.parseFloat(bubbleStyle.getPropertyValue("--point-talk-scale")) || 1,
      field: box(root),
      input: inputBox,
      innerWidth: form.clientWidth - Number.parseFloat(formStyle.paddingLeft) - Number.parseFloat(formStyle.paddingRight),
      paddingRight: Number.parseFloat(formStyle.paddingRight),
      mic: box(mic),
      draw: drawElement === null ? null : { ...box(drawElement), text: textWidth(drawElement) },
      submit: { ...submitBox, text: textWidth(submit) },
      // The input and the cluster are on different lines.
      wrapped: submitBox.y >= inputBox.bottom - 1 || wrapRows.size > 1,
      clipped,
      rail: railBox,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
}

function expectCloseTo(actual: number, expected: number, tolerance: number, what: string): void {
  expect(Math.abs(actual - expected), `${what}: ${actual} against ${expected}`).toBeLessThanOrEqual(tolerance);
}

/** Everything the owner asked of the row, for one opening of one language at one width. */
function expectRow(g: RowGeometry, options: Readonly<{ coarse: boolean; label: string }>): void {
  const { label } = options;
  const s = g.scale;
  const gap = 4 * s;
  const hit = options.coarse ? 48 : 30 * s;
  // Nothing clipped; nothing overlapping the rail or leaving the screen.
  expect(g.clipped, `${label}: clipped`).toEqual([]);
  expect(g.field.x, `${label}: left edge`).toBeGreaterThanOrEqual(0);
  expect(g.field.right, `${label}: right edge`).toBeLessThanOrEqual(g.viewportWidth + 0.5);
  expect(g.pageWidth, `${label}: page scroll`).toBeLessThanOrEqual(g.viewportWidth);
  if (g.rail !== null) {
    const overlaps = g.field.x < g.rail.right && g.field.right > g.rail.x &&
      g.field.y < g.rail.bottom && g.field.bottom > g.rail.y;
    expect(overlaps, `${label}: overlaps the tool rail`).toBe(false);
  }
  // Every button keeps its hit area and the room its own label needs.
  expect(g.mic.w, `${label}: voice width`).toBeGreaterThanOrEqual(hit - 0.5);
  expect(g.mic.h, `${label}: voice height`).toBeGreaterThanOrEqual(hit - 0.5);
  expect(g.submit.h, `${label}: Rewrite height`).toBeGreaterThanOrEqual(hit - 0.5);
  expect(g.submit.w, `${label}: Rewrite width`).toBeGreaterThanOrEqual(g.submit.text + 16 * s - 0.6);
  if (g.draw !== null) {
    expect(g.draw.h, `${label}: Draw height`).toBeGreaterThanOrEqual(hit - 0.5);
    expect(g.draw.w, `${label}: Draw width`).toBeGreaterThanOrEqual(g.draw.text + 16 * s - 0.6);
  }
  // The cluster is right-aligned to the Rewrite button's edge, in one order and one rhythm.
  expectCloseTo(g.field.right - g.submit.right, g.paddingRight + 1, 0.6, `${label}: Rewrite's right edge`);
  const cluster = g.draw === null ? [g.mic, g.submit] : [g.mic, g.draw, g.submit];
  for (let index = 1; index < cluster.length; index += 1) {
    expectCloseTo(cluster[index]!.x - cluster[index - 1]!.right, gap, 0.6, `${label}: gap ${index}`);
    expectCloseTo(cluster[index]!.y + cluster[index]!.h / 2, cluster[0]!.y + cluster[0]!.h / 2, 1, `${label}: one line`);
  }
  // Only the input flexes, and never below its floor.
  expect(g.input.w, `${label}: input width`).toBeGreaterThanOrEqual(112 * s - 0.5);
  // The cluster leaves the input's row exactly when the floor cannot be kept beside it.
  const clusterWidth = cluster.reduce((total, part) => total + part.w, 0) + gap * (cluster.length - 1);
  const slack = g.innerWidth - (112 * s + gap + clusterWidth);
  if (Math.abs(slack) > 1) expect(g.wrapped, `${label}: wrap (slack ${slack})`).toBe(slack < 0);
  if (g.wrapped) {
    expect(g.mic.y, `${label}: cluster under the input`).toBeGreaterThanOrEqual(g.input.bottom - 1);
    expectCloseTo(g.input.w, g.innerWidth, 1, `${label}: the input takes its whole row`);
  } else {
    expectCloseTo(g.input.y + g.input.h / 2, g.mic.y + g.mic.h / 2, 1, `${label}: the input shares the line`);
  }
}

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } as const;

async function measureRowOnce(
  page: Page,
  language: CanvasLanguage,
  options: Readonly<{ control: boolean; coarse: boolean; viewport: Readonly<{ width: number; height: number }>; appearance?: "light" | "dark" }>,
): Promise<RowGeometry> {
  await prefer(page, language, options.appearance ?? "light");
  if (options.control) await answerHealth(page);
  await openMatter(page, options.viewport);
  const field = await openField(page, options.coarse);
  await expect(control(page)).toBeVisible();
  if (!options.control) await expect(control(page)).toHaveAttribute("aria-disabled", "true");
  return rowGeometry(field);
}

test.describe("the popup's action row on a desktop screen", () => {
  for (const language of ALL_LANGUAGES) {
    test(`${language}: one row, nothing clipped and availability never shrinks the input or controls`, async ({ context, page }) => {
      const viewport = { width: 1280, height: 800 };
      const baseline = await context.newPage();
      const without = await measureRowOnce(baseline, language, { control: false, coarse: false, viewport });
      await baseline.close();
      const withControl = await measureRowOnce(page, language, { control: true, coarse: false, viewport });

      expectRow(without, { coarse: false, label: `${language} without the control` });
      expectRow(withControl, { coarse: false, label: `${language} with the control` });
      // Both openings reserve the entry's width; a closed service cannot shrink the row.
      expectCloseTo(without.field.w, 264 * without.scale + without.draw!.w + 4 * without.scale, 1.6, `${language}: reserved width`);
      expect(without.wrapped).toBe(false);
      expect(withControl.wrapped).toBe(false);
      expectCloseTo(withControl.field.w, without.field.w, 1.6, `${language}: stable field`);
      expectCloseTo(withControl.input.w, without.input.w, 1.6, `${language}: input width with and without the control`);
      // Rewrite is the rightmost control, then Draw, then the microphone, right to left.
      expect(withControl.submit.x).toBeGreaterThan(withControl.draw!.right - 0.5);
      expect(withControl.draw!.x).toBeGreaterThan(withControl.mic.right - 0.5);
      expect(withControl.mic.x).toBeGreaterThan(withControl.input.right - 0.5);
    });
  }

  for (const language of ["en-US", "de-DE"] as const) {
    test(`${language}: the same holds in the dark theme`, async ({ page }) => {
      const viewport = { width: 1280, height: 800 };
      const geometry = await measureRowOnce(page, language, { control: true, coarse: false, viewport, appearance: "dark" });
      await expect(page.locator(".matter-document")).toHaveAttribute("data-canvas-theme", "dark");
      expectRow(geometry, { coarse: false, label: `${language} dark` });
      expect(geometry.wrapped).toBe(false);
      await page.screenshot({ path: test.info().outputPath(`drawing-entry-${language}-dark.png`) });
    });
  }
});

test.describe("the popup's action row on a phone", () => {
  test.use(PHONE);

  for (const language of ALL_LANGUAGES) {
    test(`${language}: 48 px targets, nothing clipped or under the rail, and the cluster leaves the input only when it must`, async ({ page }) => {
      const geometry = await measureRowOnce(page, language, {
        control: true,
        coarse: true,
        viewport: PHONE.viewport,
      });
      expectRow(geometry, { coarse: true, label: `${language} on a phone` });
      expect(geometry.field.right).toBeLessThanOrEqual(PHONE.viewport.width - 12);
    });
  }

  test("a closed service preserves the same phone control targets in every language", async ({ context }) => {
    for (const language of ALL_LANGUAGES) {
      const page = await context.newPage();
      const geometry = await measureRowOnce(page, language, {
        control: false,
        coarse: true,
        viewport: PHONE.viewport,
      });
      await page.close();
      expectRow(geometry, { coarse: true, label: `${language} on a phone, no control` });
      expect(geometry.draw!.h, language).toBeGreaterThanOrEqual(48);
    }
  });
});

test.describe("when even the grown field cannot keep the input its floor", () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

  test("the whole cluster takes a row of its own under the input, still right-aligned, with 48 px targets", async ({ page }) => {
    const geometry = await measureRowOnce(page, "de-DE", {
      control: true,
      coarse: true,
      viewport: { width: 320, height: 640 },
    });
    expectRow(geometry, { coarse: true, label: "de-DE at 320" });
    expect(geometry.wrapped).toBe(true);
    expect(geometry.draw!.h).toBeGreaterThanOrEqual(47.5);
    expect(geometry.submit.h).toBeGreaterThanOrEqual(47.5);
    // The input has the field's whole width on its own row.
    expect(geometry.input.w).toBeGreaterThan(geometry.innerWidth - 1.5);
  });
});

test.describe("when the control starts", () => {
  test("is asked when a passage shows its mark, never by loading the page, and not again for every press", async ({ page }) => {
    const health = await answerHealth(page);
    await routeImage(page);
    await openMatter(page);
    await page.waitForTimeout(1_200);
    // Page load alone, and a pointer elsewhere on the paper, ask nothing.
    expect(health.requests).toBe(0);
    await page.mouse.move(700, 700);
    await page.waitForTimeout(400);
    expect(health.requests).toBe(0);

    // The mark appears and the read starts, before anyone has pressed it.
    await page.locator(`[data-thought-text-id="${ROOT_ID}"]`).hover();
    await expect(page.locator("[data-node-action=point-talk]")).toBeVisible();
    await expect.poll(() => health.requests).toBe(1);
    await expect.poll(() => health.answered).toBe(1);

    // The field opens with its control already there, and asks nothing more.
    await page.locator("[data-node-action=point-talk]").click();
    await expect(control(page)).toBeVisible();
    expect(health.requests).toBe(1);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(".point-talk")).toHaveCount(0);
    for (let round = 0; round < 3; round += 1) {
      await openPointTalk(page, ROOT_ID);
      await expect(control(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.locator(".point-talk")).toHaveCount(0);
    }
    expect(health.requests).toBe(1);
  });

  test("a closed deployment costs one health request for any number of marks and presses", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/health")) requests.push(request.url());
    });
    await openMatter(page);
    await page.waitForTimeout(1_000);
    expect(requests).toHaveLength(0);
    for (let round = 0; round < 4; round += 1) {
      await page.locator(`[data-thought-text-id="${ROOT_ID}"]`).hover();
      await expect(page.locator("[data-node-action=point-talk]")).toBeVisible();
      await page.locator("[data-node-action=point-talk]").click();
      await expect(page.locator('.point-talk[data-presence="present"]')).toHaveAttribute("data-placed", "");
      await expect(control(page)).toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Escape");
      await expect(page.locator(".point-talk")).toHaveCount(0);
    }
    expect(requests).toHaveLength(1);
  });

  test("an answer that arrives after the field opened applies to the next opening; the open row never moves", async ({ page }) => {
    let releaseHealth!: () => void;
    const heldUntil = new Promise<void>((resolve) => { releaseHealth = resolve; });
    // A failed observation must not leave its intercepted request held forever.
    page.once("close", releaseHealth);
    const health = await answerHealth(page, { heldUntil });
    await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page, ROOT_ID, { settled: false });
    // Sample the row on every frame while the answer is still on its way and after it lands.
    await field.evaluate((root) => {
      const samples: Array<{ input: number; field: number; controls: number }> = [];
      (window as unknown as { __rowSamples: typeof samples }).__rowSamples = samples;
      const tick = () => {
        const input = root.querySelector("input");
        if (input !== null) {
          // Layout widths: the entrance scales the painted box for a moment.
          samples.push({
            input: input.offsetWidth,
            field: (root as HTMLElement).offsetWidth,
            controls: root.querySelectorAll("form button").length,
          });
        }
        if (root.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const layoutWidth = () => field.evaluate((element) => (element as HTMLElement).offsetWidth);
    const opened = await layoutWidth();
    expect(health.answered).toBe(0);
    // Release only after opening and sampling: a slow host cannot turn a
    // nominal timer delay into an answer that predates the observation.
    await expect.poll(() => page.evaluate(() => (window as unknown as {
      __rowSamples: unknown[];
    }).__rowSamples.length)).toBeGreaterThan(20);
    releaseHealth();
    await expect.poll(() => health.answered, { timeout: 5_000 }).toBe(1);
    await page.waitForTimeout(600);
    // The answer was `available`, and this opening did not hear it.
    await expect(control(page)).toHaveAttribute("aria-disabled", "true");
    expect(await layoutWidth()).toBe(opened);
    const samples = await page.evaluate(() => (window as unknown as {
      __rowSamples: Array<{ input: number; field: number; controls: number }>;
    }).__rowSamples);
    expect(samples.length).toBeGreaterThan(20);
    expect(new Set(samples.map((sample) => sample.controls)).size).toBe(1);
    expect(Math.max(...samples.map((sample) => sample.input)) - Math.min(...samples.map((sample) => sample.input)))
      .toBeLessThanOrEqual(0.5);
    expect(Math.max(...samples.map((sample) => sample.field)) - Math.min(...samples.map((sample) => sample.field)))
      .toBeLessThanOrEqual(0.5);

    // The next opening admits drawing without changing the already reserved row.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(".point-talk")).toHaveCount(0);
    const reopened = await openPointTalk(page, ROOT_ID);
    await expect(control(page)).toBeVisible();
    await expect(control(page)).not.toHaveAttribute("aria-disabled", "true");
    const reopenedWidth = await reopened.evaluate((element) => (element as HTMLElement).offsetWidth);
    expect(reopenedWidth).toBe(opened);
    expect(health.requests).toBe(1);
  });

  test("a press that lands while the picture store is still opening is carried out the moment it is ready", async ({ page }) => {
    await answerHealthAvailable(page);
    await routeImage(page, "hold");
    await openMatter(page);
    const field = await openPointTalk(page);
    // The control is there from the first frame; its press arms the turn whenever the store is ready.
    await expect(control(page)).toBeVisible();
    await control(page).click();
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
  });
});

test.describe("one focus rule for every control in the field", () => {
  test("a returned spoken direction preserves outside focus when request identity is unavailable", async ({ page }) => {
    let releaseTranscript!: () => void;
    let receivedTranscript!: () => void;
    const transcriptGate = new Promise<void>((resolve) => { releaseTranscript = resolve; });
    const transcriptReceived = new Promise<void>((resolve) => { receivedTranscript = resolve; });
    let swapRequests = 0;
    await page.route(/\/api\/transcribe(?:\?|$)/u, async (route) => {
      receivedTranscript();
      await transcriptGate;
      await route.continue();
    });
    await page.route("**/api/text-swap", async (route) => {
      swapRequests += 1;
      await route.abort();
    });
    await openMatter(page);
    const field = await openPointTalk(page);
    await expect(field.getByRole("textbox")).toBeFocused();
    await field.getByRole("button", { name: "说出改写方向", exact: true }).click();
    await expect(field).toHaveAttribute("data-phase", "recording");
    await page.waitForTimeout(350);
    await field.getByRole("button", { name: "完成", exact: true }).click();
    await transcriptReceived;
    const about = page.locator('[data-chrome-control="about"]');
    await about.focus();
    await page.evaluate(() => {
      Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
      Object.defineProperty(globalThis.crypto, "getRandomValues", { configurable: true, value: undefined });
    });
    releaseTranscript();
    await expect(field).toHaveAttribute("data-phase", "ready");
    await expect(field.getByRole("textbox")).not.toHaveValue("");
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(about).toBeFocused();
    expect(swapRequests).toBe(0);
  });

  for (const choice of ["voice", "about"] as const) {
    test(`opening autofocus never takes focus back from ${choice} chosen after placement`, async ({ page }) => {
      await answerHealthAvailable(page);
      await openMatter(page);
      await page.evaluate((chosen) => {
        const observer = new MutationObserver(() => {
          const field = document.querySelector('.point-talk[data-presence="present"][data-placed]');
          if (field === null) return;
          const target = chosen === "voice"
            ? field.querySelector<HTMLButtonElement>('button[aria-label="说出改写方向"]')
            : document.querySelector<HTMLButtonElement>('[data-chrome-control="about"]');
          if (target === null) return;
          observer.disconnect();
          // Choose a real control before the opening effect's delayed default.
          target.focus({ preventScroll: true });
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      }, choice);
      const field = await openPointTalk(page);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const chosen = choice === "voice"
        ? field.getByRole("button", { name: "说出改写方向", exact: true })
        : page.locator('[data-chrome-control="about"]');
      await expect(chosen).toBeFocused();
    });
  }

  test("voice, Draw, Rewrite, Back, Keep, and Discard share one ring: 2 px, one pixel off", async ({ page }) => {
    await answerHealthAvailable(page);
    await routeImage(page);
    await openMatter(page);
    const field = await openPointTalk(page);
    const ring = () => page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element);
      return {
        label: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim(),
        focusVisible: element.matches(":focus-visible"),
        width: style.outlineWidth,
        style: style.outlineStyle,
        offset: style.outlineOffset,
        color: style.outlineColor,
      };
    });
    const rings: Array<Awaited<ReturnType<typeof ring>>> = [];
    await expect(field.getByRole("textbox")).toBeFocused();
    await field.getByRole("textbox").fill("x");
    await expect(field.getByRole("button", { name: "改写", exact: true })).toBeEnabled();
    await page.keyboard.press("Tab");
    rings.push(await ring());
    await page.keyboard.press("Tab");
    rings.push(await ring());
    await page.keyboard.press("Tab");
    rings.push(await ring());
    expect(rings.map((entry) => entry.label)).toEqual(["说出改写方向", copy.controlName, "改写"]);
    await control(page).focus();
    await page.keyboard.press("Enter");
    await expect(field.getByText(copy.armStatement, { exact: true })).toBeVisible();
    await expect(field.getByRole("button", { name: copy.draw, exact: true })).toBeVisible();
    await field.getByRole("button", { name: copy.draw, exact: true }).focus();
    rings.push(await ring());
    await field.getByRole("button", { name: copy.back, exact: true }).focus();
    rings.push(await ring());
    await field.getByRole("button", { name: copy.draw, exact: true }).click();
    await expect(field.getByRole("button", { name: copy.keep, exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    rings.push(await ring());
    await field.getByRole("button", { name: copy.keep, exact: true }).focus();
    rings.push(await ring());
    await field.getByRole("button", { name: copy.discard, exact: true }).focus();
    rings.push(await ring());
    expect(rings.length).toBeGreaterThanOrEqual(8);
    for (const entry of rings) {
      expect(entry.focusVisible, entry.label).toBe(true);
      expect({ width: entry.width, style: entry.style, offset: entry.offset }, entry.label)
        .toEqual({ width: "2px", style: "solid", offset: "1px" });
    }
    expect(new Set(rings.map((entry) => entry.color)).size).toBe(1);
  });
});

type Frame = Readonly<{
  ready: string | null;
  tops: Readonly<Record<string, number>>;
  state: string | null;
  height: number | null;
}>;

async function pictureBox(page: Page, nodeId: string): Promise<Readonly<{
  w: number;
  h: number;
  imageW: number;
  imageH: number;
  background: string;
  state: string | null;
}>> {
  return page.evaluate((id) => {
    const element = document.querySelector<HTMLElement>(`[data-thought-id="${id}"] .passage-picture`);
    if (element === null) throw new Error("the passage carries no picture box");
    const scale = element.getBoundingClientRect().width / element.offsetWidth || 1;
    const image = element.querySelector("img");
    return {
      w: element.offsetWidth,
      h: element.offsetHeight,
      imageW: image === null ? 0 : image.offsetWidth,
      imageH: image === null ? 0 : image.offsetHeight,
      background: getComputedStyle(element).backgroundColor,
      state: element.getAttribute("data-picture-state"),
      scale,
    };
  }, nodeId);
}

test.describe("the picture's own proportions", () => {
  test("the preview shows a portrait's true shape, and the kept picture is capped by the screen's height", async ({ page }) => {
    const portrait = pictureOfSize(512, 1024);
    await answerHealthAvailable(page);
    const images = await routeImage(page, "picture", portrait);
    await openMatter(page, { width: 1280, height: 800 });
    const field = await openPointTalk(page);
    await drawToPreview(page, field);
    await expect.poll(() => decoded(previewImage(field))).toBeGreaterThan(0);

    const preview = await field.evaluate((root) => {
      const box = root.querySelector<HTMLElement>(".passage-picture")!;
      const image = box.querySelector("img")!;
      const rect = box.getBoundingClientRect();
      const bubble = root.getBoundingClientRect();
      return {
        w: rect.width,
        h: rect.height,
        imageW: image.offsetWidth,
        imageH: image.offsetHeight,
        naturalW: image.naturalWidth,
        naturalH: image.naturalHeight,
        fieldBottom: bubble.bottom,
        fit: getComputedStyle(image).objectFit,
        scale: Number.parseFloat(getComputedStyle(root).getPropertyValue("--point-talk-scale")) || 1,
      };
    });
    // A 1 : 2 picture previews at 1 : 2, no taller than the field's cap, and nothing is cropped.
    expect(preview.h).toBeLessThanOrEqual(248 * preview.scale + 0.5);
    expect(preview.w / preview.h).toBeCloseTo(0.5, 2);
    expect(preview.imageW / preview.imageH).toBeCloseTo(preview.naturalW / preview.naturalH, 2);
    expect(preview.imageW).toBeCloseTo(preview.w, 0);
    expect(preview.imageH).toBeCloseTo(preview.h, 0);
    expect(preview.fit).toBe("contain");
    expect(preview.fieldBottom).toBeLessThanOrEqual(800);

    // A landscape picture is as wide as the box allows and as short as its ratio makes it.
    await field.getByRole("button", { name: copy.discard, exact: true }).click();
    await expect(page.locator(".point-talk")).toHaveCount(0);
    images.picture = pictureOfSize(1024, 512);
    const landscape = await openPointTalk(page);
    await drawToPreview(page, landscape);
    const shape = await landscape.locator(".passage-picture").evaluate((box) => {
      const rect = box.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    expect(shape.w / shape.h).toBeCloseTo(2, 2);
    expect(shape.w).toBeLessThanOrEqual(248 * preview.scale + 0.5);
  });

  test("a tall picture in a passage is narrower, never taller than the smaller of 320 px and 60% of the screen", async ({ page }) => {
    const portrait = pictureOfSize(512, 1024);
    await openMatter(page, { width: 1280, height: 800 });
    const plain = await plainArchiveOf(page);
    const siblingOf = async (): Promise<string> => page.evaluate((target) => {
      const element = document.querySelector<HTMLElement>(`[data-thought-id="${target}"]`)!;
      const all = Array.from(document.querySelectorAll<HTMLElement>("[data-thought-id]"));
      const below = all.filter((other) => other !== element &&
        other.getBoundingClientRect().top > element.getBoundingClientRect().top + 1 &&
        Math.abs(other.getBoundingClientRect().left - element.getBoundingClientRect().left) < 2);
      below.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      return below[0]!.dataset.thoughtId!;
    }, plain.targetId);
    const siblingId = await siblingOf();
    // Layout pixels: the camera's zoom cannot move the answer.
    const gapOf = async () => page.evaluate(({ sibling, target }) => {
      const targetElement = document.querySelector<HTMLElement>(`[data-thought-id="${target}"]`)!;
      const scale = targetElement.getBoundingClientRect().width / targetElement.offsetWidth || 1;
      const siblingTop = document.querySelector(`[data-thought-id="${sibling}"]`)!.getBoundingClientRect().top;
      return (siblingTop - targetElement.getBoundingClientRect().top) / scale;
    }, { sibling: siblingId, target: plain.targetId });
    const baseline = await gapOf();

    await replaceWith(page, await withPictureOn(plain.bytes, plain.targetId, { picture: portrait }));
    for (const [height, cap] of [[800, 320], [500, 300]] as const) {
      await page.setViewportSize({ width: 1280, height });
      await expect(page.locator(`[data-thought-id="${plain.targetId}"] .passage-picture[data-picture-state="resident"]`))
        .toHaveCount(1);
      await expect.poll(async () => (await pictureBox(page, plain.targetId)).h).toBeCloseTo(cap, 0);
      const box = await pictureBox(page, plain.targetId);
      expect(box.h).toBeLessThanOrEqual(Math.min(320, 0.6 * height) + 0.5);
      expect(box.w / box.h).toBeCloseTo(0.5, 2);
      // The passage grew by exactly the box and its margin: layout truth, not a guess.
      await expect.poll(async () => (await gapOf()) - baseline).toBeCloseTo(box.h + 10, 0);
    }

    // The same pointer without its bytes is a plate in the very same box (the
    // Archive panel needs the full height to be pressed).
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => (await pictureBox(page, plain.targetId)).h).toBe(320);
    await expect.poll(async () => (await gapOf()) - baseline).toBeCloseTo(320 + 10, 0);
    const resident = await pictureBox(page, plain.targetId);
    const residentGap = await gapOf();
    // (Another picture of the same 1 : 2 shape, whose bytes this device never held.)
    await replaceWith(page, await withPictureOn(plain.bytes, plain.targetId, {
      bytes: false,
      picture: pictureOfSize(256, 512),
    }));
    await expect(page.locator(`[data-thought-id="${plain.targetId}"] .passage-picture[data-picture-state="absent"]`))
      .toHaveCount(1);
    const plate = await pictureBox(page, plain.targetId);
    expect(plate.w).toBe(resident.w);
    expect(plate.h).toBe(resident.h);
    await expect.poll(gapOf).toBeCloseTo(residentGap, 0);
    // The plate is opaque, so the paper's ruling cannot show through it.
    expect(plate.background).not.toMatch(/\//u);
    expect(plate.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(plate.background).not.toBe("transparent");
  });

  test("passages below a picture do not move when its code and bytes arrive", async ({ page }) => {
    const portrait = pictureOfSize(512, 1024);
    await openMatter(page, { width: 1280, height: 800 });
    const plain = await plainArchiveOf(page);
    await replaceWith(page, await withPictureOn(plain.bytes, plain.targetId, { picture: portrait }));
    await expect(page.locator(".material-files")).toHaveAttribute("data-persistence-phase", "saved");

    await page.addInitScript((target) => {
      const frames: Array<{ ready: string | null; tops: Record<string, number>; state: string | null; height: number | null }> = [];
      (window as unknown as { __frames: typeof frames }).__frames = frames;
      const tick = () => {
        const tops: Record<string, number> = {};
        for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-thought-id]"))) {
          tops[element.dataset.thoughtId!] = element.getBoundingClientRect().top;
        }
        const box = document.querySelector<HTMLElement>(`[data-thought-id="${target}"] .passage-picture`);
        frames.push({
          ready: document.querySelector(".matter-canvas")?.getAttribute("data-layout-ready") ?? null,
          tops,
          state: box?.getAttribute("data-picture-state") ?? null,
          height: box === null ? null : box.offsetHeight,
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, plain.targetId);
    // The code that draws the picture arrives late, so the box must already be there.
    let delayedChunks = 0;
    await page.route("**/_next/static/**", async (route) => {
      const url = route.request().url();
      if (!/\.js(?:\?|$)/u.test(url)) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes("passage-picture__image")) {
        delayedChunks += 1;
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
      await route.fulfill({ response, body });
    });
    await page.reload();
    await expect(page.locator(`[data-thought-id="${plain.targetId}"] .passage-picture[data-picture-state="resident"]`))
      .toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(delayedChunks).toBeGreaterThan(0);

    const frames = await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
    const first = frames.findIndex((frame) => frame.ready === "true" && frame.state !== null);
    expect(first, "a laid-out frame that already has the picture's box").toBeGreaterThanOrEqual(0);
    const last = frames[frames.length - 1]!;
    expect(last.state).toBe("resident");
    // The box was in place, as a placeholder, before the picture's code and bytes arrived.
    expect(frames.slice(first).some((frame) => frame.state === "loading")).toBe(true);
    const below = Object.keys(last.tops).filter((id) => last.tops[id]! > last.tops[plain.targetId]! + 1);
    expect(below.length).toBeGreaterThan(0);
    for (const frame of frames.slice(first)) {
      expect(frame.height).toBe(last.height);
      for (const id of [plain.targetId, ...below]) {
        expect(Math.abs(frame.tops[id]! - last.tops[id]!), `passage ${id} moved`).toBeLessThanOrEqual(0.5);
      }
    }
    expect(last.height).toBe(320);
  });
});
