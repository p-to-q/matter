import { describe, expect, it } from "vitest";
import {
  DEFAULT_GOVERNOR_LIMITS,
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type MatterScenario,
  type ScenarioAdapter,
  type ScenarioCall,
} from "./harness";
import {
  KEEP_UNFINISHED,
  MATTER_BACKGROUND,
  REFERENCE_NOT_INSTRUCTION,
  composePrompt,
  fence,
  fenceJson,
} from "./prompt-spine";

const ECHO: MatterScenario<string, string> = Object.freeze({
  id: "matter-inquiry",
  promptVersion: "test/1",
  locale: () => "zh-CN",
  compile: (input) => `say: ${input}`,
  budget: () => ({ deadlineMs: 40, maxOutputTokens: 16 }),
  adjudicate: (answer) => typeof answer === "string" && answer.length > 0
    ? { ok: true, value: answer }
    : { ok: false, reason: "empty" },
});

const answers = (text: string): ScenarioAdapter => async () => ({ text });

describe("runScenario", () => {
  it("passes the compiled prompt, locale, and budget to the adapter", async () => {
    const seen: ScenarioCall[] = [];
    const outcome = await runScenario(ECHO, "hello", async (call) => {
      seen.push(call);
      return { text: "ok" };
    }, new ScenarioGovernor());

    expect(outcome).toEqual({ ok: true, value: "ok" });
    expect(seen[0]).toMatchObject({
      scenario: "matter-inquiry",
      prompt: "say: hello",
      locale: "zh-CN",
      input: "hello",
      deadlineMs: 40,
      maxOutputTokens: 16,
    });
  });

  it("uses the floor when there is no adapter at all", async () => {
    const outcome = await runScenario(ECHO, "hello", null, new ScenarioGovernor());
    expect(outcome).toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
  });

  it("turns a rejected answer into a fallback rather than an error", async () => {
    const outcome = await runScenario(ECHO, "hello", answers(""), new ScenarioGovernor());
    expect(outcome).toEqual({ ok: false, fallback: "MODEL_REJECTED" });
  });

  it("settles on the deadline even when the provider ignores the signal", async () => {
    const started = Date.now();
    const outcome = await runScenario(
      ECHO,
      "hello",
      () => new Promise(() => undefined),
      new ScenarioGovernor(),
    );
    expect(outcome).toEqual({ ok: false, fallback: "MODEL_TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("lets a caller shorten a scenario's deadline but never lengthen it", async () => {
    const seen: number[] = [];
    const record: ScenarioAdapter = async (call) => {
      seen.push(call.deadlineMs);
      return { text: "ok" };
    };
    await runScenario(ECHO, "a", record, new ScenarioGovernor(), { deadlineCeilingMs: 10 });
    await runScenario(ECHO, "b", record, new ScenarioGovernor(), { deadlineCeilingMs: 10_000 });
    expect(seen).toEqual([10, 40]);
  });

  it("sheds instead of queueing once the scenario is saturated", async () => {
    const governor = new ScenarioGovernor();
    const limits = { ...DEFAULT_GOVERNOR_LIMITS, maxConcurrentModelCalls: 1 };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: ScenarioAdapter = async () => {
      await held;
      return { text: "ok" };
    };

    const first = runScenario(ECHO, "a", slow, governor, { limits });
    const second = await runScenario(ECHO, "b", slow, governor, { limits });
    expect(second).toEqual({ ok: false, fallback: "MODEL_BUSY" });
    release();
    await first;
  });

  it("keeps one health counter across differently-shaped limits objects", async () => {
    const governor = new ScenarioGovernor();
    let clock = 1_000;
    const options = () => ({
      // A fresh object each call, as a test or a per-request override would pass.
      limits: { ...DEFAULT_GOVERNOR_LIMITS, failuresBeforeCooldown: 2, cooldownMs: 5_000 },
      now: () => clock,
    });
    let calls = 0;
    const failing: ScenarioAdapter = async () => {
      calls += 1;
      throw new Error("relay down");
    };

    await runScenario(ECHO, "a", failing, governor, options());
    await runScenario(ECHO, "b", failing, governor, options());
    expect(calls).toBe(2);

    expect(await runScenario(ECHO, "c", failing, governor, options()))
      .toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
    expect(calls).toBe(2);

    clock += 6_000;
    await runScenario(ECHO, "d", failing, governor, options());
    expect(calls).toBe(3);
  });

  it("gives the slot back when the scenario itself throws before the call", async () => {
    const broken: MatterScenario<string, string> = {
      ...ECHO,
      compile: () => {
        throw new Error("prompt defect");
      },
    };
    const governor = new ScenarioGovernor();
    const limits = { ...DEFAULT_GOVERNOR_LIMITS, maxConcurrentModelCalls: 1 };

    expect(await runScenario(broken, "a", answers("ok"), governor, { limits }))
      .toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
    // Without the release, the one slot would be gone for the life of the
    // process and every later request would answer MODEL_BUSY.
    expect(await runScenario(ECHO, "b", answers("ok"), governor, { limits }))
      .toEqual({ ok: true, value: "ok" });
  });

  it("gives the slot back when an adapter rejects synchronously", async () => {
    const governor = new ScenarioGovernor();
    const limits = { ...DEFAULT_GOVERNOR_LIMITS, maxConcurrentModelCalls: 1 };
    const throwing = (() => {
      throw new Error("no transport");
    }) as unknown as ScenarioAdapter;

    expect(await runScenario(ECHO, "a", throwing, governor, { limits }))
      .toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
    expect(await runScenario(ECHO, "b", answers("ok"), governor, { limits }))
      .toEqual({ ok: true, value: "ok" });
  });

  it("falls to the floor when an adjudicator throws", async () => {
    const broken: MatterScenario<string, string> = {
      ...ECHO,
      adjudicate: () => {
        throw new Error("adjudicator defect");
      },
    };
    expect(await runScenario(broken, "a", answers("ok"), new ScenarioGovernor()))
      .toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
  });

  it("never lets a provider error reach the caller", async () => {
    const outcome = await runScenario(
      ECHO,
      "hello",
      async () => {
        throw new Error("relay https://secret.invalid rejected");
      },
      new ScenarioGovernor(),
    );
    expect(JSON.stringify(outcome)).not.toContain("secret.invalid");
    expect(outcome).toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
  });
});

describe("withRequestSignal", () => {
  it("stops waiting when the caller walks away", async () => {
    const controller = new AbortController();
    const pending = withRequestSignal(new Promise(() => undefined), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("composePrompt", () => {
  const prompt = composePrompt("matter-transform", "test/2", {
    background: true,
    mandate: ["Do the one thing."],
    fixed: ["the scope."],
    allow: ["one small change."],
    keep: [KEEP_UNFINISHED],
    never: ["invent."],
    answer: ["Answer with the passage alone."],
    material: [fence("passage", "他说 <b>先别急</b>")],
  });

  it("names the scenario and its frozen version first", () => {
    expect(prompt.startsWith("SCENARIO: matter-transform@test/2\n")).toBe(true);
  });

  it("tells the model where its answer is going before telling it what to do", () => {
    expect(prompt).toContain(MATTER_BACKGROUND);
    expect(prompt.indexOf(MATTER_BACKGROUND)).toBeLessThan(prompt.indexOf("Do the one thing."));
    // Priced per call, so a scenario that does not need it does not pay.
    expect(composePrompt("matter-inquiry", "test/2", {
      background: false,
      mandate: ["Answer."],
      answer: ["Briefly."],
    })).not.toContain(MATTER_BACKGROUND);
    // The three things a model gets wrong without it: who is reading, who
    // decides how much changes, and whether this is a conversation.
    expect(MATTER_BACKGROUND).toContain("not a chat");
    expect(MATTER_BACKGROUND).toContain("The gesture decides what and how much");
    expect(MATTER_BACKGROUND).toContain("no asking whether that helped");
  });

  it("states absent context as null rather than as the word undefined", () => {
    expect(fenceJson("lineage", undefined).value).toBe("null");
  });

  it("keeps the sections in the order the argument depends on", () => {
    const order = [
      "Do the one thing.",
      "What is already decided",
      "The only changes you may make",
      "What must survive your answer",
      "What this scenario never does",
      "When you are not sure, do less.",
      "Answer with the passage alone.",
      REFERENCE_NOT_INSTRUCTION,
      "<passage>",
    ].map((needle) => prompt.indexOf(needle));
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  it("escapes fenced material so a person cannot close their own quotation", () => {
    expect(prompt).toContain("<passage>他说 &lt;b&gt;先别急&lt;/b&gt;</passage>");
  });

  it("carries the injection refusal with the material, not per scenario", () => {
    const withoutMaterial = composePrompt("matter-inquiry", "test/2", {
      background: true,
      mandate: ["Answer."],
      answer: ["Briefly."],
    });
    expect(withoutMaterial).not.toContain(REFERENCE_NOT_INSTRUCTION);
    expect(withoutMaterial).toContain("When you are not sure, do less.");
  });

  it("serializes structured context as JSON rather than prose", () => {
    const structured = composePrompt("matter-inquiry", "test/2", {
      background: false,
      mandate: ["Answer."],
      answer: ["Briefly."],
      material: [fenceJson("lineage", [{ depth: 0, text: "第一句\n第二句" }])],
    });
    expect(structured).toContain('<lineage>[{"depth":0,"text":"第一句\\n第二句"}]</lineage>');
  });
});
