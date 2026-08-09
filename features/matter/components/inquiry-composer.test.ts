import { describe, expect, it } from "vitest";
import {
  createInquiryState,
  inquiryText,
  canSubmitInquiry,
  isInquiryPending,
  pendingAnswerId,
  reduceInquiry,
  type InquiryState,
} from "./inquiry-composer";

function askQuestion(state: InquiryState, question: string): InquiryState {
  return reduceInquiry(reduceInquiry(state, { type: "type", value: question }), { type: "ask" });
}

describe("inquiry composer", () => {
  it("keeps typed and dictated language before asking", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "过去" });
    state = reduceInquiry(state, { type: "listen" });
    state = reduceInquiry(state, { type: "hear", value: "允许什么" });
    expect(inquiryText(state)).toBe("过去允许什么");
    state = reduceInquiry(state, { type: "listened" });
    expect(state).toMatchObject({ phase: "idle", draft: "过去允许什么", interim: "" });
  });

  it("keeps the final local transcript while recorded audio is processing", () => {
    let state = reduceInquiry(createInquiryState(), { type: "listen" });
    state = reduceInquiry(state, { type: "transcribe" });
    expect(state.phase).toBe("transcribing");
    state = reduceInquiry(state, { type: "hear", value: "这是端侧转写。" });
    state = reduceInquiry(state, { type: "listened" });
    expect(state).toMatchObject({
      phase: "idle",
      draft: "这是端侧转写。",
      interim: "",
    });
  });

  it("moves one question into a bounded pending exchange and resolves it", () => {
    const typed = reduceInquiry(createInquiryState(), { type: "type", value: "这是什么？" });
    const answerId = pendingAnswerId(typed);
    let state = reduceInquiry(typed, { type: "ask" });
    expect(state.exchange).toMatchObject({ question: "这是什么？", answer: { status: "pending" } });
    expect(state.draft).toBe("");
    state = reduceInquiry(state, {
      type: "answer",
      id: answerId,
      answer: { status: "unavailable", reason: "NO_PROVIDER" },
    });
    expect(state.exchange?.answer).toEqual({ status: "unavailable", reason: "NO_PROVIDER" });
  });

  it("holds one exchange at a time however many questions are asked", () => {
    let state = createInquiryState();
    for (const question of ["第一问", "第二问", "第三问", "第四问"]) {
      const id = pendingAnswerId(state);
      state = askQuestion(state, question);
      state = reduceInquiry(state, { type: "answer", id, answer: { status: "answered", text: `回答${question}` } });
      // The state shape admits one exchange, so nothing can accumulate: this
      // asserts the answer belongs to the question just asked, not to a list.
      expect(state.exchange).toMatchObject({ question, answer: { status: "answered", text: `回答${question}` } });
    }
    expect(Object.keys(state)).toEqual([
      "phase",
      "draft",
      "interim",
      "notice",
      "exchange",
      "nextExchangeId",
    ]);
  });

  it("replaces the prior exchange when the next question is asked", () => {
    const first = askQuestion(createInquiryState(), "旧问题");
    const answered = reduceInquiry(first, {
      type: "answer",
      id: first.exchange!.id,
      answer: { status: "answered", text: "旧回答" },
    });
    const second = askQuestion(answered, "新问题");
    expect(second.exchange).toMatchObject({ question: "新问题", answer: { status: "pending" } });
    expect(JSON.stringify(second)).not.toContain("旧回答");
    expect(JSON.stringify(second)).not.toContain("旧问题");
  });

  it("drops a late answer whose exchange was replaced", () => {
    const first = askQuestion(createInquiryState(), "旧问题");
    const staleId = first.exchange!.id;
    const settled = reduceInquiry(first, {
      type: "answer",
      id: staleId,
      answer: { status: "unavailable", reason: "UNREACHABLE" },
    });
    const second = askQuestion(settled, "新问题");
    const late = reduceInquiry(second, {
      type: "answer",
      id: staleId,
      answer: { status: "answered", text: "迟到的回答" },
    });
    expect(late).toBe(second);
    expect(late.exchange?.answer).toEqual({ status: "pending" });
  });

  it("drops a late answer that arrives after the exchange was cleared", () => {
    const asked = askQuestion(createInquiryState(), "问题");
    const cleared = reduceInquiry(asked, { type: "clear" });
    expect(cleared.exchange).toBeNull();
    const late = reduceInquiry(cleared, {
      type: "answer",
      id: asked.exchange!.id,
      answer: { status: "answered", text: "迟到的回答" },
    });
    expect(late).toBe(cleared);
  });

  it("keeps a running draft when the exchange is explicitly cleared", () => {
    const asked = askQuestion(createInquiryState(), "问题");
    const typing = reduceInquiry(asked, { type: "type", value: "下一个问题" });
    const cleared = reduceInquiry(typing, { type: "clear" });
    expect(cleared.exchange).toBeNull();
    expect(inquiryText(cleared)).toBe("下一个问题");
  });

  it("only enables a settled non-blank question with no pending answer", () => {
    const typed = reduceInquiry(createInquiryState(), { type: "type", value: "这是什么？" });
    expect(canSubmitInquiry(typed)).toBe(true);
    const pending = reduceInquiry(typed, { type: "ask" });
    expect(isInquiryPending(pending)).toBe(true);
    expect(canSubmitInquiry(pending)).toBe(false);
    expect(canSubmitInquiry(reduceInquiry(typed, { type: "listen" }))).toBe(false);
    expect(canSubmitInquiry(reduceInquiry(createInquiryState(), { type: "type", value: "   " }))).toBe(false);
  });

  it("refuses a second question while the first is still pending", () => {
    const pending = askQuestion(createInquiryState(), "第一问");
    const again = askQuestion(pending, "第二问");
    expect(again.exchange).toMatchObject({ question: "第一问" });
  });

  it("drops an exchange when its material context changes", () => {
    const state = askQuestion(createInquiryState(), "旧材料");
    expect(state.exchange).not.toBeNull();
    expect(reduceInquiry(state, { type: "scope-changed" })).toEqual(createInquiryState());
  });

  it("clears a closed inquiry rather than retaining a transient exchange", () => {
    const state = askQuestion(createInquiryState(), "旧问题");
    expect(reduceInquiry(state, { type: "close" })).toEqual(createInquiryState());
  });
});
