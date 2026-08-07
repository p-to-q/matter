import { mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  adjudicateModelLabel,
  decideModelRequest,
  deriveProvisionalLabel,
  normalizeLabelInput,
  validateSemanticLabel,
} from "../features/matter/material/semantic-label";
import { buildLabelPrompt } from "../features/matter/server/label-harness";
import { readModelPool } from "../features/matter/server/model-pool";
import { corpus } from "./label-corpus.mjs";

/**
 * Measures a live model against the deterministic label it would replace.
 *
 * This is a measurement, not a test: it needs a key, it spends money, and its
 * result is a judgement a person makes from the table it prints. It therefore
 * never runs by default — `npm run check` skips it — and only an explicit
 * `MATTER_LABEL_EVAL=1` turns it on:
 *
 *   MATTER_LABEL_EVAL=1 npx vitest run scripts/label-eval.test.mjs
 *   MATTER_LABEL_EVAL=1 MATTER_LABEL_EVAL_MODELS=Qwen-flash npx vitest run scripts/label-eval.test.mjs
 *   MATTER_LABEL_EVAL=1 MATTER_LABEL_EVAL_REPEAT=3 npx vitest run scripts/label-eval.test.mjs
 */
const enabled = process.env.MATTER_LABEL_EVAL === "1";
const REQUEST_TIMEOUT_MS = 20_000;

describe.runIf(enabled)("label model evaluation", () => {
  it("reports every corpus case against the live pool", { timeout: 15 * 60_000 }, async () => {
    await loadLocalEnvironment();
    const requested = (process.env.MATTER_LABEL_EVAL_MODELS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const repeat = Math.max(1, Number(process.env.MATTER_LABEL_EVAL_REPEAT ?? 1));

    const pool = readModelPool(process.env).filter(
      (candidate) => requested.length === 0 ||
        requested.some((model) => model.toLowerCase() === candidate.model.toLowerCase()),
    );
    expect(pool, "configure MATTER_LABEL_POOL in .env.local").not.toHaveLength(0);

    for (const candidate of pool) {
      const rows = [];
      for (const item of corpus) {
        const input = normalizeLabelInput({
          text: item.text,
          locale: item.locale ?? "zh-CN",
          context: item.context,
        });
        const provisional = deriveProvisionalLabel(input);
        if (!decideModelRequest(input, provisional).request) {
          rows.push({ id: item.id, provisional: provisional.text, answer: "—", verdict: "not-asked", ms: 0 });
          continue;
        }

        const prompt = buildLabelPrompt(input);
        const answers = [];
        let slowest = 0;
        for (let attempt = 0; attempt < repeat; attempt += 1) {
          const startedAt = Date.now();
          answers.push(await complete(candidate, prompt));
          slowest = Math.max(slowest, Date.now() - startedAt);
        }
        const [answer] = answers;
        rows.push({
          id: item.id,
          provisional: provisional.text,
          answer: answer.ok ? answer.text : `<${answer.error}>`,
          verdict: answer.ok ? judge(input, provisional.text, answer.text) : `transport:${answer.error}`,
          ms: slowest,
          unstable: new Set(answers.map((entry) => (entry.ok ? entry.text : entry.error))).size > 1,
        });
      }
      await report(`${candidate.model} @ ${candidate.station}`, rows);
    }
  });
});

function judge(input, provisional, text) {
  const validation = validateSemanticLabel(text, {
    locale: input.locale,
    maxGraphemes: input.maxGraphemes,
    siblingLabels: input.context.siblingLabels,
  });
  if (!validation.ok) return `invalid:${validation.code}`;
  const adjudication = adjudicateModelLabel(input, provisional, validation.label);
  return adjudication.ok ? "accepted" : `refused:${adjudication.reasons.join("+")}`;
}

async function complete(candidate, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${candidate.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${candidate.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: candidate.model,
        temperature: 0,
        max_tokens: 32,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `http-${response.status}` };
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return { ok: false, error: "no-text" };
    return { ok: true, text: text.trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : "failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function report(title, rows) {
  const columns = [["case", 20], ["deterministic", 24], ["model", 24], ["verdict", 36], ["ms", 6]];
  const lines = [
    `\n=== ${title} ===`,
    columns.map(([name, size]) => pad(name, size)).join(""),
  ];
  for (const row of rows) {
    lines.push([
      pad(row.id, 20),
      pad(row.provisional, 24),
      pad(row.answer, 24),
      pad(row.verdict + (row.unstable ? " !unstable" : ""), 36),
      pad(String(row.ms || ""), 6),
    ].join(""));
  }

  const asked = rows.filter((row) => row.verdict !== "not-asked");
  const accepted = asked.filter((row) => row.verdict === "accepted");
  const latencies = asked.map((row) => row.ms).sort((left, right) => left - right);
  lines.push(
    `\nasked ${asked.length}/${rows.length} · accepted ${accepted.length} (${percent(accepted.length, asked.length)})` +
    ` · p50 ${quantile(latencies, 0.5)}ms · p95 ${quantile(latencies, 0.95)}ms · max ${latencies.at(-1) ?? 0}ms`,
  );
  const reasons = new Map();
  for (const row of asked) {
    if (row.verdict === "accepted") continue;
    reasons.set(row.verdict, (reasons.get(row.verdict) ?? 0) + 1);
  }
  for (const [reason, count] of [...reasons].sort((left, right) => right[1] - left[1])) {
    lines.push(`  ${count}x ${reason}`);
  }
  // Vitest intercepts console output in run mode, so the readable artefact is
  // a file under the git-ignored scratch directory.
  const report = lines.join("\n");
  const directory = new URL("../tmp/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const path = new URL(`label-eval-${title.split(" ")[0].replaceAll(/[^\w.-]/gu, "_")}.txt`, directory);
  await writeFile(path, `${report}\n`, "utf8");
  process.stdout.write(`${report}\n\nwritten to ${path.pathname}\n`);
}

/** Han and full-width punctuation occupy two terminal columns. */
function pad(value, size) {
  let width = 0;
  for (const character of value) width += (character.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
  return value + " ".repeat(Math.max(1, size - width));
}

function percent(part, total) {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;
}

function quantile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * `.env.local` is git-ignored and holds the keys. Existing environment values
 * win, so a deployment or a one-off shell override is never overwritten.
 */
async function loadLocalEnvironment() {
  try {
    const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
      if (match !== null) process.env[match[1]] ??= match[2];
    }
  } catch {
    // A deployment supplies the pool through real environment variables.
  }
}
