import { expect, test, type Page, type Route } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT_ID = "thought_fixture_root";

test("Ask Matter and material-local AI surfaces own one transient slot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);

  await ask.click();
  await expect(inquiry).toBeVisible();
  await passage.hover();
  // Open canvas chrome suppresses the local lens, so the person cannot enter
  // a second AI surface without first leaving Inquiry.
  await expect(page.getByRole("button", { name: "Rewrite this material with AI" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();

  await passage.hover();
  await page.getByRole("button", { name: "Rewrite this material with AI" }).click();
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
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text));
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  // A neutral lasso may remain visible because it is also legitimate Inquiry
  // context. Elastic owns the AI slot only when the person starts adjusting a
  // grip; keyboard and pointer activation share that boundary.
  await expect(inquiry).toBeVisible();
  await page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" }).press("ArrowDown");
  await expect(inquiry).toBeHidden();
});

test("closing Inquiry revokes a delayed answer before UI or durable record", async ({ page }) => {
  const gate = deferred<void>();
  const received = deferred<void>();
  const routeSettled = deferred<void>();
  const lateText = "这条迟到的回答绝不能出现。";
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
      // A revoked browser request may reject route fulfillment. Either outcome
      // must settle before the fresh request below proves the stale turn inert.
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

  await ask.click();
  await field.fill(freshQuestion);
  await field.press("Enter");
  await expect(inquiry.locator('[data-inquiry-role="matter"]')).toContainText(freshText);
  await expect(inquiry).not.toContainText(lateText);
  await expect.poll(() => inquiryExchangeCount(page)).toBe(1);
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
  const lens = page.getByRole("toolbar", { name: "Thought context" });
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
