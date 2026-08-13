import { describe, expect, it } from "vitest";
import {
  MAX_SEMANTIC_LABEL_GRAPHEMES,
  adjudicateModelLabel,
  decideModelRequest,
  deriveProvisionalLabel,
  graphemeCount,
  labelFingerprint,
  labelSimilarity,
  normalizeLabelInput,
  validateSemanticLabel,
  type SemanticLabelInput,
} from "./semantic-label";

function label(input: SemanticLabelInput): string {
  return deriveProvisionalLabel(normalizeLabelInput(input)).text;
}

describe("provisional derivation", () => {
  it("keeps already compact material verbatim", () => {
    expect(label({ text: "重新思考首页结构" })).toBe("重新思考首页结构");
    expect(label({ text: "采访母亲关于迁徙" })).toBe("采访母亲关于迁徙");
  });

  it("prefers the contrast tail of a 不是…而是 construction", () => {
    expect(
      label({
        text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
      }),
    ).toBe("允许我们想象的其他生活");
  });

  it("drops spoken openers without touching the material", () => {
    expect(label({ text: "呃，我觉得，重新思考首页结构" })).toBe("重新思考首页结构");
    expect(label({ text: "然后还有成本的问题" })).toBe("成本的问题");
  });

  it("keeps a question whole while it fits, and drops only its opener when it does not", () => {
    expect(label({ text: "为什么身体记住了恐惧？" })).toBe("为什么身体记住了恐惧");
    expect(label({ text: "为什么身体会记住恐惧，而理性却总是先一步忘记这件事情？" }))
      .not.toMatch(/^为什么/u);
  });

  it("still allows a short label when the material is short and salient", () => {
    // Brevity is weighted, not forbidden: a short question the person actually
    // asked keeps its own length rather than being padded out.
    expect(label({ text: "到底谁在付钱？" })).toBe("到底谁在付钱");
    expect(graphemeCount(label({ text: "到底谁在付钱？" }))).toBeLessThan(7);
  });

  it("prefers a phrase over a topic word", () => {
    // A compression that lands on two or three characters names a topic; the
    // longer candidate has to win unless the material itself is that short.
    expect(graphemeCount(label({ text: "跟老王聊完之后觉得，我们其实一直在解决一个不存在的问题，真正卡住的是分发。" })))
      .toBeGreaterThan(6);
  });

  it("names Japanese material without cutting inside a word", () => {
    expect(label({
      text: "えーと、なんか、私たちが懐かしんでいるのは本当にあった過去ではなくて、その過去が今でも想像させてくれる別の暮らしなのだと思う。",
      locale: "ja-JP",
    })).toBe("本当にあった過去ではなくて");
    expect(label({ text: "母に移住のことを聞く", locale: "ja-JP" })).toBe("母に移住のことを聞く");
    // `か` is a particle and also a syllable inside 懐かしい; splitting on it
    // would produce 懐 + しんでいる, so it is not a boundary.
    expect(label({ text: "外国語の勉強を続けるかどうか、まだ決めていない。", locale: "ja-JP" }))
      .toBe("外国語の勉強を続けるかどうか");
  });

  it("gives Japanese a wider bound than Chinese", () => {
    expect(normalizeLabelInput({ text: "トップページの構造を考え直す" }).maxGraphemes).toBe(20);
    expect(normalizeLabelInput({ text: "重新思考首页结构" }).maxGraphemes).toBe(14);
  });

  it("never opens or closes a Japanese label on a bare particle", () => {
    const text = "私たちが懐かしんでいるのは本当にあった過去ではなくて、その過去が今でも想像させてくれる別の暮らしだ。";
    const value = label({ text, locale: "ja-JP" });
    expect(value).not.toMatch(/^[はがをのにでともへやかねよ]/u);
    expect(value).not.toMatch(/[はがをのにと]$/u);
  });

  it("uses an explicit heading when the material opens with one", () => {
    expect(label({ text: "# 一个标题\n后面还有正文" })).toBe("一个标题");
  });

  it("keeps a Latin head window and its stable identifier", () => {
    expect(label({ text: "Migrate API v2 authentication without changing token semantics" }))
      .toBe("Migrate API v2 authentication");
  });

  it("never splits a dotted identifier or leaves a dangling contrast opener", () => {
    expect(label({ text: "我们先检查 API v2.3 的兼容，然后再决定是否发布。" }))
      .toBe("API v2.3 兼容");
    expect(label({ text: "但是这个方案的缓存边界还没有想清楚。" }))
      .not.toMatch(/^是/u);
    expect(label({ text: "是撤销机制还是日志快照需要先确定。" }))
      .not.toMatch(/^是/u);
  });

  it("gives Han a tighter bound than Latin", () => {
    expect(normalizeLabelInput({ text: "重新思考首页结构" }).maxGraphemes).toBe(14);
    expect(normalizeLabelInput({ text: "Rethink the home page structure" }).maxGraphemes)
      .toBe(MAX_SEMANTIC_LABEL_GRAPHEMES);
  });

  it("never exceeds the requested bound", () => {
    const texts = [
      "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
      "So basically I think we should probably look at the caching layer first, because the latency is dominated by cold starts.",
      "这个其实可以再拆开，分成两个部分来看，第一个是采集，第二个是排序。",
      "嗯……",
      "a",
    ];
    for (const text of texts) {
      const input = normalizeLabelInput({ text });
      expect(graphemeCount(label({ text }))).toBeLessThanOrEqual(
        Math.max(input.maxGraphemes, "Untitled thought".length),
      );
    }
  });

  it("is deterministic and stays grounded in the material", () => {
    const text = "这个其实可以再拆开，分成两个部分来看，第一个是采集，第二个是排序。";
    const first = label({ text });
    expect(label({ text })).toBe(first);
    expect(text).toContain(first);
  });

  it("always produces a non-empty label", () => {
    for (const text of ["", "   ", "。。。", "嗯", "🙂"]) {
      expect(label({ text }).length).toBeGreaterThan(0);
    }
  });
});

describe("validation", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["", "EMPTY"],
    ["a".repeat(MAX_SEMANTIC_LABEL_GRAPHEMES + 1), "TOO_LONG"],
    ["**bold**", "MARKUP"],
    ["# heading", "MARKUP"],
    ["\"quoted\"", "MARKUP"],
    ["one · two", "MARKUP"],
    ["结构。", "TERMINAL_PUNCTUATION"],
    ["想法", "GENERIC"],
    ["Untitled thought", "GENERIC"],
  ];

  it.each(cases)("rejects %j", (value, code) => {
    const result = validateSemanticLabel(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it("rejects a control character before anything else", () => {
    const result = validateSemanticLabel("two\u0000lines");
    expect(result).toEqual({ ok: false, code: "MARKUP" });
  });

  it("rejects a near-duplicate of an existing sibling", () => {
    const result = validateSemanticLabel("模型调用成本", { siblingLabels: ["模型调用成本"] });
    expect(result).toEqual({ ok: false, code: "SIBLING_DUPLICATE" });
  });

  it("accepts a distinct sibling", () => {
    expect(validateSemanticLabel("本地推理延迟", { siblingLabels: ["模型调用成本"] }))
      .toEqual({ ok: true, label: "本地推理延迟" });
  });
});

describe("model adjudication", () => {
  const input = normalizeLabelInput({
    text: "Migrate API v2 authentication without changing token semantics",
  });

  it("accepts a grounded, distinct improvement", () => {
    expect(adjudicateModelLabel(input, "Migrate API v2", "API v2 authentication")).toEqual({
      ok: true,
    });
  });

  it("refuses a label that drops a stable identifier", () => {
    const result = adjudicateModelLabel(input, "Migrate API v2", "Better authentication");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("drops-a-stable-identifier");
  });

  it("accepts a Han label that recombines phrases the material used", () => {
    const zh = normalizeLabelInput({
      text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
    });
    expect(adjudicateModelLabel(zh, "想象的其他生活", "过去允许想象")).toEqual({ ok: true });
  });

  it("accepts a mixed-script label whose words both occur", () => {
    const mixed = normalizeLabelInput({
      text: "把 API v2 的鉴权迁移过去，但 token 的语义不要动。",
    });
    expect(adjudicateModelLabel(mixed, "鉴权迁移过去", "token 语义")).toEqual({ ok: true });
  });

  it("still refuses a sibling-shaped answer only when it is materially worse", () => {
    const zh = normalizeLabelInput({
      text: "本地推理的延迟还需要单独测量，尤其是在手机上，冷启动会更明显。",
      context: { siblingLabels: ["模型调用成本", "本地推理延迟"] },
    });
    expect(adjudicateModelLabel(zh, "延迟还需要单独测量", "冷启动延迟")).toEqual({ ok: true });
  });

  it("refuses a label the material does not support", () => {
    const zh = normalizeLabelInput({ text: "我们怀念的不是过去，而是想象的其他生活。" });
    const result = adjudicateModelLabel(zh, "想象的其他生活", "季度营收预测");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("not-grounded-in-material");
  });

  it("refuses a label that is materially less distinct than the provisional one", () => {
    const zh = normalizeLabelInput({
      text: "本地推理的延迟还需要单独测量，尤其是在手机上，调用成本也要算。",
      context: { siblingLabels: ["模型调用成本"] },
    });
    const result = adjudicateModelLabel(zh, "本地推理延迟", "模型调用成本也要算");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("less-distinct-than-provisional");
  });
});

describe("remote decision", () => {
  function decide(input: SemanticLabelInput) {
    const normalized = normalizeLabelInput(input);
    return decideModelRequest(normalized, deriveProvisionalLabel(normalized));
  }

  it("does not call the model for short, clean, distinct material", () => {
    expect(decide({ text: "重新思考首页结构" })).toEqual({
      request: false,
      reason: "provisional-is-sufficient",
    });
  });

  it("calls the model for spoken material", () => {
    expect(decide({ text: "呃，我觉得我们怀念的其实不是过去，而是想象的生活" }).request).toBe(true);
  });

  it("calls the model when the material depends on its parent", () => {
    expect(decide({ text: "然后还有成本的问题" })).toEqual({
      request: true,
      reason: "material-depends-on-context",
    });
  });

  it("calls the model when the provisional label collides with a sibling", () => {
    expect(
      decide({ text: "重新思考首页结构", context: { siblingLabels: ["重新思考首页结构"] } }),
    ).toEqual({ request: true, reason: "provisional-collides-with-a-sibling" });
  });
});

describe("fingerprint", () => {
  const base = normalizeLabelInput({ text: "重新思考首页结构" });

  it("is stable for identical input", () => {
    expect(labelFingerprint(base)).toBe(labelFingerprint(normalizeLabelInput({ text: "重新思考首页结构" })));
  });

  it("changes with text, context, bound, and prompt version", () => {
    const key = labelFingerprint(base);
    expect(labelFingerprint(normalizeLabelInput({ text: "重新思考首页结构。" }))).not.toBe(key);
    expect(
      labelFingerprint(normalizeLabelInput({ text: "重新思考首页结构", context: { siblingLabels: ["其他"] } })),
    ).not.toBe(key);
    expect(labelFingerprint(normalizeLabelInput({ text: "重新思考首页结构", maxGraphemes: 6 }))).not.toBe(key);
    expect(labelFingerprint(base, "thought-label/next")).not.toBe(key);
  });

  it("separates transpositions that a single hash lane would collide", () => {
    expect(labelFingerprint(normalizeLabelInput({ text: "ab" })))
      .not.toBe(labelFingerprint(normalizeLabelInput({ text: "ba" })));
  });
});

describe("similarity", () => {
  it("scores identity, overlap, and disjunction in order", () => {
    expect(labelSimilarity("模型调用成本", "模型调用成本")).toBe(1);
    expect(labelSimilarity("模型调用成本", "模型调用延迟")).toBeGreaterThan(0.3);
    expect(labelSimilarity("模型调用成本", "身体记住恐惧")).toBe(0);
  });

  it("ignores case, width, and punctuation", () => {
    expect(labelSimilarity("API v2", "api  v2!")).toBe(1);
  });
});
