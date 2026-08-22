import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { createPerformanceThoughtTree } from "../features/matter/material/seeded-document";

test.skip(
  process.env.MATTER_RUN_TYPOGRAPHY_DOM_BENCH !== "true",
  "Run explicitly: this is the viewport-DOM Phase B falsification gate.",
);
test.describe.configure({ mode: "serial" });

const VIEWPORTS = Object.freeze([
  { name: "phone-320", width: 320, height: 720 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
]);
const COLUMN_WIDTHS = Object.freeze([236, 280, 520]);
const CANDIDATES = Object.freeze(["one-shot", 16, 32, 64, 128] as const);
const GRAMMAR_VERSION = "phase-b-spatial-thought-css-v1";
const TEXT_CASES = Object.freeze([
  {
    id: "cjk",
    dir: "ltr" as const,
    locale: "zh-CN",
    text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
  },
  {
    id: "latin",
    dir: "ltr" as const,
    locale: "en-US",
    text: "A remembered life remains possible only while its unfinished edges can still alter the present.",
  },
  {
    id: "mixed",
    dir: "ltr" as const,
    locale: "zh-CN",
    text: "Matter 让 unfinished thought 在今天仍可被触摸、停顿，并继续向下生长。",
  },
  {
    id: "punctuation",
    dir: "ltr" as const,
    locale: "zh-CN",
    text: "“如果入口仍在，”她问，“我们是否还会回来？”——也许；但不是现在。",
  },
  {
    id: "unbroken",
    dir: "ltr" as const,
    locale: "en-US",
    text: "antidisestablishmentarianism_without_any_expected_breakpoint_0123456789",
  },
  {
    id: "arabic-rtl",
    dir: "rtl" as const,
    locale: "ar",
    text: "ربما لا نتذكر الماضي نفسه، بل المساحة التي ما زال يفتحها للحياة الممكنة.",
  },
  {
    id: "hebrew-rtl",
    dir: "rtl" as const,
    locale: "he",
    text: "אולי איננו זוכרים את העבר עצמו, אלא את האפשרות שהוא עדיין משאיר פתוחה.",
  },
]);

type Candidate = typeof CANDIDATES[number];
type InvalidationReason =
  | "column-width"
  | "direction"
  | "font"
  | "locale"
  | "theme"
  | "typography"
  | "viewport";
type TypographyTuple = Readonly<{
  borderBlockEndWidth: string;
  borderBlockStartWidth: string;
  borderInlineEndWidth: string;
  borderInlineStartWidth: string;
  boxSizing: string;
  direction: string;
  fontFamily: string;
  fontFeatureSettings: string;
  fontKerning: string;
  fontOpticalSizing: string;
  fontSize: string;
  fontSizeAdjust: string;
  fontStretch: string;
  fontStyle: string;
  fontSynthesis: string;
  fontVariant: string;
  fontVariationSettings: string;
  fontWeight: string;
  hyphenateCharacter: string;
  hyphenateLimitChars: string;
  hyphens: string;
  letterSpacing: string;
  lineBreak: string;
  lineHeight: string;
  overflowWrap: string;
  paddingBlockEnd: string;
  paddingBlockStart: string;
  paddingInlineEnd: string;
  paddingInlineStart: string;
  tabSize: string;
  textAlign: string;
  textAutospace: string;
  textIndent: string;
  textOrientation: string;
  textRendering: string;
  textSpacingTrim: string;
  textTransform: string;
  textWrap: string;
  textWrapMode: string;
  textWrapStyle: string;
  whiteSpace: string;
  whiteSpaceCollapse: string;
  width: string;
  wordBreak: string;
  wordSpacing: string;
  writingMode: string;
}>;
type MeasurementInput = Readonly<{
  columnWidthPx: number;
  dir: "ltr" | "rtl";
  fontEpoch: string;
  grammarVersion: string;
  locale: string;
  root: boolean;
  text: string;
  typography: TypographyTuple;
}>;
type MeasurementLedger = Readonly<{
  generation: number;
  invalidations: readonly InvalidationReason[];
  size: number;
  invalidate: (reason: InvalidationReason) => void;
}>;
type MeasurementReceipt = Readonly<{
  batchReceipts: readonly Readonly<{
    cleanupDurationMs: number;
    durationMs: number;
    heapAfterReadBytes: number | null;
    replicaCount: number;
    readDurationMs: number;
    writeDurationMs: number;
  }>[];
  cacheHits: number;
  candidate: Candidate;
  heapEndBytes: number | null;
  heapPeakBytes: number | null;
  heapStartBytes: number | null;
  heights: readonly number[];
  keyCount: number;
  maxBatchDurationMs: number;
  owner: Readonly<{
    ariaHidden: boolean;
    inert: boolean;
    offscreen: boolean;
    removedAfterMeasurement: boolean;
    semanticPath: string;
  }>;
  peakDomNodes: number;
  synchronousDurationMs: number;
  uniqueMisses: number;
}>;
type BrowserBench = Readonly<{
  TypographyMeasurementLedger: new () => MeasurementLedger;
  captureTypographyMeasurementTuple: (computed: CSSStyleDeclaration) => TypographyTuple;
  createTypographyMeasurementKey: (input: MeasurementInput) => string;
  measureTypographyWithDom: (input: Readonly<{
    candidate: Candidate;
    document: Document;
    items: readonly MeasurementInput[];
    ledger: MeasurementLedger;
  }>) => MeasurementReceipt;
}>;
type MatrixViewportReceipt = Readonly<{
  candidateReceipts: readonly Readonly<{
    candidate: Candidate;
    cold: MeasurementReceipt;
    failures: readonly Readonly<{
      actualHeightPx: number;
      differencePx: number;
      expectedHeightPx: number | undefined;
      label: string | undefined;
    }>[];
    maxDifferencePx: number;
    warm: MeasurementReceipt;
  }>[];
  computedTuples: readonly TypographyTuple[];
  sampleCount: number;
  viewportName: string;
}>;

const matrixPassedCandidates = new Set<Candidate>();

test("Phase B native DOM candidates preserve the complete typography matrix", async ({ page }) => {
  test.setTimeout(240_000);
  const fontResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(".woff2") && response.status() < 400) {
      fontResponses.push(response.url());
    }
  });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await installBench(page);
  const fontLoadReceipt = await page.evaluate(async () => {
    const rootStyle = getComputedStyle(document.documentElement);
    const faces = [
      { name: "plantin", variable: "--font-plantin-now", sample: "Matter Plantin 0123" },
      { name: "departure", variable: "--font-departure-mono", sample: "Matter Departure 0123" },
    ];
    const receipt = [];
    for (const face of faces) {
      const family = rootStyle.getPropertyValue(face.variable).trim();
      const loaded = await document.fonts.load(`400 16px ${family}`, face.sample);
      receipt.push({
        family,
        loadedFaces: loaded.length,
        name: face.name,
        ready: document.fonts.check(`400 16px ${family}`, face.sample),
      });
    }
    await document.fonts.ready;
    return receipt;
  });

  const viewportReceipts: MatrixViewportReceipt[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => document.fonts.ready);
    viewportReceipts.push(await page.evaluate(({ candidates, caseInputs, columnWidths, grammarVersion, viewportName }) => {
      const bench = (globalThis as typeof globalThis & {
        __matterTypographyDomBench?: BrowserBench;
      }).__matterTypographyDomBench;
      if (bench === undefined) throw new Error("Phase B typography bench was not installed.");
      const matterText = document.querySelector<HTMLElement>(".spatial-thought__text");
      if (matterText === null) throw new Error("Production material typography is unavailable.");
      const rootStyle = getComputedStyle(document.documentElement);
      const faces = [
        { name: "matter", family: getComputedStyle(matterText).fontFamily },
        { name: "plantin", family: `${rootStyle.getPropertyValue("--font-plantin-now").trim()}, serif` },
        { name: "departure", family: `${rootStyle.getPropertyValue("--font-departure-mono").trim()}, monospace` },
      ];
      const owner = document.createElement("ol");
      owner.className = "spatial-thoughts";
      owner.inert = true;
      owner.setAttribute("aria-hidden", "true");
      Object.assign(owner.style, {
        left: "-100000px",
        pointerEvents: "none",
        position: "fixed",
        top: "0",
        visibility: "hidden",
      });
      document.body.append(owner);
      const inputs: MeasurementInput[] = [];
      const truthHeights: number[] = [];
      const labels: string[] = [];
      try {
        for (const columnWidthPx of columnWidths) {
          for (const root of [true, false]) {
            for (const face of faces) {
              for (const caseInput of caseInputs) {
                const item = document.createElement("li");
                item.className = "spatial-thought";
                item.style.setProperty("--matter-column-width", `${columnWidthPx}px`);
                if (!root) item.dataset.parentId = "phase-b-truth-parent";
                const button = document.createElement("button");
                button.className = "spatial-thought__text";
                button.dir = caseInput.dir;
                button.lang = caseInput.locale;
                button.style.fontFamily = face.family;
                button.textContent = caseInput.text;
                item.append(button);
                owner.append(item);
                const computed = getComputedStyle(button);
                const typography = bench.captureTypographyMeasurementTuple(computed);
                inputs.push({
                  columnWidthPx,
                  dir: caseInput.dir,
                  fontEpoch: `ready:${document.fonts.status}:1`,
                  grammarVersion,
                  locale: caseInput.locale,
                  root,
                  text: caseInput.text,
                  typography,
                });
                truthHeights.push(button.offsetHeight);
                labels.push(`${viewportName}/${columnWidthPx}/${root ? "root" : "child"}/${face.name}/${caseInput.id}`);
                item.remove();
              }
            }
          }
        }
      } finally {
        owner.remove();
      }

      const candidateReceipts = candidates.map((candidate) => {
        const ledger = new bench.TypographyMeasurementLedger();
        const cold = bench.measureTypographyWithDom({ candidate, document, items: inputs, ledger });
        const warm = bench.measureTypographyWithDom({ candidate, document, items: inputs, ledger });
        const failures = cold.heights.flatMap((height, index) => {
          const differencePx = Math.abs(height - truthHeights[index]!);
          return differencePx <= 0.5 ? [] : [{
            actualHeightPx: height,
            differencePx,
            expectedHeightPx: truthHeights[index],
            label: labels[index],
          }];
        });
        return {
          candidate,
          cold,
          failures,
          maxDifferencePx: cold.heights.reduce(
            (maximum, height, index) => Math.max(maximum, Math.abs(height - truthHeights[index]!)),
            0,
          ),
          warm,
        };
      });
      return {
        candidateReceipts,
        computedTuples: [...new Set(inputs.map(({ typography }) => JSON.stringify(typography)))].map(
          (tuple) => JSON.parse(tuple) as TypographyTuple,
        ),
        sampleCount: inputs.length,
        viewportName,
      };
    }, {
      candidates: CANDIDATES,
      caseInputs: TEXT_CASES,
      columnWidths: COLUMN_WIDTHS,
      grammarVersion: GRAMMAR_VERSION,
      viewportName: viewport.name,
    }));
  }

  for (const candidate of CANDIDATES) {
    const receipts = viewportReceipts.flatMap(({ candidateReceipts }) =>
      candidateReceipts.filter((receipt) => receipt.candidate === candidate)
    );
    if (receipts.every(({ failures }) => failures.length === 0)) {
      matrixPassedCandidates.add(candidate);
    }
  }
  const summary = {
    fontLoadReceipt,
    fontResponses,
    matrixPassedCandidates: [...matrixPassedCandidates],
    sampleCount: viewportReceipts.reduce((count, receipt) => count + receipt.sampleCount, 0),
    viewportReceipts,
  };
  console.log(`Matter typography Phase B matrix: ${JSON.stringify({
    candidateDiagnostics: CANDIDATES.map((candidate) => ({
      candidate,
      viewports: viewportReceipts.map(({ candidateReceipts, viewportName }) => {
        const receipt = candidateReceipts.find((entry) => entry.candidate === candidate);
        return {
          failureCount: receipt?.failures.length ?? -1,
          failures: receipt?.failures.slice(0, 5) ?? [],
          maxDifferencePx: receipt?.maxDifferencePx ?? null,
          viewportName,
        };
      }),
    })),
    fontLoadReceipt,
    fontResponseCount: fontResponses.length,
    matrixPassedCandidates: [...matrixPassedCandidates],
    sampleCount: summary.sampleCount,
  })}`);
  await test.info().attach("typography-phase-b-matrix.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  expect(fontLoadReceipt.every(({ family, loadedFaces, ready }) =>
    family.length > 0 && loadedFaces > 0 && ready
  )).toBe(true);
  expect(fontResponses.length).toBeGreaterThanOrEqual(2);
  expect(summary.sampleCount).toBe(378);
  expect([...matrixPassedCandidates]).toEqual([...CANDIDATES]);
  for (const receipt of viewportReceipts) {
    for (const candidate of receipt.candidateReceipts) {
      expect(candidate.failures).toEqual([]);
      expect(candidate.maxDifferencePx).toBeLessThanOrEqual(0.5);
      expect(candidate.cold.owner).toEqual({
        ariaHidden: true,
        inert: true,
        offscreen: true,
        removedAfterMeasurement: true,
        semanticPath: "ol>li>button.spatial-thought__text",
      });
      expect(candidate.warm.uniqueMisses).toBe(0);
      expect(candidate.warm.peakDomNodes).toBe(0);
      expect(candidate.warm.heights).toEqual(candidate.cold.heights);
    }
    expect(receipt.computedTuples.every((tuple) => tuple.textWrapStyle === "pretty")).toBe(true);
  }
});

test("Phase B records 2,000 cold/warm candidates without task splitting", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await installBench(page);
  const tree = createPerformanceThoughtTree();
  const projectInputs = Object.values(tree.nodes).map((node, index) => ({
    root: node.parentId === null,
    // A cold authority must survive 2,000 distinct keys. The normal performance
    // fixture intentionally repeats material and would otherwise hide 1,350 reads.
    text: `${node.text} · ${index.toString(36)}`,
  }));
  expect(projectInputs).toHaveLength(2_000);
  await page.evaluate(async ({ grammarVersion, inputs }) => {
    await document.fonts.ready;
    const bench = (globalThis as typeof globalThis & {
      __matterTypographyDomBench?: BrowserBench;
    }).__matterTypographyDomBench;
    if (bench === undefined) throw new Error("Phase B typography bench was not installed.");
    const rootText = document.querySelector<HTMLElement>(
      ".spatial-thought:not([data-parent-id]) .spatial-thought__text",
    );
    const childText = document.querySelector<HTMLElement>(
      ".spatial-thought[data-parent-id] .spatial-thought__text",
    );
    if (rootText === null || childText === null) {
      throw new Error("Production root and child typography are unavailable.");
    }
    const rootTypography = bench.captureTypographyMeasurementTuple(getComputedStyle(rootText));
    const childTypography = bench.captureTypographyMeasurementTuple(getComputedStyle(childText));
    const state = {
      bench,
      items: inputs.map(({ root, text }): MeasurementInput => ({
        columnWidthPx: 520,
        dir: "ltr",
        fontEpoch: `ready:${document.fonts.status}:1`,
        grammarVersion,
        locale: "zh-CN",
        root,
        text,
        typography: root ? rootTypography : childTypography,
      })),
      ledgers: new Map<string, MeasurementLedger>(),
      longTasks: [] as Array<{ duration: number; startTime: number }>,
      observer: null as PerformanceObserver | null,
    };
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      state.observer.observe({ type: "longtask", buffered: false });
    }
    (globalThis as typeof globalThis & { __matterTypographyPhaseB2k?: typeof state })
      .__matterTypographyPhaseB2k = state;
  }, { grammarVersion: GRAMMAR_VERSION, inputs: projectInputs });

  const candidateReceipts = [];
  for (const candidate of CANDIDATES) {
    const cold = await page.evaluate((activeCandidate) => {
      const state = (globalThis as typeof globalThis & {
        __matterTypographyPhaseB2k?: {
          bench: BrowserBench;
          items: readonly MeasurementInput[];
          ledgers: Map<string, MeasurementLedger>;
        };
      }).__matterTypographyPhaseB2k;
      if (state === undefined) throw new Error("Phase B 2k state is unavailable.");
      const ledger = new state.bench.TypographyMeasurementLedger();
      state.ledgers.set(String(activeCandidate), ledger);
      const intervalStart = performance.now();
      const receipt = state.bench.measureTypographyWithDom({
        candidate: activeCandidate,
        document,
        items: state.items,
        ledger,
      });
      const intervalEnd = performance.now();
      return { intervalEnd, intervalStart, receipt };
    }, candidate);
    await page.waitForTimeout(0);
    const observedLongTasks = await page.evaluate(({ end, start }) => {
      const state = (globalThis as typeof globalThis & {
        __matterTypographyPhaseB2k?: {
          longTasks: readonly { duration: number; startTime: number }[];
        };
      }).__matterTypographyPhaseB2k;
      if (state === undefined) throw new Error("Phase B 2k state is unavailable.");
      return state.longTasks.filter(({ duration, startTime }) =>
        startTime < end && startTime + duration > start
      );
    }, { end: cold.intervalEnd, start: cold.intervalStart });
    const warm = await page.evaluate((activeCandidate) => {
      const state = (globalThis as typeof globalThis & {
        __matterTypographyPhaseB2k?: {
          bench: BrowserBench;
          items: readonly MeasurementInput[];
          ledgers: Map<string, MeasurementLedger>;
        };
      }).__matterTypographyPhaseB2k;
      if (state === undefined) throw new Error("Phase B 2k state is unavailable.");
      const ledger = state.ledgers.get(String(activeCandidate));
      if (ledger === undefined) throw new Error("Phase B cold ledger is unavailable.");
      return state.bench.measureTypographyWithDom({
        candidate: activeCandidate,
        document,
        items: state.items,
        ledger,
      });
    }, candidate);
    const maxObservedTaskDurationMs = observedLongTasks.reduce(
      (maximum, task) => Math.max(maximum, task.duration),
      0,
    );
    const maxSynchronousTaskMs = Math.max(
      cold.receipt.synchronousDurationMs,
      maxObservedTaskDurationMs,
    );
    const observedBlockingTimeMs = observedLongTasks.reduce(
      (total, task) => total + Math.max(0, task.duration - 50),
      0,
    );
    const synchronousBlockingFloorMs = Math.max(0, cold.receipt.synchronousDurationMs - 50);
    candidateReceipts.push({
      candidate,
      cold: cold.receipt,
      exactMatrixParity: matrixPassedCandidates.has(candidate),
      gatePassed: matrixPassedCandidates.has(candidate) &&
        maxSynchronousTaskMs < 50 && cold.receipt.synchronousDurationMs <= 63,
      maxObservedTaskDurationMs,
      maxSynchronousTaskMs,
      observedLongTasks,
      synchronousBlockingFloorMs,
      totalBlockingTimeMs: Math.max(observedBlockingTimeMs, synchronousBlockingFloorMs),
      warm,
    });
  }
  const observerReceipt = await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & {
      __matterTypographyPhaseB2k?: {
        longTasks: readonly { duration: number; startTime: number }[];
        observer: PerformanceObserver | null;
      };
    }).__matterTypographyPhaseB2k;
    if (state === undefined) throw new Error("Phase B 2k state is unavailable.");
    state.observer?.disconnect();
    return {
      longTaskSupported: state.observer !== null,
      recordedLongTaskCount: state.longTasks.length,
    };
  });
  const summary = {
    candidateReceipts,
    nodeCount: projectInputs.length,
    observerReceipt,
    passingCandidates: candidateReceipts.filter(({ gatePassed }) => gatePassed).map(({ candidate }) => candidate),
  };
  console.log(`Matter typography Phase B 2k: ${JSON.stringify({
    candidates: candidateReceipts.map((receipt) => ({
      cacheHits: receipt.cold.cacheHits,
      candidate: receipt.candidate,
      coldMs: receipt.cold.synchronousDurationMs,
      gatePassed: receipt.gatePassed,
      heapEndBytes: receipt.cold.heapEndBytes,
      heapPeakBytes: receipt.cold.heapPeakBytes,
      heapStartBytes: receipt.cold.heapStartBytes,
      maxBatchMs: receipt.cold.maxBatchDurationMs,
      maxSynchronousTaskMs: receipt.maxSynchronousTaskMs,
      peakDomNodes: receipt.cold.peakDomNodes,
      synchronousBlockingFloorMs: receipt.synchronousBlockingFloorMs,
      totalBlockingTimeMs: receipt.totalBlockingTimeMs,
      uniqueMisses: receipt.cold.uniqueMisses,
      warmMs: receipt.warm.synchronousDurationMs,
    })),
    nodeCount: summary.nodeCount,
    observerReceipt,
    passingCandidates: summary.passingCandidates,
  })}`);
  await test.info().attach("typography-phase-b-2k.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  for (const receipt of candidateReceipts) {
    expect(receipt.cold.keyCount).toBe(2_000);
    expect(receipt.cold.uniqueMisses).toBe(2_000);
    expect(receipt.cold.cacheHits).toBe(0);
    expect(receipt.warm.uniqueMisses).toBe(0);
    expect(receipt.warm.peakDomNodes).toBe(0);
  }
  // This assertion is the research stop gate, not a relaxed release budget.
  expect(summary.passingCandidates.length).toBeGreaterThan(0);
});

test("Phase B ledger invalidates across the browser authority boundaries", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await installBench(page);
  await page.evaluate(async (grammarVersion) => {
    await document.fonts.ready;
    const bench = (globalThis as typeof globalThis & {
      __matterTypographyDomBench?: BrowserBench;
    }).__matterTypographyDomBench;
    const source = document.querySelector<HTMLElement>(
      ".spatial-thought:not([data-parent-id]) .spatial-thought__text",
    );
    if (bench === undefined || source === null) throw new Error("Phase B authority is unavailable.");
    const base: MeasurementInput = {
      columnWidthPx: 520,
      dir: "ltr",
      fontEpoch: `ready:${document.fonts.status}:1`,
      grammarVersion,
      locale: "zh-CN",
      root: true,
      text: "仍然允许我们想象的其他生活。",
      typography: bench.captureTypographyMeasurementTuple(getComputedStyle(source)),
    };
    const ledger = new bench.TypographyMeasurementLedger();
    const cold = bench.measureTypographyWithDom({ candidate: 32, document, items: [base, base], ledger });
    const warm = bench.measureTypographyWithDom({ candidate: 32, document, items: [base, base], ledger });
    const state = { base, bench, cold, fontEvents: 0, ledger, warm };
    document.fonts.addEventListener("loadingdone", () => {
      state.fontEvents += 1;
    });
    (globalThis as typeof globalThis & { __matterTypographyPhaseBInvalidation?: typeof state })
      .__matterTypographyPhaseBInvalidation = state;
  }, GRAMMAR_VERSION);

  await page.setViewportSize({ width: 390, height: 844 });
  const invalidationReceipt = await page.evaluate(async () => {
    const state = (globalThis as typeof globalThis & {
      __matterTypographyPhaseBInvalidation?: {
        base: MeasurementInput;
        bench: BrowserBench;
        cold: MeasurementReceipt;
        fontEvents: number;
        ledger: MeasurementLedger;
        warm: MeasurementReceipt;
      };
    }).__matterTypographyPhaseBInvalidation;
    if (state === undefined) throw new Error("Phase B invalidation state is unavailable.");
    const source = document.querySelector<HTMLElement>(
      ".spatial-thought:not([data-parent-id]) .spatial-thought__text",
    );
    if (source === null) throw new Error("Responsive typography is unavailable.");
    const receipts: Array<{
      generation: number;
      keyChanged: boolean;
      reason: InvalidationReason;
      uniqueMisses: number;
    }> = [];
    const applyInvalidation = (reason: InvalidationReason, next: MeasurementInput) => {
      const previousKey = state.bench.createTypographyMeasurementKey(state.base);
      state.ledger.invalidate(reason);
      const receipt = state.bench.measureTypographyWithDom({
        candidate: 32,
        document,
        items: [next],
        ledger: state.ledger,
      });
      receipts.push({
        generation: state.ledger.generation,
        keyChanged: previousKey !== state.bench.createTypographyMeasurementKey(next),
        reason,
        uniqueMisses: receipt.uniqueMisses,
      });
      state.base = next;
      return receipt;
    };
    const responsiveRootTypography = state.bench.captureTypographyMeasurementTuple(
      getComputedStyle(source),
    );
    const mixedWidthLedger = new state.bench.TypographyMeasurementLedger();
    let mixedWidthError: string | null = null;
    try {
      state.bench.measureTypographyWithDom({
        candidate: 32,
        document,
        items: [
          {
            columnWidthPx: 280,
            dir: "ltr",
            fontEpoch: state.base.fontEpoch,
            grammarVersion: state.base.grammarVersion,
            locale: "zh-CN",
            root: true,
            text: "同一排版权威下的正确窄列。",
            typography: responsiveRootTypography,
          },
          {
            columnWidthPx: 520,
            dir: "ltr",
            fontEpoch: state.base.fontEpoch,
            grammarVersion: state.base.grammarVersion,
            locale: "zh-CN",
            root: true,
            text: "错误复用窄列 tuple 的宽列必须整体失败。",
            typography: responsiveRootTypography,
          },
        ],
        ledger: mixedWidthLedger,
      });
    } catch (error) {
      mixedWidthError = error instanceof Error ? error.message : String(error);
    }
    const mixedWidthFailClosed = {
      error: mixedWidthError,
      ledgerSize: mixedWidthLedger.size,
    };
    applyInvalidation("viewport", {
      ...state.base,
      typography: {
        ...responsiveRootTypography,
        width: `${state.base.columnWidthPx}px`,
      },
    });
    const widthReceipt = applyInvalidation("column-width", {
      ...state.base,
      columnWidthPx: 280,
      typography: { ...state.base.typography, width: "280px" },
    });
    const widthTruthItem = document.createElement("li");
    widthTruthItem.className = "spatial-thought";
    widthTruthItem.style.setProperty("--matter-column-width", "280px");
    const widthTruthButton = document.createElement("button");
    widthTruthButton.className = "spatial-thought__text";
    widthTruthButton.dir = state.base.dir;
    widthTruthButton.lang = state.base.locale;
    widthTruthButton.style.fontFamily = state.base.typography.fontFamily;
    widthTruthButton.textContent = state.base.text;
    widthTruthItem.append(widthTruthButton);
    document.body.append(widthTruthItem);
    const widthTruthHeightPx = widthTruthButton.offsetHeight;
    widthTruthItem.remove();

    const shell = document.querySelector<HTMLElement>(".matter-shell");
    if (shell === null) throw new Error("Matter shell is unavailable.");
    shell.dataset.canvasTheme = shell.dataset.canvasTheme === "dark" ? "light" : "dark";
    state.ledger.invalidate("theme");
    const themeReceipt = state.bench.measureTypographyWithDom({
      candidate: 32,
      document,
      items: [state.base],
      ledger: state.ledger,
    });
    receipts.push({
      generation: state.ledger.generation,
      keyChanged: false,
      reason: "theme",
      uniqueMisses: themeReceipt.uniqueMisses,
    });
    applyInvalidation("locale", { ...state.base, locale: "en-US" });
    applyInvalidation("direction", {
      ...state.base,
      dir: "rtl",
      typography: { ...state.base.typography, direction: "rtl" },
    });
    const childSource = document.querySelector<HTMLElement>(
      ".spatial-thought[data-parent-id] .spatial-thought__text",
    );
    if (childSource === null) throw new Error("Responsive child typography is unavailable.");
    applyInvalidation("typography", {
      ...state.base,
      dir: "ltr",
      root: false,
      typography: state.bench.captureTypographyMeasurementTuple(getComputedStyle(childSource)),
    });

    const probe = new FontFace(
      "MatterPhaseBFontEpochProbe",
      'url("/matter/matter-ui/PlantinNowVariable-Upright.woff2")',
    );
    document.fonts.add(probe);
    await probe.load();
    await document.fonts.ready;
    applyInvalidation("font", {
      ...state.base,
      fontEpoch: `ready:${document.fonts.status}:2`,
    });
    document.fonts.delete(probe);
    return {
      cold: state.cold,
      fontEvents: state.fontEvents,
      invalidations: state.ledger.invalidations,
      mixedWidthFailClosed,
      receipts,
      warm: state.warm,
      widthParity: {
        differencePx: Math.abs(widthReceipt.heights[0]! - widthTruthHeightPx),
        measuredHeightPx: widthReceipt.heights[0],
        truthHeightPx: widthTruthHeightPx,
      },
    };
  });
  console.log(`Matter typography Phase B invalidation: ${JSON.stringify(invalidationReceipt)}`);
  await test.info().attach("typography-phase-b-invalidation.json", {
    body: JSON.stringify(invalidationReceipt, null, 2),
    contentType: "application/json",
  });
  expect(invalidationReceipt.cold.uniqueMisses).toBe(1);
  expect(invalidationReceipt.cold.cacheHits).toBe(1);
  expect(invalidationReceipt.warm.uniqueMisses).toBe(0);
  expect(invalidationReceipt.fontEvents).toBeGreaterThan(0);
  expect(invalidationReceipt.receipts.map(({ reason }) => reason)).toEqual([
    "viewport",
    "column-width",
    "theme",
    "locale",
    "direction",
    "typography",
    "font",
  ]);
  expect(invalidationReceipt.receipts.every(({ reason, keyChanged }) =>
    reason === "theme" ? !keyChanged : keyChanged
  )).toBe(true);
  expect(invalidationReceipt.receipts.every(({ uniqueMisses }) => uniqueMisses === 1)).toBe(true);
  expect(invalidationReceipt.mixedWidthFailClosed).toEqual({
    error: "The production typography grammar changed during measurement.",
    ledgerSize: 0,
  });
  expect(invalidationReceipt.widthParity.differencePx).toBe(0);
});

async function installBench(page: import("@playwright/test").Page): Promise<void> {
  const source = await readFile(
    resolve(process.cwd(), "features/matter/layout/typography-dom-measurement-bench.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  await page.evaluate(async (moduleSource) => {
    const url = URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }));
    try {
      const bench = await import(url);
      (globalThis as typeof globalThis & { __matterTypographyDomBench?: unknown })
        .__matterTypographyDomBench = bench;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, compiled);
}
