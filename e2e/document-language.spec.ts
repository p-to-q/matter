import { expect, test } from "@playwright/test";

test("declares the language of the application chrome", async ({ page }) => {
  await page.goto("/matter");

  // The shell is served as `lang="en"` because a person's stored language is
  // not known until hydration; after it, the attribute must follow the canvas
  // language so assistive technology reads material in its own voice.
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
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
