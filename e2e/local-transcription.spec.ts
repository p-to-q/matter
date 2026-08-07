import { expect, test } from "@playwright/test";

test.skip(
  process.env.MATTER_E2E_LOCAL_TRANSCRIPTION !== "true",
  "Run explicitly because the first receipt downloads the browser Whisper model.",
);

test("recorded inquiry speech reaches the on-device Whisper worker", async ({ page }) => {
  test.setTimeout(240_000);
  const modelResponses: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("whisper-tiny") && url.includes(".onnx") && response.status() < 400) {
      modelResponses.push(url);
    }
  });

  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  await inquiry.getByRole("button", { name: "口述", exact: true }).click();
  await page.waitForTimeout(500);
  await inquiry.getByRole("button", { name: "停止口述", exact: true }).click();

  await expect(inquiry).toHaveAttribute("data-inquiry-phase", "transcribing");
  await expect(inquiry).not.toHaveAttribute(
    "data-inquiry-phase",
    "transcribing",
    { timeout: 180_000 },
  );
  expect(modelResponses.length).toBeGreaterThan(0);
});
