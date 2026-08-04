import { expect, test } from "@playwright/test";

const rootId = "thought_fixture_root";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`voice admits one undoable child at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    await page
      .locator(`[data-thought-id="${rootId}"]`)
      .locator("[data-thought-text-id]")
      .click();
    const voice = page.getByRole("button", {
      name: "Record a child beneath the selected thought",
      exact: true,
    });
    await expect(voice).toBeEnabled();
    await voice.click();
    const stop = page.getByRole("button", { name: "Stop recording", exact: true });
    await expect(stop).toBeVisible();
    await expect(page.locator("main.matter-shell")).toHaveAttribute(
      "data-interaction-pending",
      "true",
    );
    await expect(page.getByRole("button", { name: "Extend related thought", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move through canvas", exact: true })).toBeDisabled();
    // MediaRecorder chunks are asynchronous; this crosses one 250 ms capture
    // interval so Stop can prove the final dataavailable boundary with audio.
    await page.waitForTimeout(350);
    await stop.click();

    const admitted = page.locator('[data-thought-id^="thought_"]').filter({
      hasText: "也许我还没有想清楚",
    });
    await expect(admitted).toHaveCount(1);
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute(
      "data-interaction-pending",
      "true",
    );
    await expect(page.locator(`[data-thought-id="${rootId}"]`)).toHaveAttribute(
      "data-selected",
      "true",
    );
    const geometry = await page.locator("[data-thought-id]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.getAttribute("data-thought-id"), x: rect.x, y: rect.y };
      }),
    );
    expect(geometry).toHaveLength(2);
    expect(geometry[1]!.x).toBeGreaterThan(geometry[0]!.x);
    expect(geometry[1]!.y).toBeCloseTo(geometry[0]!.y, 0);

    await page.getByRole("button", { name: "Undo last change", exact: true }).click();
    await expect(admitted).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });
}
