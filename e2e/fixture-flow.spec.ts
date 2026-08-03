import { expect, test } from "@playwright/test";

test("starts with sample language and preserves the creation path", async ({
  page,
}) => {
  await page.goto("/matter?demo=fixture");
  const sampleText =
    "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";
  const sample = page.locator('[data-object-id="thought_sample"] .thought-copy');
  await expect(sample).toHaveText(sampleText);
  await expect(page.getByLabel("Fixture AI versions")).toContainText("AI adjustable");

  await page.getByRole("button", { name: "Speak" }).click();
  await expect(page.getByText("Place the thought.")).toBeVisible();

  await page.mouse.click(160, 160);
  await expect(page.getByRole("button", { name: "Finish speaking" })).toBeVisible();
  await expect(page.locator(".voice-draft-frame")).toBeVisible();
  await expect(page.locator(".voice-draft-plus")).toHaveText("+");
  await page.getByRole("button", { name: "Finish speaking" }).click();

  await expect(page.locator("[data-material]")).toHaveCount(2);

  const undo = page.getByRole("button", { name: "Undo last change" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator("[data-material]")).toHaveCount(1);
  await expect(sample).toHaveText(sampleText);
  await expect(undo).toBeDisabled();
});

test("fixture rail applies several AI-adjustable versions through undoable scene changes", async ({
  page,
}) => {
  await page.goto("/matter?demo=fixture");

  const material = page.locator('[data-object-id="thought_sample"] .thought-copy');
  const original =
    "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";
  await expect(page.getByLabel("Fixture AI versions")).toContainText("AI adjustable");

  await page.getByRole("button", { name: "Apply v2 fixture version" }).click();
  await expect(material).toHaveText(
    "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象几种还没有被彻底放弃的生活。",
  );

  await page.getByRole("button", { name: "Apply v3 fixture version" }).click();
  await expect(material).toHaveText(
    "我们怀念的也许不是过去本身，而是它在今天仍然保留的一点余地：让另一种生活继续显得可能。",
  );

  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(material).toContainText("几种还没有被彻底放弃的生活");
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(material).toHaveText(original);
});

test("lassos, stretches, transforms in place, and restores exact text", async ({
  page,
}) => {
  await page.goto("/matter?demo=fixture");

  const original =
    "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";
  const material = page.locator('[data-object-id="thought_sample"] .thought-copy');
  await expect(material).toHaveText(original);

  const targetTokens = page.locator(
    '[data-arrow-token][data-start="22"], [data-arrow-token][data-start="24"], [data-arrow-token][data-start="26"], [data-arrow-token][data-start="27"], [data-arrow-token][data-start="29"], [data-arrow-token][data-start="31"], [data-arrow-token][data-start="33"]',
  );
  const tokenRects = await targetTokens.evaluateAll((elements) =>
    elements.flatMap((element) =>
      [...element.getClientRects()].map((rect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      })),
    ),
  );
  const left = Math.min(...tokenRects.map((rect) => rect.left)) - 8;
  const top = Math.min(...tokenRects.map((rect) => rect.top)) - 8;
  const right = Math.max(...tokenRects.map((rect) => rect.right)) + 8;
  const bottom = Math.max(...tokenRects.map((rect) => rect.bottom)) + 8;

  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, top, { steps: 4 });
  await page.mouse.move(right, bottom, { steps: 3 });
  await page.mouse.move(left, bottom, { steps: 4 });
  await page.mouse.move(left, top, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Stretch selection downward" })).toBeVisible();
  await page.getByRole("button", { name: "Speak to transform" }).click();

  const endHandle = page.getByRole("button", { name: "Stretch selection downward" });
  const handleBox = await endHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  const beforeStretch = await page
    .locator('[data-object-id="thought_sample"][data-material]')
    .boundingBox();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 120, {
    steps: 6,
  });
  const duringStretch = await page
    .locator('[data-object-id="thought_sample"][data-material]')
    .boundingBox();
  expect(duringStretch!.height).toBeGreaterThan(beforeStretch!.height + 70);
  await expect(page.locator("[data-elastic-grid]")).toBeVisible();
  await expect(page.locator("[data-elastic-line]")).toHaveCount(6);
  await expect(page.locator("[data-elastic-grid]")).toContainText("更慢的时间");
  await page.mouse.up();

  const transformed =
    "我们怀念的也许不是一个真实存在过的过去，而是那个过去像一扇没有真正打开过的门：更慢的时间、更少被量化的关系，以及一些我们并不确定是否存在、却仍愿意相信曾经存在的生活方式想象的其他生活。";
  await expect(material).toHaveText(transformed);

  const undo = page.getByRole("button", { name: "Undo last change" });
  await undo.click();
  await expect(material).toHaveText(original);
});

test("extends a related thought and undoes the document node", async ({ page }) => {
  await page.goto("/matter?demo=fixture");

  await page.getByRole("button", { name: "Extend related thought" }).click();
  await page.locator('[data-object-id="thought_sample"] .thought-copy').click();

  const satellite = page.locator('[data-kind="satellite"]');
  await expect(satellite).toContainText("仍可被重新选择的可能");

  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(satellite).toHaveCount(0);
});

test("moves a thought without a frame and undoes the position", async ({ page }) => {
  await page.goto("/matter?demo=fixture");
  const material = page.locator('[data-object-id="thought_sample"][data-material]');
  const before = await material.boundingBox();
  expect(before).not.toBeNull();

  await page.getByRole("button", { name: "Move thought" }).click();
  await page.mouse.move(before!.x + 80, before!.y + 30);
  await page.mouse.down();
  await page.mouse.move(before!.x + 150, before!.y + 85, { steps: 6 });
  await page.mouse.up();

  const moved = await material.boundingBox();
  expect(moved!.x).toBeGreaterThan(before!.x + 50);
  expect(moved!.y).toBeGreaterThan(before!.y + 35);

  await page.getByRole("button", { name: "Undo last change" }).click();
  const restored = await material.boundingBox();
  expect(Math.abs(restored!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(restored!.y - before!.y)).toBeLessThan(2);
});

test("pans and pinch-zooms the canvas with trackpad wheel gestures", async ({ page }) => {
  await page.goto("/matter?demo=fixture");
  const material = page.locator('[data-object-id="thought_sample"][data-material]');
  await page.waitForTimeout(750);
  const before = await material.boundingBox();
  expect(before).not.toBeNull();

  await page.mouse.move(700, 600);
  await page.mouse.wheel(80, 45);
  const panned = await material.boundingBox();
  expect(panned!.x).toBeLessThan(before!.x - 60);
  expect(panned!.y).toBeLessThan(before!.y - 30);

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  const zoomed = await material.boundingBox();
  expect(zoomed!.width).toBeGreaterThan(panned!.width);
});
