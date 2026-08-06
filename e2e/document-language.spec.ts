import { expect, test } from "@playwright/test";

test("declares the language of the application chrome", async ({ page }) => {
  await page.goto("/matter");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "p to q home" })).toBeVisible();
});
