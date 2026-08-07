import { expect, test } from "@playwright/test";

test("declares the language of the application chrome", async ({ page }) => {
  await page.goto("/matter");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "p to q — Matter" })).toBeVisible();
});

test("accepts an extension-owned root attribute before hydration", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (/hydrat(?:e|ion)/iu.test(error.message)) hydrationErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat(?:e|ion)/iu.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.route(/\/matter$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("<html", '<html nighteye="disabled"');
    await route.fulfill({ response, body });
  });

  await page.goto("/matter");
  await expect(page.locator("html")).toHaveAttribute("nighteye", "disabled");
  await expect(page.getByRole("link", { name: "p to q — Matter" })).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});
