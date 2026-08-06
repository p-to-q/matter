import { describe, expect, it } from "vitest";
import {
  INQUIRY_MAX_CODE_POINTS,
  INQUIRY_MAX_TURNS,
  createInquiryState,
  inquiryText,
  pendingAnswerId,
  joinDictatedText,
  reduceInquiry,
  type InquiryEvent,
  type InquiryState,
} from "./inquiry-composer";

describe("inquiry composer", () => {
  it("starts empty, at rest, with nothing said yet", () => {
    expect(createInquiryState()).toMatchObject({
      phase: "idle",
      draft: "",
      interim: "",
      notice: null,
      turns: [],
    });
  });

  it("keeps a live transcript out of the draft until it settles", () => {
    const listening = run([{ type: "listen" }, { type: "hear", value: "我们怀念的" }]);
    expect(listening.draft).toBe("");
    expect(listening.interim).toBe("我们怀念的");
    expect(inquiryText(listening)).toBe("我们怀念的");

    const settled = reduceInquiry(listening, { type: "listened" });
    expect(settled).toMatchObject({ phase: "idle", draft: "我们怀念的", interim: "" });
  });

  it("replaces the running transcript rather than accumulating it", () => {
    // The port reports the whole session each time; appending would stutter.
    const state = run([
      { type: "listen" },
      { type: "hear", value: "我们" },
      { type: "hear", value: "我们怀念的过去" },
    ]);
    expect(inquiryText(state)).toBe("我们怀念的过去");
  });

  // Losing a spoken sentence to a recogniser hiccup is the one failure this
  // surface must not have, so a failed dictation still keeps what it heard.
  it("keeps what was heard when dictation fails, and says why", () => {
    const state = run([
      { type: "listen" },
      { type: "hear", value: "还没有说完的那句" },
      { type: "listen-failed", notice: "voice-failed" },
    ]);
    expect(state).toMatchObject({
      phase: "idle",
      draft: "还没有说完的那句",
      interim: "",
      notice: "voice-failed",
    });
  });

  it("dictates onto existing text instead of replacing it", () => {
    const state = run([
      { type: "type", value: "关于" },
      { type: "listen" },
      { type: "hear", value: "这段材料" },
      { type: "listened" },
    ]);
    expect(state.draft).toBe("关于这段材料");
  });

  it("refuses typing while a transcript owns the field", () => {
    const listening = run([{ type: "listen" }, { type: "hear", value: "在说话" }]);
    expect(reduceInquiry(listening, { type: "type", value: "手打" })).toBe(listening);
  });

  // The question is not lost by leaving the field: it moves into the exchange,
  // where it stays visible directly above the field it left.
  it("moves the question into the exchange and answers it in the same breath", () => {
    const asked = run([{ type: "type", value: "这份材料在讲什么？" }, { type: "ask" }]);

    expect(asked.draft).toBe("");
    expect(asked.turns).toEqual([
      { id: 1, role: "person", text: "这份材料在讲什么？" },
      { id: 2, role: "matter", outcome: { status: "pending" } },
    ]);
    expect(pendingAnswerId(createInquiryState())).toBe(2);
  });

  // A pending turn is the only transient state here, and it must always be
  // reachable: otherwise a question sits under a spinner forever.
  it("resolves the answering turn it was told to resolve, and only that one", () => {
    const asked = run([
      { type: "type", value: "第一问" },
      { type: "ask" },
      { type: "type", value: "第二问" },
      { type: "ask" },
    ]);
    const resolved = reduceInquiry(asked, {
      type: "answer",
      id: 2,
      outcome: { status: "unavailable", reason: "NO_PROVIDER" },
    });

    expect(resolved.turns[1]).toMatchObject({ outcome: { status: "unavailable", reason: "NO_PROVIDER" } });
    expect(resolved.turns[3]).toMatchObject({ outcome: { status: "pending" } });
  });

  it("ignores an answer aimed at a turn that is gone or is not an answer", () => {
    const asked = run([{ type: "type", value: "问题" }, { type: "ask" }]);
    const outcome = { status: "answered", text: "回应" } as const;

    expect(reduceInquiry(asked, { type: "answer", id: 99, outcome }).turns).toEqual(asked.turns);
    // Id 1 is the question itself; an answer must not overwrite it.
    expect(reduceInquiry(asked, { type: "answer", id: 1, outcome }).turns[0])
      .toEqual({ id: 1, role: "person", text: "问题" });
  });

  it("answers every question, so no turn is ever left waiting", () => {
    const twice = run([
      { type: "type", value: "第一问" },
      { type: "ask" },
      { type: "type", value: "第二问" },
      { type: "ask" },
    ]);

    expect(twice.turns.map((turn) => turn.role)).toEqual(["person", "matter", "person", "matter"]);
    expect(new Set(twice.turns.map((turn) => turn.id)).size).toBe(4);
  });

  it("trims the question it records", () => {
    const asked = run([{ type: "type", value: "  留白的问题  " }, { type: "ask" }]);
    expect(asked.turns[0]).toMatchObject({ role: "person", text: "留白的问题" });
  });

  it("bounds the exchange and drops the oldest turns first", () => {
    const many: InquiryEvent[] = [];
    for (let index = 0; index < INQUIRY_MAX_TURNS; index += 1) {
      many.push({ type: "type", value: `问题${index}` }, { type: "ask" });
    }
    const state = run(many);

    expect(state.turns).toHaveLength(INQUIRY_MAX_TURNS);
    // The most recent exchange survives; the first one is gone.
    expect(state.turns.at(-2)).toMatchObject({ text: `问题${INQUIRY_MAX_TURNS - 1}` });
    expect(state.turns.some((turn) => turn.role === "person" && turn.text === "问题0")).toBe(false);
  });

  it("ignores an empty question", () => {
    const blank = run([{ type: "type", value: "   " }]);
    expect(reduceInquiry(blank, { type: "ask" })).toBe(blank);
  });

  it("asks with a transcript that has not settled yet", () => {
    const state = run([
      { type: "listen" },
      { type: "hear", value: "这句只说了一半" },
      { type: "ask" },
    ]);
    expect(state).toMatchObject({ phase: "idle", draft: "", interim: "" });
    expect(state.turns[0]).toMatchObject({ role: "person", text: "这句只说了一半" });
  });

  it("keeps the exchange and an unsent draft across closing", () => {
    const closed = run([
      { type: "type", value: "问过的" },
      { type: "ask" },
      { type: "type", value: "还没问的" },
      { type: "close" },
    ]);

    expect(closed).toMatchObject({ phase: "idle", draft: "还没问的", interim: "", notice: null });
    expect(closed.turns).toHaveLength(2);
  });

  it("clears a stale voice notice as soon as the person acts again", () => {
    const failed = run([{ type: "listen" }, { type: "listen-failed", notice: "voice-denied" }]);
    expect(reduceInquiry(failed, { type: "type", value: "手打" }).notice).toBeNull();
    expect(reduceInquiry(failed, { type: "listen" }).notice).toBeNull();
  });

  it("bounds the field by code point, never splitting a surrogate pair", () => {
    const long = "𝔪".repeat(INQUIRY_MAX_CODE_POINTS + 40);
    const state = run([{ type: "type", value: long }]);
    expect(Array.from(state.draft)).toHaveLength(INQUIRY_MAX_CODE_POINTS);
    expect(state.draft.endsWith("𝔪")).toBe(true);
  });
});

describe("dictation seams", () => {
  it("does not insert a Latin space between Han characters", () => {
    expect(joinDictatedText("我们怀念", "的过去")).toBe("我们怀念的过去");
    expect(joinDictatedText("material", "的过去")).toBe("material的过去");
    expect(joinDictatedText("我们怀念", "material")).toBe("我们怀念material");
  });

  it("spaces Latin text and respects a space already typed", () => {
    expect(joinDictatedText("what is", "this material")).toBe("what is this material");
    expect(joinDictatedText("what is ", "this")).toBe("what is this");
  });

  it("ignores blank additions and blank left sides", () => {
    expect(joinDictatedText("kept", "   ")).toBe("kept");
    expect(joinDictatedText("  ", "spoken")).toBe("spoken");
  });
});

function run(events: readonly InquiryEvent[]): InquiryState {
  return events.reduce(reduceInquiry, createInquiryState());
}
