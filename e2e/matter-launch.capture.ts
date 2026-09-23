import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  inquiryBasis,
  inquiryReceipt,
  type InquiryRequest,
} from "../features/matter/protocol/inquiry-contract";
import {
  buildTextSwapPlan,
  type TextSwapEnvelope,
} from "../features/matter/protocol/text-swap-contract";
import {
  buildTransformPlan,
  type TransformEnvelope,
} from "../features/matter/protocol/transform-contract";
import { LAUNCH_POINT_TALK_FIXTURE } from "./matter-launch.fixture";

const SOURCE = "我们怀念的也许不是一个真实存在过的过去";
const SUFFIX = "，而是那个过去在今天仍然允许我们想象的其他生活。";
const EXPANDED = "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去";
const FIRST_BRANCH = LAUNCH_POINT_TALK_FIXTURE.passage;
const REWRITTEN_BRANCH = LAUNCH_POINT_TALK_FIXTURE.text;
const THIRD_BRANCH = "怀念不是返回原处，而是确认还有没有继续想象的入口。";
const NESTED_BRANCH = "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。";
const INQUIRY_QUESTION = "这段材料把‘怀念’理解成什么？";
const INQUIRY_FIXTURE_ANSWER =
  "它把“怀念”理解为过去曾让另一种生活仍可被想象。被保留的不是过去本身，而是当下尚未关闭的可能性。";
const DOCUMENT_TITLE = "被允许想象的其他生活";
const VOICE_SUBTITLE = "被允许想象的其他生活。";
const ROOT_ID = "thought_fixture_root";
const RECORDING_DURATION_MS = 68_000;
const CAPTURE_WIDTH = 1_600;
const CAPTURE_HEIGHT = 900;

type Point = Readonly<{ x: number; y: number }>;
type Bounds = Readonly<{ left: number; top: number; width: number; height: number }>;
type CameraCue = Readonly<{
  name:
    | "opening-root"
    | "about-start"
    | "about-end"
    | "voice-tool-start"
    | "voice-tool-active"
    | "voice-tool-end"
    | "point-talk-start"
    | "point-talk-end"
    | "elastic-start"
    | "elastic-confirm"
    | "elastic-end"
    | "inquiry-start"
    | "inquiry-end";
  milliseconds: number;
  bounds: Bounds;
}>;

type PresentationState = Readonly<{
  theme: "light" | "dark";
  leafFx: "on" | "off";
  ambient: "poster" | "video";
}>;

type StoryEventName =
  | "daylight-leaf"
  | "night"
  | "about"
  | "model-api"
  | "voice-recording"
  | "voice-transcribing"
  | "voice-material"
  | "point-talk-transcribed"
  | "point-talk-commit"
  | "nested-branch"
  | "elastic-commit"
  | "branch-held-aside"
  | "branch-restored"
  | "inquiry-answer"
  | "undo"
  | "canvas-positioned";

test("capture the Matter launch master", async ({ context, page }) => {
  const rawVideoPath = process.env.MATTER_LAUNCH_RAW_WEBM?.trim();
  const runDirectory = process.env.MATTER_LAUNCH_RUN_DIR?.trim();
  if (rawVideoPath === undefined || rawVideoPath.length === 0) {
    throw new Error("MATTER_LAUNCH_RAW_WEBM must name the operator-supplied recording output.");
  }
  if (runDirectory === undefined || runDirectory.length === 0) {
    throw new Error("MATTER_LAUNCH_RUN_DIR must name the operator-supplied capture directory.");
  }
  const liveInquiry = process.env.MATTER_LAUNCH_LIVE_INQUIRY === "true";
  const offlineDemo = process.env.MATTER_LAUNCH_OFFLINE_DEMO === "true";
  if (liveInquiry === offlineDemo) {
    throw new Error("The launch master requires exactly one explicit Ask Matter mode.");
  }

  await page.addInitScript(() => {
    localStorage.setItem("matter.canvas-preferences.v1", JSON.stringify({
      version: 1,
      language: "zh-CN",
      leafFx: false,
      appearance: "light",
    }));
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!isCaptureOrigin(url)) {
      await route.abort("blockedbyclient");
      throw new Error(`Launch capture blocked ${url.origin}${url.pathname}.`);
    }
    await route.continue();
  });
  await context.routeWebSocket(/.*/u, async (route) => {
    const url = new URL(route.url());
    if (!isCaptureOrigin(url)) {
      await route.close({ code: 1008, reason: "External connections are disabled during capture." });
      throw new Error(`Launch capture blocked WebSocket ${url.origin}${url.pathname}.`);
    }
    route.connectToServer();
  });
  let transformRequests = 0;
  let transformReceipt: Readonly<{
    amount: number | null;
    passageMatches: boolean;
    status: number;
  }> | null = null;
  let textSwapRequests = 0;
  let textSwapReceipt: Readonly<{
    directionMatches: boolean;
    passageMatches: boolean;
    status: number;
  }> | null = null;
  let inquiryRequests = 0;
  let inquiryThoughtCount: number | null = null;
  let transcriptionRequests = 0;
  let daylightPresentation: PresentationState | null = null;
  let nightPresentation: PresentationState | null = null;
  const storyEvents: Partial<Record<StoryEventName, number>> = {};
  await page.route("**/api/turn", async (route) => {
    const envelope = route.request().method() === "POST"
      ? route.request().postDataJSON() as {
        requestVersion?: unknown;
        gesture?: { amount?: unknown };
        selection?: { selectedText?: unknown };
      }
      : null;
    if (envelope?.requestVersion === "transform/2") {
      transformRequests += 1;
      await page.waitForTimeout(950);
      const passageMatches = envelope.selection?.selectedText === SOURCE;
      transformReceipt = Object.freeze({
        amount: typeof envelope.gesture?.amount === "number" ? envelope.gesture.amount : null,
        passageMatches,
        status: 200,
      });
      if (!passageMatches) {
        throw new Error(
          `Launch lasso selected ${JSON.stringify(envelope.selection?.selectedText)} instead of the first passage.`,
        );
      }
      const plan = buildTransformPlan(envelope as TransformEnvelope, EXPANDED);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(plan),
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/text-swap", async (route) => {
    const envelope = route.request().method() === "POST"
      ? route.request().postDataJSON() as {
        requestVersion?: unknown;
        direction?: { text?: unknown };
        selection?: { selectedText?: unknown };
      }
      : null;
    if (envelope?.requestVersion === "text-swap/2") {
      textSwapRequests += 1;
      await page.waitForTimeout(750);
      const plan = buildTextSwapPlan(
        envelope as TextSwapEnvelope,
        LAUNCH_POINT_TALK_FIXTURE.text,
      );
      textSwapReceipt = Object.freeze({
        directionMatches: envelope.direction?.text === LAUNCH_POINT_TALK_FIXTURE.direction,
        passageMatches: envelope.selection?.selectedText === LAUNCH_POINT_TALK_FIXTURE.passage,
        status: 200,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(plan),
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/inquiry", async (route) => {
    const body = route.request().postData() ?? "";
    if (
      route.request().method() === "POST" &&
      body.includes('"protocolVersion":"0.2"') &&
      body.includes('"question"') &&
      body.includes('"context"')
    ) {
      inquiryRequests += 1;
      const payload = route.request().postDataJSON() as InquiryRequest;
      inquiryThoughtCount = typeof payload.context?.thoughtCount === "number"
        ? payload.context.thoughtCount
        : null;
      if (offlineDemo) {
        await page.waitForTimeout(900);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            protocolVersion: "0.2",
            basis: inquiryBasis(payload),
            status: "answered",
            text: INQUIRY_FIXTURE_ANSWER,
            receipt: inquiryReceipt(payload.context),
          }),
        });
        return;
      }
    }
    await route.fallback();
  });
  await page.route("**/api/transcribe", async (route) => {
    const contentType = route.request().headers()["content-type"] ?? "";
    if (route.request().method() === "POST" && contentType.startsWith("multipart/form-data")) {
      transcriptionRequests += 1;
      // The fixture is intentionally fast. Preserve a truthful, perceivable
      // transcription state so the film can show voice becoming material.
      await page.waitForTimeout(700);
    }
    await route.fallback();
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/matter");
  const canvas = page.locator(".matter-canvas");
  const paper = page.locator(".matter-document");
  const materialFiles = page.locator("#material-files");
  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  const leafFx = page.locator('[data-chrome-control="fx"]');
  await expect(materialFiles).toHaveAttribute("data-persistence-phase", "saved");
  await expect(paper).toHaveAttribute("data-canvas-theme", "light");
  await expect(paper).toHaveAttribute("data-leaf-fx", "off");
  await expect(ambient).toHaveAttribute("data-fx", "off");
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("[data-thought-id]")).toHaveCount(1);
  await expect(page.locator("aside.material-files .material-file")).toHaveCount(1);
  await expect(page.getByText("No material yet.", { exact: true })).toHaveCount(0);
  const rootId = ROOT_ID;
  const root = page.locator(`[data-thought-text-id="${rootId}"]`);
  await expect(root).toHaveText(`${SOURCE}${SUFFIX}`);
  await expect(page.getByRole("button", {
    name: `重命名画布：${DOCUMENT_TITLE}`,
    exact: true,
  })).toBeVisible();
  const initialVoice = page.locator('[data-tool-id="voice"]');
  await expect(initialVoice).toBeEnabled();
  await expect(initialVoice).toHaveAttribute("aria-label", "录入一级想法");
  await expect(page.locator(".matter-guidance__next")).toHaveText("选择一段想法。");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Warm the real ambient media before the recorder starts, then return to the
  // required unadorned opening. AmbientWorkbench retains its ready state, so
  // the filmed FX click cannot swap poster -> video during the Voice close-up.
  await leafFx.click();
  await waitForAmbientMotion(page, ambient);
  await leafFx.click();
  await expect(leafFx).toHaveAttribute("aria-pressed", "false");
  await expect(ambient).toHaveAttribute("data-fx", "off");
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await Promise.all(["turn", "text-swap", "transcribe", "inquiry"].map(async (endpoint) => {
    await page.evaluate(async (path) => {
      await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
    }, `/matter/api/${endpoint}`);
  }));
  await centerOpeningMaterial(page, root, paper);
  await installCapturePointer(page);

  let cursor: Point = { x: 86, y: 450 };
  // The screencast handshake can take several seconds on a cold browser. The
  // authored clock must begin only once the recorder is actually accepting
  // frames, otherwise every cue is born late and the semantic camera windows
  // collapse toward the end of the take.
  let startedAt = 0;
  const cues: CameraCue[] = [];
  const at = async (milliseconds: number) => {
    const remaining = milliseconds - (performance.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
  };
  const moveTo = async (target: Locator, durationMs = 480) => {
    const bounds = await target.boundingBox();
    if (bounds === null) throw new Error("Launch-film target is not visible.");
    const next = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    cursor = await glide(page, cursor, next, durationMs);
  };
  const click = async (target: Locator, durationMs = 420) => {
    await moveTo(target, durationMs);
    await page.waitForTimeout(55);
    await page.mouse.down();
    await page.waitForTimeout(55);
    await page.mouse.up();
    // Pointer-operated controls should not carry a keyboard focus halo into
    // the next filmed state. This preserves the product's focus-visible
    // contract while keeping the pointer capture visually truthful.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.waitForTimeout(45);
  };
  const ensureSelected = async (target: Locator) => {
    if (await target.getAttribute("aria-pressed") !== "true") await click(target, 360);
    await expect(target).toHaveAttribute("aria-pressed", "true");
  };
  const cue = async (name: CameraCue["name"], ...targets: readonly Locator[]) => {
    cues.push(Object.freeze({
      name,
      milliseconds: Math.round(performance.now() - startedAt),
      bounds: await unionBounds(targets, name),
    }));
  };
  const receiptEvent = (name: StoryEventName) => {
    storyEvents[name] = Math.round(performance.now() - startedAt);
  };
  const ids = () => page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id") ?? ""));
  const addBranch = async (parent: Locator): Promise<string> => {
    await ensureSelected(parent);
    const before = await ids();
    const beforeRows = await page.locator("aside.material-files .material-file").count();
    const parentId = await parent.getAttribute("data-thought-text-id");
    if (parentId === null) throw new Error("Branch parent does not expose a material identity.");
    await click(page.locator('[data-tool-id="branch"]'), 360);
    await expect(page.locator("[data-thought-id]")).toHaveCount(before.length + 1);
    await expect(page.locator("aside.material-files .material-file")).toHaveCount(beforeRows + 1);
    await expect(materialFiles).toHaveAttribute("data-persistence-phase", "saved");
    const after = await ids();
    const added = after.find((id) => !before.includes(id));
    if (added === undefined) throw new Error("Branch did not publish its new material identity.");
    await expect(page.locator(`aside.material-files .material-file[data-node-id="${added}"]`)).toBeVisible();
    await expect(page.locator(`[data-thought-id="${added}"]`)).toHaveAttribute("data-parent-id", parentId);
    return added;
  };
  const centerFromIndex = async (nodeId: string, target: Locator) => {
    const open = page.locator(
      `aside.material-files .material-file[data-node-id="${nodeId}"] .material-file__open`,
    );
    await click(open, 360);
    await expect.poll(async () => {
      const bounds = await target.boundingBox();
      return bounds !== null && bounds.x >= 360 && bounds.x + bounds.width <= CAPTURE_WIDTH - 120;
    }, { timeout: 4_000 }).toBe(true);
  };

  await page.screencast.start({
    path: rawVideoPath,
    // 1600x900 JPEG frames at 95 can outpace Playwright's single-threaded VP8
    // writer and turn a 68-second take into minutes of interaction lag. The
    // moving leaf field plus four authored branches makes that pressure real;
    // 58 keeps the recorder clock coupled to interaction time on the moving
    // leaf scene. Final clarity comes from the 1600x900 source, a mild 0.9x
    // downscale, and CRF 18 slow H.264 rather than an overloaded frame queue.
    quality: 58,
    size: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
  });
  startedAt = performance.now();

  try {
    // This is composition geometry, not duplicate film text. The renderer uses
    // the real captured pixels inside these bounds to keep the opening passage
    // gently legible while the surrounding paper remains deeply out of focus.
    const openingLines = await materialLineGeometry(root);
    cues.push(Object.freeze({
      name: "opening-root",
      milliseconds: Math.round(performance.now() - startedAt),
      bounds: mergeBounds(openingLines, "opening-root"),
    }));
    // The opening proves three real paper states before any product claim:
    // bare daylight, daylight leaf shadow, then night leaf shadow. All feature
    // demonstrations remain in the final state so the film does not keep
    // changing its visual ground beneath the viewer.
    await at(3_650);
    await click(leafFx, 260);
    await expect(leafFx).toHaveAttribute("aria-pressed", "true");
    await expect(paper).toHaveAttribute("data-leaf-fx", "on");
    await expect(ambient).toHaveAttribute("data-fx", "on");
    await waitForAmbientMotion(page, ambient);
    daylightPresentation = Object.freeze({ theme: "light", leafFx: "on", ambient: "video" });
    receiptEvent("daylight-leaf");

    await at(4_700);
    const appearance = page.locator('[data-chrome-control="appearance"]');
    await click(appearance, 300);
    await expect(appearance).toHaveText("深色");
    await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
    await expect(ambient).toHaveAttribute("data-fx", "on");
    await expect(ambient).toHaveAttribute("data-presentation", "video");
    nightPresentation = Object.freeze({ theme: "dark", leafFx: "on", ambient: "video" });
    receiptEvent("night");

    // Product provenance and the current Model API entry appear only after the
    // three paper states, and remain brief enough not to compete with material.
    await at(5_700);
    const aboutTrigger = page.locator('[data-chrome-control="about"]');
    await click(aboutTrigger, 440);
    const about = page.getByRole("dialog", { name: "关于 Matter" });
    await expect(about).toBeVisible();
    await cue("about-start", about);
    receiptEvent("about");
    await page.waitForTimeout(3_700);
    await cue("about-end", about);
    await click(about.getByRole("button", { name: "关闭: 关于 Matter" }), 360);
    await expect(about).toHaveCount(0);

    await at(8_900);
    const settings = page.locator('[data-chrome-control="settings"]');
    await click(settings, 380);
    const settingsMenu = page.getByRole("menu", { name: "Matter 设置" });
    await expect(settingsMenu).toBeVisible();
    await expect(settingsMenu.getByRole("menuitem", { name: "模型 API", exact: true })).toBeVisible();
    receiptEvent("model-api");
    await page.waitForTimeout(1_000);
    await click(settings, 320);
    await expect(settingsMenu).toBeHidden();

    // The opening passage remains the same authored material through every
    // paper state. Voice now grows one spoken subtitle beneath that selected
    // passage instead of manufacturing the sentence the viewer already read.
    await at(10_800);
    const voice = page.locator('[data-tool-id="voice"]');
    const rootGeometryBeforeSelection = await materialLineGeometry(root);
    await ensureSelected(root);
    await expect(page.locator(
      '.material-address-layer[data-address-variant="structural"]',
    )).toHaveAttribute("data-material-address-painted", "true");
    expect(await materialLineGeometry(root)).toEqual(rootGeometryBeforeSelection);
    await expect(voice).toHaveAttribute("aria-label", "在所选材料下录入想法");
    const beforeAdmission = await ids();
    await cue("voice-tool-start", voice);
    await moveTo(voice, 500);
    await page.waitForTimeout(180);
    await expect.poll(() => voice.evaluate((button) => ({
      ink: getComputedStyle(button).color,
      tile: getComputedStyle(button, "::before").backgroundColor,
    }))).toEqual({ ink: "rgb(22, 29, 39)", tile: "rgba(22, 29, 39, 0.08)" });
    await at(11_600);
    // Hold the real pressed state long enough for the close-up to perceive the
    // physical black contact, without inventing a video-only highlight.
    await page.mouse.down();
    await page.waitForTimeout(110);
    await page.mouse.up();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await expect(voice).toHaveAttribute("data-tool-state", "active");
    await page.waitForTimeout(180);
    await expect.poll(() => voice.evaluate((button) => ({
      ink: getComputedStyle(button).color,
      tile: getComputedStyle(button, "::before").backgroundColor,
    }))).toEqual({ ink: "rgb(245, 245, 242)", tile: "rgb(22, 29, 39)" });
    await cue("voice-tool-active", voice);
    await at(13_050);
    await cue("voice-tool-end", voice);
    await expect(page.locator(".matter-guidance")).toHaveAttribute(
      "data-guidance-state",
      "speak-recording",
    );
    await expect(page.locator(".matter-guidance__next")).toHaveText("说出你的想法。");
    receiptEvent("voice-recording");

    // The selected root owns the transient recording and transcription lane.
    // Hold it long enough to read before stopping: the camera's return is the
    // bridge from a pressed microphone to one new subordinate material.
    await at(13_650);
    await installAdmissionStreamReveal(page, VOICE_SUBTITLE, beforeAdmission);
    await page.mouse.down();
    await page.waitForTimeout(160);
    await page.mouse.up();
    await expect(page.locator(".matter-guidance")).toHaveAttribute(
      "data-guidance-state",
      "wait-transcription",
    );
    await expect(page.locator(".matter-guidance__next")).toHaveText("正在将声音变成材料。");
    receiptEvent("voice-transcribing");
    await expect(canvas).toHaveAttribute("data-layout-ready", "true", { timeout: 8_000 });
    await expect(page.locator("[data-thought-id]")).toHaveCount(2, { timeout: 8_000 });
    await expect(materialFiles).toHaveAttribute("data-persistence-phase", "saved");
    const afterAdmission = await ids();
    const voiceSubtitleId = afterAdmission.find((id) => !beforeAdmission.includes(id));
    if (voiceSubtitleId === undefined) throw new Error("Voice did not admit a subtitle identity.");
    const voiceSubtitle = page.locator(`[data-thought-text-id="${voiceSubtitleId}"]`);
    await expect(page.locator("body")).toHaveAttribute("data-launch-admission-stream", "done", {
      timeout: 5_000,
    });
    await expect(root).toHaveText(`${SOURCE}${SUFFIX}`);
    await expect(voiceSubtitle).toHaveText(VOICE_SUBTITLE);
    await expect(page.locator(
      `aside.material-files .material-file[data-node-id="${voiceSubtitleId}"]`,
    )).toBeVisible();
    receiptEvent("voice-material");
    await at(15_100);

    // Admission must not disturb the already-visible root's typography.
    expect(await materialLineGeometry(root)).toEqual(rootGeometryBeforeSelection);

    // Handle the first branch immediately with Point and Talk so the causal
    // reference -> direction -> one material change chain stays clear.
    await at(15_300);
    const firstBranchId = await addBranch(root);
    const firstBranch = page.locator(`[data-thought-text-id="${firstBranchId}"]`);
    await expect(firstBranch).toHaveText(FIRST_BRANCH);
    // Branches grow into a new structural column. Opening the new row is the
    // real index-navigation gesture and gives its complete passage, local AI
    // field, and later camera crop an honest on-screen owner.
    await centerFromIndex(firstBranchId, firstBranch);
    await page.waitForTimeout(450);

    await at(17_000);
    await moveTo(firstBranch, 420);
    const lens = page.locator("[data-node-action-lens]");
    await expect(lens.locator('[data-node-action="point-talk"]')).toBeVisible();
    await click(lens.locator('[data-node-action="point-talk"]'), 120);
    const pointTalk = page.locator(".point-talk");
    await expect(pointTalk).toBeVisible();
    await cue("point-talk-start", firstBranch, pointTalk);
    await at(18_050);
    await click(pointTalk.getByRole("button", { name: "说出改写方向", exact: true }), 220);
    await expect(pointTalk).toHaveAttribute("data-phase", "recording");
    await at(19_250);
    await click(pointTalk.getByRole("button", { name: "完成", exact: true }), 180);
    await expect(pointTalk).toHaveAttribute("data-phase", "transcribing");
    await expect(pointTalk).toContainText("正在听清…");
    const directionField = pointTalk.getByRole("textbox", {
      name: "告诉 AI 这段文字应该怎样改变",
    });
    await expect(pointTalk).toHaveAttribute("data-phase", "ready", { timeout: 8_000 });
    await expect(directionField).toHaveValue(LAUNCH_POINT_TALK_FIXTURE.direction);
    expect(textSwapRequests).toBe(0);
    receiptEvent("point-talk-transcribed");
    await at(21_250);
    await click(pointTalk.getByRole("button", { name: "改写", exact: true }), 220);
    await expect(pointTalk).toHaveAttribute("data-phase", "pending");
    await expect(pointTalk).toContainText("正在换一种说法…");
    await expect.poll(() => textSwapReceipt).toEqual({
      directionMatches: true,
      passageMatches: true,
      status: 200,
    });
    await expect(firstBranch).toHaveText(REWRITTEN_BRANCH, { timeout: 10_000 });
    expect(textSwapRequests).toBe(1);
    receiptEvent("point-talk-commit");
    await page.waitForTimeout(800);
    await cue("point-talk-end", firstBranch);

    // Voice already authored the first subtitle. Add the third sibling now;
    // one will be held aside later so the viewer sees both the authored tree
    // and the smaller working context that the question actually sends.
    await at(23_300);
    await centerFromIndex(rootId, root);
    const thirdBranchId = await addBranch(root);
    const thirdBranch = page.locator(`[data-thought-text-id="${thirdBranchId}"]`);
    await expect(thirdBranch).toHaveText(THIRD_BRANCH);
    await expect(page.locator("aside.material-files .material-file")).toHaveCount(4);
    await page.waitForTimeout(320);

    // Continue one of the three root branches by one more level. This is the
    // same durable Branch action, not an editorial label: both the paper and
    // the index must expose the new three-level lineage before the camera fits
    // the wider authored tree.
    await at(24_150);
    const nestedBranchId = await addBranch(thirdBranch);
    const nestedBranch = page.locator(`[data-thought-text-id="${nestedBranchId}"]`);
    await expect(nestedBranch).toHaveText(NESTED_BRANCH);
    await expect(nestedBranch.locator("xpath=..")).toHaveAttribute(
      "data-parent-id",
      thirdBranchId,
    );
    await expect(page.locator("aside.material-files .material-file")).toHaveCount(5);
    receiptEvent("nested-branch");
    await page.waitForTimeout(600);

    // The authored fork is wider than one reading column. Use Matter's own
    // transient canvas navigation to fit it before the film enters Elastic;
    // the document keeps no authored coordinates and the outro can show both
    // the paper structure and its matching index without clipping a branch.
    const move = page.locator('[data-tool-id="move"]');
    await click(move, 280);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "pan");
    const navigationPaperBounds = await paper.boundingBox();
    if (navigationPaperBounds === null) throw new Error("Launch-film paper is not visible.");
    cursor = await glide(page, cursor, {
      x: navigationPaperBounds.x + navigationPaperBounds.width / 2,
      y: navigationPaperBounds.y + navigationPaperBounds.height / 2,
    }, 260);
    await page.keyboard.down("Control");
    for (let step = 1; step <= 4; step += 1) {
      const previous = (step - 1) / 4;
      const current = step / 4;
      const smooth = (progress: number) => progress * progress * progress *
        (progress * (progress * 6 - 15) + 10);
      await page.mouse.wheel(0, 110 * (smooth(current) - smooth(previous)));
      await page.waitForTimeout(70);
    }
    await page.keyboard.up("Control");
    await expect.poll(async () => Number(
      await page.locator("main.matter-shell").getAttribute("data-viewport-zoom"),
    )).toBeLessThan(0.82);
    await page.waitForTimeout(450);
    await click(move, 260);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "material");

    // Elastic keeps degree and confirmation separate. Its cue encloses the
    // selected text, both grips, and the shaped address rather than one point.
    await at(30_000);
    await ensureSelected(root);
    const lasso = page.locator('[data-tool-id="lasso"]');
    await click(lasso, 360);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    const label = root.locator(".spatial-thought__label");
    cursor = await drawSelectedSegment(page, cursor, await segmentProbeRects(label, 0));
    const actionable = page.locator('.material-address-layer[data-address-variant="actionable"]');
    const addressPath = actionable.locator(".material-address-layer__path");
    const grips = page.locator(".stretch-handle");
    await expect(actionable).toHaveAttribute("data-material-address-painted", "true");
    await expect(grips).toHaveCount(2);
    await cue("elastic-start", root, addressPath, grips.first(), grips.last());

    await at(32_000);
    const lowerGrip = page.getByRole("slider", {
      name: "用下握点设置所选文字的展开程度",
    });
    await moveTo(lowerGrip, 380);
    await page.mouse.down();
    cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y + 64 }, 820);
    await page.mouse.up();
    await expect(lowerGrip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(actionable).toHaveAttribute("data-address-confirmable", "true");
    expect(transformRequests).toBe(0);
    await page.waitForTimeout(650);

    await at(34_100);
    const confirmPoint = await elasticAddressInteriorPoint(page);
    cursor = await glide(page, cursor, confirmPoint, 360);
    await cue("elastic-confirm", addressPath);
    await page.waitForTimeout(70);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
    await expect(page.locator(".matter-guidance__next")).toHaveText("已确认，正在展开。");
    await expect(root).toHaveText(`${EXPANDED}${SUFFIX}`, { timeout: 10_000 });
    expect(transformRequests).toBe(1);
    expect(transformReceipt).toEqual({ amount: 0.5, passageMatches: true, status: 200 });
    await expect(materialFiles).toHaveAttribute("data-persistence-phase", "saved");
    receiptEvent("elastic-commit");
    await page.waitForTimeout(850);
    await cue("elastic-end", root);

    await at(36_850);
    if (await page.locator("main.matter-shell").getAttribute("data-lasso-mode") === "true") {
      await click(lasso, 320);
    }
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator(".stretch-handle")).toHaveCount(0);

    // The third subtitle leaves the working context through its real directory
    // minus. It remains faintly visible as authored material, and the same
    // position becomes a plus for recovery after the bounded inquiry.
    await at(38_000);
    const heldAsideRow = page.locator(
      `aside.material-files .material-file[data-node-id="${thirdBranchId}"]`,
    );
    const contextControl = heldAsideRow.locator(".material-file__context-control--set-aside");
    await moveTo(heldAsideRow, 420);
    await expect(contextControl).toHaveCSS("opacity", "0.68");
    await click(contextControl, 180);
    await expect(heldAsideRow).toHaveAttribute("data-context-excluded", "true");
    await expect(thirdBranch.locator("xpath=..")).toHaveAttribute("data-context-restore-target", "true");
    await expect(firstBranch.locator("xpath=..")).not.toHaveAttribute("data-context-excluded", "true");
    await expect(voiceSubtitle.locator("xpath=..")).not.toHaveAttribute("data-context-excluded", "true");
    // The directory hides descendants while their parent is held aside, then
    // restores the complete five-row lineage from the parent's plus control.
    await expect(page.locator("aside.material-files .material-file")).toHaveCount(4);
    receiptEvent("branch-held-aside");

    // Inquiry is the sole model-shaped read-only shot. It remains a bounded turn
    // and must produce a real answer from the three-thought working projection
    // after its question is visibly dictated and confirmed.
    await at(39_200);
    const askMatter = page.getByRole("button", { name: "询问 Matter", exact: true });
    await click(askMatter, 400);
    const inquiry = page.locator('#matter-inquiry[role="dialog"]');
    await expect(askMatter).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "inquiry");
    await expect(inquiry).toBeVisible();
    await expect(inquiry).toHaveAccessibleName("询问 Matter");
    await cue("inquiry-start", inquiry);
    const inquiryField = inquiry.getByRole("textbox", { name: "问一句关于这份材料的话" });
    const inquiryDictate = inquiry.locator('[data-inquiry-control="dictate"]');
    await click(inquiryDictate, 180);
    await expect(inquiry).toHaveAttribute("data-inquiry-phase", "listening");
    await page.waitForTimeout(760);
    await click(inquiryDictate, 180);
    await expect(inquiry).toHaveAttribute("data-inquiry-phase", "transcribing");
    await expect(inquiryField).toHaveValue(INQUIRY_QUESTION, { timeout: 8_000 });
    await expect(inquiry).toHaveAttribute("data-inquiry-phase", "idle");
    await page.waitForTimeout(320);
    await click(inquiry.locator('[data-inquiry-control="ask"]'), 180);
    const inquiryAnswer = inquiry.locator('[data-inquiry-role="matter"]').last();
    await expect(inquiryAnswer).toBeVisible({ timeout: 7_000 });
    await expect.poll(() => inquiryAnswer.evaluate((turn) => {
      const text = turn.textContent?.trim() ?? "";
      return text.length > 0 && text === turn.getAttribute("aria-label")?.trim();
    })).toBe(true);
    expect(inquiryRequests).toBe(1);
    expect(inquiryThoughtCount).toBe(3);
    receiptEvent("inquiry-answer");
    // Network latency may consume the authored clock. Hold from the real
    // answer receipt instead of a nominal timestamp so the response remains
    // readable in every valid take.
    await page.waitForTimeout(1_250);
    await cue("inquiry-end", inquiry);
    await click(askMatter, 320);
    await expect(inquiry).toBeHidden();

    await click(heldAsideRow.locator('[data-context-action="restore"]'), 260);
    await expect(heldAsideRow).not.toHaveAttribute("data-context-excluded", "true");
    await expect(thirdBranch.locator("xpath=..")).not.toHaveAttribute("data-context-restore-target", "true");
    await expect(nestedBranch.locator("xpath=..")).not.toHaveAttribute("data-context-excluded", "true");
    receiptEvent("branch-restored");

    // Inquiry never enters history. Undo removes only Elastic while Point Talk
    // and all authored branches remain on the paper.
    await at(55_100);
    const undo = page.locator('[data-tool-id="undo"]');
    await click(undo, 400);
    await expect(root).toHaveText(`${SOURCE}${SUFFIX}`);
    await expect(firstBranch).toHaveText(REWRITTEN_BRANCH);
    await expect(voiceSubtitle).toHaveText(VOICE_SUBTITLE);
    await expect(thirdBranch).toHaveText(THIRD_BRANCH);
    await expect(nestedBranch).toHaveText(NESTED_BRANCH);
    await expect(page.locator("[data-thought-id]")).toHaveCount(5);
    await expect(page.locator("aside.material-files .material-file")).toHaveCount(5);
    await expect(materialFiles).toHaveAttribute("data-persistence-phase", "saved");
    receiptEvent("undo");

    // End by using the product's real move mode to place the authored tree a
    // little higher and left. The final shot therefore explains one more tool
    // while settling the paper into a deliberately composed reading position.
    await at(56_200);
    await click(move, 220);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "pan");
    const finalPaperBounds = await paper.boundingBox();
    if (finalPaperBounds === null) throw new Error("Launch-film paper is not visible.");
    const panStart = {
      x: finalPaperBounds.x + finalPaperBounds.width * 0.58,
      y: finalPaperBounds.y + finalPaperBounds.height * 0.58,
    };
    cursor = await glide(page, cursor, panStart, 360);
    await page.mouse.down();
    cursor = await glide(page, cursor, { x: panStart.x - 76, y: panStart.y - 42 }, 720);
    await page.mouse.up();
    await click(move, 220);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "material");
    receiptEvent("canvas-positioned");

    // Night was established before the demonstrations. End on that same real
    // paper, then let the renderer detach it over a blurred echo of the scene.
    await at(59_600);
    await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
    await expect(ambient).toHaveAttribute("data-fx", "on");
    await expect(ambient).toHaveAttribute("data-presentation", "video");
    await hideCapturePointer(page);

    // Keep only a short reading breath before the ending. The previous long
    // leaf-only hold looked like a missing action rather than intentional rest.
    await at(60_000);
    await at(RECORDING_DURATION_MS + 120);
  } finally {
    await page.screencast.stop();
    await writeFile(resolve(runDirectory, "capture-cues.json"), `${JSON.stringify({
      version: 10,
      durationMs: RECORDING_DURATION_MS,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      cues,
      requests: {
        transcribe: transcriptionRequests,
        transform: transformRequests,
        textSwap: textSwapRequests,
        inquiry: inquiryRequests,
      },
      inquiryMode: offlineDemo ? "fixture" : "live",
      presentation: {
        opening: { theme: "light", leafFx: "off", ambient: "poster" },
        daylight: daylightPresentation,
        night: nightPresentation,
      },
      document: { title: DOCUMENT_TITLE },
      events: storyEvents,
    }, null, 2)}\n`, "utf8");
  }
});

async function installAdmissionStreamReveal(
  page: Page,
  finalText: string,
  existingIds: readonly string[],
): Promise<void> {
  await page.evaluate(({ text, excludedIds }) => {
    document.body.dataset.launchAdmissionStream = "waiting";
    const observer = new MutationObserver(() => {
      const material = [...document.querySelectorAll<HTMLElement>("[data-thought-text-id]")]
        .find((candidate) => !excludedIds.includes(
          candidate.getAttribute("data-thought-text-id") ?? "",
        ));
      if (material === undefined) return;
      observer.disconnect();
      const graphemes = Array.from(text);
      const bounds = material.getBoundingClientRect();
      const computed = getComputedStyle(material);
      const presentation = material.cloneNode(true) as HTMLElement;
      presentation.removeAttribute("data-thought-text-id");
      presentation.setAttribute("aria-hidden", "true");
      presentation.textContent = "";
      Object.assign(presentation.style, {
        background: "transparent",
        color: computed.color,
        font: computed.font,
        height: `${bounds.height}px`,
        left: `${bounds.left}px`,
        letterSpacing: computed.letterSpacing,
        lineHeight: computed.lineHeight,
        margin: "0",
        opacity: "1",
        padding: computed.padding,
        pointerEvents: "none",
        position: "fixed",
        textAlign: computed.textAlign,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        zIndex: "35",
      });
      material.style.opacity = "0";
      document.body.append(presentation);
      let visible = 0;
      const reveal = () => {
        visible = Math.min(graphemes.length, visible + 2);
        presentation.textContent = graphemes.slice(0, visible).join("");
        if (visible < graphemes.length) {
          window.setTimeout(reveal, 38);
          return;
        }
        material.style.opacity = "";
        presentation.remove();
        document.body.dataset.launchAdmissionStream = "done";
      };
      window.setTimeout(reveal, 110);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, { text: finalText, excludedIds: [...existingIds] });
}

function isCaptureOrigin(url: URL): boolean {
  return url.hostname === "127.0.0.1" && url.port === "3120" &&
    (url.protocol === "http:" || url.protocol === "ws:");
}

async function waitForAmbientMotion(page: Page, ambient: Locator): Promise<void> {
  await expect(ambient).toHaveAttribute("data-presentation", "video", { timeout: 3_000 });
  const video = ambient.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element) =>
    element instanceof HTMLVideoElement &&
    element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    !element.paused
  ), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => new Promise<void>((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
  }));
}

async function centerOpeningMaterial(
  page: Page,
  material: Locator,
  paper: Locator,
): Promise<void> {
  const bounds = await material.boundingBox();
  const paperBounds = await paper.boundingBox();
  if (bounds === null || paperBounds === null) {
    throw new Error("Opening material cannot be centered before capture.");
  }
  const delta = {
    x: CAPTURE_WIDTH / 2 - (bounds.x + bounds.width / 2),
    y: CAPTURE_HEIGHT / 2 - (bounds.y + bounds.height / 2),
  };
  const move = page.locator('[data-tool-id="move"]');
  await move.click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "pan");
  const origin = {
    x: paperBounds.x + paperBounds.width / 2,
    y: paperBounds.y + paperBounds.height / 2,
  };
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + delta.x, origin.y + delta.y, { steps: 18 });
  await page.mouse.up();
  await move.click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "material");
  await expect.poll(async () => {
    const centered = await material.boundingBox();
    if (centered === null) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(centered.x + centered.width / 2 - CAPTURE_WIDTH / 2),
      Math.abs(centered.y + centered.height / 2 - CAPTURE_HEIGHT / 2),
    );
  }).toBeLessThan(6);
}

async function unionBounds(targets: readonly Locator[], name: string): Promise<Bounds> {
  if (targets.length === 0) throw new Error(`Launch-film cue ${name} has no target.`);
  const boxes = await Promise.all(targets.map((target) => target.boundingBox()));
  if (boxes.some((box) => box === null)) {
    throw new Error(`Launch-film cue ${name} has a hidden target.`);
  }
  const visible = boxes.filter((box) => box !== null);
  return mergeBounds(visible.map((box) => ({
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
  })), name);
}

function mergeBounds(rectangles: readonly Bounds[], name: string): Bounds {
  if (rectangles.length === 0) throw new Error(`Launch-film cue ${name} has no visible bounds.`);
  const left = Math.min(...rectangles.map((box) => box.left));
  const top = Math.min(...rectangles.map((box) => box.top));
  const right = Math.max(...rectangles.map((box) => box.left + box.width));
  const bottom = Math.max(...rectangles.map((box) => box.top + box.height));
  return Object.freeze({
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  });
}

async function materialLineGeometry(material: Locator): Promise<readonly Bounds[]> {
  return material.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    try {
      const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const fragments: DOMRect[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!(node instanceof Text) || node.data.length === 0) continue;
        range.selectNodeContents(node);
        fragments.push(...range.getClientRects());
      }
      return fragments
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((left, right) => left.top - right.top || left.left - right.left)
        .map((rect) => ({
          left: Math.round(rect.left * 100) / 100,
          top: Math.round(rect.top * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        }));
    } finally {
      range.detach();
    }
  });
}

async function installCapturePointer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pointer = document.createElement("div");
    pointer.id = "matter-launch-pointer";
    pointer.setAttribute("aria-hidden", "true");
    pointer.innerHTML = `
      <svg viewBox="0 0 24 30" width="24" height="30" aria-hidden="true">
        <path d="M3 2.5v20.1l5.1-4.7 3.7 8.6 4.2-1.9-3.8-8.3h7.1L3 2.5Z"
          fill="#f7f4ee" stroke="#161d27" stroke-width="1.7" stroke-linejoin="round" />
      </svg>`;
    Object.assign(pointer.style, {
      filter: "drop-shadow(0 1px 2px rgba(22,29,39,.18))",
      left: "0",
      opacity: "0",
      pointerEvents: "none",
      position: "fixed",
      top: "0",
      transform: "translate3d(-40px,-40px,0)",
      transition: "opacity 120ms ease",
      zIndex: "2147483647",
    });
    document.documentElement.append(pointer);
    window.addEventListener("mousemove", (event) => {
      pointer.style.opacity = "1";
      pointer.style.transform = `translate3d(${event.clientX - 3}px,${event.clientY - 3}px,0)`;
    }, { passive: true });
  });
}

async function positionCapturePointer(page: Page, point: Point): Promise<void> {
  // CDP screencasts do not consistently composite Chrome's native cursor, and
  // synthetic drag events can arrive without a paintable mousemove frame. Keep
  // the capture-only pointer on the exact product event coordinate explicitly.
  await page.locator("#matter-launch-pointer").evaluate((pointer, position) => {
    const element = pointer as HTMLElement;
    element.style.opacity = "1";
    element.style.transform = `translate3d(${position.x - 3}px,${position.y - 3}px,0)`;
  }, point);
}

async function hideCapturePointer(page: Page): Promise<void> {
  await page.locator("#matter-launch-pointer").evaluate((pointer) => {
    (pointer as HTMLElement).style.opacity = "0";
  });
}

async function glide(page: Page, from: Point, to: Point, durationMs: number): Promise<Point> {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const naturalDuration = Math.min(760, Math.max(340, 260 + Math.sqrt(distance) * 12));
  const effectiveDuration = Math.max(durationMs, naturalDuration);
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const mostlyVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.4;
  const normalX = distance === 0 ? 0 : -deltaY / distance;
  const normalY = distance === 0 ? 0 : deltaX / distance;
  // Long horizontal moves follow one shallow upward arc. It reads as a human
  // hand travelling toward a target without turning the pointer into a flourish.
  const direction = normalY === 0 ? 1 : -Math.sign(normalY);
  const bend = mostlyVertical ? 0 : Math.min(64, distance * 0.08) * direction;
  const firstControl = {
    x: clampPointer(from.x + deltaX * 0.3 + normalX * bend, CAPTURE_WIDTH),
    y: clampPointer(from.y + deltaY * 0.3 + normalY * bend, CAPTURE_HEIGHT),
  };
  const secondControl = {
    x: clampPointer(from.x + deltaX * 0.72 + normalX * bend * 0.55, CAPTURE_WIDTH),
    y: clampPointer(from.y + deltaY * 0.72 + normalY * bend * 0.55, CAPTURE_HEIGHT),
  };
  // Drive slightly faster than the recorder cadence so every emitted frame has
  // a fresh pointer position, while wall-clock sampling prevents load from
  // stretching the authored story.
  const startedAt = performance.now();
  for (;;) {
    const elapsed = performance.now() - startedAt;
    const linear = Math.min(1, elapsed / effectiveDuration);
    const eased = linear * linear * linear * (linear * (linear * 6 - 15) + 10);
    const remaining = 1 - eased;
    const point = {
      x: remaining * remaining * remaining * from.x +
        3 * remaining * remaining * eased * firstControl.x +
        3 * remaining * eased * eased * secondControl.x +
        eased * eased * eased * to.x,
      y: remaining * remaining * remaining * from.y +
        3 * remaining * remaining * eased * firstControl.y +
        3 * remaining * eased * eased * secondControl.y +
        eased * eased * eased * to.y,
    };
    await page.mouse.move(point.x, point.y);
    if (linear === 1) break;
    await page.waitForTimeout(Math.min(20, effectiveDuration - elapsed));
  }
  return to;
}

function clampPointer(value: number, maximum: number): number {
  return Math.min(maximum - 12, Math.max(12, value));
}

async function segmentProbeRects(
  text: Locator,
  segmentIndex: number,
): Promise<readonly Readonly<{ x: number; y: number; width: number; height: number }>[]> {
  return text.evaluate((element, index) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("Launch-film text node is missing.");
    const delimiters = new Set(["，", "。", "；", "：", "！", "？", "、", "…", ",", ".", ";", ":", "!", "?"]);
    const segments: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (let cursor = 0; cursor < textNode.data.length; cursor += 1) {
      if (!delimiters.has(textNode.data[cursor]!)) continue;
      if (cursor > start) segments.push({ start, end: cursor });
      start = cursor + 1;
      while (textNode.data[start] === " ") start += 1;
    }
    if (start < textNode.data.length) segments.push({ start, end: textNode.data.length });
    const segment = segments[index];
    if (segment === undefined) throw new Error("Launch-film segment is missing.");
    const range = document.createRange();
    range.setStart(textNode, segment.start);
    range.setEnd(textNode, segment.end);
    const rects = [...range.getClientRects()].filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    range.detach();
    if (rects.length === 0) throw new Error("Launch-film segment has no visible fragment.");
    return rects.map((rect) => ({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }));
  }, segmentIndex);
}

async function drawSelectedSegment(
  page: Page,
  cursor: Point,
  fragments: readonly Readonly<{ x: number; y: number; width: number; height: number }>[],
): Promise<Point> {
  if (fragments.length === 0) throw new Error("Launch-film segment has no lasso fragments.");
  const rows = [...fragments].sort((left, right) => left.y - right.y || left.x - right.x);
  const horizontalMargin = 18;
  const terminalMargin = 7;
  const verticalMargin = 13;
  const left = (index: number) => rows[index]!.x - horizontalMargin;
  const right = (index: number) => rows[index]!.x + rows[index]!.width +
    (index === rows.length - 1 ? terminalMargin : horizontalMargin);
  const top = (index: number) => rows[index]!.y - verticalMargin;
  const bottom = (index: number) => rows[index]!.y + rows[index]!.height + verticalMargin;
  const outline: Point[] = [
    { x: left(0), y: top(0) },
    { x: right(0), y: top(0) },
  ];
  for (let index = 0; index < rows.length; index += 1) {
    if (index === rows.length - 1) {
      outline.push({ x: right(index), y: bottom(index) });
      continue;
    }
    const seam = (rows[index]!.y + rows[index]!.height + rows[index + 1]!.y) / 2;
    outline.push(
      { x: right(index), y: seam },
      { x: right(index + 1), y: seam },
      { x: right(index + 1), y: top(index + 1) },
    );
  }
  outline.push({ x: left(rows.length - 1), y: bottom(rows.length - 1) });
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (index === 0) {
      outline.push({ x: left(0), y: top(0) });
      continue;
    }
    const seam = (rows[index - 1]!.y + rows[index - 1]!.height + rows[index]!.y) / 2;
    outline.push(
      { x: left(index), y: seam },
      { x: left(index - 1), y: seam },
      { x: left(index - 1), y: bottom(index - 1) },
    );
  }
  let points = outline;
  for (let pass = 0; pass < 2; pass += 1) {
    const open = points.slice(0, -1);
    const rounded: Point[] = [];
    for (let index = 0; index < open.length; index += 1) {
      const current = open[index]!;
      const next = open[(index + 1) % open.length]!;
      rounded.push(
        { x: current.x * 0.75 + next.x * 0.25, y: current.y * 0.75 + next.y * 0.25 },
        { x: current.x * 0.25 + next.x * 0.75, y: current.y * 0.25 + next.y * 0.75 },
      );
    }
    points = [...rounded, rounded[0]!];
  }
  cursor = await glide(page, cursor, points[0]!, 560);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(point.x, point.y);
    await positionCapturePointer(page, point);
    await page.waitForTimeout(42);
    cursor = point;
  }
  await page.mouse.up();
  await page.waitForTimeout(140);
  return cursor;
}

async function elasticAddressInteriorPoint(page: Page): Promise<Point> {
  const layer = page.locator('.material-address-layer[data-address-variant="actionable"]');
  await expect(layer).toHaveAttribute("data-address-confirmable", "true");
  const path = layer.locator(".material-address-layer__path");
  let point: Point | null = null;
  await expect.poll(async () => {
    point = await path.evaluate((element) => {
      if (!(element instanceof SVGGeometryElement)) {
        throw new Error("Launch-film Elastic address path is missing.");
      }
      const box = element.getBoundingClientRect();
      const matrix = element.getScreenCTM();
      if (matrix === null) return null;
      for (let y = box.top + 3; y < box.bottom - 3; y += 4) {
        for (let x = box.left + 3; x < box.right - 3; x += 4) {
          const local = new DOMPoint(x, y).matrixTransform(matrix.inverse());
          if (element.isPointInFill(local) && document.elementFromPoint(x, y) === element) {
            return { x, y };
          }
        }
      }
      return null;
    });
    return point;
  }).not.toBeNull();
  if (point === null) throw new Error("Launch-film Elastic address has no confirmable interior point.");
  return point;
}
