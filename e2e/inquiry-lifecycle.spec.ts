import { expect, test, type Page, type Route } from "@playwright/test";
import { settleLassoGeometry } from "./lasso-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT_ID = "thought_fixture_root";

test("Ask Matter and material-local AI surfaces own one transient slot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.evaluate(() => document.fonts.ready);
  const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);

  await ask.click();
  await expect(inquiry).toBeVisible();
  await passage.hover();
  // Open canvas chrome suppresses the local lens, so the person cannot enter
  // a second AI surface without first leaving Inquiry.
  await expect(page.locator("[data-node-action=point-talk]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();

  await passage.hover();
  await page.locator("[data-node-action=point-talk]").click();
  await expect(page.locator(".point-talk")).toBeVisible();

  await ask.click();
  await expect(page.locator(".point-talk")).toHaveCount(0);
  await expect(inquiry).toBeVisible();
  await page.keyboard.press("Escape");

  // Elastic starts from selected visible material. Its start boundary must own
  // the same slot rather than leaving the corner Inquiry open behind it.
  await ask.click();
  await expect(inquiry).toBeVisible();
  await passage.click();
  await expect(inquiry).toBeVisible();
  await page.getByRole("button", {
    name: fixtureUiCopy.toolRail.circleSelectLanguage,
    exact: true,
  }).click();
  await expect(inquiry).toBeVisible();
  await settleLassoGeometry(page);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text));
  await expect(page.locator(".lasso-layer[data-selected=true]")).toBeVisible();
  // The grips mount from the measured address, so wait for the paint that
  // causes them rather than for the count alone. A font event can revoke a
  // fresh measurement, and racing that produced an intermittent zero here.
  await expect(page.locator('.material-address-layer[data-address-variant="actionable"]'))
    .toHaveAttribute("data-material-address-painted", "true");
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  // A neutral lasso may remain visible because it is also legitimate Inquiry
  // context. Elastic owns the AI slot only when the person starts adjusting a
  // grip; keyboard and pointer activation share that boundary.
  await expect(inquiry).toBeVisible();
  await page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" }).press("ArrowDown");
  await expect(inquiry).toBeHidden();
});

test("an IME confirmation in either engine order never asks or closes", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/inquiry", async (route) => {
    requests += 1;
    await fulfillInquiry(route, inquiryRequest(route), "这是回答。");
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("这份材料在怀念什么？");

  // Chromium: the candidate Enter carries isComposing.
  await field.dispatchEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true });
  // Pre-2026 WebKit: compositionend first, then keyCode 229 with the flag clear.
  await field.dispatchEvent("compositionend", { data: "什么" });
  await field.dispatchEvent("keydown", { key: "Enter", keyCode: 229 });
  await field.dispatchEvent("keydown", { key: "Escape", keyCode: 229 });
  await expect(inquiry).toBeVisible();
  await expect(field).toHaveValue("这份材料在怀念什么？");
  expect(requests).toBe(0);

  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText("这是回答。");
  expect(requests).toBe(1);
});

test("one Escape closes only the layer that owns it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("还没有问完的一句话");

  // Keyboard-only entry into the docked index: no outside pointer-down closes
  // Inquiry first, so only the key path is under test.
  const sidebar = page.locator(".material-files");
  const searchTrigger = sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.searchThoughts });
  await searchTrigger.focus();
  await page.keyboard.press("Enter");
  const search = sidebar.getByRole("searchbox", { name: fixtureUiCopy.materialFiles.filterMaterialFiles });
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(sidebar).toHaveAttribute("data-mode", "browse");
  await expect(inquiry).toBeVisible();
  await expect(field).toHaveValue("还没有问完的一句话");

  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();
});

test("closing Inquiry detaches UI; the answer reaches its record and the next opening", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const routeSettled = deferred<void>();
  const lateText = "这条关闭后才到的回答仍然属于这个问题。";
  const freshQuestion = "这份材料现在在怀念什么？";
  const freshText = "这是当前请求的回答。";
  let requestCount = 0;
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    requestCount += 1;
    if (requestCount > 1) {
      await fulfillInquiry(route, request, freshText);
      return;
    }
    received.resolve();
    await gate.promise;
    try {
      await fulfillInquiry(route, request, lateText);
    } catch {
      // A browser disconnect remains advisory after submit. The route must
      // settle before the fresh request below checks the retained operation.
    } finally {
      routeSettled.resolve();
    }
  });
  await page.goto("/matter");
  const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });

  await ask.click();
  await field.fill("这份材料在怀念什么？");
  await field.press("Enter");
  await received.promise;
  await expect(inquiry).toHaveAttribute("data-inquiry-phase", "idle");
  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();
  gate.resolve();
  await routeSettled.promise;
  await expect.poll(() => inquiryExchangeCount(page)).toBe(1);

  // The person never saw that answer, so the next opening carries exactly
  // that exchange and nothing else; the draft still begins clean.
  await ask.click();
  await expect(inquiry.locator('[data-inquiry-role="person"]')).toHaveText(["这份材料在怀念什么？"]);
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(lateText);
  await expect(field).toHaveValue("");
  await field.fill(freshQuestion);
  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]').last()).toContainText(freshText);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(2);

  // Seen settled, the carried exchange does not replay again.
  await page.keyboard.press("Escape");
  await ask.click();
  await expect(inquiry.locator("[data-inquiry-role]")).toHaveCount(0);
});

test("reopening during a pending answer shows that turn, then its answer", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const answer = "它仍在等待一个没有结束的想法。";
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    received.resolve();
    await gate.promise;
    await fulfillInquiry(route, request, answer).catch(() => undefined);
  });
  await page.goto("/matter");
  const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });

  await ask.click();
  await field.fill("这里在等什么？");
  await field.press("Enter");
  await received.promise;
  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();

  await ask.click();
  await expect(inquiry.locator('[data-inquiry-role="person"]')).toHaveText(["这里在等什么？"]);
  await expect(inquiry.locator("[data-inquiry-loading]")).toBeVisible();
  // One question at a time: the waiting turn offers cancellation, not Ask.
  await expect(inquiry.locator('[data-inquiry-control="ask"]')).toHaveCount(0);
  await expect(inquiry.getByRole("button", { name: "取消", exact: true })).toBeVisible();

  gate.resolve();
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(answer);
  await expect(inquiry.locator('[data-inquiry-control="ask"]')).toBeVisible();
  await expect.poll(() => inquiryExchangeCount(page)).toBe(1);
});

test("a double-click on Ask sends once and never cancels what it sent", async ({ page }) => {
  let requests = 0;
  const gate = deferred<void>();
  await page.route("**/api/inquiry", async (route) => {
    requests += 1;
    const request = inquiryRequest(route);
    await gate.promise;
    await fulfillInquiry(route, request, "双击只问了一次。").catch(() => undefined);
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("双击会发生什么？");
  await inquiry.getByRole("button", { name: "询问", exact: true }).dblclick();

  await expect(inquiry.locator('[data-inquiry-role="person"]')).toHaveText(["双击会发生什么？"]);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
  gate.resolve();
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText("双击只问了一次。");
  expect(requests).toBe(1);
});

test("explicit cancellation returns a waiting question to the field", async ({ page }) => {
  const received = deferred<void>();
  await page.route("**/api/inquiry", async (route) => {
    received.resolve();
    // Never answers; only the person's cancellation may end this request.
    await new Promise(() => undefined);
    await route.abort();
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("先不问了吧？");
  await field.press("Enter");
  await received.promise;

  await inquiry.getByRole("button", { name: "取消", exact: true }).click();
  await expect(field).toHaveValue("先不问了吧？");
  await expect(field).toBeFocused();
  await expect(inquiry.locator("[data-inquiry-role]")).toHaveCount(0);
  await expect(inquiry.getByRole("status")).toHaveText(/\S/u);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(0);
});

test("crossing the compact breakpoint keeps Ask Matter's turns", async ({ page }) => {
  await page.route("**/api/inquiry", async (route) => {
    await fulfillInquiry(route, inquiryRequest(route), "断点两侧都是同一个回答。");
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("断点会带走它吗？");
  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText("断点两侧都是同一个回答。");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(inquiry).toBeVisible();
  await expect(inquiry.locator('[data-inquiry-role="person"]')).toHaveText(["断点会带走它吗？"]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText("断点两侧都是同一个回答。");
});

test("an unavailable answer restores the exact draft and can be asked again", async ({ page }) => {
  const question = "这份材料现在在怀念什么？";
  const answer = "它在怀念仍可被想象的另一种生活。";
  let requestCount = 0;
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          error: {
            code: "INQUIRY_FAILED",
            message: "Synthetic provider busy.",
            retryable: true,
            fallbackReason: "MODEL_BUSY",
          },
        }),
      });
      return;
    }
    await fulfillInquiry(route, request, answer);
  });

  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill(question);
  await field.press("Enter");

  await expect(field).toHaveValue(question);
  await expect(field).toBeFocused();
  await expect(inquiry.locator('[data-inquiry-role="person"]')).toHaveCount(0);
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toHaveCount(0);
  // Said once, quietly, in the status line rather than drawn as an error turn.
  await expect(inquiry.getByRole("status")).toHaveText("Matter 收到了这句话，但现在有点忙，稍后再试。");
  expect(requestCount).toBe(1);

  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(answer);
  await expect(field).toHaveValue("");
  expect(requestCount).toBe(2);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(1);
});

test("a notice that arrived while the bubble was closed is announced when it reopens", async ({ page }) => {
  const question = "关上以后才回来的这句话怎么样了？";
  const notice = "Matter 收到了这句话，但现在有点忙，稍后再试。";
  const gate = deferred<void>();
  const received = deferred<void>();
  const answered = deferred<void>();
  await page.route("**/api/inquiry", async (route) => {
    received.resolve();
    await gate.promise;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        error: {
          code: "INQUIRY_FAILED",
          message: "Synthetic provider busy.",
          retryable: true,
          fallbackReason: "MODEL_BUSY",
        },
      }),
    }).catch(() => undefined);
    answered.resolve();
  });
  await page.goto("/matter");
  const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });

  await ask.click();
  await field.fill(question);
  await field.press("Enter");
  await received.promise;
  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();
  gate.resolve();
  await answered.promise;
  // Records what each Ask Matter status region holds the moment it mounts.
  await page.evaluate(() => {
    const runtime = window as Window & { __inquiryStatusAtMount?: string[] };
    runtime.__inquiryStatusAtMount = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          for (const region of [node, ...Array.from(node.querySelectorAll("[role=status]"))]) {
            if (region.getAttribute("role") !== "status") continue;
            if (region.closest("[role=dialog]")?.getAttribute("aria-label") !== "询问 Matter") continue;
            runtime.__inquiryStatusAtMount?.push(region.textContent ?? "");
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  await ask.click();
  await expect(inquiry.getByRole("status")).toHaveText(notice);
  await expect(field).toHaveValue(question);
  // The region mounted silent and then spoke, so the notice is announced.
  expect(await page.evaluate(() =>
    (window as Window & { __inquiryStatusAtMount?: string[] }).__inquiryStatusAtMount)).toEqual([""]);
});

test("a hidden tab still accepts the bounded answer it already requested", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const routeSettled = deferred<void>();
  const question = "这里为什么还没有结束？";
  const lateText = "悬停后的迟到回答。";
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    received.resolve();
    await gate.promise;
    await fulfillInquiry(route, request, lateText);
    routeSettled.resolve();
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill(question);
  await field.press("Enter");
  await received.promise;

  await setDocumentVisibility(page, "hidden");
  gate.resolve();
  await routeSettled.promise;
  await setDocumentVisibility(page, "visible");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(lateText);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(1);
});

test("a back-forward-cache hide keeps the waiting question and answers it on return", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const earlier = "先问一句：它在想什么？";
  const earlierAnswer = "它在想另一种生活。";
  const question = "离开又回来之后它还在吗？";
  const answer = "它一直在等这一页回来。";
  let requests = 0;
  await page.route("**/api/inquiry", async (route) => {
    requests += 1;
    const request = inquiryRequest(route);
    if (requests === 1) {
      await fulfillInquiry(route, request, earlierAnswer);
      return;
    }
    received.resolve();
    await gate.promise;
    await fulfillInquiry(route, request, answer);
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill(earlier);
  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(earlierAnswer);
  await field.fill(question);
  await field.press("Enter");
  await received.promise;

  await dispatchPageTransition(page, "pagehide", true);
  await dispatchPageTransition(page, "pageshow", true);
  // The page came back with its memory: the opening's record is whole and
  // the submitted question is still waiting.
  await expect(inquiry.locator('[data-inquiry-role="person"]')).toHaveText([earlier, question]);
  await expect(inquiry.locator("[data-inquiry-loading]")).toBeVisible();
  await expect(field).toHaveValue("");

  gate.resolve();
  await expect(inquiry.locator('[data-inquiry-role="matter"]').last()).toContainText(answer);
  await expect(inquiry.locator('[data-inquiry-role="matter"]').first()).toContainText(earlierAnswer);
  await expect(inquiry.getByRole("status")).toHaveText("");
  await expect.poll(() => inquiryExchangeCount(page)).toBe(2);
  expect(requests).toBe(2);
});

test("a request the browser dropped across a back-forward-cache hide returns with a quiet notice", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const question = "缓存丢了请求会怎样？";
  const answer = "再问一次就能回答。";
  let requests = 0;
  await page.route("**/api/inquiry", async (route) => {
    requests += 1;
    const request = inquiryRequest(route);
    if (requests > 1) {
      await fulfillInquiry(route, request, answer);
      return;
    }
    received.resolve();
    await gate.promise;
    await route.abort("connectionaborted");
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill(question);
  await field.press("Enter");
  await received.promise;

  await dispatchPageTransition(page, "pagehide", true);
  gate.resolve();
  await dispatchPageTransition(page, "pageshow", true);
  // Not a silent drop: the question returns with one quiet, retryable line.
  await expect(field).toHaveValue(question);
  await expect(inquiry.getByRole("status")).toHaveText("没能连上 Matter，这句话没有继续发送。");
  await expect(inquiry.locator("[data-inquiry-role]")).toHaveCount(0);

  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(answer);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(1);
  expect(requests).toBe(2);
});

test("a real unload revokes the waiting question and makes its answer inert", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const routeSettled = deferred<void>();
  const question = "真正离开时会怎样？";
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    received.resolve();
    await gate.promise;
    await fulfillInquiry(route, request, "这条回答不应出现。").catch(() => undefined);
    routeSettled.resolve();
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill(question);
  await field.press("Enter");
  await received.promise;

  await dispatchPageTransition(page, "pagehide", false);
  await expect(field).toHaveValue(question);
  await expect(inquiry.locator("[data-inquiry-role]")).toHaveCount(0);
  // A real unload needs no notice.
  await expect(inquiry.getByRole("status")).not.toHaveText("没能连上 Matter，这句话没有继续发送。");
  gate.resolve();
  await routeSettled.promise;
  await expect(inquiry.locator("[data-inquiry-role]")).toHaveCount(0);
  expect(await inquiryExchangeCount(page)).toBe(0);
});

test("a material-context change keeps the answer tied to its captured question", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const routeSettled = deferred<void>();
  const lateText = "旧上下文的回答。";
  const freshText = "这是新上下文的回答。";
  let requestCount = 0;
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    requestCount += 1;
    if (requestCount > 1) {
      await fulfillInquiry(route, request, freshText);
      return;
    }
    received.resolve();
    await gate.promise;
    await fulfillInquiry(route, request, lateText);
    routeSettled.resolve();
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("当前画面在说什么？");
  await field.press("Enter");
  await received.promise;

  // Invoke the index action without a pointer-down outside Inquiry. This proves
  // a real projected-context change does not masquerade as an explicit close.
  await page.getByRole("button", { name: /暂时不纳入画面里的材料/u }).first()
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(inquiry).toBeVisible();
  gate.resolve();
  await routeSettled.promise;
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(lateText);
  await field.fill("新上下文现在在说什么？");
  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]').last()).toContainText(freshText);
  await expect(inquiry).toContainText(lateText);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(2);
});

test("chrome restoration preserves ordinary hover and an explicit Escape dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  const lens = page.locator("[data-node-action-lens]");
  const paper = page.locator(".matter-document");

  await passage.hover();
  await expect(lens).toBeVisible();
  await paper.evaluate((element: HTMLElement) => { element.dataset.canvasModalOpen = "true"; });
  await expect(lens).toHaveCount(0);
  await paper.evaluate((element: HTMLElement) => { element.dataset.canvasModalOpen = "false"; });
  await expect(lens).toBeVisible();

  await passage.focus();
  await passage.press("ArrowRight");
  await expect(lens).toBeVisible();
  await lens.getByRole("button").first().focus();
  await lens.getByRole("button").first().press("Escape");
  await expect(lens).toHaveCount(0);
  await expect(passage).toBeFocused();

  await paper.evaluate((element: HTMLElement) => { element.dataset.canvasModalOpen = "true"; });
  await paper.evaluate((element: HTMLElement) => { element.dataset.canvasModalOpen = "false"; });
  await expect(lens).toHaveCount(0);
});

test("two separate Inquiry openings persist two distinct exchange identities", async ({ page }) => {
  await page.route("**/api/inquiry", async (route) => {
    const request = inquiryRequest(route);
    await fulfillInquiry(route, request, `回答：${request.question}`);
  });
  await page.goto("/matter");
  const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const askOnce = async (question: string) => {
    await ask.click();
    const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
    await field.fill(question);
    await field.press("Enter");
    await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(`回答：${question}`);
    await page.keyboard.press("Escape");
  };

  await askOnce("第一问是什么？");
  await askOnce("第二问是什么？");

  await expect.poll(() => inquiryExchangeIds(page)).toHaveLength(2);
  const ids = await inquiryExchangeIds(page);
  expect(new Set(ids).size).toBe(2);
});

test("a maximum-length Inquiry answer stays keyboard-readable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const longText = Array.from("这段材料保留原意，也保留尚未结束的停顿。".repeat(200))
    .slice(0, 3_200)
    .join("");
  expect(Array.from(longText)).toHaveLength(3_200);
  await page.route("**/api/inquiry", async (route) => {
    await fulfillInquiry(route, inquiryRequest(route), longText);
  });
  await page.goto("/matter");
  await page.getByRole("button", { name: "打开 Matter 菜单" }).click();
  await page.getByRole("dialog", { name: "Matter" })
    .getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const field = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
  await field.fill("这段材料的停顿在哪里？");
  await field.press("Enter");
  const thread = inquiry.locator("[data-inquiry-thread]");
  await expect(thread).toHaveAttribute("data-scrollable", "true");
  await field.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(thread).toBeFocused();
  await thread.evaluate((element) => { element.scrollTop = 0; });
  await thread.press("End");
  await expect.poll(() => thread.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(inquiry).toBeInViewport();
});

type InquiryWireRequest = Readonly<{
  protocolVersion: string;
  requestId: string;
  question: string;
  context: Readonly<{
    treeId: string;
    revision: number;
    scope: "selection" | "tree";
    lineage: readonly Readonly<{ text: string }>[];
    thoughtCount: number;
    clipped: boolean;
  }>;
}>;

function inquiryRequest(route: Route): InquiryWireRequest {
  return route.request().postDataJSON() as InquiryWireRequest;
}

async function fulfillInquiry(
  route: Route,
  request: InquiryWireRequest,
  text: string,
): Promise<void> {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      protocolVersion: request.protocolVersion,
      basis: {
        requestId: request.requestId,
        treeId: request.context.treeId,
        revision: request.context.revision,
        scope: request.context.scope,
      },
      status: "answered",
      text,
      receipt: {
        scope: request.context.scope,
        lineageNodes: request.context.lineage.length,
        contextCodePoints: request.context.lineage.reduce(
          (total, node) => total + Array.from(node.text).length,
          0,
        ),
        clipped: request.context.clipped,
        thoughtCount: request.context.thoughtCount,
      },
    }),
  });
}

async function inquiryExchangeCount(page: Page): Promise<number> {
  return (await readInquiryRecords(page)).reduce((total, record) => total + record.ids.length, 0);
}

async function inquiryExchangeIds(page: Page): Promise<readonly string[]> {
  return (await readInquiryRecords(page)).flatMap((record) => record.ids);
}

async function readInquiryRecords(page: Page): Promise<readonly Readonly<{ ids: readonly string[] }>[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("inquiryRecords", "readonly");
      const records = await new Promise<Array<{ exchanges?: Array<{ id?: unknown }> }>>((resolve, reject) => {
        const request = transaction.objectStore("inquiryRecords").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return records.map((record) => ({
        ids: (record.exchanges ?? []).flatMap((exchange) =>
          typeof exchange.id === "string" ? [exchange.id] : []
        ),
      }));
    } finally {
      database.close();
    }
  });
}

async function setDocumentVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function dispatchPageTransition(
  page: Page,
  type: "pagehide" | "pageshow",
  persisted: boolean,
): Promise<void> {
  await page.evaluate(({ type, persisted }) => {
    window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
  }, { type, persisted });
}

async function segmentProbeRect(
  text: ReturnType<Page["locator"]>,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return text.evaluate((element) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const delimiter = textNode.data.search(/[，。；：！？、…,.;:!?]/u);
    const end = delimiter > 0 ? delimiter : textNode.data.length;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, end);
    const rect = Array.from(range.getClientRects()).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (rect === undefined) throw new Error("fixture fragment missing");
    return { x: rect.left + rect.width / 2 - 2, y: rect.top + rect.height / 2 - 2, width: 4, height: 4 };
  });
}

async function drawEarlyReleaseLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  await expect(page.locator(".lasso-layer")).toHaveAttribute("data-drawing", "true");
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  await page.mouse.move(rect.x - margin, rect.y + Math.min(18, rect.height * .45), { steps: 2 });
  await page.mouse.up();
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((settle) => { resolve = settle; });
  return { promise, resolve };
}
