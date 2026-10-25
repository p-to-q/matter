import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { InquiryRequest } from "../protocol/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { INQUIRY_SCENARIO, compileInquiryPrompt } from "./inquiry-harness";
import { DEFAULT_POOL_LIMITS, resolvePoolAdapter } from "./model-pool";

/**
 * Does naming each passage's parent make Ask Matter answer structural questions
 * better than depth-ordered text alone? Skipped unless MATTER_LIVE_STRUCTURE_EVAL=1.
 * It reports; it asserts nothing about the numbers. The question it answers is
 * whether widening the inquiry wire with parent ids has evidence behind it.
 *
 *   set -a; . ./.env.local; set +a
 *   MATTER_LIVE_STRUCTURE_EVAL=1 MATTER_LIVE_STRUCTURE_EVAL_OUT=/tmp/s.txt \
 *     npx vitest run features/matter/server/inquiry-structure.live.test.ts
 */
const ENABLED = process.env.MATTER_LIVE_STRUCTURE_EVAL === "1";
const RUNS = 3;

type Item = Readonly<{ id: string; parent: string | null; depth: number; text: string }>;
type Task = Readonly<{
  name: string;
  locale: "en-US" | "zh-CN";
  items: readonly Item[];
  question: string;
  expect: readonly string[];
  forbid: readonly string[];
}>;

const MOVE: readonly Item[] = [
  { id: "m", parent: null, depth: 0, text: "Moving to Berlin" },
  { id: "c", parent: "m", depth: 1, text: "Costs" },
  { id: "c1", parent: "c", depth: 2, text: "Rent 1200" },
  { id: "c2", parent: "c", depth: 2, text: "Transit 90" },
  { id: "r", parent: "m", depth: 1, text: "Reasons" },
  { id: "r1", parent: "r", depth: 2, text: "Friends nearby" },
  { id: "r2", parent: "r", depth: 2, text: "Rent is lower than Munich" },
];
const SUMMER: readonly Item[] = [
  { id: "s", parent: null, depth: 0, text: "暑假计划" },
  { id: "t", parent: "s", depth: 1, text: "旅行" },
  { id: "t1", parent: "t", depth: 2, text: "备注：订机票" },
  { id: "l", parent: "s", depth: 1, text: "学习" },
  { id: "l1", parent: "l", depth: 2, text: "备注：每天读半小时" },
];
const PROJECTS: readonly Item[] = [
  { id: "p", parent: null, depth: 0, text: "Projects" },
  { id: "a", parent: "p", depth: 1, text: "Alpha" },
  { id: "an", parent: "a", depth: 2, text: "Notes" },
  { id: "a1", parent: "an", depth: 3, text: "ship Friday" },
  { id: "b", parent: "p", depth: 1, text: "Beta" },
  { id: "bn", parent: "b", depth: 2, text: "Notes" },
  { id: "b1", parent: "bn", depth: 3, text: "hire two" },
];

const TASKS: readonly Task[] = [
  { name: "children of Costs", locale: "en-US", items: MOVE, question: "Which two items are listed under Costs?", expect: ["Rent 1200", "Transit 90"], forbid: ["Friends"] },
  { name: "parent of a leaf", locale: "en-US", items: MOVE, question: "Under which heading does 'Friends nearby' sit? Answer with the heading only.", expect: ["Reasons"], forbid: ["Costs"] },
  { name: "rent belongs where", locale: "en-US", items: MOVE, question: "Is 'Rent is lower than Munich' filed under Costs or under Reasons?", expect: ["Reasons"], forbid: [] },
  { name: "zh parent", locale: "zh-CN", items: SUMMER, question: "“备注：每天读半小时”属于哪一个大项？只回答大项名称。", expect: ["学习"], forbid: ["旅行"] },
  { name: "duplicate headings", locale: "en-US", items: PROJECTS, question: "Which project does the 'hire two' note belong to? Answer with the project name only.", expect: ["Beta"], forbid: ["Alpha"] },
  { name: "other duplicate", locale: "en-US", items: PROJECTS, question: "Which project does the 'ship Friday' note belong to? Answer with the project name only.", expect: ["Alpha"], forbid: ["Beta"] },
];

function request(task: Task): InquiryRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "eval",
    question: task.question,
    locale: task.locale,
    context: {
      treeId: "eval",
      revision: 1,
      scope: "tree",
      lineage: task.items.map((item) => ({ nodeId: item.id, depth: item.depth, text: item.text, truncated: false })),
      thoughtCount: task.items.length,
      clipped: false,
    },
  } as InquiryRequest;
}

/** Variant B: the same prompt with each passage naming its parent, nothing else changed. */
function withParents(task: Task): string {
  const base = compileInquiryPrompt(request(task));
  const material = task.items.map((item) => ({ id: item.id, parent: item.parent, depth: item.depth, text: item.text }));
  const swapped = base.replace(/(<material>)[\s\S]*?(<\/material>)/u, `$1${JSON.stringify(material)}$2`);
  if (swapped === base) throw new Error("variant B did not change the prompt");
  return swapped;
}

describe.skipIf(!ENABLED)("inquiry structure: depth order vs named parents", () => {
  const adapter = resolvePoolAdapter(process.env, { ...DEFAULT_POOL_LIMITS, maxResponseBytes: 16 * 1_024, maxOutputTokens: 720 });

  it("reports accuracy for each variant", async () => {
    expect(adapter).not.toBeNull();
    const score = { A: 0, B: 0 };
    const rows: string[] = [];
    for (const task of TASKS) {
      for (const [variant, prompt] of [["A", compileInquiryPrompt(request(task))], ["B", withParents(task)]] as const) {
        let right = 0;
        const sample: string[] = [];
        for (let run = 0; run < RUNS; run += 1) {
          const answer = await adapter!({
            scenario: INQUIRY_SCENARIO.id, prompt, locale: task.locale, input: null,
            deadlineMs: 30_000, maxOutputTokens: 720, disableThinking: true,
          }, new AbortController().signal).then((r) => r.text).catch(() => "");
          const ok = task.expect.every((word) => answer.includes(word)) && task.forbid.every((word) => !answer.includes(word));
          if (ok) right += 1;
          if (run === 0) sample.push(answer.replace(/\s+/gu, " ").slice(0, 110));
        }
        score[variant] += right;
        rows.push(`${task.name.padEnd(20)} ${variant}: ${right}/${RUNS}   e.g. ${sample[0]}`);
      }
    }
    const total = TASKS.length * RUNS;
    const report = `structure eval: A (depth order) ${score.A}/${total}; B (named parents) ${score.B}/${total}\n${rows.join("\n")}\n`;
    const out = process.env.MATTER_LIVE_STRUCTURE_EVAL_OUT;
    if (out) writeFileSync(out, report, "utf8"); else console.info(`\n${report}`);
    expect(score.A + score.B).toBeGreaterThan(0);
  }, 600_000);
});
