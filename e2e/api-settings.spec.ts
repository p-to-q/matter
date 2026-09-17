import { expect, test, type Page, type Route } from "@playwright/test";

const PROTOCOL_VERSION = "4" as const;
const EXAMPLE_ENDPOINT = "https://api.kfc.com/v1";
const EXAMPLE_KEY = "sk-kfcfkxqsvivowushiwoyaochishunzhiyuanweiji";
const CREDENTIAL_ID = "AAAAAAAAAAAAAAAAAAAAAA";

type ProviderTraffic = {
  deletes: number;
  saves: number;
  tests: number;
  lastPost: unknown;
};

test("desktop Model API keeps the surface to address and key, then tests and saves separately", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const traffic = await mockProviderSession(page);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const selectedThought = page.locator(".spatial-thought[data-thought-id]").first();
  const selectedLabel = selectedThought.locator(".spatial-thought__label");
  await selectedThought.locator(".spatial-thought__text").click();
  await expect(selectedThought).toHaveAttribute("data-selected", "true");

  const settings = page.getByRole("button", { name: "Matter 设置", exact: true });
  await settings.click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "关闭: 模型 API" })).toBeFocused();
  await expect(page.locator("main.matter-shell"))
    .toHaveAttribute("data-material-presentation", "occluded");
  await expect(selectedLabel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(selectedLabel).toHaveCSS("box-shadow", "none");

  const endpoint = dialog.getByRole("textbox", { name: "API 地址" });
  const key = dialog.getByRole("textbox", { name: "API Key" });
  await expect(endpoint).toHaveValue("");
  await expect(endpoint).toHaveAttribute("placeholder", EXAMPLE_ENDPOINT);
  await expect(key).toHaveAttribute("placeholder", EXAMPLE_KEY);
  await expect(key).toHaveAttribute("type", "password");
  await expect(dialog).not.toContainText("OpenAI");
  await expect(dialog).not.toContainText("DeepSeek");

  await endpoint.fill("http://127.0.0.1/v1");
  await key.fill(EXAMPLE_KEY);
  await dialog.getByRole("button", { name: "测试", exact: true }).click();
  await expect(dialog).toContainText("请输入公开可访问的 HTTPS API 地址。");
  expect(traffic.tests).toBe(0);

  await endpoint.fill("api.kfc.com");
  await endpoint.blur();
  await expect(endpoint).toHaveValue(EXAMPLE_ENDPOINT);
  await dialog.getByRole("button", { name: "测试", exact: true }).click();
  await expect.poll(() => traffic.tests).toBe(1);
  await expect(dialog).toContainText("连接可用。");
  await expect(key).toHaveValue(EXAMPLE_KEY);

  await dialog.locator("form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
    (form as HTMLFormElement).requestSubmit();
  });
  await expect.poll(() => traffic.saves).toBe(1);
  await expect(dialog).toContainText("已保存并可用。");
  await expect(key).toHaveValue("");
  expect(traffic.lastPost).toEqual({
    protocolVersion: PROTOCOL_VERSION,
    action: "save",
    endpoint: EXAMPLE_ENDPOINT,
    apiKey: EXAMPLE_KEY,
  });

  await dialog.getByRole("button", { name: "移除", exact: true }).click();
  expect(traffic.deletes).toBe(0);
  await dialog.getByRole("button", { name: "确认移除", exact: true }).click();
  await expect.poll(() => traffic.deletes).toBe(1);
  await expect(endpoint).toBeFocused();

  await key.fill("sk-clear-on-pagehide");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await expect(key).toHaveValue("");
  // A real pagehide leaves no surface to click. Resume the synthetic page
  // before proving that the still-mounted dialog and its focus return recover.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await dialog.getByRole("button", { name: "关闭: 模型 API" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await expect(selectedThought).toHaveAttribute("data-selected", "true");
});

test("mobile Model API uses the same two fields and coarse-pointer targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProviderSession(page);
  await page.goto("/matter");

  const trigger = page.getByRole("button", { name: "打开 Matter 菜单" });
  await trigger.click();
  await page.getByRole("dialog", { name: "Matter" })
    .getByRole("button", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  const controls = [
    dialog.getByRole("textbox", { name: "API 地址" }),
    dialog.getByRole("textbox", { name: "API Key" }),
    dialog.getByRole("button", { name: "测试", exact: true }),
    dialog.getByRole("button", { name: "保存", exact: true }),
  ];
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
  await expect(dialog.getByRole("button", { name: /OpenAI/u })).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭: 模型 API" }).click();
  await expect(trigger).toBeFocused();
});

test("short landscape keeps both fields and actions reachable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await mockProviderSession(page);
  await page.goto("/matter");
  await page.getByRole("button", { name: "打开 Matter 菜单" }).click();
  await page.getByRole("dialog", { name: "Matter" })
    .getByRole("button", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const endpoint = dialog.getByRole("textbox", { name: "API 地址" });
  const key = dialog.getByRole("textbox", { name: "API Key" });
  const save = dialog.getByRole("button", { name: "保存", exact: true });
  for (const control of [endpoint, key, save]) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
  }
});

test("accepted save and remove actions survive presentation and language changes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let connected = false;
  let posts = 0;
  let deletes = 0;
  let releasePost!: () => void;
  let releaseDelete!: () => void;
  const postGate = new Promise<void>((resolve) => { releasePost = resolve; });
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
  await page.route("**/api/provider-session", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      posts += 1;
      await postGate;
      connected = true;
    } else if (method === "DELETE") {
      deletes += 1;
      await deleteGate;
      connected = false;
    }
    await fulfillStatus(route, connected);
  });
  await page.goto("/matter");
  const settings = page.locator('[data-chrome-control="settings"]');
  const openApi = async (language: "zh-CN" | "en-US") => {
    const name = language === "zh-CN" ? "模型 API" : "Model API";
    await settings.click();
    await page.getByRole("menuitem", { name, exact: true }).click();
    return page.getByRole("dialog", { name, exact: true });
  };

  let dialog = await openApi("zh-CN");
  await dialog.getByRole("textbox", { name: "API 地址" }).fill(EXAMPLE_ENDPOINT);
  await dialog.getByRole("textbox", { name: "API Key" }).fill(EXAMPLE_KEY);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => posts).toBe(1);
  await dialog.getByRole("button", { name: "关闭: 模型 API" }).click();
  await page.locator('[data-chrome-control="language"]').click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  dialog = await openApi("en-US");
  await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("textbox", { name: "API address" })).toHaveValue(EXAMPLE_ENDPOINT);
  await expect(dialog.getByRole("textbox", { name: "API key" })).toHaveValue(EXAMPLE_KEY);
  releasePost();
  await expect.poll(() => connected).toBe(true);
  await expect(dialog).toContainText("Saved and ready.");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("textbox", { name: "API key" })).toHaveValue("");
  await expect(dialog).not.toContainText("已保存并可用。");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm remove", exact: true }).click();
  await expect.poll(() => deletes).toBe(1);
  await dialog.getByRole("button", { name: "Close: Model API" }).click();
  dialog = await openApi("en-US");
  await expect(dialog.getByRole("button", { name: "Removing…", exact: true })).toBeDisabled();
  releaseDelete();
  await expect.poll(() => connected).toBe(false);
  await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "API Key" })).toBeEnabled();
});

test("an accepted remove updates saved state without erasing a newer draft or stealing focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let deletes = 0;
  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
  await page.route("**/api/provider-session", async (route) => {
    if (route.request().method() === "DELETE") {
      deletes += 1;
      await deleteGate;
      await fulfillStatus(route, false);
      return;
    }
    await fulfillStatus(route, true);
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toContainText("已保存在此浏览器");

  await dialog.getByRole("button", { name: "移除", exact: true }).click();
  await dialog.getByRole("button", { name: "确认移除", exact: true }).click();
  await expect.poll(() => deletes).toBe(1);

  const endpoint = dialog.getByRole("textbox", { name: "API 地址" });
  const key = dialog.getByRole("textbox", { name: "API Key" });
  const nextEndpoint = "https://draft.vendor.ai/v1";
  const nextKey = "sk-new-draft-remains-owned-by-the-user";
  await endpoint.fill(nextEndpoint);
  await key.fill(nextKey);
  await expect(key).toBeFocused();

  releaseDelete();
  await expect(dialog.getByRole("button", { name: "移除", exact: true })).toHaveCount(0);
  await expect(endpoint).toHaveValue(nextEndpoint);
  await expect(key).toHaveValue(nextKey);
  await expect(key).toBeFocused();
  await expect(dialog).not.toContainText("已移除保存的访问。");
});

test("the opening status read gates network actions without taking draft ownership", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let gets = 0;
  let saves = 0;
  let connected = false;
  let releaseGet!: () => void;
  const getGate = new Promise<void>((resolve) => { releaseGet = resolve; });
  await page.route("**/api/provider-session", async (route) => {
    if (route.request().method() === "GET") {
      gets += 1;
      if (gets === 1) {
        await getGate;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(statusBody(true, false)),
        }).catch(() => undefined);
      } else {
        await fulfillStatus(route, connected);
      }
      return;
    }
    if (route.request().method() === "POST") {
      saves += 1;
      connected = true;
    }
    await fulfillStatus(route, true);
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect.poll(() => gets).toBe(1);

  const endpoint = dialog.getByRole("textbox", { name: "API 地址" });
  await endpoint.fill(EXAMPLE_ENDPOINT);
  await dialog.getByRole("textbox", { name: "API Key" }).fill(EXAMPLE_KEY);
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "测试", exact: true })).toBeDisabled();
  expect(saves).toBe(0);
  releaseGet();
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  await expect(dialog).toContainText("已保存并可用。");

  await endpoint.fill("https://draft.vendor.ai/v1");
  await expect(endpoint).toHaveValue("https://draft.vendor.ai/v1");
  // The submitted credential remains the saved source of truth while this
  // newer draft stays editable; the completed status read owns neither.
  await expect(dialog).toContainText("此前的设置仍已保存");
  expect(saves).toBe(1);
});

test("damaged browser access resets explicitly without erasing the editable draft", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let damaged = true;
  let deletes = 0;
  await page.route("**/api/provider-session", async (route) => {
    if (route.request().method() === "DELETE") {
      deletes += 1;
      damaged = false;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...statusBody(true, false),
        resetRequired: damaged,
      }),
    });
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toContainText("已保存的访问需要重置后才能继续使用。");

  const endpoint = dialog.getByRole("textbox", { name: "API 地址" });
  const key = dialog.getByRole("textbox", { name: "API Key" });
  const draftEndpoint = "https://draft.vendor.ai/v1";
  const draftKey = "sk-draft-remains-after-explicit-reset";
  await endpoint.fill(draftEndpoint);
  await key.fill(draftKey);
  await expect(dialog.getByRole("button", { name: "测试", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();

  await dialog.getByRole("button", { name: "重置", exact: true }).click();
  await expect.poll(() => deletes).toBe(1);
  await expect(endpoint).toHaveValue(draftEndpoint);
  await expect(key).toHaveValue(draftKey);
  await expect(dialog).toContainText("浏览器访问状态已重置，现在可以保存这些内容。");
  await expect(dialog.getByRole("button", { name: "测试", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
});

test("a transient status failure leaves the draft editable and recovers on reopen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let gets = 0;
  await page.route("**/api/provider-session", async (route) => {
    gets += 1;
    if (gets === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "CONNECTION_FAILED", message: "Unavailable", retryable: true },
        }),
      });
      return;
    }
    await fulfillStatus(route, false);
  });
  await page.goto("/matter");
  const settings = page.getByRole("button", { name: "Matter 设置", exact: true });
  await settings.click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toContainText("暂时无法读取已保存设置，仍可继续编辑。");
  await expect(dialog.getByRole("textbox", { name: "API 地址" })).toBeEnabled();
  await expect(dialog.getByRole("textbox", { name: "API Key" })).toBeEnabled();
  await dialog.getByRole("button", { name: "关闭: 模型 API" }).click();

  await settings.click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect.poll(() => gets).toBe(2);
  await expect(dialog).not.toContainText("暂时无法读取已保存设置");
});

test("an unavailable Model API disables network actions but keeps its two fields inspectable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/provider-session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(statusBody(false, false)),
    });
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toContainText("此处暂时无法保存模型 API。");
  await expect(dialog.getByRole("textbox", { name: "API 地址" })).toBeEnabled();
  await expect(dialog.getByRole("textbox", { name: "API Key" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "测试", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
});

async function mockProviderSession(page: Page): Promise<ProviderTraffic> {
  const traffic: ProviderTraffic = { deletes: 0, saves: 0, tests: 0, lastPost: null };
  let connected = false;
  await page.route("**/api/provider-session", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON() as { action?: unknown; endpoint?: unknown };
      traffic.lastPost = body;
      if (body.action === "test") {
        traffic.tests += 1;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            protocolVersion: PROTOCOL_VERSION,
            verified: true,
            endpoint: body.endpoint,
          }),
        });
        return;
      }
      traffic.saves += 1;
      connected = true;
    } else if (method === "DELETE") {
      traffic.deletes += 1;
      connected = false;
    }
    await fulfillStatus(route, connected);
  });
  return traffic;
}

function statusBody(available: boolean, connected: boolean) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    available,
    credentialPresent: available && connected,
    resetRequired: false,
    credentialId: available && connected ? CREDENTIAL_ID : null,
    endpoint: available && connected ? EXAMPLE_ENDPOINT : null,
    expiresAt: available && connected ? "2026-10-17T09:00:00.000Z" : null,
  };
}

async function fulfillStatus(route: Route, connected: boolean) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(statusBody(true, connected)),
  });
}
